package plugins

import (
	"fmt"
	"time"

	lua "github.com/yuin/gopher-lua"
)

type schedulerCallback struct {
	instance *LuaPluginInstance
	function *lua.LFunction
}

func (m *Manager) luaScheduleInterval(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		pluginName := fmt.Sprintf("%s/%s", instance.SelfID, instance.Name)

		if m.schedulerManager == nil {
			return luaAPIError(L, fmt.Errorf("调度器未初始化"), "注册间隔任务失败")
		}

		seconds, err := validateNumberParam(L, 1, "seconds", true)
		if err != nil {
			return luaAPIError(L, err, "注册间隔任务失败")
		}

		if seconds <= 0 {
			return luaAPIError(L, fmt.Errorf("秒数必须大于0"), "注册间隔任务失败")
		}

		if L.Get(2).Type() != lua.LTFunction {
			return luaAPIError(L, fmt.Errorf("第二个参数必须为函数"), "注册间隔任务失败")
		}

		callbackFunc := L.ToFunction(2)

		maxExec := -1
		if L.GetTop() >= 3 {
			if optTable := L.ToTable(3); optTable != nil {
				if maxExecVal := optTable.RawGetString("maxExec"); maxExecVal != lua.LNil {
					if n, ok := maxExecVal.(lua.LNumber); ok {
						maxExec = int(n)
					}
				}
			}
		}

		callbackID := fmt.Sprintf("%s_interval_%d", pluginName, time.Now().UnixNano())

		instance.mu.Lock()
		if instance.schedulerCallbacks == nil {
			instance.schedulerCallbacks = make(map[string]*lua.LFunction)
		}
		instance.schedulerCallbacks[callbackID] = callbackFunc
		instance.mu.Unlock()

		spec := fmt.Sprintf("*/%d * * * * *", seconds)
		executor := m.createSchedulerExecutor(instance, callbackID)
		task, err := m.schedulerManager.RegisterTask(pluginName, SchedulerTypeCron, spec, callbackID, maxExec, nil, executor)
		if err != nil {
			instance.mu.Lock()
			delete(instance.schedulerCallbacks, callbackID)
			instance.mu.Unlock()
			return luaAPIError(L, err, "注册间隔任务失败")
		}

		return luaAPISuccess(L, m, task.ID)
	}
}

func (m *Manager) luaScheduleWeekly(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		pluginName := fmt.Sprintf("%s/%s", instance.SelfID, instance.Name)

		if m.schedulerManager == nil {
			return luaAPIError(L, fmt.Errorf("调度器未初始化"), "注册每周任务失败")
		}

		weekday, err := validateNumberParam(L, 1, "weekday", true)
		if err != nil {
			return luaAPIError(L, err, "注册每周任务失败")
		}

		if weekday < 0 || weekday > 6 {
			return luaAPIError(L, fmt.Errorf("星期必须为0-6之间的数字"), "注册每周任务失败")
		}

		hour, err := validateNumberParam(L, 2, "hour", true)
		if err != nil {
			return luaAPIError(L, err, "注册每周任务失败")
		}

		if hour < 0 || hour > 23 {
			return luaAPIError(L, fmt.Errorf("小时必须为0-23之间的数字"), "注册每周任务失败")
		}

		minute, err := validateNumberParam(L, 3, "minute", true)
		if err != nil {
			return luaAPIError(L, err, "注册每周任务失败")
		}

		if minute < 0 || minute > 59 {
			return luaAPIError(L, fmt.Errorf("分钟必须为0-59之间的数字"), "注册每周任务失败")
		}

		second, err := validateNumberParam(L, 4, "second", true)
		if err != nil {
			return luaAPIError(L, err, "注册每周任务失败")
		}

		if second < 0 || second > 59 {
			return luaAPIError(L, fmt.Errorf("秒数必须为0-59之间的数字"), "注册每周任务失败")
		}

		if L.Get(5).Type() != lua.LTFunction {
			return luaAPIError(L, fmt.Errorf("第五个参数必须为函数"), "注册每周任务失败")
		}

		m.logger.Infow("[MEM-PROFILE] scheduler.weekly注册开始",
			"plugin", instance.Name, "self_id", instance.SelfID)

		callbackFunc := L.ToFunction(5)

		m.logger.Infow("[MEM-PROFILE] scheduler.weekly ToFunction完成",
			"plugin", instance.Name, "self_id", instance.SelfID)

		callbackID := fmt.Sprintf("%s_weekly_%d", pluginName, time.Now().UnixNano())

		instance.mu.Lock()
		if instance.schedulerCallbacks == nil {
			instance.schedulerCallbacks = make(map[string]*lua.LFunction)
		}
		instance.schedulerCallbacks[callbackID] = callbackFunc
		instance.mu.Unlock()

		m.logger.Infow("[MEM-PROFILE] scheduler.weekly callbacks存储完成",
			"plugin", instance.Name, "self_id", instance.SelfID)

		cronSpec := fmt.Sprintf("%d %d %d * * %d", second, minute, hour, int(weekday))
		executor := m.createSchedulerExecutor(instance, callbackID)

		m.logger.Infow("[MEM-PROFILE] scheduler.weekly RegisterTask开始",
			"plugin", instance.Name, "self_id", instance.SelfID, "cronSpec", cronSpec)

		task, err := m.schedulerManager.RegisterTask(pluginName, SchedulerTypeCron, cronSpec, callbackID, 0, map[string]interface{}{
			"task_type": "weekly",
		}, executor)

		m.logger.Infow("[MEM-PROFILE] scheduler.weekly RegisterTask完成",
			"plugin", instance.Name, "self_id", instance.SelfID, "hasTask", task != nil)

		if err != nil {
			instance.mu.Lock()
			delete(instance.schedulerCallbacks, callbackID)
			instance.mu.Unlock()
			return luaAPIError(L, err, "注册每周任务失败")
		}

		return luaAPISuccess(L, m, task.ID)
	}
}

func (m *Manager) luaScheduleMonthly(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		pluginName := fmt.Sprintf("%s/%s", instance.SelfID, instance.Name)

		if m.schedulerManager == nil {
			return luaAPIError(L, fmt.Errorf("调度器未初始化"), "注册每月任务失败")
		}

		day, err := validateNumberParam(L, 1, "day", true)
		if err != nil {
			return luaAPIError(L, err, "注册每月任务失败")
		}

		if day < 1 || day > 31 {
			return luaAPIError(L, fmt.Errorf("日期必须为1-31之间的数字"), "注册每月任务失败")
		}

		hour, err := validateNumberParam(L, 2, "hour", true)
		if err != nil {
			return luaAPIError(L, err, "注册每月任务失败")
		}

		if hour < 0 || hour > 23 {
			return luaAPIError(L, fmt.Errorf("小时必须为0-23之间的数字"), "注册每月任务失败")
		}

		minute, err := validateNumberParam(L, 3, "minute", true)
		if err != nil {
			return luaAPIError(L, err, "注册每月任务失败")
		}

		if minute < 0 || minute > 59 {
			return luaAPIError(L, fmt.Errorf("分钟必须为0-59之间的数字"), "注册每月任务失败")
		}

		second, err := validateNumberParam(L, 4, "second", true)
		if err != nil {
			return luaAPIError(L, err, "注册每月任务失败")
		}

		if second < 0 || second > 59 {
			return luaAPIError(L, fmt.Errorf("秒数必须为0-59之间的数字"), "注册每月任务失败")
		}

		if L.Get(5).Type() != lua.LTFunction {
			return luaAPIError(L, fmt.Errorf("第五个参数必须为函数"), "注册每月任务失败")
		}

		callbackFunc := L.ToFunction(5)

		callbackID := fmt.Sprintf("%s_monthly_%d", pluginName, time.Now().UnixNano())

		instance.mu.Lock()
		if instance.schedulerCallbacks == nil {
			instance.schedulerCallbacks = make(map[string]*lua.LFunction)
		}
		instance.schedulerCallbacks[callbackID] = callbackFunc
		instance.mu.Unlock()

		cronSpec := fmt.Sprintf("%d %d %d %d * *", second, minute, hour, day)
		executor := m.createSchedulerExecutor(instance, callbackID)
		task, err := m.schedulerManager.RegisterTask(pluginName, SchedulerTypeCron, cronSpec, callbackID, 0, map[string]interface{}{
			"task_type": "monthly",
		}, executor)
		if err != nil {
			instance.mu.Lock()
			delete(instance.schedulerCallbacks, callbackID)
			instance.mu.Unlock()
			return luaAPIError(L, err, "注册每月任务失败")
		}

		return luaAPISuccess(L, m, task.ID)
	}
}

func (m *Manager) luaScheduleDaily(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		pluginName := fmt.Sprintf("%s/%s", instance.SelfID, instance.Name)

		if m.schedulerManager == nil {
			return luaAPIError(L, fmt.Errorf("调度器未初始化"), "注册每天任务失败")
		}

		hour, err := validateNumberParam(L, 1, "hour", true)
		if err != nil {
			return luaAPIError(L, err, "注册每天任务失败")
		}

		if hour < 0 || hour > 23 {
			return luaAPIError(L, fmt.Errorf("小时必须为0-23之间的数字"), "注册每天任务失败")
		}

		minute, err := validateNumberParam(L, 2, "minute", true)
		if err != nil {
			return luaAPIError(L, err, "注册每天任务失败")
		}

		if minute < 0 || minute > 59 {
			return luaAPIError(L, fmt.Errorf("分钟必须为0-59之间的数字"), "注册每天任务失败")
		}

		second, err := validateNumberParam(L, 3, "second", true)
		if err != nil {
			return luaAPIError(L, err, "注册每天任务失败")
		}

		if second < 0 || second > 59 {
			return luaAPIError(L, fmt.Errorf("秒数必须为0-59之间的数字"), "注册每天任务失败")
		}

		if L.Get(4).Type() != lua.LTFunction {
			return luaAPIError(L, fmt.Errorf("第四个参数必须为函数"), "注册每天任务失败")
		}

		callbackFunc := L.ToFunction(4)

		callbackID := fmt.Sprintf("%s_daily_%d", pluginName, time.Now().UnixNano())

		instance.mu.Lock()
		if instance.schedulerCallbacks == nil {
			instance.schedulerCallbacks = make(map[string]*lua.LFunction)
		}
		instance.schedulerCallbacks[callbackID] = callbackFunc
		instance.mu.Unlock()

		cronSpec := fmt.Sprintf("%d %d %d * * *", second, minute, hour)
		executor := m.createSchedulerExecutor(instance, callbackID)
		task, err := m.schedulerManager.RegisterTask(pluginName, SchedulerTypeCron, cronSpec, callbackID, 0, map[string]interface{}{
			"task_type": "daily",
		}, executor)
		if err != nil {
			instance.mu.Lock()
			delete(instance.schedulerCallbacks, callbackID)
			instance.mu.Unlock()
			return luaAPIError(L, err, "注册每天任务失败")
		}

		return luaAPISuccess(L, m, task.ID)
	}
}

func (m *Manager) createSchedulerExecutor(instance *LuaPluginInstance, callbackID string) TaskExecutor {
	return func(task *ScheduledTask) error {
		if instance == nil {
			return fmt.Errorf("插件实例不存在")
		}

		instance.unloadingMu.RLock()
		isUnloading := instance.unloading
		instance.unloadingMu.RUnlock()

		if isUnloading {
			return fmt.Errorf("插件正在卸载，跳过执行")
		}

		if instance.IsLuaCorrupted() {
			return fmt.Errorf("Lua状态已损坏，跳过执行")
		}

		instance.mu.Lock()
		callbackFunc, exists := instance.schedulerCallbacks[callbackID]
		L := instance.L
		instance.mu.Unlock()

		if !exists || callbackFunc == nil {
			return fmt.Errorf("回调函数不存在: %s", callbackID)
		}

		if L == nil {
			return fmt.Errorf("Lua状态不可用，插件可能已卸载")
		}

		instance.unloadingMu.RLock()
		isUnloadingNow := instance.unloading
		instance.unloadingMu.RUnlock()

		if isUnloadingNow {
			return fmt.Errorf("插件正在卸载，跳过执行")
		}

		if instance.IsLuaCorrupted() {
			return fmt.Errorf("Lua状态已损坏，跳过执行")
		}

		return instance.sandbox.SafeCall(L, callbackFunc)
	}
}

func (m *Manager) luaCancelSchedulerTask(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		if m.schedulerManager == nil {
			return luaAPIError(L, fmt.Errorf("调度器未初始化"), "取消任务失败")
		}

		taskID, err := validateStringParam(L, 1, "task_id", true)
		if err != nil {
			return luaAPIError(L, err, "取消任务失败")
		}

		success := m.schedulerManager.CancelTask(taskID)

		L.Push(lua.LBool(success))
		return 1
	}
}

func (m *Manager) luaPauseSchedulerTask(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		if m.schedulerManager == nil {
			return luaAPIError(L, fmt.Errorf("调度器未初始化"), "暂停任务失败")
		}

		taskID, err := validateStringParam(L, 1, "task_id", true)
		if err != nil {
			return luaAPIError(L, err, "暂停任务失败")
		}

		success := m.schedulerManager.PauseTask(taskID)

		L.Push(lua.LBool(success))
		return 1
	}
}

func (m *Manager) luaResumeSchedulerTask(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		if m.schedulerManager == nil {
			return luaAPIError(L, fmt.Errorf("调度器未初始化"), "恢复任务失败")
		}

		taskID, err := validateStringParam(L, 1, "task_id", true)
		if err != nil {
			return luaAPIError(L, err, "恢复任务失败")
		}

		success := m.schedulerManager.ResumeTask(taskID)

		L.Push(lua.LBool(success))
		return 1
	}
}

func (m *Manager) luaGetSchedulerTaskStatus(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		if m.schedulerManager == nil {
			return luaAPIError(L, fmt.Errorf("调度器未初始化"), "获取任务状态失败")
		}

		taskID, err := validateStringParam(L, 1, "task_id", true)
		if err != nil {
			return luaAPIError(L, err, "获取任务状态失败")
		}

		task, exists := m.schedulerManager.GetTaskStatus(taskID)
		if !exists {
			L.Push(lua.LNil)
			return 1
		}

		result := map[string]interface{}{
			"id":            task.ID,
			"type":          string(task.Type),
			"spec":          task.Spec,
			"status":        string(task.Status),
			"exec_count":    task.ExecCount,
			"max_exec":      task.MaxExec,
			"created_at":    task.CreatedAt.Unix(),
			"next_exec_at":  task.NextExecAt.Unix(),
			"last_exec_at":  task.LastExecAt.Unix(),
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

func (m *Manager) luaListSchedulerTasks(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		if m.schedulerManager == nil {
			return luaAPIError(L, fmt.Errorf("调度器未初始化"), "列出任务失败")
		}

		pluginName := fmt.Sprintf("%s/%s", instance.SelfID, instance.Name)
		tasks := m.schedulerManager.ListTasks(pluginName)

		result := make([]map[string]interface{}, 0, len(tasks))
		for _, task := range tasks {
			taskInfo := map[string]interface{}{
				"id":            task.ID,
				"type":          string(task.Type),
				"spec":          task.Spec,
				"status":        string(task.Status),
				"exec_count":    task.ExecCount,
				"max_exec":      task.MaxExec,
				"created_at":    task.CreatedAt.Unix(),
				"next_exec_at": task.NextExecAt.Unix(),
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
