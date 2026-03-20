package services

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"go.uber.org/zap"
)

// SSEClient SSE客户端（简化版）
// 用于接收WebSocket事件并分发给插件管理器
type SSEClient struct {
	reverseWS   *ReverseWebSocketService
	logger      *zap.SugaredLogger
	running     bool
	pluginMgr   interface {
		HandleEvent(eventType string, eventData map[string]interface{})
	}
	// 用于优雅关闭
	ctx    context.Context
	cancel context.CancelFunc
	// 防重复处理机制
	loginCommandMutex sync.Mutex
	lastProcessedMsg  map[string]time.Time
	mutex             sync.RWMutex
}

// NewSSEClient 创建SSE客户端
func NewSSEClient(reverseWS *ReverseWebSocketService, base *zap.Logger, pluginMgr interface {
	HandleEvent(eventType string, eventData map[string]interface{})
}) *SSEClient {
	ctx, cancel := context.WithCancel(context.Background())
	c := &SSEClient{
		reverseWS:        reverseWS,
		logger:           base.With(zap.String("module", "sse.client")).Sugar(),
		running:          false,
		pluginMgr:        pluginMgr,
		ctx:              ctx,
		cancel:           cancel,
		lastProcessedMsg: make(map[string]time.Time),
	}
	return c
}

// Start 启动SSE客户端
func (c *SSEClient) Start() {
	if c.running {
		return
	}
	c.running = true

	// 注册事件处理器 - reverse_websocket 已创建副本，这里直接使用
	c.reverseWS.AddEventHandler(func(selfID string, eventData map[string]interface{}) {
		// 创建副本并添加 self_id（避免修改原始数据）
		evt := make(map[string]interface{}, len(eventData)+1)
		for k, v := range eventData {
			evt[k] = v
		}
		evt["_self_id"] = selfID

		// 分发事件到插件管理器
		c.distributeEventToPlugins(evt)
	})

	// 启动定期清理过期记录的协程
	go c.cleanupExpiredRecords()

	c.logger.Infow("SSE客户端已启动")
}

// Stop 停止SSE客户端
func (c *SSEClient) Stop() {
	if !c.running {
		return
	}

	c.logger.Infow("正在停止SSE客户端...")
	c.running = false

	if c.cancel != nil {
		c.cancel()
	}

	c.logger.Infow("SSE客户端已停止")
}

// cleanupExpiredRecords 定期清理过期的记录
func (c *SSEClient) cleanupExpiredRecords() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			c.mutex.Lock()
			now := time.Now()
			for qq, lastTime := range c.lastProcessedMsg {
				if now.Sub(lastTime) > 5*time.Minute {
					delete(c.lastProcessedMsg, qq)
				}
			}
			c.mutex.Unlock()
		case <-c.ctx.Done():
			return
		}
	}
}

// distributeEventToPlugins 分发事件到插件管理器
func (c *SSEClient) distributeEventToPlugins(eventData map[string]interface{}) {
	if c.pluginMgr == nil {
		return
	}

	// 提取事件类型
	postType, ok := eventData["post_type"].(string)
	if !ok {
		return
	}

	// 跳过心跳事件
	if postType == "meta_event" {
		metaEventType, ok := eventData["meta_event_type"].(string)
		if ok && metaEventType == "heartbeat" {
			return
		}
	}

	// 分发事件到插件管理器
	c.pluginMgr.HandleEvent(postType, eventData)
}

// logEvent 记录事件
func (c *SSEClient) logEvent(selfID string, eventData map[string]interface{}) {
	postType, _ := eventData["post_type"].(string)
	c.logger.Debugw("收到事件",
		"self_id", selfID,
		"post_type", postType)
}

// handleAdminLoginCommand 处理 /admin login 指令
// 注意：此功能已移至Web登录系统，此处保留用于兼容性
func (c *SSEClient) handleAdminLoginCommand(eventData map[string]interface{}) {
	// 检查是否为私聊消息
	postType, _ := eventData["post_type"].(string)
	if postType != "message" {
		return
	}

	messageType, _ := eventData["message_type"].(string)
	if messageType != "private" {
		return
	}

	// 获取发送者QQ和消息内容
	userId, ok := eventData["user_id"].(float64)
	if !ok {
		return
	}
	qq := fmt.Sprintf("%.0f", userId)

	// 获取消息内容
	rawMessage, _ := eventData["raw_message"].(string)
	if rawMessage != "/admin login" {
		return
	}

	// 防重复处理
	c.mutex.RLock()
	lastTime, exists := c.lastProcessedMsg[qq]
	c.mutex.RUnlock()

	if exists && time.Since(lastTime) < 5*time.Second {
		c.logger.Debugw("忽略重复的管理员登录请求", "qq", qq)
		return
	}

	c.mutex.Lock()
	c.lastProcessedMsg[qq] = time.Now()
	c.mutex.Unlock()

	c.logger.Infow("收到管理员登录指令", "qq", qq)
	// 注意：登录功能已移至Web登录系统，请使用Web界面登录
}

// AddRawEventHandler 添加原始事件处理器（兼容旧接口）
func (c *SSEClient) AddRawEventHandler(handler func(rawData []byte)) {
	c.reverseWS.AddEventHandler(func(selfID string, eventData map[string]interface{}) {
		data, _ := json.Marshal(eventData)
		handler(data)
	})
}
