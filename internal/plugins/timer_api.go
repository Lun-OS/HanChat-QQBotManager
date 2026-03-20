package plugins

import (
	"fmt"
	"time"

	lua "github.com/yuin/gopher-lua"
)

func (m *Manager) luaRegisterInterval(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		pluginName := instance.Name

		if m.timerSystem == nil {
			return luaAPIError(L, fmt.Errorf("定时任务系统未初始化"), "注册间隔任务失败")
		}

		interval, err := validateStringParam(L, 1, "interval", true)
		if err != nil {
			return luaAPIError(L, err, "注册间隔任务失败")
		}

		if L.Get(2).Type() != lua.LTFunction {
			return luaAPIError(L, fmt.Errorf("第二个参数必须为函数"), "注册间隔任务失败")
		}

		callbackFunc := L.ToFunction(2)

		opts := TaskOptions{
			MaxExec:   -1,
			FirstExec: 0,
		}

		if L.GetTop() >= 3 {
			if optTable := L.ToTable(3); optTable != nil {
				if maxExec := optTable.RawGetString("maxExec"); maxExec != lua.LNil {
					if n, ok := maxExec.(lua.LNumber); ok {
						maxExecVal := int(n)
						if maxExecVal > 0 {
							opts.MaxExec = maxExecVal
						}
					}
				}
				if firstExec := optTable.RawGetString("firstExec"); firstExec != lua.LNil {
					if s, ok := firstExec.(lua.LString); ok {
						if d, err := time.ParseDuration(string(s)); err == nil {
							opts.FirstExec = d
						}
					}
				}
			}
		}

		taskID, err := m.timerSystem.RegisterTask(pluginName, TaskTypeInterval, interval, callbackFunc, opts)
		if err != nil {
			return luaAPIError(L, err, "注册间隔任务失败")
		}

		return luaAPISuccess(L, m, taskID)
	}
}

func (m *Manager) luaRegisterCron(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		pluginName := instance.Name

		if m.timerSystem == nil {
			return luaAPIError(L, fmt.Errorf("定时任务系统未初始化"), "注册Cron任务失败")
		}

		cronExpr, err := validateStringParam(L, 1, "cron", true)
		if err != nil {
			return luaAPIError(L, err, "注册Cron任务失败")
		}

		if L.Get(2).Type() != lua.LTFunction {
			return luaAPIError(L, fmt.Errorf("第二个参数必须为函数"), "注册Cron任务失败")
		}

		callbackFunc := L.ToFunction(2)

		opts := TaskOptions{
			MaxExec:   -1,
			FirstExec: 0,
		}

		if L.GetTop() >= 3 {
			if optTable := L.ToTable(3); optTable != nil {
				if maxExec := optTable.RawGetString("maxExec"); maxExec != lua.LNil {
					if n, ok := maxExec.(lua.LNumber); ok {
						maxExecVal := int(n)
						if maxExecVal > 0 {
							opts.MaxExec = maxExecVal
						}
					}
				}
			}
		}

		taskID, err := m.timerSystem.RegisterTask(pluginName, TaskTypeCron, cronExpr, callbackFunc, opts)
		if err != nil {
			return luaAPIError(L, err, "注册Cron任务失败")
		}

		return luaAPISuccess(L, m, taskID)
	}
}

func (m *Manager) luaRegisterAt(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		pluginName := instance.Name

		if m.timerSystem == nil {
			return luaAPIError(L, fmt.Errorf("定时任务系统未初始化"), "注册定时任务失败")
		}

		timeStr, err := validateStringParam(L, 1, "time", true)
		if err != nil {
			return luaAPIError(L, err, "注册定时任务失败")
		}

		if L.Get(2).Type() != lua.LTFunction {
			return luaAPIError(L, fmt.Errorf("第二个参数必须为函数"), "注册定时任务失败")
		}

		callbackFunc := L.ToFunction(2)

		opts := TaskOptions{
			MaxExec:   1,
			FirstExec: 0,
		}

		taskID, err := m.timerSystem.RegisterTask(pluginName, TaskTypeAt, timeStr, callbackFunc, opts)
		if err != nil {
			return luaAPIError(L, err, "注册定时任务失败")
		}

		return luaAPISuccess(L, m, taskID)
	}
}

func (m *Manager) luaRegisterDelay(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		pluginName := instance.Name

		if m.timerSystem == nil {
			return luaAPIError(L, fmt.Errorf("定时任务系统未初始化"), "注册延迟任务失败")
		}

		delay, err := validateStringParam(L, 1, "delay", true)
		if err != nil {
			return luaAPIError(L, err, "注册延迟任务失败")
		}

		if L.Get(2).Type() != lua.LTFunction {
			return luaAPIError(L, fmt.Errorf("第二个参数必须为函数"), "注册延迟任务失败")
		}

		callbackFunc := L.ToFunction(2)

		opts := TaskOptions{
			MaxExec:   1,
			FirstExec: 0,
		}

		taskID, err := m.timerSystem.RegisterTask(pluginName, TaskTypeDelay, delay, callbackFunc, opts)
		if err != nil {
			return luaAPIError(L, err, "注册延迟任务失败")
		}

		return luaAPISuccess(L, m, taskID)
	}
}

func (m *Manager) luaRegisterOnce(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		pluginName := instance.Name

		if m.timerSystem == nil {
			return luaAPIError(L, fmt.Errorf("定时任务系统未初始化"), "注册一次性任务失败")
		}

		delay, err := validateStringParam(L, 1, "delay", true)
		if err != nil {
			return luaAPIError(L, err, "注册一次性任务失败")
		}

		if L.Get(2).Type() != lua.LTFunction {
			return luaAPIError(L, fmt.Errorf("第二个参数必须为函数"), "注册一次性任务失败")
		}

		callbackFunc := L.ToFunction(2)

		opts := TaskOptions{
			MaxExec:   1,
			FirstExec: 0,
		}

		taskID, err := m.timerSystem.RegisterTask(pluginName, TaskTypeOnce, delay, callbackFunc, opts)
		if err != nil {
			return luaAPIError(L, err, "注册一次性任务失败")
		}

		return luaAPISuccess(L, m, taskID)
	}
}

func (m *Manager) luaCancelTask(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		pluginName := instance.Name

		if m.timerSystem == nil {
			return luaAPIError(L, fmt.Errorf("定时任务系统未初始化"), "取消任务失败")
		}

		taskID, err := validateStringParam(L, 1, "task_id", true)
		if err != nil {
			return luaAPIError(L, err, "取消任务失败")
		}

		success := m.timerSystem.CancelTask(pluginName, taskID)

		L.Push(lua.LBool(success))
		return 1
	}
}

func (m *Manager) luaGetTaskStatus(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		pluginName := instance.Name

		if m.timerSystem == nil {
			return luaAPIError(L, fmt.Errorf("定时任务系统未初始化"), "获取任务状态失败")
		}

		taskID, err := validateStringParam(L, 1, "task_id", true)
		if err != nil {
			return luaAPIError(L, err, "获取任务状态失败")
		}

		task, exists := m.timerSystem.GetTaskStatus(pluginName, taskID)
		if !exists {
			L.Push(lua.LNil)
			return 1
		}

		result := map[string]interface{}{
			"id":         task.ID,
			"type":       string(task.TaskType),
			"spec":       task.Spec,
			"status":     string(task.Status),
			"execCount":  task.ExecCount,
			"createdAt":  task.CreatedAt.Unix(),
			"nextExecAt": task.NextExecAt.Unix(),
			"lastExecAt": task.LastExecAt.Unix(),
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

func (m *Manager) luaListTasks(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		pluginName := instance.Name

		if m.timerSystem == nil {
			return luaAPIError(L, fmt.Errorf("定时任务系统未初始化"), "列出任务失败")
		}

		tasks := m.timerSystem.ListTasks(pluginName)

		result := make([]map[string]interface{}, 0, len(tasks))
		for _, task := range tasks {
			taskInfo := map[string]interface{}{
				"id":         task.ID,
				"type":       string(task.TaskType),
				"spec":       task.Spec,
				"status":     string(task.Status),
				"execCount":  task.ExecCount,
				"createdAt":  task.CreatedAt.Unix(),
				"nextExecAt": task.NextExecAt.Unix(),
			}
			result = append(result, taskInfo)
		}

		table := L.NewTable()
		for i, taskInfo := range result {
			taskTable := L.NewTable()
			for k, v := range taskInfo {
				L.SetField(taskTable, k, m.convertToLuaValue(L, v))
			}
			L.SetTable(table, lua.LNumber(i+1), taskTable)
		}

		L.Push(table)
		return 1
	}
}

func (m *Manager) luaPauseTask(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		pluginName := instance.Name

		if m.timerSystem == nil {
			return luaAPIError(L, fmt.Errorf("定时任务系统未初始化"), "暂停任务失败")
		}

		taskID, err := validateStringParam(L, 1, "task_id", true)
		if err != nil {
			return luaAPIError(L, err, "暂停任务失败")
		}

		success := m.timerSystem.PauseTask(pluginName, taskID)

		L.Push(lua.LBool(success))
		return 1
	}
}

func (m *Manager) luaResumeTask(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		pluginName := instance.Name

		if m.timerSystem == nil {
			return luaAPIError(L, fmt.Errorf("定时任务系统未初始化"), "恢复任务失败")
		}

		taskID, err := validateStringParam(L, 1, "task_id", true)
		if err != nil {
			return luaAPIError(L, err, "恢复任务失败")
		}

		success := m.timerSystem.ResumeTask(pluginName, taskID)

		L.Push(lua.LBool(success))
		return 1
	}
}

func (m *Manager) luaCancelAllTasks(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		pluginName := instance.Name

		if m.timerSystem == nil {
			return luaAPIError(L, fmt.Errorf("定时任务系统未初始化"), "取消所有任务失败")
		}

		m.timerSystem.CancelPluginTasks(pluginName)

		return 0
	}
}
