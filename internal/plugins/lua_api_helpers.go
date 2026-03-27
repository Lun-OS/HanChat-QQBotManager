package plugins

import (
	"context"
	"fmt"
	"strconv"
	"time"

	lua "github.com/yuin/gopher-lua"
)

// luaAPIError 统一的Lua API错误返回
// 统一返回包含 success=false 和错误信息的表类型
func luaAPIError(L *lua.LState, err error, context string) int {
	errMsg := fmt.Sprintf("%s: %v", context, err)

	// 统一返回表类型格式
	table := L.CreateTable(0, 3)
	table.RawSetString("success", lua.LFalse)
	table.RawSetString("error", lua.LString(errMsg))
	table.RawSetString("message", lua.LString(context))

	L.Push(table)
	return 1
}

// luaAPISuccess 统一的Lua API成功返回（单个结果）
// 统一返回包含 success=true 和数据的表类型
func luaAPISuccess(L *lua.LState, m *Manager, result interface{}) int {
	// 统一返回表类型格式
	table := L.CreateTable(0, 3)
	table.RawSetString("success", lua.LTrue)

	if result != nil {
		// 将结果数据放入表的 data 字段
		table.RawSetString("data", m.convertToLuaValue(L, result))
	}

	L.Push(table)
	return 1
}

// luaAPISuccessWithTable 统一的Lua API成功返回（表格结果）
// 返回包含 success=true 和数据的表类型
func luaAPISuccessWithTable(L *lua.LState, m *Manager, result map[string]interface{}) int {
	// 统一返回表类型格式
	table := L.CreateTable(0, 3)
	table.RawSetString("success", lua.LTrue)

	if result != nil {
		// 将结果数据放入表的 data 字段
		resultTable := m.convertToLuaTable(L, result)
		table.RawSetString("data", resultTable)

		// 同时保留常用字段在顶层，方便访问
		for key, value := range result {
			table.RawSetString(key, m.convertToLuaValue(L, value))
		}
	}

	L.Push(table)
	return 1
}

// luaAPIBoolSuccess 统一的Lua API布尔成功返回
// 返回包含 success=true 和数据的表类型
func luaAPIBoolSuccess(L *lua.LState, m *Manager, result map[string]interface{}) int {
	// 统一返回表类型格式
	table := L.CreateTable(0, 3)
	table.RawSetString("success", lua.LTrue)

	if result != nil {
		// 将结果数据放入表的 data 字段
		resultTable := m.convertToLuaTable(L, result)
		table.RawSetString("data", resultTable)

		// 同时保留常用字段在顶层，方便访问
		if messageId, ok := result["message_id"]; ok {
			table.RawSetString("message_id", m.convertToLuaValue(L, messageId))
		}
		if status, ok := result["status"]; ok {
			table.RawSetString("status", m.convertToLuaValue(L, status))
		}
	}

	L.Push(table)
	return 1
}

// luaAPIBoolError 统一的Lua API布尔错误返回
// 返回包含 success=false 和错误信息的表类型
func luaAPIBoolError(L *lua.LState, err error, context string) int {
	errMsg := fmt.Sprintf("%s: %v", context, err)

	// 统一返回表类型格式
	table := L.CreateTable(0, 3)
	table.RawSetString("success", lua.LFalse)
	table.RawSetString("error", lua.LString(errMsg))
	table.RawSetString("message", lua.LString(context))

	L.Push(table)
	return 1
}

// checkLLService 检查服务是否已初始化（优先使用新的ReverseWebSocketService）
func checkLLService(L *lua.LState, instance *LuaPluginInstance) error {
	// 优先使用新的反向WebSocket服务
	if instance.reverseWS != nil && instance.SelfID != "" {
		return nil
	}
	// 兼容旧的LLOneBot服务
	if instance.llService != nil {
		return nil
	}
	return fmt.Errorf("服务未初始化")
}

// checkLLServiceWithManager 使用Manager的服务来检查和补充实例
func checkLLServiceWithManager(L *lua.LState, m *Manager, instance *LuaPluginInstance) error {
	// 优先使用新的反向WebSocket服务
	if instance.reverseWS != nil && instance.SelfID != "" {
		return nil
	}
	// 兼容旧的LLOneBot服务
	if instance.llService != nil {
		return nil
	}
	// 尝试从Manager获取服务
	if m.reverseWS != nil {
		instance.reverseWS = m.reverseWS
		return nil
	}
	if m.llService != nil {
		instance.llService = m.llService
		return nil
	}
	return fmt.Errorf("服务未初始化")
}

// checkLLServiceManager 检查Manager的服务是否已初始化
func checkLLServiceManager(L *lua.LState, m *Manager) error {
	// 优先使用新的反向WebSocket服务
	if m.reverseWS != nil {
		return nil
	}
	// 兼容旧的LLOneBot服务
	if m.llService != nil {
		return nil
	}
	return fmt.Errorf("服务未初始化")
}

// callBotAPI 调用机器人API（使用新的ReverseWebSocketService或旧的LLOneBotService）
func callBotAPI(instance *LuaPluginInstance, action string, params map[string]interface{}) (map[string]interface{}, error) {
	// 优先使用新的反向WebSocket服务
	if instance.reverseWS != nil && instance.SelfID != "" {
		return instance.reverseWS.CallBotAPI(instance.SelfID, action, params)
	}
	// 兼容旧的LLOneBot服务
	if instance.llService != nil {
		return instance.llService.CallAPI(action, params, "POST")
	}
	return nil, fmt.Errorf("服务未初始化")
}

// validateStringParam 验证字符串参数
func validateStringParam(L *lua.LState, index int, paramName string, required bool) (string, error) {
	if L.GetTop() < index {
		if required {
			return "", fmt.Errorf("缺少必需参数: %s", paramName)
		}
		return "", nil
	}

	val := L.CheckString(index)
	if required && val == "" {
		return "", fmt.Errorf("参数 %s 不能为空", paramName)
	}
	return val, nil
}

// validateNumberParam 验证数字参数，支持字符串类型的数字转换
func validateNumberParam(L *lua.LState, index int, paramName string, required bool) (lua.LNumber, error) {
	if L.GetTop() < index {
		if required {
			return 0, fmt.Errorf("缺少必需参数: %s", paramName)
		}
		return 0, nil
	}

	// 尝试直接获取数字
	val := L.Get(index)
	if val.Type() == lua.LTNumber {
		return val.(lua.LNumber), nil
	}
	// 尝试将字符串转换为数字
	if val.Type() == lua.LTString {
		strVal := val.(lua.LString)
		numVal, err := strconv.ParseFloat(string(strVal), 64)
		if err != nil {
			return 0, fmt.Errorf("参数 %s 必须是数字或可转换为数字的字符串", paramName)
		}
		return lua.LNumber(numVal), nil
	}
	return 0, fmt.Errorf("参数 %s 必须是数字类型", paramName)
}

// validateIntParam 验证整数参数
func validateIntParam(L *lua.LState, index int, paramName string, required bool, min, max int) (int, error) {
	if L.GetTop() < index {
		if required {
			return 0, fmt.Errorf("缺少必需参数: %s", paramName)
		}
		return 0, nil
	}

	val := L.CheckInt(index)
	if val < min || val > max {
		return 0, fmt.Errorf("参数 %s 超出范围 [%d, %d]", paramName, min, max)
	}
	return val, nil
}

// withTimeout 为操作添加超时控制
func withTimeout(timeout time.Duration, fn func() error) error {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	done := make(chan error, 1)
	go func() {
		done <- fn()
	}()

	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		return fmt.Errorf("操作超时")
	}
}

// safeCall 安全调用函数，捕获panic
func safeCall(fn func() error) (err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("panic: %v", r)
		}
	}()
	return fn()
}
