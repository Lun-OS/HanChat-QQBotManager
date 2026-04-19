package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"HanChat-QQBotManager/internal/services"
)

// WebQQMessage WebQQ消息结构
type WebQQMessage struct {
	MessageID   string `json:"message_id"`
	UserID      string `json:"user_id"`
	GroupID     string `json:"group_id,omitempty"`
	RawMessage  string `json:"raw_message"`
	SenderName  string `json:"sender_name"`
	SenderID    string `json:"sender_id"`
	Time        int64  `json:"time"`
	MessageSeq  int64  `json:"message_seq,omitempty"`
	MessageType string `json:"message_type"`
	PostType    string `json:"post_type"`
	SelfID      string `json:"self_id"`
}

// WebQQMessageFull 完整消息结构（仅用于实时广播，不缓存）
type WebQQMessageFull struct {
	MessageID   string                 `json:"message_id"`
	UserID      string                 `json:"user_id"`
	GroupID     string                 `json:"group_id,omitempty"`
	Message     []interface{}          `json:"message"`
	RawMessage  string                 `json:"raw_message"`
	Sender      map[string]interface{} `json:"sender"`
	Time        int64                  `json:"time"`
	MessageSeq  int64                  `json:"message_seq,omitempty"`
	MessageType string                 `json:"message_type"`
	PostType    string                 `json:"post_type"`
	SelfID      string                 `json:"self_id"`
}

// WebQQClient WebQQ客户端连接
type WebQQClient struct {
	SelfID      string
	UserID      string
	Chan        chan interface{}
	LastPing    time.Time
	MessageType string
	TargetID    string
}

// WebQQManager WebQQ消息管理器
type WebQQManager struct {
	clients    map[string]*WebQQClient // key: clientID (selfID + ":" + userID)
	clientsMu  sync.RWMutex
	logger     *zap.SugaredLogger
	reverseWS  *services.ReverseWebSocketService
	history    map[string][]WebQQMessage // 消息历史缓存 key: "friend:selfID:userID" or "group:selfID:groupID"
	historyMu  sync.RWMutex
	maxHistory int
}

var webQQManager *WebQQManager
var webQQManagerOnce sync.Once

// GetWebQQManager 获取WebQQ管理器单例
func GetWebQQManager(baseLogger *zap.Logger, reverseWS *services.ReverseWebSocketService) *WebQQManager {
	webQQManagerOnce.Do(func() {
		webQQManager = &WebQQManager{
			clients:    make(map[string]*WebQQClient),
			logger:     baseLogger.With(zap.String("module", "webqq")).Sugar(),
			reverseWS:  reverseWS,
			history:    make(map[string][]WebQQMessage),
			maxHistory: 100,
		}
		webQQManager.Start()
	})
	return webQQManager
}

// Start 启动WebQQ管理器
func (m *WebQQManager) Start() {
	m.reverseWS.AddEventHandler(func(selfID string, eventData map[string]interface{}) {
		m.handleEvent(selfID, eventData)
	})

	go m.cleanupLoop()

	memMgr := services.GetMemoryManager(nil)
	memMgr.RegisterCleanup(func() {
		m.historyMu.Lock()
		total := 0
		for key, history := range m.history {
			if len(history) > 50 {
				newHistory := make([]WebQQMessage, 0, 50)
				newHistory = append(newHistory, history[len(history)-50:]...)
				m.history[key] = newHistory
				total += 50
			} else {
				total += len(history)
			}
		}
		if len(m.history) > 100 {
			keys := make([]string, 0, len(m.history))
			for k := range m.history {
				keys = append(keys, k)
			}
			for i := 0; i < len(keys)-50; i++ {
				delete(m.history, keys[i])
			}
		}
		m.historyMu.Unlock()
	})

	m.logger.Info("WebQQ管理器已启动")
}

// handleEvent 处理事件
func (m *WebQQManager) handleEvent(selfID string, eventData map[string]interface{}) {
	postType, _ := eventData["post_type"].(string)
	if postType != "message" {
		return
	}

	messageType, _ := eventData["message_type"].(string)
	if messageType != "private" && messageType != "group" {
		return
	}

	cacheMsg := WebQQMessage{
		PostType:    postType,
		MessageType: messageType,
		SelfID:      selfID,
	}

	if v, ok := eventData["message_id"].(float64); ok {
		cacheMsg.MessageID = fmt.Sprintf("%.0f", v)
	}
	if v, ok := eventData["user_id"].(float64); ok {
		cacheMsg.UserID = fmt.Sprintf("%.0f", v)
	}
	if v, ok := eventData["group_id"].(float64); ok {
		cacheMsg.GroupID = fmt.Sprintf("%.0f", v)
	}
	if v, ok := eventData["raw_message"].(string); ok {
		cacheMsg.RawMessage = v
	}
	if sender, ok := eventData["sender"].(map[string]interface{}); ok {
		if nickname, ok := sender["nickname"].(string); ok {
			cacheMsg.SenderName = nickname
		}
		if uid, ok := sender["user_id"].(float64); ok {
			cacheMsg.SenderID = fmt.Sprintf("%.0f", uid)
		}
	}
	if v, ok := eventData["time"].(float64); ok {
		cacheMsg.Time = int64(v)
	}
	if v, ok := eventData["message_seq"].(float64); ok {
		cacheMsg.MessageSeq = int64(v)
	}

	m.cacheMessage(cacheMsg)

	fullMsg := WebQQMessageFull{
		MessageID:   cacheMsg.MessageID,
		UserID:      cacheMsg.UserID,
		GroupID:     cacheMsg.GroupID,
		RawMessage:  cacheMsg.RawMessage,
		Time:        cacheMsg.Time,
		MessageSeq:  cacheMsg.MessageSeq,
		MessageType: cacheMsg.MessageType,
		PostType:    cacheMsg.PostType,
		SelfID:      cacheMsg.SelfID,
	}
	if v, ok := eventData["message"].([]interface{}); ok {
		fullMsg.Message = v
	}
	if v, ok := eventData["sender"].(map[string]interface{}); ok {
		fullMsg.Sender = v
	}

	m.broadcastFullMessage(fullMsg)
}

// cacheMessage 缓存消息
func (m *WebQQManager) cacheMessage(msg WebQQMessage) {
	m.historyMu.Lock()
	defer m.historyMu.Unlock()

	var key string
	if msg.MessageType == "private" {
		key = fmt.Sprintf("friend:%s:%s", msg.SelfID, msg.UserID)
	} else {
		key = fmt.Sprintf("group:%s:%s", msg.SelfID, msg.GroupID)
	}

	history := m.history[key]
	history = append(history, msg)

	if len(history) > m.maxHistory {
		newHistory := make([]WebQQMessage, 0, m.maxHistory)
		newHistory = append(newHistory, history[len(history)-m.maxHistory:]...)
		history = newHistory
	}

	m.history[key] = history

	if len(m.history) > 50 {
		keys := make([]string, 0, len(m.history))
		for k := range m.history {
			keys = append(keys, k)
		}
		for i := 0; i < len(keys)-25; i++ {
			delete(m.history, keys[i])
		}
	}
}

// GetHistory 获取历史消息
func (m *WebQQManager) GetHistory(selfID string, chatType string, targetID string, limit int) []WebQQMessage {
	m.historyMu.RLock()
	defer m.historyMu.RUnlock()

	key := fmt.Sprintf("%s:%s:%s", chatType, selfID, targetID)
	history := m.history[key]

	if limit <= 0 || limit > len(history) {
		limit = len(history)
	}

	// 返回副本
	result := make([]WebQQMessage, limit)
	copy(result, history[len(history)-limit:])
	return result
}

// broadcastMessage 广播消息给客户端
func (m *WebQQManager) broadcastFullMessage(msg WebQQMessageFull) {
	m.clientsMu.RLock()
	defer m.clientsMu.RUnlock()

	for _, client := range m.clients {
		if client.SelfID != "" && client.SelfID != msg.SelfID {
			continue
		}

		if client.MessageType != "all" {
			if msg.MessageType == "private" && client.MessageType != "friend" {
				continue
			}
			if msg.MessageType == "group" && client.MessageType != "group" {
				continue
			}
		}

		if client.TargetID != "" {
			if msg.MessageType == "private" && client.TargetID != msg.UserID {
				continue
			}
			if msg.MessageType == "group" && client.TargetID != msg.GroupID {
				continue
			}
		}

		select {
		case client.Chan <- msg:
		default:
		}
	}
}

// RegisterClient 注册客户端
func (m *WebQQManager) RegisterClient(selfID, userID, messageType, targetID string) *WebQQClient {
	clientID := fmt.Sprintf("%s:%s", selfID, userID)

	m.clientsMu.Lock()
	defer m.clientsMu.Unlock()

	// 关闭旧连接
	if oldClient, exists := m.clients[clientID]; exists {
		close(oldClient.Chan)
	}

	client := &WebQQClient{
		SelfID:      selfID,
		UserID:      userID,
		Chan:        make(chan interface{}, 100),
		LastPing:    time.Now(),
		MessageType: messageType,
		TargetID:    targetID,
	}

	m.clients[clientID] = client
	m.logger.Infow("WebQQ客户端已注册", "clientID", clientID, "messageType", messageType, "targetID", targetID)

	return client
}

// UnregisterClient 注销客户端
func (m *WebQQManager) UnregisterClient(selfID, userID string) {
	clientID := fmt.Sprintf("%s:%s", selfID, userID)

	m.clientsMu.Lock()
	defer m.clientsMu.Unlock()

	if client, exists := m.clients[clientID]; exists {
		close(client.Chan)
		delete(m.clients, clientID)
		m.logger.Infow("WebQQ客户端已注销", "clientID", clientID)
	}
}

// UpdatePing 更新客户端心跳
func (m *WebQQManager) UpdatePing(selfID, userID string) {
	clientID := fmt.Sprintf("%s:%s", selfID, userID)

	m.clientsMu.Lock()
	defer m.clientsMu.Unlock()

	if client, exists := m.clients[clientID]; exists {
		client.LastPing = time.Now()
	}
}

// cleanupLoop 清理过期客户端和不活跃的历史记录
func (m *WebQQManager) cleanupLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		m.clientsMu.Lock()
		now := time.Now()
		for clientID, client := range m.clients {
			if now.Sub(client.LastPing) > 2*time.Minute {
				close(client.Chan)
				delete(m.clients, clientID)
				m.logger.Infow("WebQQ客户端已超时移除", "clientID", clientID)
			}
		}
		m.clientsMu.Unlock()

		m.historyMu.Lock()
		if len(m.history) > 100 {
			keys := make([]string, 0, len(m.history))
			for k := range m.history {
				keys = append(keys, k)
			}
			for i := 0; i < len(keys)-50; i++ {
				delete(m.history, keys[i])
			}
			m.logger.Debugw("清理历史记录缓存", "remaining", len(m.history))
		}
		m.historyMu.Unlock()
	}
}

// RegisterWebQQRoutes 注册WebQQ路由
func RegisterWebQQRoutes(r *gin.RouterGroup, manager *WebQQManager, base *zap.Logger) {
	logger := base.With(zap.String("module", "api.webqq")).Sugar()

	// SSE消息推送接口
	r.GET("/events", func(c *gin.Context) {
		selfID := c.Query("self_id")
		userID := c.Query("user_id")
		messageType := c.DefaultQuery("type", "all") // friend, group, all
		targetID := c.Query("target_id")              // 特定好友或群ID

		if selfID == "" || userID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少self_id或user_id参数"})
			return
		}

		// 注册客户端
		client := manager.RegisterClient(selfID, userID, messageType, targetID)
		defer manager.UnregisterClient(selfID, userID)

		// 设置SSE响应头
		c.Writer.Header().Set("Content-Type", "text/event-stream")
		c.Writer.Header().Set("Cache-Control", "no-cache")
		c.Writer.Header().Set("Connection", "keep-alive")
		c.Writer.Header().Set("X-Accel-Buffering", "no") // 禁用Nginx缓冲

		// 发送初始连接成功事件
		fmt.Fprintf(c.Writer, "event: connected\ndata: %s\n\n", `{"status":"connected"}`)
		c.Writer.Flush()

		logger.Infow("WebQQ SSE连接已建立", "selfID", selfID, "userID", userID)

		// 保持连接
		for {
			select {
			case msg, ok := <-client.Chan:
				if !ok {
					return
				}
				data, err := json.Marshal(msg)
				if err != nil {
					logger.Errorw("消息序列化失败", "error", err)
					continue
				}
				fmt.Fprintf(c.Writer, "event: message\ndata: %s\n\n", string(data))
				c.Writer.Flush()

			case <-c.Request.Context().Done():
				logger.Infow("WebQQ SSE连接已关闭", "selfID", selfID, "userID", userID)
				return
			}
		}
	})

	// 获取历史消息
	r.GET("/history", func(c *gin.Context) {
		selfID := c.Query("self_id")
		chatType := c.Query("type") // friend, group
		targetID := c.Query("target_id")
		limit := 0
		if v, err := fmt.Sscanf(c.DefaultQuery("limit", "50"), "%d", &limit); err != nil || v != 1 {
			limit = 50
		}

		if selfID == "" || chatType == "" || targetID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必要参数"})
			return
		}

		history := manager.GetHistory(selfID, chatType, targetID, limit)
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    history,
		})
	})

	// 心跳接口
	r.POST("/ping", func(c *gin.Context) {
		var body struct {
			SelfID string `json:"self_id"`
			UserID string `json:"user_id"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}

		manager.UpdatePing(body.SelfID, body.UserID)
		c.JSON(http.StatusOK, gin.H{"success": true})
	})
}
