package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"HanChat-QQBotManager/internal/models"
)

// AccountConfig 多账号配置管理器
// 负责config.json中accounts区域的读写操作
// 使用文件锁确保并发安全
type AccountConfig struct {
	mu         sync.RWMutex
	configPath string
}

// ConfigFile 配置文件结构
type ConfigFile struct {
	Server       ServerConfig             `json:"server"`
	Logger       LoggerConfig             `json:"logger"`
	Websocket    WebsocketConfig          `json:"websocket"`
	Memory       MemoryConfig             `json:"memory"`
	Appearance   AppearanceConfig         `json:"appearance"`
	Advanced     AdvancedConfig           `json:"advanced"`
	LogCleanup   LogCleanupConfig         `json:"logCleanup"`
	Accounts     map[string]*models.BotAccount `json:"accounts"` // key: self_id
}

type AppearanceConfig struct {
	Theme     string            `json:"theme"`
	FontSize  int               `json:"fontSize"`
	CustomCSS map[string]string `json:"customCSS"`
}

type AdvancedConfig struct {
	WSPort           int      `json:"wsPort"`
	LogLevel         string   `json:"logLevel"`
	CorsOrigins      []string `json:"corsOrigins"`
	LogRetentionDays int      `json:"logRetentionDays"`
}

// LogCleanupScope 日志自动清理范围配置
type LogCleanupScope struct {
	PluginLog       bool `json:"pluginLog"`       // 插件日志
	LoginLog        bool `json:"loginLog"`        // 登录日志
	FileOpLog       bool `json:"fileOpLog"`       // 文件操作日志
	PluginOpLog     bool `json:"pluginOpLog"`     // 插件操作日志
	ProxyLog        bool `json:"proxyLog"`        // 代理日志
	BotConnLog      bool `json:"botConnLog"`      // 机器人连接日志
}

// LogCleanupConfig 日志自动清理配置
type LogCleanupConfig struct {
	Enabled    bool            `json:"enabled"`    // 是否启用自动清理
	Interval   int             `json:"interval"`   // 清理间隔（小时），默认24
	Retention  int             `json:"retention"`  // 保留天数，默认7
	Scope      LogCleanupScope `json:"scope"`      // 清理范围
}

// MemoryConfig 内存管理器配置
type MemoryConfig struct {
	TargetMB         int `json:"target_mb"`          // 目标内存使用量(MB)
	SoftLimitMB      int `json:"soft_limit_mb"`      // 软限制内存(MB)
	HardLimitMB      int `json:"hard_limit_mb"`      // 硬限制内存(MB)
	IdleTimeoutSecs  int `json:"idle_timeout_secs"`  // 空闲超时时间(秒)
	MonitorInterval  int `json:"monitor_interval_ms"`// 监控间隔(毫秒)
	GCCheckInterval  int `json:"gc_check_interval"`  // GC检查间隔(消息数)
}

// ServerConfig 服务器配置
type ServerConfig struct {
	Host string `json:"host"`
	Port int    `json:"port"`
}

// LoggerConfig 日志配置
type LoggerConfig struct {
	Level  string `json:"level"`
	Path   string `json:"path"`
}

// WebsocketConfig WebSocket配置
type WebsocketConfig struct {
	Authorization string `json:"authorization"` // 全局统一Token
	Port          int    `json:"port"`          // 反向WS监听端口
}

// NewAccountConfig 创建账号配置管理器
// configPath: 配置文件路径，通常为 "config.json"
func NewAccountConfig(configPath string) *AccountConfig {
	return &AccountConfig{
		configPath: configPath,
	}
}

// LoadConfig 加载完整配置文件
// 返回ConfigFile结构，包含所有配置项
func (ac *AccountConfig) LoadConfig() (*ConfigFile, error) {
	ac.mu.RLock()
	defer ac.mu.RUnlock()

	// 如果配置文件不存在，返回默认配置
	if _, err := os.Stat(ac.configPath); os.IsNotExist(err) {
		return &ConfigFile{
			Server: ServerConfig{
				Host: "0.0.0.0",
				Port: 8080,
			},
			Logger: LoggerConfig{
				Level: "info",
				Path:  "./logs",
			},
			Websocket: WebsocketConfig{
				Authorization: "",
				Port:          59178,
			},
			Memory: MemoryConfig{
				TargetMB:         20,
				SoftLimitMB:      30,
				HardLimitMB:      50,
				IdleTimeoutSecs:  30,
				MonitorInterval:  10000, // 10秒
				GCCheckInterval:  50000,
			},
			Appearance: AppearanceConfig{
				Theme:     "light",
				FontSize:  16,
				CustomCSS: make(map[string]string),
			},
			Advanced: AdvancedConfig{
			WSPort:           59178,
			LogLevel:         "info",
			CorsOrigins:      []string{"*"},
			LogRetentionDays: 7,
		},
		LogCleanup: LogCleanupConfig{
			Enabled:   true,
			Interval:  24,
			Retention: 7,
			Scope: LogCleanupScope{
				PluginLog:   true,
				LoginLog:    true,
				FileOpLog:   true,
				PluginOpLog: true,
				ProxyLog:    true,
				BotConnLog:  true,
			},
		},
		Accounts: make(map[string]*models.BotAccount),
	}, nil
}

	// 读取配置文件
	data, err := os.ReadFile(ac.configPath)
	if err != nil {
		return nil, fmt.Errorf("读取配置文件失败: %w", err)
	}

	var cfg ConfigFile
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("解析配置文件失败: %w", err)
	}

	if cfg.Accounts == nil {
		cfg.Accounts = make(map[string]*models.BotAccount)
	}
	if cfg.Appearance.CustomCSS == nil {
		cfg.Appearance.CustomCSS = make(map[string]string)
	}
	if cfg.Advanced.CorsOrigins == nil {
		cfg.Advanced.CorsOrigins = []string{"*"}
	}

	return &cfg, nil
}

// SaveAccountConfig 保存单个账号配置到配置文件
// 使用写锁确保并发安全，自动创建账号记录（如果不存在）
func (ac *AccountConfig) SaveAccountConfig(account *models.BotAccount) error {
	ac.mu.Lock()
	defer ac.mu.Unlock()

	// 加载现有配置
	cfg, err := ac.loadConfigUnsafe()
	if err != nil {
		return err
	}

	// 更新账号配置（不包含WsConn，因为不序列化）
	cfg.Accounts[account.SelfID] = account

	// 保存回文件
	return ac.saveConfigUnsafe(cfg)
}

// GetAccountConfig 获取单个账号配置
func (ac *AccountConfig) GetAccountConfig(selfID string) (*models.BotAccount, error) {
	ac.mu.RLock()
	defer ac.mu.RUnlock()

	cfg, err := ac.loadConfigUnsafe()
	if err != nil {
		return nil, err
	}

	account, exists := cfg.Accounts[selfID]
	if !exists {
		return nil, fmt.Errorf("账号不存在: %s", selfID)
	}

	return account, nil
}

// DeleteAccountConfig 删除账号配置
func (ac *AccountConfig) DeleteAccountConfig(selfID string) error {
	ac.mu.Lock()
	defer ac.mu.Unlock()

	cfg, err := ac.loadConfigUnsafe()
	if err != nil {
		return err
	}

	delete(cfg.Accounts, selfID)
	return ac.saveConfigUnsafe(cfg)
}

// GetAllAccounts 获取所有账号配置
func (ac *AccountConfig) GetAllAccounts() (map[string]*models.BotAccount, error) {
	ac.mu.RLock()
	defer ac.mu.RUnlock()

	cfg, err := ac.loadConfigUnsafe()
	if err != nil {
		return nil, err
	}

	// 返回副本，避免外部修改
	accounts := make(map[string]*models.BotAccount)
	for k, v := range cfg.Accounts {
		accounts[k] = v
	}

	return accounts, nil
}

// loadConfigUnsafe 加载配置（无锁版本，调用者需持有锁）
func (ac *AccountConfig) loadConfigUnsafe() (*ConfigFile, error) {
	// 如果配置文件不存在，返回默认配置
	if _, err := os.Stat(ac.configPath); os.IsNotExist(err) {
		return &ConfigFile{
			Server: ServerConfig{
				Host: "0.0.0.0",
				Port: 8080,
			},
			Logger: LoggerConfig{
				Level: "info",
				Path:  "./logs",
			},
			Websocket: WebsocketConfig{
				Authorization: "",
				Port:          59178,
			},
			Memory: MemoryConfig{
				TargetMB:         20,
				SoftLimitMB:      30,
				HardLimitMB:      50,
				IdleTimeoutSecs:  30,
				MonitorInterval:  10000, // 10秒
				GCCheckInterval:  50000,
			},
			Appearance: AppearanceConfig{
				Theme:     "light",
				FontSize:  16,
				CustomCSS: make(map[string]string),
			},
			Advanced: AdvancedConfig{
			WSPort:           59178,
			LogLevel:         "info",
			CorsOrigins:      []string{"*"},
			LogRetentionDays: 7,
		},
		LogCleanup: LogCleanupConfig{
			Enabled:   true,
			Interval:  24,
			Retention: 7,
			Scope: LogCleanupScope{
				PluginLog:   true,
				LoginLog:    true,
				FileOpLog:   true,
				PluginOpLog: true,
				ProxyLog:    true,
				BotConnLog:  true,
			},
		},
		Accounts: make(map[string]*models.BotAccount),
	}, nil
}

	data, err := os.ReadFile(ac.configPath)
	if err != nil {
		return nil, fmt.Errorf("读取配置文件失败: %w", err)
	}

	var cfg ConfigFile
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("解析配置文件失败: %w", err)
	}

	if cfg.Accounts == nil {
		cfg.Accounts = make(map[string]*models.BotAccount)
	}
	if cfg.Appearance.CustomCSS == nil {
		cfg.Appearance.CustomCSS = make(map[string]string)
	}
	if cfg.Advanced.CorsOrigins == nil {
		cfg.Advanced.CorsOrigins = []string{"*"}
	}

	return &cfg, nil
}

// saveConfigUnsafe 保存配置（无锁版本，调用者需持有锁）
func (ac *AccountConfig) saveConfigUnsafe(cfg *ConfigFile) error {
	// 确保目录存在
	dir := filepath.Dir(ac.configPath)
	if dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("创建配置目录失败: %w", err)
		}
	}

	// 序列化为JSON（带缩进，便于阅读）
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化配置失败: %w", err)
	}

	// 写入文件
	if err := os.WriteFile(ac.configPath, data, 0644); err != nil {
		return fmt.Errorf("写入配置文件失败: %w", err)
	}

	return nil
}

// SaveWebsocketConfig 保存WebSocket配置到配置文件
// 用于更新全局鉴权Token等WebSocket相关配置
func (ac *AccountConfig) SaveWebsocketConfig(wsConfig WebsocketConfig) error {
	ac.mu.Lock()
	defer ac.mu.Unlock()

	// 加载现有配置
	cfg, err := ac.loadConfigUnsafe()
	if err != nil {
		return err
	}

	// 更新WebSocket配置
	cfg.Websocket = wsConfig

	// 保存回文件
	return ac.saveConfigUnsafe(cfg)
}

// AccountExists 检查账号是否已存在
func (ac *AccountConfig) AccountExists(selfID string) bool {
	ac.mu.RLock()
	defer ac.mu.RUnlock()

	cfg, err := ac.loadConfigUnsafe()
	if err != nil {
		return false
	}

	_, exists := cfg.Accounts[selfID]
	return exists
}

func (ac *AccountConfig) SaveAppearanceConfig(appearance AppearanceConfig) error {
	ac.mu.Lock()
	defer ac.mu.Unlock()

	cfg, err := ac.loadConfigUnsafe()
	if err != nil {
		return err
	}

	cfg.Appearance = appearance

	return ac.saveConfigUnsafe(cfg)
}

func (ac *AccountConfig) SaveAdvancedConfig(advanced AdvancedConfig) error {
	ac.mu.Lock()
	defer ac.mu.Unlock()

	cfg, err := ac.loadConfigUnsafe()
	if err != nil {
		return err
	}

	cfg.Advanced = advanced

	return ac.saveConfigUnsafe(cfg)
}

func (ac *AccountConfig) SaveLogCleanupConfig(logCleanup LogCleanupConfig) error {
	ac.mu.Lock()
	defer ac.mu.Unlock()

	cfg, err := ac.loadConfigUnsafe()
	if err != nil {
		return err
	}

	cfg.LogCleanup = logCleanup

	return ac.saveConfigUnsafe(cfg)
}
