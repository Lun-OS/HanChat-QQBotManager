package plugins

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	lua "github.com/yuin/gopher-lua"
)

// validateCronExpression 验证Cron表达式是否有效
// 支持标准Cron格式：秒 分 时 日 月 周 (6个字段)
func validateCronExpression(cronExpr string) error {
	if cronExpr == "" {
		return fmt.Errorf("Cron表达式不能为空")
	}

	fields := strings.Fields(cronExpr)
	if len(fields) != 5 && len(fields) != 6 {
		return fmt.Errorf("Cron表达式必须包含5或6个字段，当前有%d个字段", len(fields))
	}

	// 字段定义（支持6字段格式：秒 分 时 日 月 周）
	var fieldNames []string
	var minVals, maxVals []int

	if len(fields) == 6 {
		// 6字段格式：秒 分 时 日 月 周
		fieldNames = []string{"秒", "分", "时", "日", "月", "周"}
		minVals = []int{0, 0, 0, 1, 1, 0}
		maxVals = []int{59, 59, 23, 31, 12, 6}
	} else {
		// 5字段格式：分 时 日 月 周
		fieldNames = []string{"分", "时", "日", "月", "周"}
		minVals = []int{0, 0, 1, 1, 0}
		maxVals = []int{59, 23, 31, 12, 6}
	}

	// 验证每个字段
	for i, field := range fields {
		if err := validateCronField(field, fieldNames[i], minVals[i], maxVals[i]); err != nil {
			return fmt.Errorf("字段[%s]验证失败: %v", fieldNames[i], err)
		}
	}

	return nil
}

// validateCronField 验证单个Cron字段
func validateCronField(field, fieldName string, minVal, maxVal int) error {
	// 支持的特殊字符: * / , -
	// 正则表达式验证字段格式
	validPattern := regexp.MustCompile(`^[\d*,/-]+$`)
	if !validPattern.MatchString(field) {
		return fmt.Errorf("包含非法字符")
	}

	// 处理特殊值
	if field == "*" {
		return nil // * 表示任意值，始终有效
	}

	// 处理列表 (e.g., "1,2,3")
	if strings.Contains(field, ",") {
		parts := strings.Split(field, ",")
		for _, part := range parts {
			if err := validateCronField(part, fieldName, minVal, maxVal); err != nil {
				return err
			}
		}
		return nil
	}

	// 处理范围 (e.g., "1-5")
	if strings.Contains(field, "-") {
		parts := strings.Split(field, "-")
		if len(parts) != 2 {
			return fmt.Errorf("范围格式错误")
		}
		start, err1 := strconv.Atoi(parts[0])
		end, err2 := strconv.Atoi(parts[1])
		if err1 != nil || err2 != nil {
			return fmt.Errorf("范围值必须是数字")
		}
		if start < minVal || end > maxVal || start > end {
			return fmt.Errorf("范围值必须在%d-%d之间", minVal, maxVal)
		}
		return nil
	}

	// 处理步长 (e.g., "*/5" or "1-5/2")
	if strings.Contains(field, "/") {
		parts := strings.Split(field, "/")
		if len(parts) != 2 {
			return fmt.Errorf("步长格式错误")
		}
		step, err := strconv.Atoi(parts[1])
		if err != nil {
			return fmt.Errorf("步长必须是数字")
		}
		if step <= 0 {
			return fmt.Errorf("步长必须大于0")
		}
		// 验证步长前的部分
		if parts[0] != "*" {
			if err := validateCronField(parts[0], fieldName, minVal, maxVal); err != nil {
				return err
			}
		}
		return nil
	}

	// 处理单个数字
	val, err := strconv.Atoi(field)
	if err != nil {
		return fmt.Errorf("必须是数字或特殊字符")
	}
	if val < minVal || val > maxVal {
		return fmt.Errorf("值必须在%d-%d之间", minVal, maxVal)
	}

	return nil
}

func (m *Manager) luaRegisterInterval(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		pluginName := fmt.Sprintf("%s/%s", instance.SelfID, instance.Name)

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
		pluginName := fmt.Sprintf("%s/%s", instance.SelfID, instance.Name)

		if m.timerSystem == nil {
			return luaAPIError(L, fmt.Errorf("定时任务系统未初始化"), "注册Cron任务失败")
		}

		cronExpr, err := validateStringParam(L, 1, "cron", true)
		if err != nil {
			return luaAPIError(L, err, "注册Cron任务失败")
		}

		// 验证Cron表达式有效性
		if err := validateCronExpression(cronExpr); err != nil {
			return luaAPIError(L, err, "Cron表达式无效")
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
		pluginName := fmt.Sprintf("%s/%s", instance.SelfID, instance.Name)

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
		pluginName := fmt.Sprintf("%s/%s", instance.SelfID, instance.Name)

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
		pluginName := fmt.Sprintf("%s/%s", instance.SelfID, instance.Name)

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
		pluginName := fmt.Sprintf("%s/%s", instance.SelfID, instance.Name)

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
		pluginName := fmt.Sprintf("%s/%s", instance.SelfID, instance.Name)

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
		pluginName := fmt.Sprintf("%s/%s", instance.SelfID, instance.Name)

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
		pluginName := fmt.Sprintf("%s/%s", instance.SelfID, instance.Name)

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
		pluginName := fmt.Sprintf("%s/%s", instance.SelfID, instance.Name)

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
		pluginName := fmt.Sprintf("%s/%s", instance.SelfID, instance.Name)

		if m.timerSystem == nil {
			return luaAPIError(L, fmt.Errorf("定时任务系统未初始化"), "取消所有任务失败")
		}

		m.timerSystem.CancelPluginTasks(pluginName)

		return 0
	}
}
