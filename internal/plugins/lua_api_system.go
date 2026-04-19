// 系统级lua_api扩展，包括机器人管理、插件间通信等功能
package plugins

import (
	"fmt"
	"sync"
	"time"

	lua "github.com/yuin/gopher-lua"
	"go.uber.org/zap"
)

// ========== 机器人管理API ==========

// luaGetBots 获取系统中所有机器人信息
func (m *Manager) luaGetBots() func(*lua.LState) int {
	return func(L *lua.LState) int {
		bots := make([]map[string]interface{}, 0)

		// 从账号管理器获取所有账号
		if m.reverseWS != nil && m.reverseWS.GetAccountManager() != nil {
			accounts := m.reverseWS.GetAccountManager().GetAllAccounts()
			for selfID, account := range accounts {
				botInfo := map[string]interface{}{
					"self_id":           selfID,
					"custom_name":       account.CustomName,
					"status":            account.Status,
					"created_at":        account.CreatedAt.Format("2006-01-02 15:04:05"),
					"last_connected_at": account.LastConnectedAt.Format("2006-01-02 15:04:05"),
					"last_activity_at":  account.LastActivityAt.Format("2006-01-02 15:04:05"),
				}

				// 添加登录信息
				if account.LoginInfo != nil {
					botInfo["login_info"] = map[string]interface{}{
						"user_id":  account.LoginInfo.UserID,
						"nickname": account.LoginInfo.Nickname,
					}
				}

				// 添加版本信息
				if account.VersionInfo != nil {
					botInfo["version_info"] = map[string]interface{}{
						"app_name":         account.VersionInfo.AppName,
						"protocol_version": account.VersionInfo.ProtocolVersion,
						"app_version":      account.VersionInfo.AppVersion,
					}
				}

				// 添加状态信息
				if account.BotStatus != nil {
					botInfo["bot_status"] = map[string]interface{}{
						"online": account.BotStatus.Online,
						"good":   account.BotStatus.Good,
					}
				}

				bots = append(bots, botInfo)
			}
		}

		// 转换为Lua表
		resultTable := L.NewTable()
		for i, bot := range bots {
			L.RawSetInt(resultTable, i+1, m.convertToLuaTable(L, bot))
		}

		L.Push(resultTable)
		return 1
	}
}

// luaGetBotInfo 获取指定机器人的详细信息
func (m *Manager) luaGetBotInfo() func(*lua.LState) int {
	return func(L *lua.LState) int {
		targetSelfID := L.CheckString(1)

		if m.reverseWS == nil || m.reverseWS.GetAccountManager() == nil {
			L.Push(lua.LNil)
			L.Push(lua.LString("账号管理器未初始化"))
			return 2
		}

		account, err := m.reverseWS.GetAccountManager().GetAccount(targetSelfID)
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		botInfo := map[string]interface{}{
			"self_id":           account.SelfID,
			"custom_name":       account.CustomName,
			"status":            account.Status,
			"created_at":        account.CreatedAt.Format("2006-01-02 15:04:05"),
			"last_connected_at": account.LastConnectedAt.Format("2006-01-02 15:04:05"),
			"last_activity_at":  account.LastActivityAt.Format("2006-01-02 15:04:05"),
		}

		// 添加登录信息
		if account.LoginInfo != nil {
			botInfo["login_info"] = map[string]interface{}{
				"user_id":  account.LoginInfo.UserID,
				"nickname": account.LoginInfo.Nickname,
			}
		}

		// 添加版本信息
		if account.VersionInfo != nil {
			botInfo["version_info"] = map[string]interface{}{
				"app_name":         account.VersionInfo.AppName,
				"protocol_version": account.VersionInfo.ProtocolVersion,
				"app_version":      account.VersionInfo.AppVersion,
			}
		}

		// 添加状态信息
		if account.BotStatus != nil {
			botInfo["bot_status"] = map[string]interface{}{
				"online": account.BotStatus.Online,
				"good":   account.BotStatus.Good,
			}
			if account.BotStatus.Stat != nil {
				botInfo["bot_stat"] = map[string]interface{}{
					"message_received":   account.BotStatus.Stat.MessageReceived,
					"message_sent":       account.BotStatus.Stat.MessageSent,
					"last_message_time":  account.BotStatus.Stat.LastMessageTime,
					"startup_time":       account.BotStatus.Stat.StartupTime,
				}
			}
		}

		// 获取该账号的插件信息
		container := m.getContainer(targetSelfID)
		if container != nil {
			container.mu.RLock()
			plugins := make([]map[string]interface{}, 0, len(container.LuaPlugins))
			for name, instance := range container.LuaPlugins {
				plugins = append(plugins, map[string]interface{}{
					"name":         name,
					"start_time":   instance.StartTime.Format("2006-01-02 15:04:05"),
					"event_count":  instance.eventCount,
					"error_count":  instance.errorCount,
				})
			}
			container.mu.RUnlock()
			botInfo["plugins"] = plugins
		}

		L.Push(m.convertToLuaTable(L, botInfo))
		return 1
	}
}

// luaGetBotCount 获取机器人数量
func (m *Manager) luaGetBotCount() func(*lua.LState) int {
	return func(L *lua.LState) int {
		if m.reverseWS == nil || m.reverseWS.GetAccountManager() == nil {
			L.Push(lua.LNumber(0))
			return 1
		}

		stats := m.reverseWS.GetAccountManager().GetAccountStats()
		result := L.NewTable()
		L.SetField(result, "total", lua.LNumber(stats["total"].(int)))
		L.SetField(result, "online", lua.LNumber(stats["online"].(int)))
		L.SetField(result, "offline", lua.LNumber(stats["offline"].(int)))

		L.Push(result)
		return 1
	}
}

// ========== 机器人连接管理API ==========

// luaIsBotOnline 检查机器人是否在线
func (m *Manager) luaIsBotOnline(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 可选参数：selfID，不传则检查当前插件所属的机器人
		targetSelfID := L.OptString(1, instance.SelfID)

		if m.reverseWS == nil || m.reverseWS.GetAccountManager() == nil {
			L.Push(lua.LBool(false))
			return 1
		}

		account, err := m.reverseWS.GetAccountManager().GetAccount(targetSelfID)
		if err != nil {
			L.Push(lua.LBool(false))
			return 1
		}

		L.Push(lua.LBool(account.IsOnline()))
		return 1
	}
}

// luaDisconnectBot 断开指定机器人的WebSocket连接
func (m *Manager) luaDisconnectBot() func(*lua.LState) int {
	return func(L *lua.LState) int {
		targetSelfID := L.CheckString(1)

		if m.reverseWS == nil || m.reverseWS.GetAccountManager() == nil {
			L.Push(lua.LBool(false))
			L.Push(lua.LString("WebSocket服务未初始化"))
			return 2
		}

		accountMgr := m.reverseWS.GetAccountManager()
		if accountMgr == nil {
			L.Push(lua.LBool(false))
			L.Push(lua.LString("WebSocket服务未初始化"))
			return 2
		}

		// 检查账号是否存在
		_, err := accountMgr.GetAccount(targetSelfID)
		if err != nil {
			L.Push(lua.LBool(false))
			L.Push(lua.LString(err.Error()))
			return 2
		}

		// 使用 HandleDisconnect 统一处理断开连接，它会通过 SafeClose 安全关闭
		accountMgr.HandleDisconnect(targetSelfID, fmt.Errorf("插件请求断开连接"))

		L.Push(lua.LBool(true))
		return 1
	}
}

// ========== 插件管理API ==========

// luaReloadPlugin 重新加载当前插件
func (m *Manager) luaReloadPlugin(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		selfID := instance.SelfID
		pluginName := instance.Name

		// 先卸载
		if err := m.UnloadLuaPlugin(selfID, pluginName); err != nil {
			L.Push(lua.LBool(false))
			L.Push(lua.LString(fmt.Sprintf("卸载插件失败: %s", err.Error())))
			return 2
		}

		// 再加载
		if err := m.LoadLuaPlugin(selfID, pluginName); err != nil {
			L.Push(lua.LBool(false))
			L.Push(lua.LString(fmt.Sprintf("加载插件失败: %s", err.Error())))
			return 2
		}

		L.Push(lua.LBool(true))
		return 1
	}
}

// luaStopPlugin 停止当前插件
func (m *Manager) luaStopPlugin(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		selfID := instance.SelfID
		pluginName := instance.Name

		if err := m.UnloadLuaPlugin(selfID, pluginName); err != nil {
			L.Push(lua.LBool(false))
			L.Push(lua.LString(err.Error()))
			return 2
		}

		L.Push(lua.LBool(true))
		return 1
	}
}

// luaUnloadSelf 卸载当前插件（与stop相同，为了兼容Blockly积木）
func (m *Manager) luaUnloadSelf(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		selfID := instance.SelfID
		pluginName := instance.Name

		if err := m.UnloadLuaPlugin(selfID, pluginName); err != nil {
			L.Push(lua.LBool(false))
			L.Push(lua.LString(err.Error()))
			return 2
		}

		L.Push(lua.LBool(true))
		return 1
	}
}

// ========== 自定义API请求接口 ==========

// luaSendCustomAPI 向当前机器人发送自定义API请求
func (m *Manager) luaSendCustomAPI(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "发送自定义API请求失败")
		}

		// 获取API端点
		endpoint, err := validateStringParam(L, 1, "endpoint", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 获取参数表
		var params map[string]interface{}
		if L.GetTop() >= 2 {
			tbl := L.OptTable(2, nil)
			if tbl != nil {
				params = luaTableToMap(L, tbl)
			}
		}

		// 调用API
		result, err := callBotAPI(instance, endpoint, params)
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("调用API失败 [endpoint=%s]", endpoint))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// ========== 插件间通信系统 ==========

// PluginConnection 插件连接信息
type PluginConnection struct {
	FromSelfID   string
	FromPlugin   string
	ToSelfID     string
	ToPlugin     string
	Remark       string
	Status       string // pending, connected, rejected
	CreatedAt    time.Time
	DataChannel  chan map[string]interface{}
}

// PluginConnectionManager 插件连接管理器
type PluginConnectionManager struct {
	connections   map[string]*PluginConnection
	connectionsMu sync.RWMutex
	logger        *zap.SugaredLogger
}

var (
	pluginConnMgrInstance *PluginConnectionManager
	pluginConnMgrOnce     sync.Once
)

// GetPluginConnectionManager 获取插件连接管理器单例
func GetPluginConnectionManager(logger *zap.SugaredLogger) *PluginConnectionManager {
	pluginConnMgrOnce.Do(func() {
		pluginConnMgrInstance = &PluginConnectionManager{
			connections: make(map[string]*PluginConnection),
			logger:      logger,
		}
	})
	return pluginConnMgrInstance
}

// generateConnectionKey 生成连接key
func (pcm *PluginConnectionManager) generateConnectionKey(fromSelfID, fromPlugin, toSelfID, toPlugin string) string {
	return fmt.Sprintf("%s/%s->%s/%s", fromSelfID, fromPlugin, toSelfID, toPlugin)
}

// RegisterConnection 注册插件连接请求
func (pcm *PluginConnectionManager) RegisterConnection(fromSelfID, fromPlugin, toSelfID, toPlugin, remark string) (*PluginConnection, error) {
	pcm.connectionsMu.Lock()
	defer pcm.connectionsMu.Unlock()

	key := pcm.generateConnectionKey(fromSelfID, fromPlugin, toSelfID, toPlugin)

	if _, exists := pcm.connections[key]; exists {
		return nil, fmt.Errorf("连接已存在")
	}

	conn := &PluginConnection{
		FromSelfID:  fromSelfID,
		FromPlugin:  fromPlugin,
		ToSelfID:    toSelfID,
		ToPlugin:    toPlugin,
		Remark:      remark,
		Status:      "pending",
		CreatedAt:   time.Now(),
		DataChannel: make(chan map[string]interface{}, 100),
	}

	pcm.connections[key] = conn
	pcm.logger.Infow("插件连接请求已注册", "from", fromSelfID+"/"+fromPlugin, "to", toSelfID+"/"+toPlugin)

	return conn, nil
}

// AcceptConnection 接受插件连接
func (pcm *PluginConnectionManager) AcceptConnection(fromSelfID, fromPlugin, toSelfID, toPlugin string) error {
	pcm.connectionsMu.Lock()
	defer pcm.connectionsMu.Unlock()

	key := pcm.generateConnectionKey(fromSelfID, fromPlugin, toSelfID, toPlugin)

	conn, exists := pcm.connections[key]
	if !exists {
		return fmt.Errorf("连接不存在")
	}

	conn.Status = "connected"
	pcm.logger.Infow("插件连接已接受", "from", fromSelfID+"/"+fromPlugin, "to", toSelfID+"/"+toPlugin)

	return nil
}

// RejectConnection 拒绝插件连接
func (pcm *PluginConnectionManager) RejectConnection(fromSelfID, fromPlugin, toSelfID, toPlugin string) error {
	pcm.connectionsMu.Lock()
	defer pcm.connectionsMu.Unlock()

	key := pcm.generateConnectionKey(fromSelfID, fromPlugin, toSelfID, toPlugin)

	conn, exists := pcm.connections[key]
	if !exists {
		return fmt.Errorf("连接不存在")
	}

	conn.Status = "rejected"
	close(conn.DataChannel)
	pcm.logger.Infow("插件连接已拒绝", "from", fromSelfID+"/"+fromPlugin, "to", toSelfID+"/"+toPlugin)

	return nil
}

// SendData 发送数据到指定连接
func (pcm *PluginConnectionManager) SendData(fromSelfID, fromPlugin, toSelfID, toPlugin string, data map[string]interface{}) error {
	pcm.connectionsMu.RLock()
	defer pcm.connectionsMu.RUnlock()

	key := pcm.generateConnectionKey(fromSelfID, fromPlugin, toSelfID, toPlugin)

	conn, exists := pcm.connections[key]
	if !exists {
		return fmt.Errorf("连接不存在")
	}

	if conn.Status != "connected" {
		return fmt.Errorf("连接未建立")
	}

	select {
	case conn.DataChannel <- data:
		return nil
	default:
		return fmt.Errorf("数据通道已满")
	}
}

// ReceiveData 从指定连接接收数据（非阻塞）
func (pcm *PluginConnectionManager) ReceiveData(fromSelfID, fromPlugin, toSelfID, toPlugin string) (map[string]interface{}, bool) {
	pcm.connectionsMu.RLock()
	defer pcm.connectionsMu.RUnlock()

	key := pcm.generateConnectionKey(fromSelfID, fromPlugin, toSelfID, toPlugin)

	conn, exists := pcm.connections[key]
	if !exists {
		return nil, false
	}

	if conn.Status != "connected" {
		return nil, false
	}

	select {
	case data := <-conn.DataChannel:
		return data, true
	default:
		return nil, false
	}
}

// GetPendingConnections 获取待处理的连接请求
func (pcm *PluginConnectionManager) GetPendingConnections(toSelfID, toPlugin string) []*PluginConnection {
	pcm.connectionsMu.RLock()
	defer pcm.connectionsMu.RUnlock()

	var pending []*PluginConnection
	for _, conn := range pcm.connections {
		if conn.ToSelfID == toSelfID && conn.ToPlugin == toPlugin && conn.Status == "pending" {
			pending = append(pending, conn)
		}
	}

	return pending
}

// CloseConnection 关闭连接
func (pcm *PluginConnectionManager) CloseConnection(fromSelfID, fromPlugin, toSelfID, toPlugin string) {
	pcm.connectionsMu.Lock()
	defer pcm.connectionsMu.Unlock()

	key := pcm.generateConnectionKey(fromSelfID, fromPlugin, toSelfID, toPlugin)

	if conn, exists := pcm.connections[key]; exists {
		close(conn.DataChannel)
		delete(pcm.connections, key)
		pcm.logger.Infow("插件连接已关闭", "from", fromSelfID+"/"+fromPlugin, "to", toSelfID+"/"+toPlugin)
	}
}

// luaRegisterPluginConnection 注册插件间连接监听
func (m *Manager) luaRegisterPluginConnection(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 参数：处理连接请求的回调函数
		handler := L.CheckFunction(1)

		// 存储连接处理器到插件实例
		instance.EventHandlers["plugin_connection_request"] = handler

		L.Push(lua.LBool(true))
		return 1
	}
}

// luaConnectToPlugin 连接到其他插件
func (m *Manager) luaConnectToPlugin(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		toSelfID := L.CheckString(1)
		toPlugin := L.CheckString(2)
		remark := L.OptString(3, "")

		pcm := GetPluginConnectionManager(m.logger)

		// 注册连接请求
		conn, err := pcm.RegisterConnection(instance.SelfID, instance.Name, toSelfID, toPlugin, remark)
		if err != nil {
			L.Push(lua.LBool(false))
			L.Push(lua.LString(err.Error()))
			return 2
		}

		// 触发目标插件的连接请求事件
		targetInstance := m.GetPluginInstance(toSelfID, toPlugin)
		if targetInstance != nil {
			if handler, exists := targetInstance.EventHandlers["plugin_connection_request"]; exists {
				requestData := map[string]interface{}{
					"type":       "plugin_connection_request",
					"from_self_id": instance.SelfID,
					"from_plugin":  instance.Name,
					"remark":       remark,
					"created_at":   conn.CreatedAt.Format("2006-01-02 15:04:05"),
				}

				// 异步调用处理器
				go func() {
					L := targetInstance.L
					targetInstance.mu.Lock()
					defer targetInstance.mu.Unlock()

					L.Push(handler)
					L.Push(targetInstance.L.NewFunction(func(L *lua.LState) int {
						L.Push(m.convertToLuaTable(L, requestData))
						return 1
					}))
					_ = L.PCall(1, 0, nil)
				}()
			}
		}

		L.Push(lua.LBool(true))
		return 1
	}
}

// luaAcceptPluginConnection 接受插件连接请求
func (m *Manager) luaAcceptPluginConnection(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		fromSelfID := L.CheckString(1)
		fromPlugin := L.CheckString(2)

		pcm := GetPluginConnectionManager(m.logger)

		if err := pcm.AcceptConnection(fromSelfID, fromPlugin, instance.SelfID, instance.Name); err != nil {
			L.Push(lua.LBool(false))
			L.Push(lua.LString(err.Error()))
			return 2
		}

		L.Push(lua.LBool(true))
		return 1
	}
}

// luaRejectPluginConnection 拒绝插件连接请求
func (m *Manager) luaRejectPluginConnection(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		fromSelfID := L.CheckString(1)
		fromPlugin := L.CheckString(2)

		pcm := GetPluginConnectionManager(m.logger)

		if err := pcm.RejectConnection(fromSelfID, fromPlugin, instance.SelfID, instance.Name); err != nil {
			L.Push(lua.LBool(false))
			L.Push(lua.LString(err.Error()))
			return 2
		}

		L.Push(lua.LBool(true))
		return 1
	}
}

// luaSendToPlugin 发送数据到已连接的插件
func (m *Manager) luaSendToPlugin(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		toSelfID := L.CheckString(1)
		toPlugin := L.CheckString(2)

		// 获取数据表
		dataTable := L.CheckTable(3)
		data := luaTableToMap(L, dataTable)

		pcm := GetPluginConnectionManager(m.logger)

		if err := pcm.SendData(instance.SelfID, instance.Name, toSelfID, toPlugin, data); err != nil {
			L.Push(lua.LBool(false))
			L.Push(lua.LString(err.Error()))
			return 2
		}

		L.Push(lua.LBool(true))
		return 1
	}
}

// luaReceiveFromPlugin 从已连接的插件接收数据
func (m *Manager) luaReceiveFromPlugin(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		fromSelfID := L.CheckString(1)
		fromPlugin := L.CheckString(2)

		pcm := GetPluginConnectionManager(m.logger)

		data, ok := pcm.ReceiveData(fromSelfID, fromPlugin, instance.SelfID, instance.Name)
		if !ok {
			L.Push(lua.LNil)
			return 1
		}

		L.Push(m.convertToLuaTable(L, data))
		return 1
	}
}

// luaGetPendingConnections 获取待处理的连接请求列表
func (m *Manager) luaGetPendingConnections(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		pcm := GetPluginConnectionManager(m.logger)

		connections := pcm.GetPendingConnections(instance.SelfID, instance.Name)

		resultTable := L.NewTable()
		for i, conn := range connections {
			connTable := L.NewTable()
			L.SetField(connTable, "from_self_id", lua.LString(conn.FromSelfID))
			L.SetField(connTable, "from_plugin", lua.LString(conn.FromPlugin))
			L.SetField(connTable, "remark", lua.LString(conn.Remark))
			L.SetField(connTable, "created_at", lua.LString(conn.CreatedAt.Format("2006-01-02 15:04:05")))
			L.RawSetInt(resultTable, i+1, connTable)
		}

		L.Push(resultTable)
		return 1
	}
}

// luaClosePluginConnection 关闭插件连接
func (m *Manager) luaClosePluginConnection(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		targetSelfID := L.CheckString(1)
		targetPlugin := L.CheckString(2)

		pcm := GetPluginConnectionManager(m.logger)

		// 关闭双向连接
		pcm.CloseConnection(instance.SelfID, instance.Name, targetSelfID, targetPlugin)
		pcm.CloseConnection(targetSelfID, targetPlugin, instance.SelfID, instance.Name)

		L.Push(lua.LBool(true))
		return 1
	}
}

// ========== 连接状态监控API ==========

// luaOnBotStatusChange 注册机器人状态变化监听
func (m *Manager) luaOnBotStatusChange(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		fn := L.CheckFunction(1)
		instance.EventHandlers["bot_status_change"] = fn
		m.logger.Infow("注册机器人状态变化监听器", "plugin", instance.Name)
		return 0
	}
}

// ========== 插件RPC（远程过程调用）API ==========

// RPC配置常量
const (
	// 默认RPC调用超时（秒）
	DefaultRPCTimeout = 30
	// 最大RPC调用超时（秒）
	MaxRPCTimeout = 300
	// 单个RPC调用返回数据最大大小（10MB）
	MaxRPCResultSize = 10 * 1024 * 1024
	// 单个插件每秒最大RPC调用次数
	MaxRPCPerSecond = 100
	// 最大递归调用深度
	MaxRPCRecursionDepth = 10
)

// PluginRPCManager 插件RPC管理器
type PluginRPCManager struct {
	rpcHandlers      map[string][]*rpcHandler
	rpcMu            sync.RWMutex
	logger           *zap.SugaredLogger
	callRateLimiter  map[string]*rateLimiter
	recursionTracker map[string]int
	recursionMu      sync.Mutex
}

type rpcHandler struct {
	selfID     string
	pluginName string
	handler    *lua.LFunction
}

type rateLimiter struct {
	mu       sync.Mutex
	count    int
	lastTime time.Time
}

type rpcCall struct {
	callID     string
	callerSelf string
	callerName string
	function   string
	args       interface{}
	resultChan chan rpcResult
}

type rpcResult struct {
	success bool
	result  interface{}
	err     string
}

var (
	rpcManagerInstance *PluginRPCManager
	rpcManagerOnce     sync.Once
)

// GetPluginRPCManager 获取插件RPC管理器单例
func GetPluginRPCManager(logger *zap.SugaredLogger) *PluginRPCManager {
	rpcManagerOnce.Do(func() {
		rpcManagerInstance = &PluginRPCManager{
			rpcHandlers:      make(map[string][]*rpcHandler),
			logger:           logger,
			callRateLimiter:  make(map[string]*rateLimiter),
			recursionTracker: make(map[string]int),
		}
	})
	return rpcManagerInstance
}

// checkRateLimit 检查调用频率限制
func (prm *PluginRPCManager) checkRateLimit(selfID, pluginName string) bool {
	key := fmt.Sprintf("%s/%s", selfID, pluginName)
	
	prm.rpcMu.Lock()
	limiter, exists := prm.callRateLimiter[key]
	if !exists {
		limiter = &rateLimiter{}
		prm.callRateLimiter[key] = limiter
	}
	prm.rpcMu.Unlock()
	
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	
	now := time.Now()
	
	// 重置每秒的计数
	if now.Sub(limiter.lastTime) > time.Second {
		limiter.count = 0
		limiter.lastTime = now
	}
	
	limiter.count++
	return limiter.count <= MaxRPCPerSecond
}

// checkRecursion 检查递归调用深度
func (prm *PluginRPCManager) checkRecursion(callKey string) (bool, func()) {
	prm.recursionMu.Lock()
	defer prm.recursionMu.Unlock()
	
	depth := prm.recursionTracker[callKey]
	if depth >= MaxRPCRecursionDepth {
		return false, nil
	}
	
	prm.recursionTracker[callKey] = depth + 1
	
	return true, func() {
		prm.recursionMu.Lock()
		defer prm.recursionMu.Unlock()
		prm.recursionTracker[callKey]--
		if prm.recursionTracker[callKey] <= 0 {
			delete(prm.recursionTracker, callKey)
		}
	}
}

// estimateDataSize 估算数据大小
func estimateDataSize(data interface{}) int {
	if data == nil {
		return 0
	}
	
	switch v := data.(type) {
	case string:
		return len(v)
	case []byte:
		return len(v)
	case map[string]interface{}:
		size := 0
		for k, val := range v {
			size += len(k) + estimateDataSize(val)
		}
		return size
	case []interface{}:
		size := 0
		for _, val := range v {
			size += estimateDataSize(val)
		}
		return size
	default:
		return 8 // 估算一个基础大小
	}
}

// RegisterRPCHandler 注册RPC处理器
func (prm *PluginRPCManager) RegisterRPCHandler(selfID, pluginName, functionName string, handler *lua.LFunction) {
	prm.rpcMu.Lock()
	defer prm.rpcMu.Unlock()

	newHandler := &rpcHandler{
		selfID:     selfID,
		pluginName: pluginName,
		handler:    handler,
	}

	// 检查是否已经存在相同的处理器（避免重复注册）
	handlers := prm.rpcHandlers[functionName]
	for i, h := range handlers {
		if h.selfID == selfID && h.pluginName == pluginName {
			// 更新已存在的处理器
			handlers[i] = newHandler
			prm.rpcHandlers[functionName] = handlers
			prm.logger.Infow("RPC处理器已更新", "self_id", selfID, "plugin", pluginName, "function", functionName)
			return
		}
	}

	// 添加新处理器
	prm.rpcHandlers[functionName] = append(handlers, newHandler)
	prm.logger.Infow("RPC处理器已注册", "self_id", selfID, "plugin", pluginName, "function", functionName)
}

// UnregisterRPCHandler 注销RPC处理器
func (prm *PluginRPCManager) UnregisterRPCHandler(selfID, pluginName, functionName string) {
	prm.rpcMu.Lock()
	defer prm.rpcMu.Unlock()

	handlers := prm.rpcHandlers[functionName]
	var newHandlers []*rpcHandler
	for _, h := range handlers {
		if h.selfID != selfID || h.pluginName != pluginName {
			newHandlers = append(newHandlers, h)
		}
	}

	if len(newHandlers) == 0 {
		delete(prm.rpcHandlers, functionName)
	} else {
		prm.rpcHandlers[functionName] = newHandlers
	}

	prm.logger.Infow("RPC处理器已注销", "self_id", selfID, "plugin", pluginName, "function", functionName)
}

// UnregisterAllPluginHandlers 注销插件的所有RPC处理器
func (prm *PluginRPCManager) UnregisterAllPluginHandlers(selfID, pluginName string) {
	prm.rpcMu.Lock()
	defer prm.rpcMu.Unlock()

	// 遍历所有函数名
	for functionName, handlers := range prm.rpcHandlers {
		var newHandlers []*rpcHandler
		for _, h := range handlers {
			if h.selfID != selfID || h.pluginName != pluginName {
				newHandlers = append(newHandlers, h)
			}
		}
		if len(newHandlers) == 0 {
			delete(prm.rpcHandlers, functionName)
		} else {
			prm.rpcHandlers[functionName] = newHandlers
		}
	}

	// 同时清理频率限制器
	limiterKey := fmt.Sprintf("%s/%s", selfID, pluginName)
	delete(prm.callRateLimiter, limiterKey)

	prm.logger.Infow("插件所有RPC处理器已注销", "self_id", selfID, "plugin", pluginName)
}

// CallRPC 调用RPC函数（返回所有插件的执行结果）
func (prm *PluginRPCManager) CallRPC(functionName string, args interface{}, manager *Manager) ([]map[string]interface{}, error) {
	// 参数验证
	if functionName == "" {
		return nil, fmt.Errorf("函数名不能为空")
	}

	// 获取所有注册的处理器
	prm.rpcMu.RLock()
	handlers := prm.rpcHandlers[functionName]
	if len(handlers) == 0 {
		prm.rpcMu.RUnlock()
		return nil, fmt.Errorf("RPC函数不存在: %s", functionName)
	}
	prm.rpcMu.RUnlock()

	// 为每个处理器创建结果通道
	type callResult struct {
		selfID     string
		pluginName string
		success    bool
		result     interface{}
		err        string
	}

	resultChan := make(chan callResult, len(handlers))

	// 异步调用所有处理器
	for _, handler := range handlers {
		go func(h *rpcHandler) {
			defer func() {
				if r := recover(); r != nil {
					prm.logger.Errorw("RPC处理器panic", "self_id", h.selfID, "plugin", h.pluginName, "function", functionName, "error", r)
					resultChan <- callResult{
						selfID:     h.selfID,
						pluginName: h.pluginName,
						success:    false,
						err:        fmt.Sprintf("RPC处理器panic: %v", r),
					}
				}
			}()

			// 检查调用频率限制
			if !prm.checkRateLimit(h.selfID, h.pluginName) {
				resultChan <- callResult{
					selfID:     h.selfID,
					pluginName: h.pluginName,
					success:    false,
					err:        "RPC调用频率超限",
				}
				return
			}

			// 检查递归调用
			callKey := fmt.Sprintf("%s/%s", h.selfID, h.pluginName)
			canCall, releaseRecursion := prm.checkRecursion(callKey)
			if !canCall {
				resultChan <- callResult{
					selfID:     h.selfID,
					pluginName: h.pluginName,
					success:    false,
					err:        "RPC递归调用深度超限",
				}
				return
			}
			defer releaseRecursion()

			// 获取目标插件实例
			targetInstance := manager.GetPluginInstance(h.selfID, h.pluginName)
			if targetInstance == nil {
				resultChan <- callResult{
					selfID:     h.selfID,
					pluginName: h.pluginName,
					success:    false,
					err:        "目标插件未运行",
				}
				return
			}

			// 获取锁并确保在目标插件的锁
			targetInstance.mu.Lock()
			defer targetInstance.mu.Unlock()

			L := targetInstance.L
			if L == nil {
				resultChan <- callResult{
					selfID:     h.selfID,
					pluginName: h.pluginName,
					success:    false,
					err:        "目标插件Lua环境已销毁",
				}
				return
			}

			// 检查Lua栈安全
			topBefore := L.GetTop()
			defer func() {
				// 清理Lua栈，防止栈泄漏
				if L.GetTop() > topBefore {
					L.SetTop(topBefore)
				}
			}()

			// 推送函数
			L.Push(h.handler)

			// 推送参数
			if args != nil {
				L.Push(manager.convertToLuaValue(L, args))
			} else {
				L.Push(lua.LNil)
			}

			// 执行函数（保护模式调用，最多1个参数，1个返回值
			if err := L.PCall(1, 1, nil); err != nil {
				resultChan <- callResult{
					selfID:     h.selfID,
					pluginName: h.pluginName,
					success:    false,
					err:        err.Error(),
				}
				return
			}

			// 获取返回值
			retVal := L.Get(-1)
			L.Pop(1)

			// 转换返回值
			var result interface{}
			switch retVal.Type() {
			case lua.LTTable:
				result = luaTableToInterface(L, retVal.(*lua.LTable))
			case lua.LTString:
				result = string(retVal.(lua.LString))
			case lua.LTNumber:
				result = float64(retVal.(lua.LNumber))
			case lua.LTBool:
				result = bool(retVal.(lua.LBool))
			case lua.LTNil:
				result = nil
			default:
				result = retVal.String()
			}

			// 检查返回数据大小
			if result != nil {
				resultSize := estimateDataSize(result)
				if resultSize > MaxRPCResultSize {
					resultChan <- callResult{
						selfID:     h.selfID,
						pluginName: h.pluginName,
						success:    false,
						err:        fmt.Sprintf("返回数据过大: %d bytes (最大: %d bytes)", resultSize, MaxRPCResultSize),
					}
					return
				}
			}

			resultChan <- callResult{
				selfID:     h.selfID,
				pluginName: h.pluginName,
				success:    true,
				result:     result,
			}
		}(handler)
	}

	// 等待所有结果或超时
	results := make([]map[string]interface{}, 0, len(handlers))
	timeout := time.After(DefaultRPCTimeout * time.Second)
	received := 0

	for received < len(handlers) {
		select {
		case res := <-resultChan:
			resultMap := map[string]interface{}{
				"self_id":     res.selfID,
				"plugin_name": res.pluginName,
				"success":     res.success,
			}
			if res.success {
				resultMap["result"] = res.result
			} else {
				resultMap["error"] = res.err
			}
			results = append(results, resultMap)
			received++
		case <-timeout:
			// 超时，返回已收到的结果
			prm.logger.Warnw("RPC调用部分超时", "function", functionName, "completed", received, "total", len(handlers))
			return results, fmt.Errorf("RPC调用超时，已完成%d/%d", received, len(handlers))
		}
	}

	return results, nil
}

// luaDeclareEvent 声明事件（注册RPC函数）
func (m *Manager) luaDeclareEvent(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		functionName := L.CheckString(1)
		handler := L.CheckFunction(2)

		prm := GetPluginRPCManager(m.logger)
		prm.RegisterRPCHandler(instance.SelfID, instance.Name, functionName, handler)

		L.Push(lua.LBool(true))
		return 1
	}
}

// luaCallFunction 调用RPC函数（调用所有同名函数）
func (m *Manager) luaCallFunction(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		functionName := L.CheckString(1)

		// 获取参数（支持多种类型）
		var args interface{}
		if L.GetTop() >= 2 {
			val := L.Get(2)
			switch val.Type() {
			case lua.LTTable:
				args = luaTableToInterface(L, val.(*lua.LTable))
			case lua.LTString:
				args = string(val.(lua.LString))
			case lua.LTNumber:
				args = float64(val.(lua.LNumber))
			case lua.LTBool:
				args = bool(val.(lua.LBool))
			case lua.LTNil:
				args = nil
			default:
				args = val.String()
			}
		}

		prm := GetPluginRPCManager(m.logger)
		results, err := prm.CallRPC(functionName, args, m)

		if err != nil && len(results) == 0 {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		// 转换结果并返回（返回数组，包含所有插件的结果）
		resultTable := L.NewTable()
		for i, res := range results {
			L.RawSetInt(resultTable, i+1, m.convertToLuaValue(L, res))
		}

		L.Push(resultTable)
		if err != nil {
			L.Push(lua.LString(err.Error()))
		} else {
			L.Push(lua.LNil)
		}
		return 2
	}
}

// luaReturnFunction 返回函数结果
func (m *Manager) luaReturnFunction(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 这个函数实际上是在声明的事件处理器中直接return
		// 这里提供一个辅助函数用于明确返回
		if L.GetTop() >= 1 {
			// 直接返回第一个值作为结果
			return 1
		}
		return 0
	}
}
