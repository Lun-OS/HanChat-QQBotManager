package plugins

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/robfig/cron/v3"
	"go.uber.org/zap"
)

type TaskManager struct {
	timerSystem *TimerSystem
	logger      *zap.SugaredLogger
	tasks       map[string]*PluginTimerTask
	mu          sync.RWMutex
	// 重试策略配置
	defaultRetryCount int           // 默认重试次数
	defaultRetryDelay time.Duration // 默认重试延迟
}

func NewTaskManager(timerSystem *TimerSystem, logger *zap.SugaredLogger) *TaskManager {
	return &TaskManager{
		timerSystem:       timerSystem,
		logger:            logger,
		tasks:             make(map[string]*PluginTimerTask),
		defaultRetryCount: 3,
		defaultRetryDelay: 5 * time.Second,
	}
}

func (tm *TaskManager) RegisterTask(pluginName string, taskType TaskType, spec string, callback interface{}, opts TaskOptions) (string, error) {
	taskID := fmt.Sprintf("task_%d", time.Now().UnixNano())

	var nextExecTime time.Time
	var interval time.Duration
	var err error

	// 计算下一次执行时间
	now := time.Now()
	switch taskType {
	case TaskTypeInterval:
		interval, err = parseInterval(spec)
		if err != nil {
			return "", err
		}
		if opts.FirstExec > 0 {
			nextExecTime = now.Add(opts.FirstExec)
		} else {
			nextExecTime = now.Add(interval)
		}
	case TaskTypeDelay:
		interval, err = parseInterval(spec)
		if err != nil {
			return "", err
		}
		nextExecTime = now.Add(interval)
	case TaskTypeCron:
		nextExecTime, err = parseCronNext(spec)
		if err != nil {
			return "", err
		}
	case TaskTypeAt:
		nextExecTime, err = parseAtNext(spec)
		if err != nil {
			return "", err
		}
	case TaskTypeOnce:
		// Once任务立即执行
		nextExecTime = now
	}

	// 设置最大执行次数，-1表示无限执行
	maxExec := opts.MaxExec
	if maxExec == 0 {
		if taskType == TaskTypeOnce {
			maxExec = 1
		} else {
			maxExec = -1
		}
	}

	// 创建任务
	task := &PluginTimerTask{
		ID:         taskID,
		PluginName: pluginName,
		TaskType:   taskType,
		Spec:       spec,
		Interval:   interval,
		Callback:   callback,
		ExecCount:  0,
		Status:     TaskStatusRunning,
		CreatedAt:  now,
		NextExecAt: nextExecTime,
		Options:    opts,
		LastResult: nil,
	}

	tm.mu.Lock()
	tm.tasks[taskID] = task
	tm.mu.Unlock()

	// 创建时间轮任务
	timeWheelTask := &TimeWheelTask{
		ID:         taskID,
		PluginName: pluginName,
		TaskType:   taskType,
		Interval:   interval,
		Callback:   callback,
		ExecFunc:   tm.createExecFunc(task),
		PluginTask: task,
	}

	// 添加任务到多级时间轮
	if tm.timerSystem == nil || tm.timerSystem.timeWheel == nil {
		return "", fmt.Errorf("定时任务系统未初始化")
	}
	if err := tm.timerSystem.timeWheel.AddTask(timeWheelTask, nextExecTime); err != nil {
		tm.mu.Lock()
		delete(tm.tasks, taskID)
		tm.mu.Unlock()
		return "", err
	}

	if tm.logger != nil {
		tm.logger.Infow("任务已注册", "task_id", taskID, "plugin", pluginName, "type", taskType, "next_exec", nextExecTime)
	}

	// 更新系统统计信息，记录任务创建时间
	tm.timerSystem.mu.Lock()
	tm.timerSystem.stats.LastTaskCreated = time.Now()
	tm.timerSystem.mu.Unlock()

	return taskID, nil
}

func (tm *TaskManager) CancelTask(pluginName, taskID string) bool {
	tm.mu.Lock()
	task, exists := tm.tasks[taskID]
	tm.mu.Unlock()

	if !exists {
		return false
	}

	if task.PluginName != pluginName {
		return false
	}

	// 从时间轮中移除任务
	if tm.timerSystem != nil && tm.timerSystem.timeWheel != nil {
		tm.timerSystem.timeWheel.RemoveTask(taskID)
	}

	// 更新任务状态
	tm.mu.Lock()
	task.Status = TaskStatusStopped
	delete(tm.tasks, taskID)
	tm.mu.Unlock()

	if tm.logger != nil {
		tm.logger.Infow("任务已取消", "task_id", taskID, "plugin", pluginName)
	}

	return true
}

func (tm *TaskManager) GetTaskStatus(pluginName, taskID string) (*PluginTimerTask, bool) {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	task, exists := tm.tasks[taskID]
	if !exists {
		return nil, false
	}

	if task.PluginName != pluginName {
		return nil, false
	}

	return task, true
}

func (tm *TaskManager) ListTasks(pluginName string) []*PluginTimerTask {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	var result []*PluginTimerTask
	for _, task := range tm.tasks {
		if task.PluginName == pluginName {
			result = append(result, task)
		}
	}
	return result
}

func (tm *TaskManager) PauseTask(pluginName, taskID string) bool {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	task, exists := tm.tasks[taskID]
	if !exists {
		return false
	}

	if task.PluginName != pluginName {
		return false
	}

	task.Status = TaskStatusPaused
	if tm.logger != nil {
		tm.logger.Infow("任务已暂停", "task_id", taskID, "plugin", pluginName)
	}

	return true
}

func (tm *TaskManager) ResumeTask(pluginName, taskID string) bool {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	task, exists := tm.tasks[taskID]
	if !exists {
		return false
	}

	if task.PluginName != pluginName {
		return false
	}

	task.Status = TaskStatusRunning
	// 重新计算下一次执行时间
	task.NextExecAt = time.Now().Add(task.Interval)
	if tm.logger != nil {
		tm.logger.Infow("任务已恢复", "task_id", taskID, "plugin", pluginName, "next_exec", task.NextExecAt)
	}

	// 重新添加到时间轮
	timeWheelTask := &TimeWheelTask{
		ID:         task.ID,
		PluginName: task.PluginName,
		TaskType:   task.TaskType,
		Interval:   task.Interval,
		Callback:   task.Callback,
		ExecFunc:   tm.createExecFunc(task),
		PluginTask: task,
	}

	if tm.timerSystem == nil || tm.timerSystem.timeWheel == nil {
		if tm.logger != nil {
			tm.logger.Errorw("定时任务系统未初始化", "task_id", taskID, "plugin", pluginName)
		}
		return false
	}
	if err := tm.timerSystem.timeWheel.AddTask(timeWheelTask, task.NextExecAt); err != nil {
		if tm.logger != nil {
			tm.logger.Errorw("恢复任务失败", "task_id", taskID, "plugin", pluginName, "error", err)
		}
		return false
	}

	return true
}

func (tm *TaskManager) createExecFunc(task *PluginTimerTask) func() {
	return func() {
		// 检查任务状态
		if task.Status != TaskStatusRunning {
			return
		}

		// 检查执行次数限制
		if task.Options.MaxExec > 0 && task.ExecCount >= task.Options.MaxExec {
			task.Status = TaskStatusCompleted
			if tm.logger != nil {
				tm.logger.Infow("任务执行次数已达上限", "task_id", task.ID, "plugin", task.PluginName, "max_exec", task.Options.MaxExec)
			}
			return
		}

		// 尝试获取信号量，限制并发执行
		semaphoreAcquired := false
		if tm.timerSystem != nil {
			if !tm.timerSystem.AcquireTaskSemaphore() {
				// 并发数已达上限，重新排队
				if tm.logger != nil {
					tm.logger.Warnw("任务并发数已达上限，任务重新排队", "task_id", task.ID, "plugin", task.PluginName)
				}
				tm.rescheduleTask(task, time.Now().Add(100*time.Millisecond))
				return
			}
			semaphoreAcquired = true
		}

		// 确保释放信号量 - 在函数退出时执行
		defer func() {
			if semaphoreAcquired && tm.timerSystem != nil {
				tm.timerSystem.ReleaseTaskSemaphore()
			}
		}()

		// 执行任务
		retryCount := 0
		success := false
		var execErr error
		var startTime time.Time

		// 重试机制
		maxRetries := tm.defaultRetryCount
		if task.Options.MaxExec > 0 {
			maxRetries = task.Options.MaxExec
		}

		for retryCount <= maxRetries {
			startTime = time.Now()

			// 执行回调函数
			func() {
				defer func() {
					if r := recover(); r != nil {
						execErr = fmt.Errorf("任务执行 panic: %v", r)
						success = false
					}
				}()

				switch cb := task.Callback.(type) {
				case func() error:
					execErr = cb()
					if execErr == nil {
						success = true
					}
				case func():
					cb()
					success = true
				default:
					if tm.logger != nil {
						tm.logger.Warnw("不支持的回调类型，任务将静默失败", "task_id", task.ID, "plugin", task.PluginName, "callback_type", fmt.Sprintf("%T", task.Callback))
					}
					execErr = fmt.Errorf("不支持的回调类型: %T", task.Callback)
					success = false
				}
			}()

			if success {
				break
			}

			// 任务执行失败，准备重试
			retryCount++
			if retryCount > maxRetries {
				break
			}

			// 计算重试延迟（指数退避）
			retryDelay := tm.defaultRetryDelay * time.Duration(retryCount)
			if tm.logger != nil {
				tm.logger.Warnw("任务执行失败，准备重试", "task_id", task.ID, "plugin", task.PluginName, "retry_count", retryCount, "delay", retryDelay, "error", execErr)
			}
			// 使用重新调度替代阻塞Sleep，避免goroutine堆积
			// 注意：这里不再增加 ExecCount，重试时保持原计数
			tm.rescheduleTask(task, time.Now().Add(retryDelay))
			return
		}

		// 更新任务状态和执行统计
		tm.mu.Lock()
		task.ExecCount++
		task.LastExecAt = startTime
		duration := time.Since(startTime)

		if success {
			task.LastResult = &TaskResult{
				Success:     true,
				TriggerTime: startTime,
				Duration:    duration,
			}
			if tm.logger != nil {
				tm.logger.Infow("任务执行成功", "task_id", task.ID, "plugin", task.PluginName, "exec_count", task.ExecCount, "duration", duration)
			}
		} else {
			task.LastResult = &TaskResult{
				Success:     false,
				TriggerTime: startTime,
				Duration:    duration,
				Error:       execErr.Error(),
			}
			if tm.logger != nil {
				tm.logger.Errorw("任务执行失败", "task_id", task.ID, "plugin", task.PluginName, "exec_count", task.ExecCount, "duration", duration, "error", execErr)
			}
		}
		tm.mu.Unlock()

		// 更新系统统计信息
		if tm.timerSystem != nil {
			tm.timerSystem.UpdateStats(task, success, duration)
		}

		// 检查是否需要继续执行
		if task.Options.MaxExec > 0 && task.ExecCount >= task.Options.MaxExec {
			tm.mu.Lock()
			task.Status = TaskStatusCompleted
			tm.mu.Unlock()
			if tm.logger != nil {
				tm.logger.Infow("任务执行完成", "task_id", task.ID, "plugin", task.PluginName, "exec_count", task.ExecCount)
			}
			return
		}

		// 根据任务类型决定是否重新调度
		switch task.TaskType {
		case TaskTypeInterval:
			// 固定间隔任务，重新调度
			nextExec := time.Now().Add(task.Interval)
			tm.rescheduleTask(task, nextExec)
		case TaskTypeCron:
			// Cron任务，计算下一次执行时间
			nextExec, err := parseCronNext(task.Spec)
			if err != nil {
				if tm.logger != nil {
					tm.logger.Errorw("计算Cron任务下一次执行时间失败", "task_id", task.ID, "plugin", task.PluginName, "error", err)
				}
				task.Status = TaskStatusStopped
				return
			}
			tm.rescheduleTask(task, nextExec)
		case TaskTypeDelay, TaskTypeOnce:
			// 延迟任务和一次性任务，执行后结束
			tm.mu.Lock()
			task.Status = TaskStatusCompleted
			tm.mu.Unlock()
			if tm.logger != nil {
				tm.logger.Infow("任务执行完成", "task_id", task.ID, "plugin", task.PluginName)
			}
		}
	}
}

// rescheduleTask 重新调度任务
func (tm *TaskManager) rescheduleTask(task *PluginTimerTask, nextExec time.Time) {
	// 更新任务的下一次执行时间
	tm.mu.Lock()
	task.NextExecAt = nextExec
	tm.mu.Unlock()

	// 创建新的时间轮任务
	timeWheelTask := &TimeWheelTask{
		ID:         task.ID,
		PluginName: task.PluginName,
		TaskType:   task.TaskType,
		Interval:   task.Interval,
		Callback:   task.Callback,
		ExecFunc:   tm.createExecFunc(task),
		PluginTask: task,
	}

	// 添加到时间轮
	if tm.timerSystem == nil || tm.timerSystem.timeWheel == nil {
		if tm.logger != nil {
			tm.logger.Errorw("定时任务系统未初始化，无法重新调度任务", "task_id", task.ID, "plugin", task.PluginName)
		}
		return
	}
	if err := tm.timerSystem.timeWheel.AddTask(timeWheelTask, nextExec); err != nil {
		if tm.logger != nil {
			tm.logger.Errorw("重新调度任务失败", "task_id", task.ID, "plugin", task.PluginName, "error", err)
		}
	}
}

// 解析间隔时间字符串
func parseInterval(s string) (time.Duration, error) {
	s = strings.TrimSpace(s)

	re := regexp.MustCompile(`^(\d+)([smhd]?)$`)
	matches := re.FindStringSubmatch(s)

	if matches == nil {
		return 0, fmt.Errorf("无效的时间间隔格式: %s", s)
	}

	value, _ := strconv.ParseInt(matches[1], 10, 64)
	unit := matches[2]

	var duration time.Duration
	switch unit {
	case "s":
		duration = time.Duration(value) * time.Second
	case "m":
		duration = time.Duration(value) * time.Minute
	case "h":
		duration = time.Duration(value) * time.Hour
	case "d":
		duration = time.Duration(value) * 24 * time.Hour
	default:
		duration = time.Duration(value) * time.Second
	}

	return duration, nil
}

// 解析Cron表达式，计算下一次执行时间
func parseCronNext(s string) (time.Time, error) {
	s = strings.TrimSpace(s)

	parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor)
	schedule, err := parser.Parse(s)
	if err != nil {
		return time.Time{}, fmt.Errorf("无效的Cron表达式: %s, 错误: %v", s, err)
	}

	now := time.Now()
	next := schedule.Next(now)
	return next, nil
}

// 解析At表达式，计算下一次执行时间
func parseAtNext(s string) (time.Time, error) {
	s = strings.TrimSpace(s)

	// 支持格式：HH:MM 或 YYYY-MM-DD HH:MM
	// 简化实现：只支持当天的时间点
	if len(s) == 5 && strings.Contains(s, ":") {
		// HH:MM 格式
		parts := strings.Split(s, ":")
		hour, err := strconv.Atoi(parts[0])
		if err != nil || hour < 0 || hour > 23 {
			return time.Time{}, fmt.Errorf("无效的小时格式: %s", parts[0])
		}
		minute, err := strconv.Atoi(parts[1])
		if err != nil || minute < 0 || minute > 59 {
			return time.Time{}, fmt.Errorf("无效的分钟格式: %s", parts[1])
		}

		now := time.Now()
		next := time.Date(now.Year(), now.Month(), now.Day(), hour, minute, 0, 0, now.Location())
		if next.Before(now) {
			// 如果时间已过，安排到明天
			next = next.Add(24 * time.Hour)
		}
		return next, nil
	}

	// 支持 YYYY-MM-DD HH:MM 格式
	if len(s) == 16 && strings.Contains(s, " ") {
		next, err := time.Parse("2006-01-02 15:04", s)
		if err != nil {
			return time.Time{}, fmt.Errorf("无效的时间格式: %s", s)
		}
		return next, nil
	}

	return time.Time{}, fmt.Errorf("无效的At表达式格式: %s", s)
}

// GetRunningTasksCount 获取当前运行的任务数量
func (tm *TaskManager) GetRunningTasksCount() int {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	count := 0
	for _, task := range tm.tasks {
		if task.Status == TaskStatusRunning {
			count++
		}
	}
	return count
}

// GetCompletedTasksCount 获取已完成的任务数量
func (tm *TaskManager) GetCompletedTasksCount() int {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	count := 0
	for _, task := range tm.tasks {
		if task.Status == TaskStatusCompleted {
			count++
		}
	}
	return count
}
