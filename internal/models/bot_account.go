package models

import (
	"fmt"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// BotLoginInfo 机器人登录信息
type BotLoginInfo struct {
	UserID   int64  `json:"user_id"`
	Nickname string `json:"nickname"`
}

// BotVersionInfo 机器人版本信息
type BotVersionInfo struct {
	AppName           string `json:"app_name"`
	ProtocolVersion   string `json:"protocol_version"`
	AppVersion        string `json:"app_version"`
}

// BotStatus 机器人状态
type BotStatus struct {
	Online bool   `json:"online"`
	Good   bool   `json:"good"`
	Stat   *BotStat `json:"stat,omitempty"`
}

// BotStat 机器人统计信息
type BotStat struct {
	MessageReceived  int64 `json:"message_received"`
	MessageSent      int64 `json:"message_sent"`
	LastMessageTime int64 `json:"last_message_time"`
	StartupTime     int64 `json:"startup_time"`
}

// BotAccount 机器人账号模型
// 以self_id（QQ号）为唯一标识，管理多账号架构中的单个账号信息
type BotAccount struct {
	SelfID          string         `json:"self_id"`           // QQ号，唯一标识
	CustomName      string         `json:"custom_name"`       // 反向WS自定义名称（/ws/{customName}）
	Status          string         `json:"status"`            // online/offline
	CreatedAt       time.Time      `json:"created_at"`        // 账号自动创建时间
	LastConnectedAt time.Time      `json:"last_connected_at"` // 最后连接时间
	LastActivityAt  time.Time      `json:"last_activity_at"`  // 最后活动时间（收到消息）
	OfflineAt       *time.Time     `json:"offline_at,omitempty"` // 离线时间（用于缓存管理）
	WsConn          *websocket.Conn `json:"-"`               // WS连接句柄（不序列化）
	connMu          sync.Mutex     `json:"-"`               // 保护WsConn的互斥锁
	LoginInfo       *BotLoginInfo  `json:"login_info,omitempty"`       // 登录信息
	VersionInfo     *BotVersionInfo `json:"version_info,omitempty"`    // 版本信息
	BotStatus       *BotStatus     `json:"bot_status,omitempty"`      // 机器人状态
}

// NewBotAccount 创建新的BotAccount实例
// 自动设置创建时间和初始状态
func NewBotAccount(selfID, customName string) *BotAccount {
	now := time.Now()
	return &BotAccount{
		SelfID:          selfID,
		CustomName:      customName,
		Status:          "offline",
		CreatedAt:       now,
		LastConnectedAt: now,
		LastActivityAt:  now,
		WsConn:          nil,
	}
}

// UpdateStatus 更新账号在线状态
// status应为 "online" 或 "offline"
func (ba *BotAccount) UpdateStatus(status string) {
	ba.Status = status
	if status == "online" {
		ba.LastConnectedAt = time.Now()
	}
}

// UpdateConn 更新WebSocket连接句柄
// 当机器人连接或断开时调用
func (ba *BotAccount) UpdateConn(conn *websocket.Conn) {
	ba.WsConn = conn
	if conn != nil {
		ba.Status = "online"
		ba.LastConnectedAt = time.Now()
		ba.LastActivityAt = time.Now()
	} else {
		ba.Status = "offline"
	}
}

// UpdateActivity 更新最后活动时间
// 在收到消息时调用，用于保活
func (ba *BotAccount) UpdateActivity() {
	ba.LastActivityAt = time.Now()
}

// IsOnline 检查账号是否在线
func (ba *BotAccount) IsOnline() bool {
	return ba.Status == "online" && ba.WsConn != nil
}

// SetLoginInfo 设置登录信息
func (ba *BotAccount) SetLoginInfo(info *BotLoginInfo) {
	ba.LoginInfo = info
}

// SetVersionInfo 设置版本信息
func (ba *BotAccount) SetVersionInfo(info *BotVersionInfo) {
	ba.VersionInfo = info
}

// SetBotStatus 设置机器人状态
func (ba *BotAccount) SetBotStatus(status *BotStatus) {
	ba.BotStatus = status
}

// WriteMessage 线程安全地发送WebSocket消息
func (ba *BotAccount) WriteMessage(messageType int, data []byte) error {
	ba.connMu.Lock()
	defer ba.connMu.Unlock()

	if ba.WsConn == nil {
		return fmt.Errorf("连接不存在")
	}

	return ba.WsConn.WriteMessage(messageType, data)
}

// SafeClose 安全关闭连接，返回是否实际关闭了连接
// 使用互斥锁保护，避免重复关闭导致的 panic
func (ba *BotAccount) SafeClose() bool {
	ba.connMu.Lock()
	defer ba.connMu.Unlock()

	if ba.WsConn == nil {
		return false
	}

	ba.WsConn.Close()
	ba.WsConn = nil
	return true
}
