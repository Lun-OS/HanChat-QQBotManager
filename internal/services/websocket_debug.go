package services

import (
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"go.uber.org/zap"
	"HanChat-QQBotManager/internal/utils"
)

// WSDebugClient WebSocket调试客户端
type WSDebugClient struct {
	conn       *websocket.Conn
	selfID     string
	logger     *zap.SugaredLogger
	sendChan   chan []byte
	closeChan  chan struct{}
	closeOnce  sync.Once
}

// WSDebugService WebSocket调试服务
type WSDebugService struct {
	upgrader       websocket.Upgrader
	logger         *zap.SugaredLogger
	reverseWS      *ReverseWebSocketService
	debugToken     string
	
	// 调试客户端管理
	clients        map[string]*WSDebugClient // self_id -> client
	clientsMu      sync.RWMutex
}

// NewWSDebugService 创建WebSocket调试服务
func NewWSDebugService(baseLogger *zap.Logger, reverseWS *ReverseWebSocketService) *WSDebugService {
	logger := utils.NewModuleLogger(baseLogger, "service.ws_debug")
	
	// 从环境变量读取调试Token
	debugToken := os.Getenv("WEBSOCKET_DEBUG_TOKEN")
	if debugToken == "" {
		debugToken = "debug_default_token"
	}
	
	service := &WSDebugService{
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				return true // 允许所有来源
			},
		},
		logger:     logger,
		reverseWS:  reverseWS,
		debugToken: debugToken,
		clients:    make(map[string]*WSDebugClient),
	}
	
	// 注册消息拦截器 - 直接透传原始消息
	service.registerInterceptors()
	
	return service
}

// registerInterceptors 注册消息拦截器到ReverseWebSocketService
func (s *WSDebugService) registerInterceptors() {
	// 使用原始数据事件处理器 - 直接透传LLBot发来的原始数据，不做任何解析和修改
	s.reverseWS.AddRawEventHandler(func(selfID string, rawData []byte) {
		s.ForwardRawEvent(selfID, rawData)
	})

	// 注册调试响应处理器 - 转发API响应到调试客户端
	s.reverseWS.AddDebugResponseHandler(func(selfID string, rawData []byte) {
		s.ForwardDebugResponse(selfID, rawData)
	})
}

// HandleDebugWebSocket 处理调试WebSocket连接
// 路由: /debug/{self_id}
// 鉴权: Authorization: Bearer {debug_token}
func (s *WSDebugService) HandleDebugWebSocket(c *gin.Context) {
	selfID := c.Param("self_id")
	if selfID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少self_id参数"})
		return
	}
	
	// Token鉴权
	authHeader := c.GetHeader("Authorization")
	token := strings.TrimPrefix(authHeader, "Bearer ")
	if token != s.debugToken {
		s.logger.Warnw("调试WebSocket连接被拒绝：Token无效",
			"ip", c.ClientIP(),
			"self_id", selfID)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "无效的Token"})
		return
	}
	
	// 升级WebSocket连接
	conn, err := s.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		s.logger.Errorw("调试WebSocket升级失败",
			"error", err,
			"ip", c.ClientIP(),
			"self_id", selfID)
		return
	}
	
	// 创建调试客户端
	client := &WSDebugClient{
		conn:      conn,
		selfID:    selfID,
		logger:    s.logger,
		sendChan:  make(chan []byte, 100),
		closeChan: make(chan struct{}),
	}
	
	// 保存客户端
	s.clientsMu.Lock()
	// 如果已存在相同self_id的客户端，先关闭旧的
	if oldClient, exists := s.clients[selfID]; exists {
		oldClient.Close()
	}
	s.clients[selfID] = client
	s.clientsMu.Unlock()
	
	s.logger.Infow("调试WebSocket连接已建立",
		"self_id", selfID,
		"ip", c.ClientIP())
	
	// 启动读写协程
	go client.writeLoop()
	go client.readLoop(s)
}

// writeLoop 写入循环
func (c *WSDebugClient) writeLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	
	for {
		select {
		case message, ok := <-c.sendChan:
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			c.conn.WriteMessage(websocket.TextMessage, message)
			
		case <-ticker.C:
			// 发送ping保持连接
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
			
		case <-c.closeChan:
			return
		}
	}
}

// readLoop 读取循环 - 处理从调试客户端发来的消息（API调用）
func (c *WSDebugClient) readLoop(service *WSDebugService) {
	defer c.Close()
	
	for {
		messageType, data, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				c.logger.Warnw("调试WebSocket读取错误",
					"self_id", c.selfID,
					"error", err)
			}
			return
		}
		
		if messageType != websocket.TextMessage {
			continue
		}
		
		// 直接透传原始数据到LLBot，不做任何解析和修改
		service.forwardToBot(c, data)
	}
}

// forwardToBot 直接转发原始数据到LLBot
func (s *WSDebugService) forwardToBot(client *WSDebugClient, rawData []byte) {
	// 直接发送原始消息到机器人
	err := s.reverseWS.SendRawMessageToAccount(client.selfID, rawData)
	if err != nil {
		s.logger.Errorw("转发消息到机器人失败",
			"self_id", client.selfID,
			"error", err)
	}
}

// ForwardRawEvent 直接转发原始事件数据（由ReverseWebSocketService调用）
func (s *WSDebugService) ForwardRawEvent(selfID string, rawData []byte) {
	s.clientsMu.RLock()
	client, exists := s.clients[selfID]
	s.clientsMu.RUnlock()

	if !exists {
		return
	}

	// 直接透传原始数据，不做任何修改
	select {
	case client.sendChan <- rawData:
	default:
		s.logger.Warnw("调试客户端发送通道已满，丢弃消息",
			"self_id", client.selfID)
	}
}

// ForwardDebugResponse 转发API响应到调试客户端
func (s *WSDebugService) ForwardDebugResponse(selfID string, rawData []byte) {
	s.clientsMu.RLock()
	client, exists := s.clients[selfID]
	s.clientsMu.RUnlock()

	if !exists {
		return
	}

	s.logger.Debugw("转发API响应到调试客户端",
		"self_id", selfID,
		"size", len(rawData))

	select {
	case client.sendChan <- rawData:
	default:
		s.logger.Warnw("调试客户端发送通道已满，丢弃API响应",
			"self_id", client.selfID)
	}
}

// Close 关闭调试客户端
func (c *WSDebugClient) Close() {
	c.closeOnce.Do(func() {
		close(c.closeChan)
		c.conn.Close()
		close(c.sendChan)
	})
}

// RemoveClient 移除调试客户端
func (s *WSDebugService) RemoveClient(selfID string) {
	s.clientsMu.Lock()
	if client, exists := s.clients[selfID]; exists {
		client.Close()
		delete(s.clients, selfID)
	}
	s.clientsMu.Unlock()
	
	s.logger.Infow("调试客户端已移除", "self_id", selfID)
}

// GetConnectedClients 获取已连接的调试客户端列表
func (s *WSDebugService) GetConnectedClients() []string {
	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()
	
	clients := make([]string, 0, len(s.clients))
	for selfID := range s.clients {
		clients = append(clients, selfID)
	}
	return clients
}
