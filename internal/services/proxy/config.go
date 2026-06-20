package proxy

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"HanChat-QQBotManager/internal/models"
)

// ConfigManager 配置管理器
type ConfigManager struct {
	mu         sync.RWMutex
	configPath string
	config     *models.ProxyConfig
	logger     Logger
}

// NewConfigManager 创建配置管理器
func NewConfigManager(configPath string, logger Logger) *ConfigManager {
	return &ConfigManager{
		configPath: configPath,
		logger:     logger,
	}
}

// LoadConfig 加载配置文件
func (cm *ConfigManager) LoadConfig() (*models.ProxyConfig, error) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	data, err := os.ReadFile(cm.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			cm.logger.Infow("配置文件不存在，创建默认配置")
			defaultConfig := cm.getDefaultConfig()
			return defaultConfig, nil
		}
		return nil, fmt.Errorf("读取配置文件失败: %w", err)
	}

	var config models.ProxyConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("解析配置文件失败: %w", err)
	}

	cm.config = &config
	cm.logger.Infow("配置文件加载成功")
	return &config, nil
}

// SaveConfig 保存配置文件
func (cm *ConfigManager) SaveConfig(config *models.ProxyConfig) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	dir := filepath.Dir(cm.configPath)
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("创建目录失败: %w", err)
		}
	}

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化配置失败: %w", err)
	}

	if err := os.WriteFile(cm.configPath, data, 0644); err != nil {
		return fmt.Errorf("写入配置文件失败: %w", err)
	}

	cm.config = config
	cm.logger.Infow("配置文件保存成功")
	return nil
}

// GetConfig 获取当前配置
func (cm *ConfigManager) GetConfig() *models.ProxyConfig {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	return cm.config
}

// getDefaultConfig 获取默认配置
func (cm *ConfigManager) getDefaultConfig() *models.ProxyConfig {
	return &models.ProxyConfig{
		Network: models.NetworkConfig{
			WebSocketClients: []models.WSClientConfig{},
			WebSocketServers: []models.WSServerConfig{},
			HTTPServers:       []models.HTTPServerConfig{},
			HTTPClients:       []models.HTTPClientConfig{},
		},
	}
}
