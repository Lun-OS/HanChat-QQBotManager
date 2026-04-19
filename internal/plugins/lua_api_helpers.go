package plugins

import (
	"context"
	"fmt"
	"strconv"
	"time"

	lua "github.com/yuin/gopher-lua"
)

// safeLuaCall 安全的 Lua API 调用包装器
// 自动捕获 panic 并转换为错误返回，防止 Lua 脚本错误导致程序崩溃
func safeLuaCall(L *lua.LState, fn func() int) int {
	defer func() {
		if r := recover(); r != nil {
			// 将 panic 转换为 Lua 错误返回
			errMsg := fmt.Sprintf("API内部错误: %v (已自动恢复)", r)
			table := L.CreateTable(0, 3)
			table.RawSetString("success", lua.LFalse)
			table.RawSetString("error", lua.LString(errMsg))
			table.RawSetString("recovered", lua.LTrue) // 标记为已恢复
			L.Push(table)
		}
	}()
	return fn()
}

// safeCheckString 安全的字符串参数检查（不会 panic）
// 替代 L.CheckString，在参数为 nil 或类型不匹配时返回默认值而非 panic
func safeCheckString(L *lua.LState, index int, defaultValue string) string {
	if L.GetTop() < index {
		return defaultValue
	}
	val := L.Get(index)
	if val == nil || val.Type() == lua.LTNil || val.Type() != lua.LTString {
		return defaultValue
	}
	return string(val.(lua.LString))
}

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
// 直接返回结果数据，不再包装data字段
func luaAPISuccess(L *lua.LState, m *Manager, result interface{}) int {
	table := L.CreateTable(0, 2)
	table.RawSetString("success", lua.LTrue)

	if result != nil {
		if resultMap, ok := result.(map[string]interface{}); ok {
			for key, value := range resultMap {
				table.RawSetString(key, m.convertToLuaValue(L, value))
			}
		} else {
			table.RawSetString("data", m.convertToLuaValue(L, result))
		}
	}

	L.Push(table)
	return 1
}

// luaAPISuccessWithTable 统一的Lua API成功返回（表格结果）
// 直接返回结果数据，不再包装data字段
func luaAPISuccessWithTable(L *lua.LState, m *Manager, result map[string]interface{}) int {
	table := L.CreateTable(0, 2)
	table.RawSetString("success", lua.LTrue)

	if result != nil {
		for key, value := range result {
			table.RawSetString(key, m.convertToLuaValue(L, value))
		}
	}

	L.Push(table)
	return 1
}

// luaAPIBoolSuccess 统一的Lua API布尔成功返回
// 内部委托给 luaAPISuccess，保持向后兼容
func luaAPIBoolSuccess(L *lua.LState, m *Manager, result map[string]interface{}) int {
	return luaAPISuccess(L, m, result)
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

// validateStringParam 验证字符串参数（安全版本 - 不会 panic）
func validateStringParam(L *lua.LState, index int, paramName string, required bool) (string, error) {
	if L.GetTop() < index {
		if required {
			return "", fmt.Errorf("缺少必需参数: %s", paramName)
		}
		return "", nil
	}

	val := L.Get(index)
	// ⭐ 安全检查：处理 nil 参数
	if val == nil || val.Type() == lua.LTNil {
		if required {
			return "", fmt.Errorf("参数 %s 不能为 nil", paramName)
		}
		return "", nil
	}

	if val.Type() != lua.LTString {
		if required {
			return "", fmt.Errorf("参数 %s 必须是字符串类型（实际: %s）", paramName, val.Type())
		}
		return "", nil
	}

	strVal := string(val.(lua.LString))
	if required && strVal == "" {
		return "", fmt.Errorf("参数 %s 不能为空字符串", paramName)
	}
	return strVal, nil
}

// validateNumberParam 验证数字参数，支持字符串类型的数字转换（安全版本 - 不会 panic）
func validateNumberParam(L *lua.LState, index int, paramName string, required bool) (lua.LNumber, error) {
	if L.GetTop() < index {
		if required {
			return 0, fmt.Errorf("缺少必需参数: %s", paramName)
		}
		return 0, nil
	}

	val := L.Get(index)
	// ⭐ 安全检查：处理 nil 参数
	if val == nil || val.Type() == lua.LTNil {
		if required {
			return 0, fmt.Errorf("参数 %s 不能为 nil", paramName)
		}
		return 0, nil
	}

	// 尝试直接获取数字
	if val.Type() == lua.LTNumber {
		return val.(lua.LNumber), nil
	}
	// 尝试将字符串转换为数字
	if val.Type() == lua.LTString {
		strVal := string(val.(lua.LString))
		numVal, err := strconv.ParseFloat(strVal, 64)
		if err != nil {
			return 0, fmt.Errorf("参数 %s 必须是数字或可转换为数字的字符串（实际值: %s）", paramName, strVal)
		}
		return lua.LNumber(numVal), nil
	}
	return 0, fmt.Errorf("参数 %s 必须是数字类型（实际: %s）", paramName, val.Type())
}

// validateIntParam 验证整数参数（安全版本 - 不会 panic）
func validateIntParam(L *lua.LState, index int, paramName string, required bool, min, max int) (int, error) {
	if L.GetTop() < index {
		if required {
			return 0, fmt.Errorf("缺少必需参数: %s", paramName)
		}
		return 0, nil
	}

	val := L.Get(index)
	// ⭐ 安全检查：处理 nil 参数
	if val == nil || val.Type() == lua.LTNil {
		if required {
			return 0, fmt.Errorf("参数 %s 不能为 nil", paramName)
		}
		return 0, nil
	}

	var intVal int
	switch val.Type() {
	case lua.LTNumber:
		intVal = int(val.(lua.LNumber))
	case lua.LTString:
		strVal := string(val.(lua.LString))
		parsedVal, err := strconv.Atoi(strVal)
		if err != nil {
			return 0, fmt.Errorf("参数 %s 必须是整数或可转换为整数的字符串（实际值: %s）", paramName, strVal)
		}
		intVal = parsedVal
	default:
		return 0, fmt.Errorf("参数 %s 必须是整数类型（实际: %s）", paramName, val.Type())
	}

	if intVal < min || intVal > max {
		return 0, fmt.Errorf("参数 %s 超出范围 [%d, %d]（实际值: %d）", paramName, min, max, intVal)
	}
	return intVal, nil
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
