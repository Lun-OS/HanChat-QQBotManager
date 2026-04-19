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
	// 心跳检测停止信号
	heartbeatStopChan chan struct{}

	// 修复问题22：临时响应回调（实例级别，避免全局变量竞争）
	tempResponseMu   sync.Mutex
	tempResponseChan map[string]chan map[string]interface{}
	tempResponseChanBytes map[string]chan []byte
	tempResponseTimes map[string]time.Time // ⭐ 响应通道注册时间（用于TTL清理）
	echoCounter      uint64 // 原子计数器，用于生成唯一的 echo

	// 调试响应处理器（用于WS调试时将API响应转发给调试客户端）
	debugResponseHandlers []func(selfID string, rawData []byte)
	debugResponseMu       sync.RWMutex

	// ========== 性能优化：日志广播Worker池 ==========
	logBroadcastChan   chan logBroadcastTask // 日志广播任务通道
	logBroadcastStop   chan struct{}         // 停止信号
	logBroadcastOnce   sync.Once             // 确保日志广播只停止一次
	stopOnce          sync.Once             // 确保Stop只执行一次
	// 清理任务控制（用于停止 StartCleanupTask 启动的 goroutine）
	cleanupStopChan  chan struct{}         // 清理任务停止信号
	cleanupOnce      sync.Once             // 确保清理任务只停止一次
	heartbeatOnce    sync.Once             // 确保心跳检测只停止一次
	cleanupWg        sync.WaitGroup        // 等待清理任务退出
}

// logBroadcastTask 日志广播任务
type logBroadcastTask struct {
	selfID  string
	postType string
	message string
	level   string
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
		tempResponseChanBytes: make(map[string]chan []byte),
		tempResponseTimes:  make(map[string]time.Time), // ⭐ 初始化时间戳映射
		echoCounter:       0,
		// 调试响应处理器初始化
		debugResponseHandlers: make([]func(selfID string, rawData []byte), 0),
		heartbeatStopChan:     make(chan struct{}),
		// 日志广播Worker池初始化（缓冲100，避免阻塞）
		logBroadcastChan:   make(chan logBroadcastTask, 100),
		logBroadcastStop:   make(chan struct{}),
		// 清理任务控制初始化
		cleanupStopChan:  make(chan struct{}),
	}

	// 启动心跳检测任务
	go service.heartbeatChecker()

	go service.logBroadcastWorker()

	memMgr := GetMemoryManager(logger)
	memMgr.RegisterCleanup(func() {
		service.cleanupExpiredTempResponses(30 * time.Second)
	})
	memMgr.RegisterCleanup(func() {
		service.cleanupStaleLogSubscribers()
	})
	memMgr.Start()

	return service
}

// heartbeatChecker 心跳检测任务
// 定期检查所有连接的心跳状态，关闭超时的连接
func (s *ReverseWebSocketService) heartbeatChecker() {
	ticker := time.NewTicker(s.heartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.checkHeartbeats()
		case <-s.heartbeatStopChan:
			s.logger.Debugw("心跳检测器已停止")
			return
		}
	}
}

func (s *ReverseWebSocketService) cleanupStaleLogSubscribers() {
	s.logSubMu.Lock()
	defer s.logSubMu.Unlock()

	for selfID, subscribers := range s.logSubscribers {
		var staleChans []chan LogEntry
		for ch := range subscribers {
			select {
			case <-ch:
			default:
				select {
				case ch <- LogEntry{}:
				default:
					staleChans = append(staleChans, ch)
				}
			}
		}
		for _, ch := range staleChans {
			delete(subscribers, ch)
			func() {
				defer func() { recover() }()
				close(ch)
			}()
		}
		if len(subscribers) == 0 {
			delete(s.logSubscribers, selfID)
		}
	}
}
// Stop 停止WebSocket服务并清理所有资源
// 使用 sync.Once 确保只执行一次，避免重复关闭通道导致 panic
func (s *ReverseWebSocketService) Stop() {
	s.stopOnce.Do(func() {
		s.logger.Infow("正在停止WebSocket服务...")

		// 停止日志广播Worker（使用独立的sync.Once确保安全）
		s.logBroadcastOnce.Do(func() {
			close(s.logBroadcastStop)
		})

		// 停止心跳检测器（使用独立的sync.Once确保安全）
		s.heartbeatOnce.Do(func() {
			close(s.heartbeatStopChan)
		})

		// 停止定期清理任务（使用独立的sync.Once确保安全）
		s.cleanupOnce.Do(func() {
			close(s.cleanupStopChan)
		})
		// 等待清理任务退出（最多等待5秒）
		done := make(chan struct{})
		go func() {
			s.cleanupWg.Wait()
			close(done)
		}()
		select {
		case <-done:
			s.logger.Debugw("清理任务已退出")
		case <-time.After(5 * time.Second):
			s.logger.Warnw("清理任务退出超时")
		}

		// 清理所有账号资源
		if s.accountMgr != nil {
			s.accountMgr.CleanupAllAccounts()
		}

		s.logger.Infow("WebSocket服务已停止")
	})
}

// logBroadcastWorker 日志广播Worker
// 单goroutine处理所有日志广播任务，避免高并发下创建大量goroutine导致资源耗尽
func (s *ReverseWebSocketService) logBroadcastWorker() {
	for {
		select {
		case <-s.logBroadcastStop:
			s.logger.Debugw("日志广播Worker已停止")
			return
		case task := <-s.logBroadcastChan:
			if task.message != "" {
				s.BroadcastLog(LogEntry{
					SelfID:  task.selfID,
					Level:   task.level,
					Message: task.message,
					Source:  "websocket",
					Time:    time.Now(),
				})
			}
		}
	}
}

// checkHeartbeats 检查所有连接的心跳状态
// [已禁用] 不再因为心跳超时而主动关闭连接
func (s *ReverseWebSocketService) checkHeartbeats() {
	// 只记录心跳超时，但不主动关闭连接
	// 连接只在真正异常断开时才关闭
	s.lastHeartbeatMu.RLock()
	now := time.Now()

	for selfID, lastBeat := range s.lastHeartbeat {
		if now.Sub(lastBeat) > s.heartbeatTimeout {
			s.logger.Debugw("检测到心跳超时，但不主动关闭连接",
				"self_id", selfID,
				"timeout", s.heartbeatTimeout.String(),
				"last_beat", lastBeat)
		}
	}
	s.lastHeartbeatMu.RUnlock()
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

// CleanupAccount 清理指定账号的所有资源
func (s *ReverseWebSocketService) CleanupAccount(selfID string) {
	s.logger.Debugw("开始清理账号资源", "self_id", selfID)
	
	// 1. 清理心跳记录
	s.RemoveHeartbeat(selfID)
	
	// 2. 清理并发控制通道
	s.apiChanMu.Lock()
	delete(s.apiChan, selfID)
	s.apiChanMu.Unlock()
	
	// 3. 清理等待连接列表
	s.waitingMu.Lock()
	delete(s.waitingConnect, selfID)
	s.waitingMu.Unlock()
	
	// 4. 清理临时响应通道（与该账号相关的所有 echo）
	s.tempResponseMu.Lock()
	// 找出所有以 selfID 开头的 echo 并删除
	for echo := range s.tempResponseChan {
		if strings.HasPrefix(echo, "echo_"+selfID+"_") {
			delete(s.tempResponseChan, echo)
		}
	}
	for echo := range s.tempResponseChanBytes {
		if strings.HasPrefix(echo, "echo_"+selfID+"_") {
			delete(s.tempResponseChanBytes, echo)
		}
	}
	s.tempResponseMu.Unlock()
	
	s.logger.Infow("账号资源清理完成", "self_id", selfID)
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
	// 设置 ping 处理函数 - 收到 ping 时自动回复 pong 并更新心跳
	conn.SetPingHandler(func(appData string) error {
		s.logger.Debugw("收到 ping，更新心跳", "self_id", selfID)
		s.UpdateHeartbeat(selfID)
		if account, err := s.accountMgr.GetAccount(selfID); err == nil {
			account.UpdateActivity()
		}
		// 自动回复 pong
		err := conn.WriteControl(websocket.PongMessage, []byte(appData), time.Now().Add(time.Second*10))
		if err != nil {
			s.logger.Warnw("发送 pong 失败", "self_id", selfID, "error", err)
		}
		return nil
	})

	// 设置 pong 处理函数 - 收到 pong 时也更新心跳
	conn.SetPongHandler(func(appData string) error {
		s.logger.Debugw("收到 pong，更新心跳", "self_id", selfID)
		s.UpdateHeartbeat(selfID)
		if account, err := s.accountMgr.GetAccount(selfID); err == nil {
			account.UpdateActivity()
		}
		return nil
	})

	defer func() {
		// 连接断开时的清理工作
		// 使用 HandleDisconnect 统一处理，它会通过 SafeClose 安全关闭连接
		// 不在这里直接调用 conn.Close()，避免重复关闭
		s.accountMgr.HandleDisconnect(selfID, fmt.Errorf("连接关闭"))
		s.CleanupAccount(selfID)
	}()

	for {
		messageType, data, err := conn.ReadMessage()
		if err != nil {
			// 优化错误处理 - 减少不必要的警告日志
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure, websocket.CloseTLSHandshake, websocket.CloseNormalClosure) {
				// 只记录非预期的错误，正常关闭不记录警告
				if !websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway, websocket.CloseNoStatusReceived) {
					s.logger.Warnw("WebSocket读取错误",
						"self_id", selfID,
						"error", err)
				}
			} else {
				// 其他错误（如网络中断）记录为信息级
				s.logger.Infow("WebSocket连接关闭",
					"self_id", selfID,
					"error", err)
			}
			return
		}

		// 收到任何消息都更新心跳（包括 TextMessage, BinaryMessage 等）
		s.UpdateHeartbeat(selfID)
		if account, err := s.accountMgr.GetAccount(selfID); err == nil {
			account.UpdateActivity()
		}

		// 只处理文本消息
		if messageType != websocket.TextMessage {
			continue
		}

		// 记录接收的 WebSocket 消息（排除 ping）
		if s.logManager != nil {
			s.logManager.WriteWSLog(selfID, "recv", data)
		}

		var msg map[string]interface{}
		if err := json.Unmarshal(data, &msg); err != nil {
			s.logger.Errorw("解析消息失败",
				"self_id", selfID,
				"error", err,
				"data", string(data))
			continue
		}

		s.handleMessage(selfID, msg, data)

		if memMgr := GetMemoryManager(nil); memMgr.running.Load() {
			memMgr.RecordMessage()
		}
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
// 优化：减少内存分配，合并锁获取操作，使用对象池减少GC压力
func (s *ReverseWebSocketService) handleEvent(selfID string, eventData map[string]interface{}, rawData []byte) {
	postType, _ := eventData["post_type"].(string)

	if postType == "meta_event" {
		metaEventType, _ := eventData["meta_event_type"].(string)
		if metaEventType == "heartbeat" {
			return
		}
	}

	if _, ok := eventData["self_id"].(string); !ok {
		eventData["_self_id"] = selfID
	}

	s.eventHandlersMu.RLock()
	handlerCount := len(s.eventHandlers)
	if handlerCount == 0 {
		s.eventHandlersMu.RUnlock()

		s.rawEventHandlersMu.RLock()
		rawHandlerCount := len(s.rawEventHandlers)
		if rawHandlerCount == 0 {
			s.rawEventHandlersMu.RUnlock()
			return
		}
		rawHandlers := make([]func(selfID string, rawData []byte), rawHandlerCount)
		copy(rawHandlers, s.rawEventHandlers)
		s.rawEventHandlersMu.RUnlock()
		for _, handler := range rawHandlers {
			handler(selfID, rawData)
		}
		return
	}

	handlers := make([]func(selfID string, eventData map[string]interface{}), handlerCount)
	copy(handlers, s.eventHandlers)
	s.eventHandlersMu.RUnlock()

	select {
	case s.logBroadcastChan <- s.buildLogBroadcastTask(selfID, postType, eventData):
	default:
	}

	for _, handler := range handlers {
		handler(selfID, eventData)
	}

	s.rawEventHandlersMu.RLock()
	rawHandlerCount := len(s.rawEventHandlers)
	if rawHandlerCount == 0 {
		s.rawEventHandlersMu.RUnlock()
		return
	}
	rawHandlers := make([]func(selfID string, rawData []byte), rawHandlerCount)
	copy(rawHandlers, s.rawEventHandlers)
	s.rawEventHandlersMu.RUnlock()

	for _, handler := range rawHandlers {
		handler(selfID, rawData)
	}
}

// buildLogBroadcastTask 构建日志广播任务
// 在handleEvent中同步调用，提取日志信息后立即释放eventData引用
func (s *ReverseWebSocketService) buildLogBroadcastTask(selfID string, postType string, eventData map[string]interface{}) logBroadcastTask {
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
		subType, _ := eventData["sub_type"].(string)
		message = fmt.Sprintf("[元事件] %s", subType)
	default:
		message = fmt.Sprintf("[事件] %s", postType)
	}

	return logBroadcastTask{
		selfID:   selfID,
		postType: postType,
		message:  message,
		level:    level,
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

	// 分发给调试响应处理器（用于WS调试）
	s.debugResponseMu.RLock()
	debugHandlers := make([]func(selfID string, rawData []byte), len(s.debugResponseHandlers))
	copy(debugHandlers, s.debugResponseHandlers)
	s.debugResponseMu.RUnlock()
	for _, handler := range debugHandlers {
		handler(selfID, rawData)
	}

	// 处理临时响应（map类型）- 同步处理以减少延迟
	s.logger.Debugw("处理临时响应", "echo", echo)
	s.handleTempResponse(echo, response)

	// 处理临时响应（字节类型，用于原始数据透传）- 同步处理以减少延迟
	s.handleTempResponseBytes(echo, rawData)
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
	// 先检查账号是否在线
	account, err := s.accountMgr.GetAccount(selfID)
	if err != nil {
		return nil, fmt.Errorf("账号不存在: %w", err)
	}
	if !account.IsOnline() {
		return nil, fmt.Errorf("账号离线: %s", selfID)
	}
	
	// 修复：处理action参数，移除开头的"/"，确保接口名称格式一致
	action = strings.TrimPrefix(action, "/")

	// 优化：获取或创建该账号的并发控制通道（提升并发限制从5到20）
	s.apiChanMu.Lock()
	ch, ok := s.apiChan[selfID]
	if !ok {
		ch = make(chan struct{}, 20) // 每个账号最多20个并发API请求（原5太小）
		s.apiChan[selfID] = ch
	}
	s.apiChanMu.Unlock()

	// 尝试获取并发许可，使用非阻塞select避免丢弃请求
	// 优化：增加等待超时从5秒到15秒（原超时太短导致大量请求失败）
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
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
	// 优化：使用defer异步清理，不阻塞当前调用
	// 原来的50ms sleep会导致每个API调用都额外增加50ms延迟
	defer func() {
		go func() {
			// 异步清理，短延时确保响应已处理完毕
			time.Sleep(10 * time.Millisecond) // 优化：从50ms降低到10ms
			s.unregisterTempResponse(echo)
		}()
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

// CallBotAPIRaw 发送API请求到机器人并直接返回原始响应（用于接口调试透传）
func (s *ReverseWebSocketService) CallBotAPIRaw(selfID, action string, params map[string]interface{}) ([]byte, error) {
	// 先检查账号是否在线
	account, err := s.accountMgr.GetAccount(selfID)
	if err != nil {
		return nil, fmt.Errorf("账号不存在: %w", err)
	}
	if !account.IsOnline() {
		return nil, fmt.Errorf("账号离线: %s", selfID)
	}
	
	action = strings.TrimPrefix(action, "/")

	s.apiChanMu.Lock()
	ch, ok := s.apiChan[selfID]
	if !ok {
		ch = make(chan struct{}, 20) // 统一并发限制为20（与CallBotAPI保持一致）
		s.apiChan[selfID] = ch
	}
	s.apiChanMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second) // 统一超时时间为15秒
	defer cancel()

	select {
	case ch <- struct{}{}:
	case <-ctx.Done():
		return nil, fmt.Errorf("API请求并发等待超时: %s", action)
	}
	defer func() { <-ch }()

	echo := s.generateEcho(selfID)

	request := map[string]interface{}{
		"action": action,
		"params": params,
		"echo":   echo,
	}

	respChan := make(chan []byte, 1)
	s.registerTempResponseBytes(echo, respChan)
	defer func() {
		go func() {
			time.Sleep(10 * time.Millisecond) // 优化：从100ms降低到10ms
			s.unregisterTempResponseBytes(echo)
		}()
	}()

	if err := s.SendMessageToAccount(selfID, request); err != nil {
		return nil, err
	}

	select {
	case rawResp := <-respChan:
		return rawResp, nil
	case <-time.After(30 * time.Second):
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
	s.tempResponseTimes[echo] = time.Now() // ⭐ 记录注册时间
}

// unregisterTempResponse 取消注册临时响应回调
func (s *ReverseWebSocketService) unregisterTempResponse(echo string) {
	s.tempResponseMu.Lock()
	defer s.tempResponseMu.Unlock()

	ch, ok := s.tempResponseChan[echo]
	if !ok {
		return
	}

	// 先删除映射和时间戳，再关闭通道，避免竞态条件
	delete(s.tempResponseChan, echo)
	delete(s.tempResponseTimes, echo) // ⭐ 清理时间戳

	// 使用 recover 防止重复关闭 panic（安全网）
	defer func() {
		if r := recover(); r != nil {
			s.logger.Debugw("通道已关闭，忽略重复关闭", "echo", echo, "recover", r)
		}
	}()
	close(ch)
}

// handleTempResponse 处理临时响应（修复问题22：使用实例级别的锁）
func (s *ReverseWebSocketService) handleTempResponse(echo string, response map[string]interface{}) {
	s.tempResponseMu.Lock()
	ch, ok := s.tempResponseChan[echo]
	if !ok {
		s.tempResponseMu.Unlock()
		return
	}
	// ⭐ 关键修复：从map中移除引用，防止并发关闭
	delete(s.tempResponseChan, echo)
	s.tempResponseMu.Unlock()

	// 在锁外发送，使用defer+recover防止向已关闭的channel发送导致panic
	func() {
		defer func() {
			if r := recover(); r != nil {
				s.logger.Warnw("响应通道可能已关闭，忽略发送错误",
					"echo", echo,
					"error", r)
			}
		}()

		select {
		case ch <- response:
			// 发送成功
		case <-time.After(5 * time.Second):
			// 发送超时，可能是通道已满或正在关闭
			s.logger.Warnw("响应通道发送超时，丢弃响应", "echo", echo)
		}
	}()
}

// registerTempResponseBytes 注册字节类型的临时响应回调
func (s *ReverseWebSocketService) registerTempResponseBytes(echo string, ch chan []byte) {
	s.tempResponseMu.Lock()
	defer s.tempResponseMu.Unlock()
	s.tempResponseChanBytes[echo] = ch
	s.tempResponseTimes[echo] = time.Now() // ⭐ 记录注册时间
}

// unregisterTempResponseBytes 取消注册字节类型的临时响应回调
func (s *ReverseWebSocketService) unregisterTempResponseBytes(echo string) {
	s.tempResponseMu.Lock()
	defer s.tempResponseMu.Unlock()

	ch, ok := s.tempResponseChanBytes[echo]
	if !ok {
		return
	}

	// 先删除映射和时间戳，再关闭通道，避免竞态条件
	delete(s.tempResponseChanBytes, echo)
	delete(s.tempResponseTimes, echo) // ⭐ 清理时间戳

	// 使用 recover 防止重复关闭 panic（安全网）
	defer func() {
		if r := recover(); r != nil {
			s.logger.Debugw("字节通道已关闭，忽略重复关闭", "echo", echo, "recover", r)
		}
	}()
	close(ch)
}

// handleTempResponseBytes 处理字节类型的临时响应
func (s *ReverseWebSocketService) handleTempResponseBytes(echo string, rawData []byte) {
	s.tempResponseMu.Lock()
	ch, ok := s.tempResponseChanBytes[echo]
	if !ok {
		s.tempResponseMu.Unlock()
		return
	}
	// ⭐ 关键修复：从map中移除引用，防止并发关闭
	delete(s.tempResponseChanBytes, echo)
	s.tempResponseMu.Unlock()

	// 在锁外发送，使用defer+recover防止向已关闭的channel发送导致panic
	func() {
		defer func() {
			if r := recover(); r != nil {
				s.logger.Warnw("字节响应通道可能已关闭，忽略发送错误",
					"echo", echo,
					"error", r)
			}
		}()

		select {
		case ch <- rawData:
			// 发送成功
		case <-time.After(5 * time.Second):
			// 发送超时，可能是通道已满或正在关闭
			s.logger.Warnw("字节响应通道发送超时，丢弃响应", "echo", echo)
		}
	}()
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

// AddDebugResponseHandler 添加调试响应处理器
// 处理器会接收到所有账号的API响应原始数据（用于WS调试）
func (s *ReverseWebSocketService) AddDebugResponseHandler(handler func(selfID string, rawData []byte)) {
	s.debugResponseMu.Lock()
	defer s.debugResponseMu.Unlock()
	s.debugResponseHandlers = append(s.debugResponseHandlers, handler)
}

// RemoveDebugResponseHandler 移除调试响应处理器
func (s *ReverseWebSocketService) RemoveDebugResponseHandler(handler func(selfID string, rawData []byte)) {
	s.debugResponseMu.Lock()
	defer s.debugResponseMu.Unlock()
	// 修复：遍历查找并移除匹配的处理器（原代码使用 &h==&handler 比较循环变量地址，永远为false，导致永远无法移除）
	for i, h := range s.debugResponseHandlers {
		// 使用 reflect.ValueOf().Pointer() 比较函数指针地址
		if fmt.Sprintf("%p", h) == fmt.Sprintf("%p", handler) {
			s.debugResponseHandlers = append(s.debugResponseHandlers[:i], s.debugResponseHandlers[i+1:]...)
			return
		}
	}
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
	// 清理过期连接（使用 cleanupWg 跟踪，支持优雅退出）
	s.cleanupWg.Add(1)
	go func() {
		defer s.cleanupWg.Done()
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				s.accountMgr.CleanupStaleConnections(maxIdle)
			case <-s.cleanupStopChan:
				return
			}
		}
	}()

	// 清理超时未收到connect的连接（3秒）
	s.cleanupWg.Add(1)
	go func() {
		defer s.cleanupWg.Done()
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				s.cleanupWaitingConnect()
			case <-s.cleanupStopChan:
				return
			}
		}
	}()

	// ⭐ 新增：定期清理过期的临时响应通道（TTL 60秒）
	s.cleanupWg.Add(1)
	go func() {
		defer s.cleanupWg.Done()
		ticker := time.NewTicker(30 * time.Second) // 每30秒清理一次
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				s.cleanupExpiredTempResponses(30 * time.Second) // TTL = 30秒（优化：缩短TTL减少内存占用）
			case <-s.cleanupStopChan:
				return
			}
		}
	}()
}

// cleanupExpiredTempResponses 清理过期的临时响应通道（防止内存泄漏）
func (s *ReverseWebSocketService) cleanupExpiredTempResponses(ttl time.Duration) {
	s.tempResponseMu.Lock()
	defer s.tempResponseMu.Unlock()

	now := time.Now()
	expiredCount := 0

	for echo, registerTime := range s.tempResponseTimes {
		if now.Sub(registerTime) > ttl {
			// 过期的响应通道，清理它
			if ch, ok := s.tempResponseChan[echo]; ok {
				delete(s.tempResponseChan, echo)
				func() {
					defer func() {
						if r := recover(); r != nil {
							// 忽略关闭已关闭通道的错误
						}
					}()
					close(ch)
				}()
			}
			if ch, ok := s.tempResponseChanBytes[echo]; ok {
				delete(s.tempResponseChanBytes, echo)
				func() {
					defer func() {
						if r := recover(); r != nil {
							// 忽略关闭已关闭通道的错误
						}
					}()
					close(ch)
				}()
			}
			delete(s.tempResponseTimes, echo)
			expiredCount++
		}
	}

	if expiredCount > 0 {
		s.logger.Debugw("清理过期临时响应通道",
			"expired_count", expiredCount,
			"remaining", len(s.tempResponseTimes),
			"ttl", ttl.String())
	}
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
// 返回回调ID，用于后续移除
func (s *ReverseWebSocketService) OnConnect(callback func(selfID string)) string {
	s.onConnectMu.Lock()
	defer s.onConnectMu.Unlock()
	
	// 生成唯一回调ID
	callbackID := fmt.Sprintf("callback_%d", time.Now().UnixNano())
	s.onConnectCallbacks = append(s.onConnectCallbacks, callback)
	
	return callbackID
}

// RemoveOnConnect 移除连接回调函数
func (s *ReverseWebSocketService) RemoveOnConnect(callback func(selfID string)) {
	s.onConnectMu.Lock()
	defer s.onConnectMu.Unlock()
	
	// 通过函数指针比较移除回调
	for i, cb := range s.onConnectCallbacks {
		if fmt.Sprintf("%p", cb) == fmt.Sprintf("%p", callback) {
			s.onConnectCallbacks = append(s.onConnectCallbacks[:i], s.onConnectCallbacks[i+1:]...)
			return
		}
	}
}

// triggerOnConnect 触发连接回调
func (s *ReverseWebSocketService) triggerOnConnect(selfID string) {
	s.onConnectMu.RLock()
	callbacks := make([]func(selfID string), len(s.onConnectCallbacks))
	copy(callbacks, s.onConnectCallbacks)
	s.onConnectMu.RUnlock()

	for _, callback := range callbacks {
		go func(cb func(string)) {
			defer func() {
				if r := recover(); r != nil {
					s.logger.Errorw("连接回调panic", "self_id", selfID, "recover", r)
				}
			}()
			cb(selfID)
		}(callback)
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
	subscribers, exists := s.logSubscribers[entry.SelfID]
	if !exists || len(subscribers) == 0 {
		s.logSubMu.RUnlock()
		return
	}

	var staleChans []chan LogEntry
	for ch := range subscribers {
		select {
		case ch <- entry:
		default:
			staleChans = append(staleChans, ch)
		}
	}
	s.logSubMu.RUnlock()

	if len(staleChans) > 0 {
		s.logSubMu.Lock()
		for _, ch := range staleChans {
			if subscribers, exists := s.logSubscribers[entry.SelfID]; exists {
				delete(subscribers, ch)
				func() {
					defer func() { recover() }()
					close(ch)
				}()
			}
		}
		if subs, exists := s.logSubscribers[entry.SelfID]; exists && len(subs) == 0 {
			delete(s.logSubscribers, entry.SelfID)
		}
		s.logSubMu.Unlock()
	}
}
