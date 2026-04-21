package services

import (
	"fmt"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"go.uber.org/zap"
	"HanChat-QQBotManager/internal/config"
	"HanChat-QQBotManager/internal/models"
	"HanChat-QQBotManager/internal/utils"
)

// BotAccountManager 多账号管理器单例
// 负责管理所有机器人账号的生命周期、连接状态和配置持久化
type BotAccountManager struct {
	mu       sync.RWMutex
	accounts map[string]*models.BotAccount // key: self_id
	logger   *zap.SugaredLogger
	config   *config.AccountConfig
}

var (
	botAccountMgrInstance *BotAccountManager
	botAccountMgrOnce     sync.Once
)

// GetBotAccountManager 获取BotAccountManager单例
// 注意：首次调用时 baseLogger 和 cfg 不能为nil
func GetBotAccountManager(baseLogger *zap.Logger, cfg *config.AccountConfig) *BotAccountManager {
	botAccountMgrOnce.Do(func() {
		// 参数验证
		if baseLogger == nil {
			panic("GetBotAccountManager: baseLogger cannot be nil")
		}
		if cfg == nil {
			panic("GetBotAccountManager: cfg cannot be nil")
		}
		
		logger := utils.NewModuleLogger(baseLogger, "service.bot_account_mgr")

		mgr := &BotAccountManager{
			accounts: make(map[string]*models.BotAccount),
			logger:   logger,
			config:   cfg,
		}

		// 只使用内存管理账号，不从配置文件加载
		// 账号只在WebSocket连接成功后才会被添加到列表

		botAccountMgrInstance = mgr
	})

	return botAccountMgrInstance
}

// loadAccountsFromConfig 从配置文件加载账号列表
// 启动时调用，恢复上次运行的账号信息
func (m *BotAccountManager) loadAccountsFromConfig() error {
	accounts, err := m.config.GetAllAccounts()
	if err != nil {
		return fmt.Errorf("加载账号配置失败: %w", err)
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	// 加载账号，但重置连接状态为离线（因为WS连接需要重新建立）
	for selfID, account := range accounts {
		account.Status = "offline"
		account.WsConn = nil
		m.accounts[selfID] = account
	}

	m.logger.Infow("从配置加载账号完成", "count", len(m.accounts))
	return nil
}

// GetAccount 获取账号信息
// 如果不存在，返回错误
func (m *BotAccountManager) GetAccount(selfID string) (*models.BotAccount, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	account, exists := m.accounts[selfID]
	if !exists {
		return nil, fmt.Errorf("账号不存在: %s", selfID)
	}

	return account, nil
}

// CreateAccount 创建新账号
// 如果账号已存在，直接返回现有账号
// 新账号会自动持久化到配置文件
func (m *BotAccountManager) CreateAccount(selfID, customName string) (*models.BotAccount, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// 检查是否已存在
	if account, exists := m.accounts[selfID]; exists {
		m.logger.Infow("账号已存在，返回现有账号", "self_id", selfID)
		return account, nil
	}

	// 创建新账号
	account := models.NewBotAccount(selfID, customName)
	m.accounts[selfID] = account

	// 持久化到配置文件
	if err := m.config.SaveAccountConfig(account); err != nil {
		m.logger.Errorw("保存账号配置失败", "self_id", selfID, "error", err)
		// 不返回错误，继续运行
	}

	m.logger.Infow("创建新账号", "self_id", selfID, "custom_name", customName)
	return account, nil
}

// UpdateConn 更新账号的WebSocket连接句柄
// 当机器人连接或断开时调用
func (m *BotAccountManager) UpdateConn(selfID string, conn *websocket.Conn) {
	m.mu.Lock()
	defer m.mu.Unlock()

	account, exists := m.accounts[selfID]
	if !exists {
		m.logger.Warnw("更新连接失败：账号不存在", "self_id", selfID)
		return
	}

	oldStatus := account.Status
	account.UpdateConn(conn)

	// 记录状态变化
	if oldStatus != account.Status {
		if account.Status == "online" {
			m.logger.Infow("账号上线", "self_id", selfID, "custom_name", account.CustomName)
		} else {
			m.logger.Infow("账号离线", "self_id", selfID, "custom_name", account.CustomName)
		}

		// 更新配置文件中的状态
		if err := m.config.SaveAccountConfig(account); err != nil {
			m.logger.Errorw("保存账号状态失败", "self_id", selfID, "error", err)
		}
	}
}

// UpdateStatus 更新账号在线状态
func (m *BotAccountManager) UpdateStatus(selfID string, status string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	account, exists := m.accounts[selfID]
	if !exists {
		m.logger.Warnw("更新状态失败：账号不存在", "self_id", selfID)
		return
	}

	oldStatus := account.Status
	account.UpdateStatus(status)

	if oldStatus != status {
		m.logger.Infow("账号状态变更", "self_id", selfID, "old_status", oldStatus, "new_status", status)

		// 更新配置文件
		if err := m.config.SaveAccountConfig(account); err != nil {
			m.logger.Errorw("保存账号状态失败", "self_id", selfID, "error", err)
		}
	}
}

// ValidateXSelfID 校验X-Self-ID一致性
// 用于反向WS连接鉴权，确保请求头中的self_id与URL中的customName对应账号一致
func (m *BotAccountManager) ValidateXSelfID(selfID, xSelfID string) error {
	if selfID != xSelfID {
		return fmt.Errorf("X-Self-ID不匹配: expected=%s, got=%s", selfID, xSelfID)
	}
	return nil
}

// GetAccountByCustomName 通过customName查找账号
func (m *BotAccountManager) GetAccountByCustomName(customName string) (*models.BotAccount, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, account := range m.accounts {
		if account.CustomName == customName {
			return account, nil
		}
	}

	return nil, fmt.Errorf("找不到custom_name为%s的账号", customName)
}

// GetAllAccounts 获取所有账号
func (m *BotAccountManager) GetAllAccounts() map[string]*models.BotAccount {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// 返回副本
	accounts := make(map[string]*models.BotAccount)
	for k, v := range m.accounts {
		accounts[k] = v
	}

	return accounts
}

// GetOnlineAccounts 获取所有在线账号
func (m *BotAccountManager) GetOnlineAccounts() map[string]*models.BotAccount {
	m.mu.RLock()
	defer m.mu.RUnlock()

	onlineAccounts := make(map[string]*models.BotAccount)
	for k, v := range m.accounts {
		if v.IsOnline() {
			onlineAccounts[k] = v
		}
	}

	return onlineAccounts
}

// DeleteAccount 删除账号
func (m *BotAccountManager) DeleteAccount(selfID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	account, exists := m.accounts[selfID]
	if !exists {
		return fmt.Errorf("账号不存在: %s", selfID)
	}

	// 如果账号在线，先断开连接
	// 使用 SafeClose 安全关闭，避免重复关闭
	account.SafeClose()

	delete(m.accounts, selfID)

	// 从配置文件删除
	if err := m.config.DeleteAccountConfig(selfID); err != nil {
		m.logger.Errorw("删除账号配置失败", "self_id", selfID, "error", err)
	}

	m.logger.Infow("删除账号", "self_id", selfID)
	return nil
}

// HandleDisconnect 处理账号断连
// 记录断连日志，清理连接句柄，标记离线，被动等待重连
func (m *BotAccountManager) HandleDisconnect(selfID string, reason error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	account, exists := m.accounts[selfID]
	if !exists {
		m.logger.Warnw("处理断连失败：账号不存在", "self_id", selfID)
		return
	}

	// 记录断连日志
	m.logger.Infow("账号断连",
		"self_id", selfID,
		"custom_name", account.CustomName,
		"reason", reason,
		"last_connected_at", account.LastConnectedAt,
	)

	// 清理连接句柄，标记离线，记录离线时间
	// 使用 SafeClose 安全关闭连接，避免重复关闭
	account.SafeClose()
	account.Status = "offline"
	now := time.Now()
	account.OfflineAt = &now

	// 更新配置文件
	if err := m.config.SaveAccountConfig(account); err != nil {
		m.logger.Errorw("保存账号离线状态失败", "self_id", selfID, "error", err)
	}

	m.logger.Infow("账号已标记为离线，保留在缓存中以便重连", "self_id", selfID)
}

// GetOrCreateAccount 获取或创建账号
// 机器人首次连接时调用，自动初始化BotAccount并写入config.json
func (m *BotAccountManager) GetOrCreateAccount(selfID, customName string) (*models.BotAccount, error) {
	// 先尝试获取
	if account, err := m.GetAccount(selfID); err == nil {
		// 更新customName（可能变化）
		if account.CustomName != customName {
			m.mu.Lock()
			account.CustomName = customName
			m.mu.Unlock()
			m.config.SaveAccountConfig(account)
		}
		return account, nil
	}

	// 创建新账号
	return m.CreateAccount(selfID, customName)
}

// GetOnlineCount 获取当前在线账号数量
func (m *BotAccountManager) GetOnlineCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()

	count := 0
	for _, account := range m.accounts {
		if account.IsOnline() {
			count++
		}
	}
	return count
}

// GetAccountStats 获取账号统计信息
func (m *BotAccountManager) GetAccountStats() map[string]interface{} {
	m.mu.RLock()
	defer m.mu.RUnlock()

	total := len(m.accounts)
	online := 0
	for _, account := range m.accounts {
		if account.IsOnline() {
			online++
		}
	}

	return map[string]interface{}{
		"total":   total,
		"online":  online,
		"offline": total - online,
	}
}

// CleanupStaleConnections 清理过期连接
// 定期检查并清理已断开但未标记的连接
// 使用 LastActivityAt（最后活动时间）判断连接是否过期，而不是 LastConnectedAt
func (m *BotAccountManager) CleanupStaleConnections(maxIdle time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()
	offlineTimeout := 10 * time.Minute // 离线账号缓存10分钟

	for selfID, account := range m.accounts {
		if account.Status == "online" && account.WsConn != nil {
			// 检查连接是否仍然有效（基于最后活动时间，而不是连接时间）
			if now.Sub(account.LastActivityAt) > maxIdle {
				m.logger.Warnw("检测到过期连接，强制清理",
					"self_id", selfID,
					"last_activity_at", account.LastActivityAt,
					"idle_duration", now.Sub(account.LastActivityAt).String())
				// 使用 SafeClose 安全关闭，避免重复关闭
				account.SafeClose()
				account.Status = "offline"
				account.OfflineAt = &now
				m.config.SaveAccountConfig(account)
			}
		}

		// 清理过期的离线账号（缓存10分钟后移除）
		if account.Status == "offline" && account.OfflineAt != nil {
			if now.Sub(*account.OfflineAt) > offlineTimeout {
				m.logger.Infow("清理过期离线账号缓存", "self_id", selfID, "custom_name", account.CustomName)
				delete(m.accounts, selfID)
			}
		}
	}
}

// CleanupAllAccounts 清理所有账号资源（用于程序关闭时）
func (m *BotAccountManager) CleanupAllAccounts() {
	m.mu.Lock()
	accountsCopy := make(map[string]*models.BotAccount, len(m.accounts))
	for selfID, account := range m.accounts {
		accountsCopy[selfID] = account
	}
	m.accounts = make(map[string]*models.BotAccount)
	m.mu.Unlock()

	m.logger.Infow("开始清理所有账号资源", "account_count", len(accountsCopy))

	for selfID, account := range accountsCopy {
		if account.WsConn != nil {
			m.logger.Debugw("关闭账号连接", "self_id", selfID, "custom_name", account.CustomName)
			account.SafeClose()
		}
		account.Status = "offline"
		now := time.Now()
		account.OfflineAt = &now
		m.config.SaveAccountConfig(account)
	}

	m.logger.Infow("所有账号资源已清理")
}
