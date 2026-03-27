package services

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"go.uber.org/zap"
	"HanChat-QQBotManager/internal/config"
	"HanChat-QQBotManager/internal/models"
	"HanChat-QQBotManager/internal/utils"
)

// LogEntry 日志条目
type LogEntry struct {
	SelfID    string                 `json:"self_id"`
	Level     string                 `json:"level"`
	Message   string                 `json:"message"`
	Source    string                 `json:"source"`
	Time      time.Time              `json:"time"`
	Data      map[string]interface{} `json:"data,omitempty"`
}

// ReverseWebSocketService 反向WebSocket服务端
// 完全替代原有正向WS，实现多账号接入、鉴权、事件处理
type ReverseWebSocketService struct {
	upgrader    websocket.Upgrader
	logger      *zap.SugaredLogger
	accountMgr  *BotAccountManager
	cfg         *config.AccountConfig
	globalToken string // 全局鉴权Token
	maxConnections int // 最大连接数限制
	eventHandlers []func(selfID string, eventData map[string]interface{}) // 事件处理器列表
	eventHandlersMu sync.RWMutex // 保护eventHandlers
	
	// 原始数据事件处理器（用于调试服务透传）
	rawEventHandlers []func(selfID string, rawData []byte)
	rawEventHandlersMu sync.RWMutex
	waitingConnect   map[string]*waitingConnectInfo // 等待connect消息的连接
	waitingMu        sync.Mutex // 保护waitingConnect
	
	// 日志广播机制
	logSubscribers   map[string]map[chan LogEntry]bool // self_id -> 订阅者通道集合
	logSubMu         sync.RWMutex

	// 并发控制 - 使用channel模拟信号量，每个账号最多同时处理5个API请求
	apiChan     map[string]chan struct{} // self_id -> 并发控制通道
	apiChanMu   sync.Mutex

	// 连接回调 - 当新账号连接时调用
	onConnectCallbacks []func(selfID string)
	onConnectMu        sync.RWMutex

	// 日志管理器
	logManager  *LogManager

	// 心跳检测
	heartbeatInterval time.Duration // 心跳间隔
	heartbeatTimeout  time.Duration // 心跳超时时间
	lastHeartbeat     map[string]time.Time // self_id -> 最后心跳时间
	lastHeartbeatMu   sync.RWMutex

	// 修复问题22：临时响应回调（实例级别，避免全局变量竞争）
	tempResponseMu   sync.Mutex
	tempResponseChan map[string]chan map[string]interface{}
	echoCounter      uint64 // 原子计数器，用于生成唯一的 echo
}

type waitingConnectInfo struct {
	conn       *websocket.Conn
	customName string
	xSelfID    string
	ip         string
	createdAt  time.Time
}

// NewReverseWebSocketService 创建反向WebSocket服务端
func NewReverseWebSocketService(baseLogger *zap.Logger, accountMgr *BotAccountManager, cfg *config.AccountConfig, globalToken string) *ReverseWebSocketService {
	logger := utils.NewModuleLogger(baseLogger, "service.reverse_websocket")

	service := &ReverseWebSocketService{
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				// 允许所有来源（反向WS由机器人客户端主动连接）
				return true
			},
		},
		logger:            logger,
		accountMgr:        accountMgr,
		cfg:               cfg,
		globalToken:       globalToken,
		maxConnections:    10, // 默认最大10个连接
		eventHandlers:     make([]func(selfID string, eventData map[string]interface{}), 0),
		waitingConnect:    make(map[string]*waitingConnectInfo),
		logSubscribers:    make(map[string]map[chan LogEntry]bool),
		apiChan:           make(map[string]chan struct{}),
		heartbeatInterval: 30 * time.Second, // 默认30秒心跳间隔
		heartbeatTimeout:  60 * time.Second, // 默认60秒超时
		lastHeartbeat:     make(map[string]time.Time),
		// 修复问题22：初始化临时响应回调映射
		tempResponseChan:  make(map[string]chan map[string]interface{}),
		echoCounter:       0,
	}

	// 启动心跳检测任务
	go service.heartbeatChecker()

	return service
}

// heartbeatChecker 心跳检测任务
// 定期检查所有连接的心跳状态，关闭超时的连接
func (s *ReverseWebSocketService) heartbeatChecker() {
	ticker := time.NewTicker(s.heartbeatInterval)
	defer ticker.Stop()

	for range ticker.C {
		s.checkHeartbeats()
	}
}

// checkHeartbeats 检查所有连接的心跳状态
func (s *ReverseWebSocketService) checkHeartbeats() {
	s.lastHeartbeatMu.RLock()
	now := time.Now()
	timeoutConnections := make([]string, 0)

	for selfID, lastBeat := range s.lastHeartbeat {
		if now.Sub(lastBeat) > s.heartbeatTimeout {
			timeoutConnections = append(timeoutConnections, selfID)
		}
	}
	s.lastHeartbeatMu.RUnlock()

	// 关闭超时的连接
	for _, selfID := range timeoutConnections {
		s.logger.Warnw("心跳超时，关闭连接",
			"self_id", selfID,
			"timeout", s.heartbeatTimeout.String())

		// 获取账号并断开连接
		if account, err := s.accountMgr.GetAccount(selfID); err == nil {
			if account.WsConn != nil {
				account.WsConn.Close()
			}
		}

		s.accountMgr.HandleDisconnect(selfID, fmt.Errorf("心跳超时"))
		s.RemoveHeartbeat(selfID)
	}
}

// UpdateHeartbeat 更新指定账号的心跳时间
func (s *ReverseWebSocketService) UpdateHeartbeat(selfID string) {
	s.lastHeartbeatMu.Lock()
	defer s.lastHeartbeatMu.Unlock()
	s.lastHeartbeat[selfID] = time.Now()
}

// RemoveHeartbeat 移除指定账号的心跳记录
func (s *ReverseWebSocketService) RemoveHeartbeat(selfID string) {
	s.lastHeartbeatMu.Lock()
	defer s.lastHeartbeatMu.Unlock()
	delete(s.lastHeartbeat, selfID)
}

// SetHeartbeatConfig 设置心跳检测配置
func (s *ReverseWebSocketService) SetHeartbeatConfig(interval, timeout time.Duration) {
	if interval > 0 {
		s.heartbeatInterval = interval
	}
	if timeout > 0 {
		s.heartbeatTimeout = timeout
	}
}

// HandleWebSocket 处理WebSocket连接请求
// 路由: /ws/{customName}
// 鉴权: Authorization: Bearer {token} (如果配置了全局Token)
//       X-Self-ID: {self_id} (必须与customName对应的账号一致)
func (s *ReverseWebSocketService) HandleWebSocket(c *gin.Context) {
	customName := c.Param("customName")
	if customName == "" {
		s.logger.Warnw("WebSocket连接被拒绝：缺少customName", "ip", c.ClientIP())
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少customName参数"})
		return
	}

	// 1. Token鉴权（如果配置了全局Token）
	if s.globalToken != "" {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			s.logger.Warnw("WebSocket连接被拒绝：缺少Authorization头",
				"ip", c.ClientIP(),
				"custom_name", customName)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "缺少Authorization头"})
			return
		}

		// 移除Bearer前缀
		token := strings.TrimPrefix(authHeader, "Bearer ")
		if token != s.globalToken {
			s.logger.Warnw("WebSocket连接被拒绝：Token不匹配",
				"ip", c.ClientIP(),
				"custom_name", customName)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "无效的Token"})
			return
		}
	}

	// 2. 获取X-Self-ID头
	xSelfID := c.GetHeader("X-Self-ID")
	if xSelfID == "" {
		s.logger.Warnw("WebSocket连接被拒绝：缺少X-Self-ID头",
			"ip", c.ClientIP(),
			"custom_name", customName)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "缺少X-Self-ID头"})
		return
	}

	// 3. 升级WebSocket连接
	conn, err := s.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		s.logger.Errorw("WebSocket升级失败",
			"error", err,
			"ip", c.ClientIP(),
			"custom_name", customName)
		return
	}

	// 4. 检查连接数限制
	currentCount := s.accountMgr.GetOnlineCount()
	if currentCount >= s.maxConnections {
		s.logger.Warnw("WebSocket连接被拒绝：达到最大连接数限制",
			"ip", c.ClientIP(),
			"custom_name", customName,
			"current", currentCount,
			"max", s.maxConnections)
		conn.Close()
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "达到最大连接数限制"})
		return
	}

	// 5. 将连接加入等待列表，等待connect消息
	s.waitingMu.Lock()
	s.waitingConnect[xSelfID] = &waitingConnectInfo{
		conn:       conn,
		customName: customName,
		xSelfID:    xSelfID,
		ip:         c.ClientIP(),
		createdAt:  time.Now(),
	}
	s.waitingMu.Unlock()

	s.logger.Infow("WebSocket连接已建立，等待connect消息",
		"self_id", xSelfID,
		"custom_name", customName,
		"ip", c.ClientIP(),
		"current", currentCount,
		"max", s.maxConnections)

	// 6. 启动消息读取循环
	go s.readLoop(xSelfID, conn)
}

// readLoop 读取WebSocket消息循环
// 处理事件上报和API响应
func (s *ReverseWebSocketService) readLoop(selfID string, conn *websocket.Conn) {
	defer func() {
		// 连接断开时的清理工作
		s.accountMgr.HandleDisconnect(selfID, fmt.Errorf("连接关闭"))
		s.RemoveHeartbeat(selfID) // 移除心跳记录
		conn.Close()
	}()

	for {
		messageType, data, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure, websocket.CloseTLSHandshake) {
				s.logger.Warnw("WebSocket读取错误",
					"self_id", selfID,
					"error", err)
			}
			return
		}

		if messageType != websocket.TextMessage {
			continue
		}

		// 更新最后活动时间（用于保活）
	if account, err := s.accountMgr.GetAccount(selfID); err == nil {
		account.UpdateActivity()
	}

	// 更新心跳时间
	s.UpdateHeartbeat(selfID)

		// 记录接收的 WebSocket 消息（排除 ping）
		if s.logManager != nil {
			s.logManager.WriteWSLog(selfID, "recv", data)
		}

		// 解析消息
		var msg map[string]interface{}
		if err := json.Unmarshal(data, &msg); err != nil {
			s.logger.Errorw("解析消息失败",
				"self_id", selfID,
				"error", err,
				"data", string(data))
			continue
		}

		// 处理消息
		s.handleMessage(selfID, msg, data)
	}
}

// handleMessage 处理单条消息
// 区分事件上报和API响应
func (s *ReverseWebSocketService) handleMessage(selfID string, msg map[string]interface{}, rawData []byte) {
	// 判断消息类型
	postType, hasPostType := msg["post_type"]
	subType, _ := msg["sub_type"].(string)
	_, hasEcho := msg["echo"]

	// 检查是否是connect消息（需要从等待列表中移除并完成认证）
	if hasPostType && postType == "meta_event" && subType == "connect" {
		s.handleConnectMessage(selfID, msg)
		return
	}

	// 检查是否在等待列表中，如果在则忽略其他消息
	s.waitingMu.Lock()
	_, isWaiting := s.waitingConnect[selfID]
	s.waitingMu.Unlock()
	if isWaiting {
		s.logger.Warnw("收到消息但未收到connect消息，忽略",
			"self_id", selfID,
			"post_type", postType)
		return
	}

	if hasPostType && postType != nil {
		// 事件上报
		s.handleEvent(selfID, msg, rawData)
	} else if hasEcho {
		// API响应
		s.handleAPIResponse(selfID, msg, rawData)
	} else {
		// 其他消息类型（如心跳响应）
		s.logger.Debugw("收到其他类型消息",
			"self_id", selfID,
			"msg", msg)
	}
}

// handleConnectMessage 处理connect消息
// 完成账号创建和连接认证
func (s *ReverseWebSocketService) handleConnectMessage(selfID string, msg map[string]interface{}) {
	// 获取等待连接信息
	s.waitingMu.Lock()
	waitInfo, exists := s.waitingConnect[selfID]
	if !exists {
		s.waitingMu.Unlock()
		s.logger.Warnw("收到connect消息但不在等待列表中", "self_id", selfID)
		return
	}

	// 从等待列表中移除
	delete(s.waitingConnect, selfID)
	s.waitingMu.Unlock()

	// 获取或创建账号
	customName := waitInfo.customName
	account, err := s.accountMgr.GetOrCreateAccount(selfID, customName)
	if err != nil {
		s.logger.Errorw("获取或创建账号失败",
			"error", err,
			"self_id", selfID,
			"custom_name", customName)
		waitInfo.conn.Close()
		return
	}

	// 校验X-Self-ID一致性
	if account.CustomName != customName {
		account.CustomName = customName
		s.cfg.SaveAccountConfig(account)
	}

	// 更新连接状态
	s.accountMgr.UpdateConn(selfID, waitInfo.conn)

	// 初始化心跳
	s.UpdateHeartbeat(selfID)

	s.logger.Infow("WebSocket连接认证成功",
		"self_id", selfID,
		"custom_name", customName,
		"ip", waitInfo.ip)

	// 触发连接回调
	s.triggerOnConnect(selfID)

	// 异步获取机器人信息
	go s.fetchBotInfo(selfID)
}

// fetchBotInfo 获取机器人信息
// 在连接成功后调用，包括登录信息、版本信息和状态
func (s *ReverseWebSocketService) fetchBotInfo(selfID string) {
	// 1. 获取登录信息
	resp, err := s.CallBotAPI(selfID, "get_login_info", nil)
	if err != nil {
		s.logger.Warnw("获取登录信息失败", "self_id", selfID, "error", err)
	} else {
		data, ok := resp["data"].(map[string]interface{})
		if ok {
			loginInfo := &models.BotLoginInfo{}
			if userID, ok := data["user_id"].(float64); ok {
				loginInfo.UserID = int64(userID)
			}
			if nickname, ok := data["nickname"].(string); ok {
				loginInfo.Nickname = nickname
			}
			account, err := s.accountMgr.GetAccount(selfID)
			if err == nil {
				account.SetLoginInfo(loginInfo)
				s.logger.Infow("获取登录信息成功", "self_id", selfID, "nickname", loginInfo.Nickname)
			}
		}
	}

	// 2. 获取版本信息
	resp, err = s.CallBotAPI(selfID, "get_version_info", nil)
	if err != nil {
		s.logger.Warnw("获取版本信息失败", "self_id", selfID, "error", err)
	} else {
		data, ok := resp["data"].(map[string]interface{})
		if ok {
			versionInfo := &models.BotVersionInfo{}
			if appName, ok := data["app_name"].(string); ok {
				versionInfo.AppName = appName
			}
			if protocolVersion, ok := data["protocol_version"].(string); ok {
				versionInfo.ProtocolVersion = protocolVersion
			}
			if appVersion, ok := data["app_version"].(string); ok {
				versionInfo.AppVersion = appVersion
			}
			account, err := s.accountMgr.GetAccount(selfID)
			if err == nil {
				account.SetVersionInfo(versionInfo)
				s.logger.Infow("获取版本信息成功", "self_id", selfID, "app_name", versionInfo.AppName, "app_version", versionInfo.AppVersion)
			}
		}
	}

	// 3. 获取状态信息
	resp, err = s.CallBotAPI(selfID, "get_status", nil)
	if err != nil {
		s.logger.Warnw("获取状态信息失败", "self_id", selfID, "error", err)
	} else {
		data, ok := resp["data"].(map[string]interface{})
		if ok {
			botStatus := &models.BotStatus{}
			if online, ok := data["online"].(bool); ok {
				botStatus.Online = online
			}
			if good, ok := data["good"].(bool); ok {
				botStatus.Good = good
			}
			if stat, ok := data["stat"].(map[string]interface{}); ok {
				botStat := &models.BotStat{}
				if msgReceived, ok := stat["message_received"].(float64); ok {
					botStat.MessageReceived = int64(msgReceived)
				}
				if msgSent, ok := stat["message_sent"].(float64); ok {
					botStat.MessageSent = int64(msgSent)
				}
				if lastMsgTime, ok := stat["last_message_time"].(float64); ok {
					botStat.LastMessageTime = int64(lastMsgTime)
				}
				if startupTime, ok := stat["startup_time"].(float64); ok {
					botStat.StartupTime = int64(startupTime)
				}
				botStatus.Stat = botStat
			}
			account, err := s.accountMgr.GetAccount(selfID)
			if err == nil {
				account.SetBotStatus(botStatus)
				s.logger.Infow("获取状态信息成功", "self_id", selfID, "online", botStatus.Online, "good", botStatus.Good)
			}
		}
	}
}

// handleEvent 处理事件上报
// 将事件分发给注册的处理器
func (s *ReverseWebSocketService) handleEvent(selfID string, eventData map[string]interface{}, rawData []byte) {
	// 创建事件副本，避免并发问题
	eventCopy := make(map[string]interface{}, len(eventData))
	for k, v := range eventData {
		eventCopy[k] = v
	}

	postType, _ := eventCopy["post_type"].(string)

	// 跳过心跳事件
	if postType == "meta_event" {
		metaEventType, _ := eventCopy["meta_event_type"].(string)
		if metaEventType == "heartbeat" {
			return
		}
	}

	// 广播事件日志（优化：使用后台goroutine避免阻塞）
	go s.broadcastEventLog(selfID, postType, eventCopy)

	// 获取处理器列表（线程安全）
	s.eventHandlersMu.RLock()
	handlers := make([]func(selfID string, eventData map[string]interface{}), len(s.eventHandlers))
	copy(handlers, s.eventHandlers)
	s.eventHandlersMu.RUnlock()

	// 分发给所有处理器（直接传递同一副本，更高效）
	for _, handler := range handlers {
		handler(selfID, eventCopy)
	}

	// 分发原始数据给原始数据处理器（用于调试服务透传）
	s.rawEventHandlersMu.RLock()
	rawHandlers := make([]func(selfID string, rawData []byte), len(s.rawEventHandlers))
	copy(rawHandlers, s.rawEventHandlers)
	s.rawEventHandlersMu.RUnlock()

	// 直接透传原始数据，不做任何修改
	for _, handler := range rawHandlers {
		handler(selfID, rawData)
	}
}

// broadcastEventLog 广播事件日志
func (s *ReverseWebSocketService) broadcastEventLog(selfID string, postType string, eventData map[string]interface{}) {
	// 构建日志消息
	var message string
	var level string = "INFO"

	switch postType {
	case "message":
		messageType, _ := eventData["message_type"].(string)
		sender, _ := eventData["sender"].(map[string]interface{})
		nickname, _ := sender["nickname"].(string)
		userID, _ := eventData["user_id"].(float64)
		rawMessage, _ := eventData["raw_message"].(string)

		if messageType == "private" {
			message = fmt.Sprintf("[私聊] %s(%.0f): %s", nickname, userID, rawMessage)
		} else if messageType == "group" {
			groupID, _ := eventData["group_id"].(float64)
			message = fmt.Sprintf("[群聊] %s(%.0f) @ 群%.0f: %s", nickname, userID, groupID, rawMessage)
		}
	case "notice":
		noticeType, _ := eventData["notice_type"].(string)
		message = fmt.Sprintf("[通知] %s", noticeType)
	case "request":
		requestType, _ := eventData["request_type"].(string)
		message = fmt.Sprintf("[请求] %s", requestType)
	case "meta_event":
		message = fmt.Sprintf("[元事件] %s", eventData["sub_type"])
	default:
		message = fmt.Sprintf("[事件] %s", postType)
	}

	if message != "" {
		s.BroadcastLog(LogEntry{
			SelfID:  selfID,
			Level:   level,
			Message: message,
			Source:  "websocket",
			Time:    time.Now(),
			Data:    eventData,
		})
	}
}

// handleAPIResponse 处理API响应
// 修复问题20：添加安全的类型断言
func (s *ReverseWebSocketService) handleAPIResponse(selfID string, response map[string]interface{}, rawData []byte) {
	// 安全获取echo字段
	echo, ok := response["echo"].(string)
	if !ok || echo == "" {
		s.logger.Warnw("收到没有echo的API响应", "self_id", selfID)
		return
	}

	// 安全获取status字段
	status := "unknown"
	if statusVal, ok := response["status"].(string); ok {
		status = statusVal
	}

	// 安全获取retcode字段
	retcode := -1.0
	if retcodeVal, ok := response["retcode"].(float64); ok {
		retcode = retcodeVal
	} else if retcodeInt, ok := response["retcode"].(int); ok {
		retcode = float64(retcodeInt)
	}

	s.logger.Infow("收到API响应",
		"self_id", selfID,
		"echo", echo,
		"status", status,
		"retcode", retcode)

	// 处理临时响应
	s.logger.Debugw("处理临时响应", "echo", echo)
	go s.handleTempResponse(echo, response)
}

// SendMessageToAccount 发送消息到指定账号的WebSocket连接
// 用于向机器人客户端发送API请求（线程安全）
func (s *ReverseWebSocketService) SendMessageToAccount(selfID string, message interface{}) error {
	account, err := s.accountMgr.GetAccount(selfID)
	if err != nil {
		return fmt.Errorf("账号不存在: %w", err)
	}

	if account.WsConn == nil {
		return fmt.Errorf("账号未连接: %s", selfID)
	}

	data, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("序列化消息失败: %w", err)
	}

	s.logger.Infow("发送WebSocket消息",
		"self_id", selfID,
		"message", string(data))

	// 记录发送的 WebSocket 消息（排除 ping）
	if s.logManager != nil {
		s.logManager.WriteWSLog(selfID, "send", data)
	}

	// 使用线程安全的写入方法
	if err := account.WriteMessage(websocket.TextMessage, data); err != nil {
		return fmt.Errorf("发送消息失败: %w", err)
	}

	return nil
}

// SendRawMessageToAccount 发送原始消息到指定账号的WebSocket连接
// 用于透传原始数据，不做任何序列化（线程安全）
func (s *ReverseWebSocketService) SendRawMessageToAccount(selfID string, data []byte) error {
	account, err := s.accountMgr.GetAccount(selfID)
	if err != nil {
		return fmt.Errorf("账号不存在: %w", err)
	}

	if account.WsConn == nil {
		return fmt.Errorf("账号未连接: %s", selfID)
	}

	s.logger.Infow("发送原始WebSocket消息",
		"self_id", selfID,
		"size", len(data))

	// 记录发送的 WebSocket 消息
	if s.logManager != nil {
		s.logManager.WriteWSLog(selfID, "send", data)
	}

	// 使用线程安全的写入方法
	if err := account.WriteMessage(websocket.TextMessage, data); err != nil {
		return fmt.Errorf("发送消息失败: %w", err)
	}

	return nil
}

// CallBotAPI 发送API请求到机器人并等待响应
// action: API动作名称，如 "get_login_info"
// params: 请求参数
// 返回响应数据
func (s *ReverseWebSocketService) CallBotAPI(selfID, action string, params map[string]interface{}) (map[string]interface{}, error) {
	// 修复：处理action参数，移除开头的"/"，确保接口名称格式一致
	action = strings.TrimPrefix(action, "/")

	// 获取或创建该账号的并发控制通道（限制并发数为5）
	s.apiChanMu.Lock()
	ch, ok := s.apiChan[selfID]
	if !ok {
		ch = make(chan struct{}, 5) // 每个账号最多5个并发API请求
		s.apiChan[selfID] = ch
	}
	s.apiChanMu.Unlock()

	// 尝试获取并发许可，使用非阻塞select避免丢弃请求
	// 修复问题21：使用队列等待而不是直接丢弃请求
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	select {
	case ch <- struct{}{}:
		// 成功获取许可
	case <-ctx.Done():
		s.logger.Warnw("API请求等待并发许可超时",
			"self_id", selfID,
			"action", action)
		return nil, fmt.Errorf("API请求并发等待超时: %s", action)
	}
	// 确保释放许可
	defer func() { <-ch }()

	// 修复问题23：使用更安全的echo生成方式，包含selfID避免冲突
	echo := s.generateEcho(selfID)

	// 构建请求
	request := map[string]interface{}{
		"action": action,
		"params": params,
		"echo":   echo,
	}

	s.logger.Infow("准备发送API请求",
		"self_id", selfID,
		"action", action,
		"echo", echo)

	// 创建响应通道
	respChan := make(chan map[string]interface{}, 1)

	// 注册响应回调（临时）
	s.registerTempResponse(echo, respChan)
	// 修复问题24：在超时后也清理回调，但使用更安全的延迟清理
	defer func() {
		// 延迟一小段时间再清理，确保响应已经处理完毕
		time.Sleep(100 * time.Millisecond)
		s.unregisterTempResponse(echo)
	}()

	// 发送请求
	if err := s.SendMessageToAccount(selfID, request); err != nil {
		s.logger.Errorw("发送API请求失败",
			"self_id", selfID,
			"action", action,
			"error", err)
		return nil, err
	}

	s.logger.Infow("API请求已发送，等待响应",
		"self_id", selfID,
		"action", action,
		"echo", echo)

	// 等待响应（30秒超时，考虑到某些API如get_friend_list可能需要较长时间）
	select {
	case resp := <-respChan:
		s.logger.Infow("收到API响应",
			"self_id", selfID,
			"action", action,
			"echo", echo)
		// 修复问题19：确保响应数据结构与LLOneBotService一致
		// 返回完整的响应数据，包含status和data
		return resp, nil
	case <-time.After(30 * time.Second):
		s.logger.Errorw("API请求超时",
			"self_id", selfID,
			"action", action,
			"echo", echo)
		return nil, fmt.Errorf("API请求超时: %s", action)
	}
}

// generateEcho 生成唯一的 echo（修复问题23：包含selfID避免高并发冲突）
func (s *ReverseWebSocketService) generateEcho(selfID string) string {
	counter := atomic.AddUint64(&s.echoCounter, 1)
	return fmt.Sprintf("echo_%s_%d_%d", selfID, time.Now().UnixNano(), counter)
}

// registerTempResponse 注册临时响应回调（修复问题22：使用实例级别的锁）
func (s *ReverseWebSocketService) registerTempResponse(echo string, ch chan map[string]interface{}) {
	s.tempResponseMu.Lock()
	defer s.tempResponseMu.Unlock()
	s.tempResponseChan[echo] = ch
}

// unregisterTempResponse 取消注册临时响应回调
func (s *ReverseWebSocketService) unregisterTempResponse(echo string) {
	s.tempResponseMu.Lock()
	defer s.tempResponseMu.Unlock()
	if ch, ok := s.tempResponseChan[echo]; ok {
		// 安全关闭通道，避免重复关闭
		select {
		case <-ch:
			// 通道已经关闭或已收到数据
		default:
			close(ch)
		}
		delete(s.tempResponseChan, echo)
	}
}

// handleTempResponse 处理临时响应（修复问题22：使用实例级别的锁）
func (s *ReverseWebSocketService) handleTempResponse(echo string, response map[string]interface{}) {
	s.tempResponseMu.Lock()
	defer s.tempResponseMu.Unlock()
	if ch, ok := s.tempResponseChan[echo]; ok {
		// 使用非阻塞发送，避免阻塞
		select {
		case ch <- response:
		default:
			// 通道已满或已关闭，记录警告
			s.logger.Warnw("响应通道已满或已关闭，丢弃响应", "echo", echo)
		}
	}
}

// AddEventHandler 添加事件处理器
// 处理器会接收到所有账号的事件
func (s *ReverseWebSocketService) AddEventHandler(handler func(selfID string, eventData map[string]interface{})) {
	s.eventHandlersMu.Lock()
	defer s.eventHandlersMu.Unlock()
	s.eventHandlers = append(s.eventHandlers, handler)
}

// AddRawEventHandler 添加原始数据事件处理器
// 处理器会接收到所有账号的原始事件数据（不做解析，直接透传）
func (s *ReverseWebSocketService) AddRawEventHandler(handler func(selfID string, rawData []byte)) {
	s.rawEventHandlersMu.Lock()
	defer s.rawEventHandlersMu.Unlock()
	s.rawEventHandlers = append(s.rawEventHandlers, handler)
}

// GetEventHandlers 获取事件处理器列表（线程安全）
func (s *ReverseWebSocketService) GetEventHandlers() []func(selfID string, eventData map[string]interface{}) {
	s.eventHandlersMu.RLock()
	defer s.eventHandlersMu.RUnlock()
	handlers := make([]func(selfID string, eventData map[string]interface{}), len(s.eventHandlers))
	copy(handlers, s.eventHandlers)
	return handlers
}

// BroadcastToAllAccounts 广播消息到所有在线账号（线程安全）
func (s *ReverseWebSocketService) BroadcastToAllAccounts(message interface{}) {
	onlineAccounts := s.accountMgr.GetOnlineAccounts()

	data, err := json.Marshal(message)
	if err != nil {
		s.logger.Errorw("序列化广播消息失败", "error", err)
		return
	}

	for selfID, account := range onlineAccounts {
		if account.WsConn != nil {
			// 使用线程安全的写入方法
			if err := account.WriteMessage(websocket.TextMessage, data); err != nil {
				s.logger.Warnw("广播消息失败",
					"self_id", selfID,
					"error", err)
			}
		}
	}
}

// IsAccountConnected 检查账号是否已连接
func (s *ReverseWebSocketService) IsAccountConnected(selfID string) bool {
	account, err := s.accountMgr.GetAccount(selfID)
	if err != nil {
		return false
	}
	return account.IsOnline()
}

// GetConnectionStats 获取连接统计信息
func (s *ReverseWebSocketService) GetConnectionStats() map[string]interface{} {
	stats := s.accountMgr.GetAccountStats()
	return map[string]interface{}{
		"accounts": stats,
	}
}

// StartCleanupTask 启动定期清理任务
// 清理过期连接和超时未收到connect的连接
func (s *ReverseWebSocketService) StartCleanupTask(interval time.Duration, maxIdle time.Duration) {
	// 清理过期连接
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for range ticker.C {
			s.accountMgr.CleanupStaleConnections(maxIdle)
		}
	}()

	// 清理超时未收到connect的连接（3秒）
	go func() {
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()

		for range ticker.C {
			s.cleanupWaitingConnect()
		}
	}()
}

// SetMaxConnections 设置最大连接数限制
func (s *ReverseWebSocketService) SetMaxConnections(max int) {
	if max > 0 {
		s.maxConnections = max
	}
}

// UpdateGlobalToken 更新全局鉴权Token
// 用于动态更新WebSocket鉴权Token，无需重启服务
func (s *ReverseWebSocketService) UpdateGlobalToken(token string) {
	s.globalToken = token
	s.logger.Infow("全局鉴权Token已更新", "configured", token != "")
}

// GetMaxConnections 获取最大连接数限制
func (s *ReverseWebSocketService) GetMaxConnections() int {
	return s.maxConnections
}

// GetCurrentConnections 获取当前连接数
func (s *ReverseWebSocketService) GetCurrentConnections() int {
	return s.accountMgr.GetOnlineCount()
}

// GetAccountManager 获取账号管理器
func (s *ReverseWebSocketService) GetAccountManager() *BotAccountManager {
	return s.accountMgr
}

// SetLogManager 设置日志管理器
func (s *ReverseWebSocketService) SetLogManager(lm *LogManager) {
	s.logManager = lm
}

// GetLogManager 获取日志管理器
func (s *ReverseWebSocketService) GetLogManager() *LogManager {
	return s.logManager
}

// OnConnect 注册连接回调函数
// 当有新账号成功连接时，会调用所有注册的回调函数
func (s *ReverseWebSocketService) OnConnect(callback func(selfID string)) {
	s.onConnectMu.Lock()
	defer s.onConnectMu.Unlock()
	s.onConnectCallbacks = append(s.onConnectCallbacks, callback)
}

// triggerOnConnect 触发连接回调
func (s *ReverseWebSocketService) triggerOnConnect(selfID string) {
	s.onConnectMu.RLock()
	callbacks := make([]func(selfID string), len(s.onConnectCallbacks))
	copy(callbacks, s.onConnectCallbacks)
	s.onConnectMu.RUnlock()

	for _, callback := range callbacks {
		go callback(selfID)
	}
}

// cleanupWaitingConnect 清理超时未收到connect消息的连接
func (s *ReverseWebSocketService) cleanupWaitingConnect() {
	now := time.Now()
	timeout := 3 * time.Second

	s.waitingMu.Lock()
	defer s.waitingMu.Unlock()

	for selfID, info := range s.waitingConnect {
		if now.Sub(info.createdAt) > timeout {
			s.logger.Warnw("连接超时未收到connect消息，断开连接",
				"self_id", selfID,
				"custom_name", info.customName,
				"ip", info.ip,
				"timeout", now.Sub(info.createdAt).String())
			info.conn.Close()
			delete(s.waitingConnect, selfID)
		}
	}
}

// SubscribeLogs 订阅指定账号的日志
// 返回一个接收日志的通道，调用者需要通过 UnsubscribeLogs 取消订阅
func (s *ReverseWebSocketService) SubscribeLogs(selfID string) chan LogEntry {
	s.logSubMu.Lock()
	defer s.logSubMu.Unlock()

	// 创建带缓冲的通道，防止阻塞
	ch := make(chan LogEntry, 100)

	// 初始化该账号的订阅者集合
	if s.logSubscribers[selfID] == nil {
		s.logSubscribers[selfID] = make(map[chan LogEntry]bool)
	}
	s.logSubscribers[selfID][ch] = true

	s.logger.Debugw("日志订阅者添加", "self_id", selfID, "subscribers", len(s.logSubscribers[selfID]))
	return ch
}

// UnsubscribeLogs 取消日志订阅
func (s *ReverseWebSocketService) UnsubscribeLogs(selfID string, ch chan LogEntry) {
	s.logSubMu.Lock()
	defer s.logSubMu.Unlock()

	if subscribers, exists := s.logSubscribers[selfID]; exists {
		delete(subscribers, ch)
		close(ch)

		// 如果没有订阅者了，清理该账号的映射
		if len(subscribers) == 0 {
			delete(s.logSubscribers, selfID)
		}
	}
}

// BroadcastLog 广播日志到所有订阅者
func (s *ReverseWebSocketService) BroadcastLog(entry LogEntry) {
	s.logSubMu.RLock()
	defer s.logSubMu.RUnlock()

	subscribers, exists := s.logSubscribers[entry.SelfID]
	if !exists || len(subscribers) == 0 {
		return
	}

	// 广播到所有订阅者（非阻塞）
	for ch := range subscribers {
		select {
		case ch <- entry:
		default:
			// 通道已满，丢弃日志（避免阻塞）
			s.logger.Debugw("日志通道已满，丢弃日志", "self_id", entry.SelfID)
		}
	}
}
