package proxy

import (
	"fmt"
	"sync"

	"HanChat-QQBotManager/internal/models"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// ProxyManager 代理管理器 (核心!)
type ProxyManager struct {
	mu           sync.RWMutex
	adapters     map[string]IProxyAdapter // name → adapter
	configMgr    *ConfigManager
	wsService    ReverseWebSocketService
	logger       Logger
	eventHandler string
	webPort      int // 主Web服务端口，用于自动生成地址
	router       *gin.Engine // 主Gin Router引用（可选）
	logWriter    LogWriteFunc // 日志写入函数，用于记录proxy日志到LogManager
}

// ReverseWebSocketService WS服务接口 (解耦)
type ReverseWebSocketService interface {
	AddRawEventHandler(handler func(selfID string, rawData []byte))
	CallBotAPIRaw(selfID string, apiName string, params map[string]interface{}) ([]byte, error)
	GetBotVersion(selfID string) string
}

// NewProxyManager 创建代理管理器
func NewProxyManager(wsService ReverseWebSocketService, logger *zap.Logger, configPath string, webPort int, appVersion string, logWriter LogWriteFunc) *ProxyManager {
	var sugarLogger Logger
	if logger != nil {
		sugarLogger = logger.Sugar().Named("proxy_manager")
	} else {
		sugarLogger = &noopLogger{}
	}

	pm := &ProxyManager{
		adapters:   make(map[string]IProxyAdapter),
		configMgr:  NewConfigManager(configPath, sugarLogger),
		wsService:  wsService,
		logger:     sugarLogger,
		webPort:    webPort,
		logWriter:  logWriter,
	}

	if appVersion != "" {
		SetHanChatVersion(appVersion)
	}

	return pm
}

// Start 启动管理器
func (pm *ProxyManager) Start() error {
	pm.logger.Infow("启动代理管理器...")

	config, err := pm.configMgr.LoadConfig()
	if err != nil {
		pm.logger.Errorw("加载配置失败", "error", err)
		return err
	}

	pm.wsService.AddRawEventHandler(pm.BroadcastEvent)

	if err := pm.initAdapters(config); err != nil {
		pm.logger.Errorw("初始化适配器失败", "error", err)
		return err
	}

	pm.logger.Infow("代理管理器已启动",
		"hanchat_version", hanchatVersion,
	)

	pm.logger.Infow("代理管理器启动完成", "adapter_count", len(pm.adapters))
	return nil
}

// Stop 停止管理器
func (pm *ProxyManager) Stop() error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	for name, adapter := range pm.adapters {
		if err := adapter.Close(); err != nil {
			pm.logger.Warnw("关闭适配器失败", "name", name, "error", err)
		}
	}
	pm.adapters = make(map[string]IProxyAdapter)

	pm.logger.Infow("代理管理器已停止")
	return nil
}

// LoadConfig 重新加载配置
func (pm *ProxyManager) LoadConfig() (*models.ProxyConfig, error) {
	return pm.configMgr.LoadConfig()
}

// SaveConfig 保存配置
func (pm *ProxyManager) SaveConfig() error {
	config := pm.buildConfigFromAdapters()
	return pm.configMgr.SaveConfig(config)
}

// ReloadAll 重载所有适配器
func (pm *ProxyManager) ReloadAll() error {
	config, err := pm.configMgr.LoadConfig()
	if err != nil {
		return err
	}

	pm.mu.Lock()
	for name, adapter := range pm.adapters {
		if err := adapter.Close(); err != nil {
			pm.logger.Warnw("关闭适配器失败", "name", name, "error", err)
		}
		delete(pm.adapters, name)
	}
	pm.mu.Unlock()

	if err := pm.initAdapters(config); err != nil {
		return err
	}

	if pm.router != nil {
		pm.logger.Infow("重载完成，重新注册路由到Gin Engine")
		pm.RegisterRoutes(pm.router)
	}

	return nil
}

// GetAdapter 获取适配器
func (pm *ProxyManager) GetAdapter(name string) (IProxyAdapter, error) {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	adapter, exists := pm.adapters[name]
	if !exists {
		return nil, fmt.Errorf("适配器不存在: %s", name)
	}
	return adapter, nil
}

// GetAllAdapters 获取所有适配器
func (pm *ProxyManager) GetAllAdapters() []IProxyAdapter {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	adapters := make([]IProxyAdapter, 0, len(pm.adapters))
	for _, adapter := range pm.adapters {
		adapters = append(adapters, adapter)
	}
	return adapters
}

// GetAllStatuses 获取所有适配器状态
func (pm *ProxyManager) GetAllStatuses() []*models.AdapterStatus {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	statuses := make([]*models.AdapterStatus, 0, len(pm.adapters))
	for _, adapter := range pm.adapters {
		status := adapter.Status()
		// 填充配置信息供前端显示
		if cfg := adapter.Config(); cfg != nil {
			status.Config = cfg
		}
		statuses = append(statuses, status)
	}
	return statuses
}

// EnableAdapter 启用适配器
func (pm *ProxyManager) EnableAdapter(name string) error {
	adapter, err := pm.GetAdapter(name)
	if err != nil {
		return err
	}

	adapter.SetEnable(true)

	if !adapter.IsActive() {
		if err := adapter.Open(); err != nil {
			return fmt.Errorf("启动适配器失败: %w", err)
		}
	}

	pm.SaveConfig()
	return nil
}

// DisableAdapter 禁用适配器
func (pm *ProxyManager) DisableAdapter(name string) error {
	adapter, err := pm.GetAdapter(name)
	if err != nil {
		return err
	}

	adapter.SetEnable(false)

	if adapter.IsActive() {
		if err := adapter.Close(); err != nil {
			return fmt.Errorf("停止适配器失败: %w", err)
		}
	}

	pm.SaveConfig()
	return nil
}

// AddAdapter 新增适配器
func (pm *ProxyManager) AddAdapter(adapterType models.AdapterType, config interface{}) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	name := getNameFromConfig(config)
	if _, exists := pm.adapters[name]; exists {
		return fmt.Errorf("适配器已存在: %s", name)
	}

	adapter, err := pm.createAdapter(adapterType, config)
	if err != nil {
		return fmt.Errorf("创建适配器失败: %w", err)
	}

	pm.adapters[name] = adapter

	if getEnableFromConfig(config) {
		if err := adapter.Open(); err != nil {
			pm.logger.Warnw("启动新适配器失败", "name", name, "error", err)
		} else {
			pm.registerAdapterRoute(adapter)
		}
	}

	pm.SaveConfig()
	pm.logger.Infow("适配器已添加", "name", name, "type", adapterType)
	return nil
}

// RemoveAdapter 删除适配器
func (pm *ProxyManager) RemoveAdapter(name string) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	adapter, exists := pm.adapters[name]
	if !exists {
		return fmt.Errorf("适配器不存在: %s", name)
	}

	if adapter.IsActive() {
		if err := adapter.Close(); err != nil {
			pm.logger.Warnw("关闭适配器失败", "name", name, "error", err)
		}
	}

	delete(pm.adapters, name)
	pm.SaveConfig()
	pm.logger.Infow("适配器已删除", "name", name)
	return nil
}

// UpdateAdapter 更新适配器配置
func (pm *ProxyManager) UpdateAdapter(name string, config interface{}) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	adapter, exists := pm.adapters[name]
	if !exists {
		return fmt.Errorf("适配器不存在: %s", name)
	}

	wasActive := adapter.IsActive()
	
	if wasActive {
		if err := adapter.Close(); err != nil {
			return fmt.Errorf("停止适配器失败: %w", err)
		}
	}

	if err := adapter.Reload(config); err != nil {
		return fmt.Errorf("重载配置失败: %w", err)
	}

	if wasActive || getEnableFromConfig(config) {
		if err := adapter.Open(); err != nil {
			pm.logger.Warnw("重启适配器失败", "name", name, "error", err)
		}
	}

	pm.SaveConfig()
	pm.logger.Infow("适配器配置已更新", "name", name)
	return nil
}

// BroadcastEvent 广播事件到所有活跃适配器（原始数据透传）
func (pm *ProxyManager) BroadcastEvent(selfID string, rawData []byte) {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	for _, adapter := range pm.adapters {
		if adapter.IsActive() {
			go adapter.OnEvent(selfID, rawData)
		}
	}
}

// initAdapters 从配置初始化所有适配器（仅创建+启动，不注册路由）
func (pm *ProxyManager) initAdapters(config *models.ProxyConfig) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	for _, cfg := range config.Network.WebSocketClients {
		adapter, err := pm.createAdapter(models.AdapterTypeWSClient, cfg)
		if err != nil {
			pm.logger.Errorw("创建WS客户端适配器失败", "name", cfg.Name, "error", err)
			continue
		}
		pm.adapters[cfg.Name] = adapter
		if cfg.Enable {
			go adapter.Open()
		}
	}

	for _, cfg := range config.Network.WebSocketServers {
		adapter, err := pm.createAdapter(models.AdapterTypeWSServer, cfg)
		if err != nil {
			pm.logger.Errorw("创建WS服务端适配器失败", "name", cfg.Name, "error", err)
			continue
		}
		pm.adapters[cfg.Name] = adapter
		if cfg.Enable {
			go adapter.Open()
		}
	}

	for _, cfg := range config.Network.HTTPServers {
		adapter, err := pm.createAdapter(models.AdapterTypeHTTPServer, cfg)
		if err != nil {
			pm.logger.Errorw("创建HTTP服务端适配器失败", "name", cfg.Name, "error", err)
			continue
		}
		pm.adapters[cfg.Name] = adapter
		if cfg.Enable {
			go adapter.Open()
		}
	}

	for _, cfg := range config.Network.HTTPClients {
		adapter, err := pm.createAdapter(models.AdapterTypeHTTPClient, cfg)
		if err != nil {
			pm.logger.Errorw("创建HTTP客户端适配器失败", "name", cfg.Name, "error", err)
			continue
		}
		pm.adapters[cfg.Name] = adapter
		if cfg.Enable {
			go adapter.Open()
		}
	}

	return nil
}

// registerAdapterRoute 注册单个适配器的路由到Gin Engine（内部方法）
func (pm *ProxyManager) registerAdapterRoute(adapter IProxyAdapter) {
	if pm.router == nil {
		return
	}

	switch adapter.Type() {
	case models.AdapterTypeWSClient:
		if wsClient, ok := adapter.(*WSClientAdapter); ok {
			path := wsClient.buildPath()
			pm.router.GET(path, wsClient.GetHandler())
			pm.logger.Infow("注册WS正向路由", "name", adapter.Name(), "path", path)
		}
	case models.AdapterTypeHTTPServer:
		if httpServer, ok := adapter.(*HTTPServerAdapter); ok {
			httpServer.CreateRouterGroup(pm.router.Group(""))
			pm.logger.Infow("注册HTTP服务路由", "name", adapter.Name())
		}
	}
}

// createAdapter 创建适配器实例
func (pm *ProxyManager) createAdapter(adapterType models.AdapterType, config interface{}) (IProxyAdapter, error) {
	pm.logger.Debugw("创建适配器实例", "type", adapterType)

	// 提取配置信息用于日志记录
	adapterName := getNameFromConfig(config)
	selfID := getSelfIDFromConfig(config)

	// 为每个适配器创建专用的 ProxyLogger（如果 logWriter 存在）
	var adapterLogger Logger = pm.logger
	if pm.logWriter != nil && adapterName != "" {
		adapterLogger = NewProxyLogger(pm.logWriter, selfID, adapterName, pm.logger)
	}

	switch adapterType {
	case models.AdapterTypeWSClient:
		adapter := NewWSClientAdapter(config.(models.WSClientConfig), pm.wsService, adapterLogger, pm.webPort)
		return adapter, nil
	case models.AdapterTypeWSServer:
		adapter := NewWSServerAdapter(config.(models.WSServerConfig), pm.wsService, adapterLogger)
		return adapter, nil
	case models.AdapterTypeHTTPServer:
		adapter := NewHTTPServerAdapter(config.(models.HTTPServerConfig), pm.wsService, adapterLogger, pm.webPort)
		return adapter, nil
	case models.AdapterTypeHTTPClient:
		adapter := NewHTTPClientAdapter(config.(models.HTTPClientConfig), adapterLogger)
		return adapter, nil
	default:
		return nil, fmt.Errorf("不支持的适配器类型: %s", adapterType)
	}
}

// buildConfigFromAdapters 从当前适配器构建配置
func (pm *ProxyManager) buildConfigFromAdapters() *models.ProxyConfig {
	config := &models.ProxyConfig{
		Network: models.NetworkConfig{
			WebSocketClients: []models.WSClientConfig{},
			WebSocketServers: []models.WSServerConfig{},
			HTTPServers:       []models.HTTPServerConfig{},
			HTTPClients:       []models.HTTPClientConfig{},
		},
	}

	for _, adapter := range pm.adapters {
		switch adapter.Type() {
		case models.AdapterTypeWSClient:
			config.Network.WebSocketClients = append(config.Network.WebSocketClients, *adapter.Config().(*models.WSClientConfig))
		case models.AdapterTypeWSServer:
			config.Network.WebSocketServers = append(config.Network.WebSocketServers, *adapter.Config().(*models.WSServerConfig))
		case models.AdapterTypeHTTPServer:
			config.Network.HTTPServers = append(config.Network.HTTPServers, *adapter.Config().(*models.HTTPServerConfig))
		case models.AdapterTypeHTTPClient:
			config.Network.HTTPClients = append(config.Network.HTTPClients, *adapter.Config().(*models.HTTPClientConfig))
		}
	}

	return config
}

// 辅助函数
func getNameFromConfig(config interface{}) string {
	switch c := config.(type) {
	case models.WSClientConfig:
		return c.Name
	case models.WSServerConfig:
		return c.Name
	case models.HTTPServerConfig:
		return c.Name
	case models.HTTPClientConfig:
		return c.Name
	default:
		return ""
	}
}

func getEnableFromConfig(config interface{}) bool {
	switch c := config.(type) {
	case models.WSClientConfig:
		return c.Enable
	case models.WSServerConfig:
		return c.Enable
	case models.HTTPServerConfig:
		return c.Enable
	case models.HTTPClientConfig:
		return c.Enable
	default:
		return false
	}
}

func getSelfIDFromConfig(config interface{}) string {
	switch c := config.(type) {
	case models.WSClientConfig:
		return c.SelfID
	case models.WSServerConfig:
		return c.SelfID
	case models.HTTPServerConfig:
		return c.SelfID
	case models.HTTPClientConfig:
		return "" // HTTPClient没有self_id字段
	default:
		return ""
	}
}

// noopLogger 空日志实现
type noopLogger struct{}

func (l *noopLogger) Infow(msg string, keysAndValues ...interface{}) {}
func (l *noopLogger) Warnw(msg string, keysAndValues ...interface{}) {}
func (l *noopLogger) Errorw(msg string, keysAndValues ...interface{}) {}
func (l *noopLogger) Debugw(msg string, keysAndValues ...interface{}) {}

// RegisterRoutes 将WS正向和HTTP服务适配器的路由注册到主Gin Router
func (pm *ProxyManager) RegisterRoutes(r *gin.Engine) {
	pm.router = r
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	pm.logger.Infow("开始注册代理适配器路由...", "total_adapters", len(pm.adapters))

	wsCount := 0
	httpCount := 0

	for name, adapter := range pm.adapters {
		if !adapter.IsActive() {
			pm.logger.Debugw("跳过未启用的适配器", "name", name)
			continue
		}

		switch adapter.Type() {
		case models.AdapterTypeWSClient:
			if wsClient, ok := adapter.(*WSClientAdapter); ok {
				path := wsClient.buildPath()
				r.GET(path, wsClient.GetHandler())
				wsCount++
				pm.logger.Infow("✅ 注册WS正向路由",
					"name", name,
					"path", path,
					"method", "GET",
				)
			} else {
				pm.logger.Errorw("类型断言失败：WSClientAdapter", "name", name)
			}
		case models.AdapterTypeHTTPServer:
			if httpServer, ok := adapter.(*HTTPServerAdapter); ok {
				httpServer.CreateRouterGroup(r.Group(""))
				httpCount++
				pathPrefix := httpServer.buildPath()
				pm.logger.Infow("✅ 注册HTTP服务路由",
					"name", name,
					"path_prefix", pathPrefix,
				)
			} else {
				pm.logger.Errorw("类型断言失败：HTTPServerAdapter", "name", name)
			}
		}
	}

	pm.logger.Infow("代理适配器路由注册完成",
		"ws_routes", wsCount,
		"http_routes", httpCount,
	)
}

// HandleBotDisconnect 处理机器人离线事件
// 断开该selfID相关的所有代理适配器WS连接（WS正向客户端 + WS反向连接）
func (pm *ProxyManager) HandleBotDisconnect(selfID string) {
	pm.logger.Infow("处理机器人离线，断开代理适配器连接", "self_id", selfID)

	pm.mu.RLock()
	adaptersCopy := make([]IProxyAdapter, 0, len(pm.adapters))
	for _, adapter := range pm.adapters {
		if !adapter.IsActive() {
			continue
		}
		// 只断开与该selfID相关的WS适配器
		switch adapter.Type() {
		case models.AdapterTypeWSClient, models.AdapterTypeWSServer:
			adaptersCopy = append(adaptersCopy, adapter)
		}
	}
	pm.mu.RUnlock()

	disconnectedCount := 0
	for _, adapter := range adaptersCopy {
		if err := adapter.Close(); err != nil {
			pm.logger.Warnw("断开适配器连接失败", "name", adapter.Name(), "error", err)
		} else {
			pm.logger.Infow("已断开代理适配器连接", "self_id", selfID, "name", adapter.Name(), "type", adapter.Type())
			disconnectedCount++
		}
	}

	if disconnectedCount > 0 {
		pm.logger.Infow("机器人离线处理完成", "self_id", selfID, "disconnected_adapters", disconnectedCount)
	}
}
