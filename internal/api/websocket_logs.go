package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"go.uber.org/zap"
	"HanChat-QQBotManager/internal/services"
	"HanChat-QQBotManager/internal/utils"
)

// WebSocketLogsHandler 日志流WebSocket处理器
type WebSocketLogsHandler struct {
	logger    *zap.SugaredLogger
	reverseWS *services.ReverseWebSocketService
	authToken string
	upgrader  websocket.Upgrader
}

// NewWebSocketLogsHandler 创建日志流WebSocket处理器
func NewWebSocketLogsHandler(baseLogger *zap.Logger, reverseWS *services.ReverseWebSocketService, authToken string) *WebSocketLogsHandler {
	return &WebSocketLogsHandler{
		logger:    utils.NewModuleLogger(baseLogger, "api.ws_logs"),
		reverseWS: reverseWS,
		authToken: authToken,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
	}
}

// RegisterRoutes 注册路由到 r（绕过JWT，用token鉴权）
// 路由: GET /api/logs/stream?self_id=xxx&token=xxx
func (h *WebSocketLogsHandler) RegisterRoutes(r *gin.Engine) {
	r.GET("/api/logs/stream", h.handleStream)
	h.logger.Infow("日志流WebSocket路由已注册", "path", "/api/logs/stream")
}

// handleStream 处理日志流WebSocket连接
// 鉴权: URL query param: ?token=xxx&self_id=xxx
func (h *WebSocketLogsHandler) handleStream(c *gin.Context) {
	selfID := c.Query("self_id")
	if selfID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 self_id 参数"})
		return
	}

	// 鉴权：优先用 query param token，其次用 Authorization header
	token := c.Query("token")
	if token == "" {
		authHeader := c.GetHeader("Authorization")
		token = strings.TrimPrefix(authHeader, "Bearer ")
	}
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "缺少 token"})
		return
	}

	// 验证 token
	if h.authToken == "" {
		h.logger.Warnw("日志流WebSocket鉴权失败：未配置 authToken")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "服务器未配置鉴权"})
		return
	}
	if token != h.authToken {
		h.logger.Warnw("日志流WebSocket鉴权失败：token 无效",
			"ip", c.ClientIP(),
			"self_id", selfID,
		)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "token 无效"})
		return
	}

	// 升级为 WebSocket
	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		h.logger.Warnw("日志流WebSocket升级失败", "error", err)
		return
	}
	defer conn.Close()

	h.logger.Infow("日志流WebSocket已连接",
		"self_id", selfID,
		"ip", c.ClientIP(),
	)

	// 订阅日志
	logCh := h.reverseWS.SubscribeLogs(selfID)
	defer h.reverseWS.UnsubscribeLogs(selfID, logCh)

	// 发送初始消息
	conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	conn.WriteJSON(gin.H{
		"type":    "connected",
		"self_id": selfID,
		"message": "日志流已连接，等待新日志...",
	})

	// 启动读 goroutine（接收 pong/close）
	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				return
			}
		}
	}()

	// 发送心跳 + 读取日志
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-done:
			return
		case entry, ok := <-logCh:
			if !ok {
				return
			}
			conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			if err := conn.WriteJSON(gin.H{
				"type":    "log",
				"level":   entry.Level,
				"message": entry.Message,
				"source":  entry.Source,
				"time":    entry.Time.Format("2006-01-02 15:04:05"),
				"data":    entry.Data,
			}); err != nil {
				h.logger.Debugw("日志流WebSocket写入失败", "error", err, "self_id", selfID)
				return
			}
		case <-ticker.C:
			conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			if err := conn.WriteMessage(websocket.PingMessage, []byte("ping")); err != nil {
				return
			}
		}
	}
}
