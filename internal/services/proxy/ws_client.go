package proxy

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"HanChat-QQBotManager/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// WSClientAdapter WebSocket正向连接适配器（Server监听模式，路由注册到主Web服务）
type WSClientAdapter struct {
	*BaseAdapter
	config   models.WSClientConfig
	clients  map[*websocket.Conn]bool
	mu       sync.RWMutex
	wsSvc    ReverseWebSocketService
	upgrader websocket.Upgrader
	filter   *EventFilter
}

// NewWSClientAdapter 创建WS正向适配器
func NewWSClientAdapter(config models.WSClientConfig, wsSvc ReverseWebSocketService, logger Logger, _ int) *WSClientAdapter {
	return &WSClientAdapter{
		BaseAdapter: NewBaseAdapter(config.Name, models.AdapterTypeWSClient, logger),
		config:      config,
		clients:     make(map[*websocket.Conn]bool),
		wsSvc:       wsSvc,
		upgrader: websocket.Upgrader{
			CheckOrigin:     func(r *http.Request) bool { return true },
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
		},
		filter: NewEventFilter(config.EventFilter, logger),
	}
}

// buildPath 自动生成路径: /onebot/{self_id}/{name}
func (a *WSClientAdapter) buildPath() string {
	selfID := a.config.SelfID
	if selfID == "" {
		selfID = "_"
	}
	return "/onebot/" + selfID + "/" + a.config.Name
}

// Config 返回配置
func (a *WSClientAdapter) Config() interface{} { return &a.config }

// GetHandler 获取WebSocket处理器（用于注册到外部Gin Router）
func (a *WSClientAdapter) GetHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		a.logger.Infow("收到WS连接请求",
			"name", a.Name(),
			"path", c.Request.URL.Path,
			"method", c.Request.Method,
			"header_upgrade", c.GetHeader("Upgrade"),
			"header_connection", c.GetHeader("Connection"),
		)

		originalUA := c.GetHeader(HeaderUserAgent)
		c.Header(HeaderUserAgent, BuildUserAgent(originalUA))

		if a.config.Token != "" {
			token := strings.TrimPrefix(c.GetHeader(HeaderAuth), "Bearer ")
			if token != a.config.Token && c.Query("token") != a.config.Token {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
				return
			}
		}

		conn, err := a.upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			a.logger.Errorw("WS升级失败",
				"error", err,
				"path", c.Request.URL.Path,
				"remote_addr", c.ClientIP(),
			)
			return
		}

		a.mu.Lock()
		a.clients[conn] = true
		clientCount := len(a.clients)
		a.mu.Unlock()

		a.UpdateMetrics(func(m *models.AdapterMetrics) { m.ClientsCount = clientCount })
		a.logger.Infow("新客户端连接", "name", a.Name(), "clients", clientCount)

		defer func() {
			a.mu.Lock()
			delete(a.clients, conn)
			clientCount = len(a.clients)
			a.mu.Unlock()

			a.UpdateMetrics(func(m *models.AdapterMetrics) { m.ClientsCount = clientCount })
			conn.Close()
			a.logger.Infow("客户端连接关闭",
				"name", a.Name(),
				"remaining_clients", clientCount,
				"remote_addr", c.ClientIP(),
				"disconnect_reason", "正常关闭",
			)
		}()

		for {
			messageType, msg, err := conn.ReadMessage()
			if err != nil {
				a.logger.Infow("客户端连接断开",
					"name", a.Name(),
					"remote_addr", c.ClientIP(),
					"disconnect_type", "被动断开",
					"reason", classifyWSError(err),
					"error_detail", err.Error(),
				)
				break
			}

			switch messageType {
			case websocket.TextMessage:
				a.handleClientMessage(conn, msg)
			case websocket.BinaryMessage:
				a.handleClientMessage(conn, msg)
			case websocket.CloseMessage:
				a.logger.Infow("客户端发送关闭帧-主动断开",
					"name", a.Name(),
					"remote_addr", c.ClientIP(),
					"disconnect_type", "主动断开",
					"reason", "收到CloseMessage",
				)
				return
			}
		}
	}
}

// ========== 辅助函数: 日志增强工具 ==========

// extractEventType 从原始JSON数据中提取事件类型
func extractEventType(rawData []byte) string {
	var event map[string]interface{}
	if err := json.Unmarshal(rawData, &event); err != nil {
		return "unknown"
	}

	if postType, ok := event["post_type"]; ok {
		return fmt.Sprintf("%v", postType)
	}
	if eventType, ok := event["event"]; ok {
		return fmt.Sprintf("event:%v", eventType)
	}

	return "unknown"
}

// truncateString 截断字符串到指定长度
func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return string(runes[:maxLen]) + "..."
}

// classifyWSError 分类WebSocket错误类型
func classifyWSError(err error) string {
	if err == nil {
		return "none"
	}

	errStr := err.Error()
	switch {
	case strings.Contains(errStr, "close 1000"):
		return "正常关闭"
	case strings.Contains(errStr, "close 1001"):
		return "客户端离开"
	case strings.Contains(errStr, "close 1002"):
		return "协议错误"
	case strings.Contains(errStr, "close 1003"):
		return "不支持的数据类型"
	case strings.Contains(errStr, "close 1006"):
		return "异常关闭(连接丢失)"
	case strings.Contains(errStr, "close 1007"):
		return "无效负载数据"
	case strings.Contains(errStr, "close 1008"):
		return "策略违规"
	case strings.Contains(errStr, "close 1009"):
		return "消息过大"
	case strings.Contains(errStr, "close 1011"):
		return "服务器错误"
	case strings.Contains(errStr, "i/o timeout"):
		return "读写超时"
	case strings.Contains(errStr, "connection reset"):
		return "连接被重置"
	case strings.Contains(errStr, "broken pipe"):
		return "管道断裂"
	case strings.Contains(errStr, "use of closed network connection"):
		return "连接已关闭"
	default:
		return "未知错误: " + truncateString(errStr, 50)
	}
}

// getRemoteAddr 获取远程地址
func getRemoteAddr(conn *websocket.Conn) string {
	if conn == nil || conn.RemoteAddr() == nil {
		return "unknown"
	}
	return conn.RemoteAddr().String()
}

// formatMapPreview 格式化map预览(限制显示的key数量)
func formatMapPreview(m map[string]interface{}, maxKeys int) string {
	if m == nil || len(m) == 0 {
		return "{}"
	}

	var builder strings.Builder
	builder.WriteString("{")
	count := 0
	for k, v := range m {
		if count >= maxKeys {
			builder.WriteString(fmt.Sprintf(", ...(%d more)", len(m)-count))
			break
		}
		if count > 0 {
			builder.WriteString(", ")
		}
		builder.WriteString(fmt.Sprintf("%v: %v", k, truncateString(fmt.Sprintf("%v", v), 50)))
		count++
	}
	builder.WriteString("}")
	return builder.String()
}

// Open 启动适配器（仅标记为活跃，实际路由由外部注册）
func (a *WSClientAdapter) Open() error {
	a.SetEnable(true)
	a.SetActive(true)
	path := a.buildPath()
	a.logger.Infow("WS正向适配器已启用", "name", a.Name(), "path", path)
	return nil
}

// Close 停止适配器
func (a *WSClientAdapter) Close() error {
	a.mu.Lock()
	for conn := range a.clients {
		conn.Close()
		delete(a.clients, conn)
	}
	a.mu.Unlock()

	a.SetActive(false)
	return nil
}

// Reload 重载配置
func (a *WSClientAdapter) Reload(config interface{}) error {
	newConfig := config.(models.WSClientConfig)

	wasActive := a.IsActive()
	if wasActive {
		a.Close()
	}

	time.Sleep(100 * time.Millisecond)
	a.config = newConfig
	a.BaseAdapter.status.Name = newConfig.Name
	a.SetEnable(newConfig.Enable)
	a.filter.UpdateConfig(newConfig.EventFilter)

	if newConfig.Enable || wasActive {
		return a.Open()
	}

	return nil
}

// OnEvent 广播原始事件到所有已连接的客户端（纯透传，不修改数据）
func (a *WSClientAdapter) OnEvent(selfID string, rawData []byte) {
	if a.filter != nil && !a.filter.ShouldPass(rawData) {
		a.logger.Infow("事件被过滤",
			"name", a.Name(),
			"event_type", extractEventType(rawData),
			"filter_mode", a.filter.GetMode(),
			"filter_rules", a.filter.GetRulesSummary(),
			"event_preview", truncateString(string(rawData), 200),
		)
		return
	}

	eventType := extractEventType(rawData)
	eventPreview := truncateString(string(rawData), 300)

	// 关键修复: 先在 RLock 内快速快照客户端列表，释放锁后再做网络 I/O，
	// 避免 WriteMessage 期间 GetHandler 的 defer 写锁被长时间阻塞。
	a.mu.RLock()
	conns := make([]*websocket.Conn, 0, len(a.clients))
	for conn := range a.clients {
		conns = append(conns, conn)
	}
	clientCount := len(conns)
	a.mu.RUnlock()

	if clientCount == 0 {
		return
	}

	a.logger.Infow("转发事件到客户端",
		"name", a.Name(),
		"event_type", eventType,
		"data_length", len(rawData),
		"connected_clients", clientCount,
		"event_preview", eventPreview,
	)

	// 锁外执行网络写入，避免持锁 I/O 导致断连清理延迟。
	disconnected := make([]*websocket.Conn, 0)
	for _, conn := range conns {
		if err := conn.WriteMessage(websocket.TextMessage, rawData); err != nil {
			a.logger.Warnw("发送事件失败-客户端可能已断开",
				"name", a.Name(),
				"event_type", eventType,
				"error", err,
				"error_type", classifyWSError(err),
				"remote_addr", getRemoteAddr(conn),
			)
			disconnected = append(disconnected, conn)
		} else {
			a.UpdateMetrics(func(m *models.AdapterMetrics) { m.EventsSent++ })
		}
	}

	// 清理死连接（写锁短暂持有，不涉及网络 I/O）
	if len(disconnected) > 0 {
		a.mu.Lock()
		for _, conn := range disconnected {
			// 二次校验：可能 GetHandler 的 defer 已经把它从 map 删了
			if _, ok := a.clients[conn]; ok {
				delete(a.clients, conn)
				conn.Close()
			}
		}
		remaining := len(a.clients)
		a.mu.Unlock()

		a.UpdateMetrics(func(m *models.AdapterMetrics) {
			m.ClientsCount = remaining
			m.EventsFailed += int64(len(disconnected))
		})
		a.logger.Warnw("部分客户端发送失败",
			"name", a.Name(),
			"failed_count", len(disconnected),
			"total_clients", remaining,
		)
	}

	a.UpdateMetrics(func(m *models.AdapterMetrics) { m.LastEventTime = timeNow() })
}

// handleClientMessage 处理客户端消息（API调用）
func (a *WSClientAdapter) handleClientMessage(conn *websocket.Conn, msg []byte) {
	a.logger.Infow("收到客户端API调用请求",
		"name", a.Name(),
		"message_length", len(msg),
		"remote_addr", getRemoteAddr(conn),
		"message_preview", truncateString(string(msg), 200),
	)

	var req struct {
		Action string                 `json:"action"`
		Params map[string]interface{} `json:"params"`
		SelfID string                 `json:"self_id"`
	}

	if err := json.Unmarshal(msg, &req); err != nil {
		a.logger.Warnw("解析客户端消息失败",
			"error", err,
			"raw_message", truncateString(string(msg), 100),
		)
		return
	}

	if req.Action == "" {
		a.logger.Warnw("收到空action的请求",
			"raw_message", string(msg),
		)
		return
	}

	a.logger.Infow("处理API调用",
		"name", a.Name(),
		"action", req.Action,
		"self_id", req.SelfID,
		"params_count", len(req.Params),
		"params_preview", formatMapPreview(req.Params, 3),
	)

	if req.Action != "" {
		selfID := req.SelfID
		if selfID == "" {
			selfID = a.config.SelfID
		}
		startTime := timeNow()
		rawResp, err := a.wsSvc.CallBotAPIRaw(selfID, req.Action, req.Params)
		latency := time.Since(startTime).Milliseconds()

		if err != nil {
			resp := gin.H{"status": "failed", "retcode": -1, "message": err.Error()}
			data, _ := json.Marshal(resp)
			conn.WriteMessage(websocket.TextMessage, data)

			a.logger.Warnw("API调用失败",
				"name", a.Name(),
				"action", req.Action,
				"self_id", selfID,
				"error", err,
				"latency_ms", latency,
			)
			return
		}

		conn.WriteMessage(websocket.TextMessage, rawResp)

		a.UpdateMetrics(func(m *models.AdapterMetrics) { m.RequestsHandled++ })

		a.logger.Infow("API调用成功并返回结果",
			"name", a.Name(),
			"action", req.Action,
			"self_id", selfID,
			"response_length", len(rawResp),
			"latency_ms", latency,
			"response_preview", truncateString(string(rawResp), 150),
		)
	}
}
