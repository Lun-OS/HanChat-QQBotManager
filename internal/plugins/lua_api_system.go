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
		targetInstance := m.getPluginInstance(toSelfID, toPlugin)
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
