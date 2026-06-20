package proxy

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"HanChat-QQBotManager/internal/models"
	"github.com/gorilla/websocket"
)

// WSServerAdapter WebSocket反向连接适配器（实际为Client连接模式）
// 用户输入完整URL，程序主动连接到远程服务器并推送事件
type WSServerAdapter struct {
	*BaseAdapter
	config     models.WSServerConfig
	conn       *websocket.Conn
	stopChan   chan struct{}
	stopOnce   sync.Once
	wsSvc      ReverseWebSocketService
	filter     *EventFilter
}

// NewWSServerAdapter 创建WS反向适配器（Client模式）
func NewWSServerAdapter(config models.WSServerConfig, wsSvc ReverseWebSocketService, logger Logger) *WSServerAdapter {
	return &WSServerAdapter{
		BaseAdapter: NewBaseAdapter(config.Name, models.AdapterTypeWSServer, logger),
		config:      config,
		stopChan:    make(chan struct{}),
		wsSvc:       wsSvc,
		filter:      NewEventFilter(config.EventFilter, logger),
	}
}

// Config 返回配置
func (a *WSServerAdapter) Config() interface{} { return &a.config }

// validateURL 验证并规范化URL
func (a *WSServerAdapter) validateURL() (string, error) {
	rawURL := strings.TrimSpace(a.config.URL)
	if rawURL == "" {
		return "", fmt.Errorf("URL未配置，请输入完整的连接地址（如 wss://your-server.com:1234/path）")
	}

	u, err := url.Parse(rawURL)
	if err != nil {
		return "", fmt.Errorf("解析URL失败 [%s]: %w", rawURL, err)
	}

	if u.Scheme != "ws" && u.Scheme != "wss" {
		if u.Host == "" || u.Host == rawURL {
			return "", fmt.Errorf("无效的URL格式 [%s]，请使用 ws:// 或 wss:// 开头", rawURL)
		}
	}

	result := u.String()
	if result == "" {
		result = rawURL
	}

	return result, nil
}

// Open 启动适配器（作为WebSocket客户端连接远程服务器）
func (a *WSServerAdapter) Open() error {
	a.SetEnable(true)

	targetURL, err := a.validateURL()
	if err != nil {
		return err
	}

	a.logger.Infow("WS反向开始连接", "name", a.Name(), "url", targetURL)

	go a.connectLoop(targetURL)
	return nil
}

// Close 停止适配器
func (a *WSServerAdapter) Close() error {
	a.stopOnce.Do(func() {
		close(a.stopChan)
	})

	if a.conn != nil {
		a.conn.Close()
		a.conn = nil
	}

	a.SetActive(false)
	return nil
}

// Reload 重载配置
func (a *WSServerAdapter) Reload(config interface{}) error {
	newConfig := config.(models.WSServerConfig)
	wasActive := a.IsActive()

	if wasActive {
		a.Close()
	}

	time.Sleep(100 * time.Millisecond)
	a.config = newConfig
	a.BaseAdapter.status.Name = newConfig.Name
	a.SetEnable(newConfig.Enable)
	a.filter.UpdateConfig(newConfig.EventFilter)

	if wasActive || newConfig.Enable {
		a.stopChan = make(chan struct{})
		a.stopOnce = sync.Once{}
		go func() {
			targetURL, _ := a.validateURL()
			if targetURL != "" {
				a.connectLoop(targetURL)
			}
		}()
	}

	return nil
}

// OnEvent 发送原始事件到远程服务器（纯透传，不修改数据）
func (a *WSServerAdapter) OnEvent(selfID string, rawData []byte) {
	if a.filter != nil && !a.filter.ShouldPass(rawData) {
		a.logger.Infow("事件被过滤(WS反向)",
			"name", a.Name(),
			"event_type", extractEventType(rawData),
			"filter_mode", a.filter.GetMode(),
			"filter_rules", a.filter.GetRulesSummary(),
			"event_preview", truncateString(string(rawData), 200),
		)
		return
	}

	eventType := extractEventType(rawData)

	a.logger.Infow("转发事件到远程服务器",
		"name", a.Name(),
		"event_type", eventType,
		"data_length", len(rawData),
		"target_url", a.config.URL,
		"event_preview", truncateString(string(rawData), 300),
	)

	a.mu.RLock()
	conn := a.conn
	a.mu.RUnlock()

	if conn == nil {
		a.logger.Warnw("无法发送事件-连接未建立",
			"name", a.Name(),
			"event_type", eventType,
			"target_url", a.config.URL,
		)
		return
	}

	startTime := timeNow()
	if err := conn.WriteMessage(websocket.TextMessage, rawData); err != nil {
		latency := time.Since(startTime).Milliseconds()
		a.logger.Warnw("发送事件失败-连接可能已断开",
			"name", a.Name(),
			"event_type", eventType,
			"error", err,
			"error_type", classifyWSError(err),
			"target_url", a.config.URL,
			"latency_ms", latency,
		)
		a.UpdateMetrics(func(m *models.AdapterMetrics) { m.EventsFailed++ })
		return
	}

	latency := time.Since(startTime).Milliseconds()
	a.UpdateMetrics(func(m *models.AdapterMetrics) {
		m.EventsSent++
		m.LastEventTime = time.Now()
	})

	a.logger.Infow("事件发送成功",
		"name", a.Name(),
		"event_type", eventType,
		"latency_ms", latency,
		"target_url", a.config.URL,
	)
}

// connectLoop 连接循环（支持自动重连）
func (a *WSServerAdapter) connectLoop(targetURL string) {
	reconnectInterval := time.Duration(a.config.ReconnectInterval) * time.Millisecond
	if reconnectInterval == 0 {
		reconnectInterval = 5 * time.Second
	}

	maxAttempts := a.config.MaxReconnectAttempts
	if maxAttempts < 0 {
		maxAttempts = 0
	}
	if maxAttempts == 0 {
		maxAttempts = -1 // 不限制
	}

	for attempt := 0; maxAttempts == -1 || attempt < maxAttempts; attempt++ {
		select {
		case <-a.stopChan:
			return
		default:
		}

		header := http.Header{}
		header.Set(HeaderUserAgent, BuildUserAgent(""))
		if a.config.Token != "" {
			header.Set(HeaderAuth, "Bearer "+a.config.Token)
		}

		conn, _, err := websocket.DefaultDialer.Dial(targetURL, header)
		if err != nil {
			a.SetError(err)

			backoff := time.Duration(math.Pow(2, float64(attempt))) * reconnectInterval
			if backoff > 60*time.Second {
				backoff = 60 * time.Second
			}

			a.logger.Warnw("WS反向连接失败",
				"name", a.Name(),
				"attempt", attempt+1,
				"max_attempts", maxAttempts,
				"url", targetURL,
				"error", err,
				"error_type", classifyWSError(err),
				"next_retry_in", backoff.String(),
			)

			select {
			case <-time.After(backoff):
				continue
			case <-a.stopChan:
				return
			}
		}

		a.mu.Lock()
		a.conn = conn
		a.mu.Unlock()

		a.SetActive(true)
		a.SetError(nil)
		a.logger.Infow("WS反向连接成功",
			"name", a.Name(),
			"url", targetURL,
			"attempt", attempt+1,
			"remote_addr", getRemoteAddr(conn),
		)

		err = a.readLoop(conn)

		a.mu.Lock()
		a.conn = nil
		a.mu.Unlock()

		a.SetActive(false)

		if err != nil {
			a.logger.Warnw("WS反向连接断开",
				"name", a.Name(),
				"url", targetURL,
				"error", err,
				"error_type", classifyWSError(err),
				"disconnect_reason", "被动断开",
				"next_reconnect_in", reconnectInterval.String(),
			)
			a.SetError(err)
		} else {
			a.logger.Infow("WS反向连接正常关闭",
				"name", a.Name(),
				"url", targetURL,
				"disconnect_reason", "主动断开/停止信号",
			)
		}

		select {
		case <-a.stopChan:
			return
		case <-time.After(reconnectInterval):
		}
	}

	a.logger.Errorw("WS反向达到最大重试次数", "name", a.Name())
	a.SetEnable(false)
}

// readLoop 消息读取循环
func (a *WSServerAdapter) readLoop(conn *websocket.Conn) error {
	for {
		select {
		case <-a.stopChan:
			return nil
		default:
		}

		messageType, msg, err := conn.ReadMessage()
		if err != nil {
			return err
		}

		switch messageType {
		case websocket.TextMessage, websocket.BinaryMessage:
			a.handleServerMessage(msg)
		case websocket.CloseMessage:
			return nil
		}
	}
}

// handleServerMessage 处理来自服务器的消息
func (a *WSServerAdapter) handleServerMessage(msg []byte) {
	a.logger.Infow("收到远程服务器API调用请求",
		"name", a.Name(),
		"message_length", len(msg),
		"remote_url", a.config.URL,
		"message_preview", truncateString(string(msg), 200),
	)

	var req struct {
		Action string                 `json:"action"`
		Params map[string]interface{} `json:"params"`
		SelfID string                 `json:"self_id"`
	}

	if err := json.Unmarshal(msg, &req); err != nil {
		a.logger.Warnw("解析服务器消息失败",
			"error", err,
			"raw_message", truncateString(string(msg), 100),
		)
		return
	}

	if req.Action == "" {
		a.logger.Warnw("收到空action的请求(WS反向)",
			"raw_message", string(msg),
		)
		return
	}

	a.logger.Infow("处理服务器API调用",
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
			a.logger.Warnw("服务器API调用失败",
				"name", a.Name(),
				"action", req.Action,
				"self_id", selfID,
				"error", err,
				"latency_ms", latency,
			)
			return
		}

		a.mu.RLock()
		conn := a.conn
		a.mu.RUnlock()

		if conn != nil {
			conn.WriteMessage(websocket.TextMessage, rawResp)
			a.UpdateMetrics(func(m *models.AdapterMetrics) { m.RequestsHandled++ })

			a.logger.Infow("服务器API调用成功并返回结果",
				"name", a.Name(),
				"action", req.Action,
				"self_id", selfID,
				"response_length", len(rawResp),
				"latency_ms", latency,
				"response_preview", truncateString(string(rawResp), 150),
			)
		} else {
			a.logger.Warnw("无法返回API结果-连接已断开",
				"name", a.Name(),
				"action", req.Action,
				"self_id", selfID,
			)
		}
	}
}
