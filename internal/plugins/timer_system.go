package plugins

import (
	"context"
	"fmt"
	"sync"
	"time"

	"go.uber.org/zap"
)

// TimerStats 定时任务系统统计信息
type TimerStats struct {
	TotalTasks       int           // 任务总数
	RunningTasks     int           // 正在运行的任务数
	CompletedTasks   int           // 已完成的任务数
	FailedTasks      int           // 失败的任务数
	SuccessTasks     int           // 成功的任务数
	AvgExecTime      time.Duration // 平均执行时间
	MaxExecTime      time.Duration // 最长执行时间
	MinExecTime      time.Duration // 最短执行时间
	TotalExecCount   int           // 总执行次数
	StartTime        time.Time     // 系统启动时间
	LastTaskCreated  time.Time     // 最后一个任务创建时间
	LastTaskExecuted time.Time     // 最后一个任务执行时间
}

type TimerSystem struct {
	manager     *Manager
	timeWheel   *MultiLevelTimeWheel
	taskManager *TaskManager
	logger      *zap.SugaredLogger
	ctx         context.Context
	cancel      context.CancelFunc
	wg          sync.WaitGroup
	mu          sync.RWMutex
	pluginTasks map[string]map[string]*PluginTimerTask
	// 限制并发执行的任务数量
	maxConcurrentTasks int
	runningTasks       int
	taskSemaphore      chan struct{}
	// 任务统计信息
	stats TimerStats
	// 用于计算平均执行时间 - 使用环形缓冲区实现O(1)操作
	execTimes    []time.Duration
	execTimesIdx int          // 环形缓冲区当前索引
	execTimesLen int          // 当前有效元素数量
	maxExecTimes int          // 保存的最大执行时间记录数
}

func NewTimerSystem(manager *Manager, logger *zap.SugaredLogger) *TimerSystem {
	ctx, cancel := context.WithCancel(context.Background())

	// 默认限制最大并发任务数量为100
	maxConcurrent := 100
	// 默认保存最近1000条执行时间记录
	maxExecTimes := 1000

	ts := &TimerSystem{
		manager:            manager,
		logger:             logger,
		ctx:                ctx,
		cancel:             cancel,
		pluginTasks:        make(map[string]map[string]*PluginTimerTask),
		maxConcurrentTasks: maxConcurrent,
		taskSemaphore:      make(chan struct{}, maxConcurrent),
		maxExecTimes:       maxExecTimes,
		execTimes:          make([]time.Duration, maxExecTimes),
		execTimesIdx:       0,
		execTimesLen:       0,
		stats: TimerStats{
			StartTime:        time.Now(),
			LastTaskCreated:  time.Time{},
			LastTaskExecuted: time.Time{},
		},
	}

	ts.timeWheel = NewMultiLevelTimeWheel(logger)
	ts.taskManager = NewTaskManager(ts, logger)

	// 短暂延迟后启动，确保系统完全初始化
	time.Sleep(10 * time.Millisecond)
	ts.timeWheel.Start()

	logger.Info("定时任务系统已启动")

	return ts
}

// GetStats 获取定时任务系统统计信息
func (ts *TimerSystem) GetStats() TimerStats {
	ts.mu.RLock()
	defer ts.mu.RUnlock()

	// 计算平均执行时间
	var totalExecTime time.Duration
	if ts.execTimesLen > 0 {
		for i := 0; i < ts.execTimesLen; i++ {
			totalExecTime += ts.execTimes[i]
		}
		ts.stats.AvgExecTime = totalExecTime / time.Duration(ts.execTimesLen)
	}

	// 更新任务数量统计
	ts.stats.RunningTasks = ts.runningTasks
	if ts.taskManager != nil {
		ts.stats.TotalTasks = ts.taskManager.GetRunningTasksCount() + ts.taskManager.GetCompletedTasksCount()
		ts.stats.CompletedTasks = ts.taskManager.GetCompletedTasksCount()
	} else {
		ts.stats.TotalTasks = 0
		ts.stats.CompletedTasks = 0
	}

	return ts.stats
}

// UpdateStats 更新定时任务系统统计信息
func (ts *TimerSystem) UpdateStats(task *PluginTimerTask, success bool, execTime time.Duration) {
	ts.mu.Lock()
	defer ts.mu.Unlock()

	// 更新任务执行统计
	ts.stats.TotalExecCount++
	ts.stats.LastTaskExecuted = time.Now()

	// 使用环形缓冲区更新执行时间统计 - O(1)操作
	ts.execTimes[ts.execTimesIdx] = execTime
	ts.execTimesIdx = (ts.execTimesIdx + 1) % ts.maxExecTimes
	if ts.execTimesLen < ts.maxExecTimes {
		ts.execTimesLen++
	}

	// 更新最大和最小执行时间
	if execTime > ts.stats.MaxExecTime {
		ts.stats.MaxExecTime = execTime
	}
	if execTime < ts.stats.MinExecTime || ts.stats.MinExecTime == 0 {
		ts.stats.MinExecTime = execTime
	}

	// 更新成功和失败任务数
	if success {
		ts.stats.SuccessTasks++
	} else {
		ts.stats.FailedTasks++
	}
}

// ResetStats 重置定时任务系统统计信息
func (ts *TimerSystem) ResetStats() {
	ts.mu.Lock()
	defer ts.mu.Unlock()

	ts.stats = TimerStats{
		StartTime:        ts.stats.StartTime, // 保留启动时间
		LastTaskCreated:  time.Time{},
		LastTaskExecuted: time.Time{},
	}
	ts.execTimes = make([]time.Duration, ts.maxExecTimes)
	ts.execTimesIdx = 0
	ts.execTimesLen = 0
}

// LogStats 记录定时任务系统统计信息
func (ts *TimerSystem) LogStats() {
	stats := ts.GetStats()
	ts.logger.Infow("定时任务系统统计信息",
		"total_tasks", stats.TotalTasks,
		"running_tasks", stats.RunningTasks,
		"completed_tasks", stats.CompletedTasks,
		"failed_tasks", stats.FailedTasks,
		"success_tasks", stats.SuccessTasks,
		"avg_exec_time", stats.AvgExecTime,
		"max_exec_time", stats.MaxExecTime,
		"min_exec_time", stats.MinExecTime,
		"total_exec_count", stats.TotalExecCount,
		"uptime", time.Since(stats.StartTime),
	)
}

func (ts *TimerSystem) SetLogger(logger *zap.SugaredLogger) {
	ts.logger = logger
	if ts.timeWheel != nil {
		ts.timeWheel.logger = logger
	}
	if ts.taskManager != nil {
		ts.taskManager.logger = logger
	}
}

func (ts *TimerSystem) Shutdown() {
	if ts.logger != nil {
		ts.logger.Info("正在关闭定时任务系统...")
	}

	if ts.timeWheel != nil {
		ts.timeWheel.Stop()
	}

	ts.wg.Wait()

	if ts.logger != nil {
		ts.logger.Info("定时任务系统已关闭")
	}
}

// AcquireTaskSemaphore 获取任务执行信号量
func (ts *TimerSystem) AcquireTaskSemaphore() bool {
	select {
	case ts.taskSemaphore <- struct{}{}:
		ts.mu.Lock()
		ts.runningTasks++
		ts.mu.Unlock()
		return true
	default:
		ts.logger.Warn("任务并发数已达上限，无法执行新任务")
		return false
	}
}

// ReleaseTaskSemaphore 释放任务执行信号量
func (ts *TimerSystem) ReleaseTaskSemaphore() {
	<-ts.taskSemaphore
	ts.mu.Lock()
	ts.runningTasks--
	ts.mu.Unlock()
}

func (ts *TimerSystem) RegisterTask(pluginName string, taskType TaskType, spec string, callback interface{}, opts TaskOptions) (string, error) {
	if ts.taskManager == nil {
		return "", fmt.Errorf("task manager not initialized")
	}
	return ts.taskManager.RegisterTask(pluginName, taskType, spec, callback, opts)
}

func (ts *TimerSystem) CancelTask(pluginName, taskID string) bool {
	if ts.taskManager == nil {
		return false
	}
	return ts.taskManager.CancelTask(pluginName, taskID)
}

func (ts *TimerSystem) GetTaskStatus(pluginName, taskID string) (*PluginTimerTask, bool) {
	if ts.taskManager == nil {
		return nil, false
	}
	return ts.taskManager.GetTaskStatus(pluginName, taskID)
}

func (ts *TimerSystem) ListTasks(pluginName string) []*PluginTimerTask {
	if ts.taskManager == nil {
		return []*PluginTimerTask{}
	}
	return ts.taskManager.ListTasks(pluginName)
}

func (ts *TimerSystem) PauseTask(pluginName, taskID string) bool {
	if ts.taskManager == nil {
		return false
	}
	return ts.taskManager.PauseTask(pluginName, taskID)
}

func (ts *TimerSystem) ResumeTask(pluginName, taskID string) bool {
	if ts.taskManager == nil {
		return false
	}
	return ts.taskManager.ResumeTask(pluginName, taskID)
}

func (ts *TimerSystem) CancelPluginTasks(pluginName string) {
	tasks := ts.ListTasks(pluginName)
	for _, task := range tasks {
		ts.CancelTask(pluginName, task.ID)
	}
}
