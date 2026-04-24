package plugins

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/robfig/cron/v3"
	"go.uber.org/zap"
)

type SchedulerType string

const (
	SchedulerTypeCron SchedulerType = "cron"
)

type ScheduledTask struct {
	ID         string                 `json:"id"`
	PluginName string                 `json:"plugin_name"`
	Type       SchedulerType          `json:"type"`
	Spec       string                 `json:"spec"`
	Status     TaskStatus             `json:"status"`
	ExecCount  int                    `json:"exec_count"`
	MaxExec    int                    `json:"max_exec"`
	CreatedAt  time.Time              `json:"created_at"`
	UpdatedAt  time.Time              `json:"updated_at"`
	NextExecAt time.Time              `json:"next_exec_at"`
	LastExecAt time.Time              `json:"last_exec_at"`
	CallbackID string                 `json:"callback_id"`
	ExtraData  map[string]interface{} `json:"extra_data,omitempty"`
}

type TaskExecutor func(task *ScheduledTask) error

type SchedulerManager struct {
	manager      *Manager
	scheduler    *cron.Cron
	logger       *zap.SugaredLogger
	wg           sync.WaitGroup
	mu           sync.RWMutex
	tasks        map[string]*ScheduledTask
	cronEntries  map[string]cron.EntryID
	executors    map[string]TaskExecutor
	persistStore TaskPersistence
}

type cronLogger struct {
	sugar *zap.SugaredLogger
}

func (cl *cronLogger) Info(msg string, keysAndValues ...interface{}) {
	cl.sugar.Infow(msg, keysAndValues...)
}

func (cl *cronLogger) Error(err error, msg string, keysAndValues ...interface{}) {
	cl.sugar.Errorw(msg, append(keysAndValues, "error", err)...)
}

func NewSchedulerManager(manager *Manager, logger *zap.SugaredLogger, persistStore TaskPersistence) *SchedulerManager {
	loc := time.Local

	cronLog := &cronLogger{sugar: logger}

	scheduler := cron.New(
		cron.WithSeconds(),
		cron.WithLocation(loc),
		cron.WithLogger(cronLog),
		cron.WithChain(cron.SkipIfStillRunning(cronLog)),
	)

	sm := &SchedulerManager{
		manager:      manager,
		scheduler:    scheduler,
		logger:       logger,
		tasks:        make(map[string]*ScheduledTask),
		cronEntries:  make(map[string]cron.EntryID),
		executors:    make(map[string]TaskExecutor),
		persistStore: persistStore,
	}

	scheduler.Start()

	if persistStore != nil {
		sm.loadTasks()
	}

	logger.Info("Scheduler manager started")
	return sm
}

func (sm *SchedulerManager) SetLogger(logger *zap.SugaredLogger) {
	sm.logger = logger
}

func (sm *SchedulerManager) Shutdown() {
	if sm.logger != nil {
		sm.logger.Info("Shutting down scheduler manager...")
	}

	ctx := sm.scheduler.Stop()
	<-ctx.Done()

	if sm.logger != nil {
		sm.logger.Info("Scheduler manager shut down")
	}
}

func (sm *SchedulerManager) loadTasks() {
	if sm.persistStore == nil {
		return
	}

	tasks, err := sm.persistStore.LoadTasks()
	if err != nil {
		sm.logger.Warnw("Failed to load tasks from persistence", "error", err)
		return
	}

	sm.mu.Lock()
	defer sm.mu.Unlock()

	for _, task := range tasks {
		sm.tasks[task.ID] = task
		if task.Status == TaskStatusRunning {
			if entryID, err := sm.rescheduleTask(task); err != nil {
				sm.logger.Warnw("Failed to reschedule task", "task_id", task.ID, "error", err)
			} else if entryID != 0 {
				sm.cronEntries[task.ID] = entryID
			}
		}
	}

	sm.logger.Infow("Loaded tasks from persistence", "count", len(tasks))
}

func (sm *SchedulerManager) rescheduleTask(task *ScheduledTask) (cron.EntryID, error) {
	taskFunc := sm.createTaskFunc(task)

	switch task.Type {
	case SchedulerTypeCron:
		return sm.scheduler.AddFunc(task.Spec, taskFunc)

	default:
		return 0, fmt.Errorf("unsupported task type: %s", task.Type)
	}
}

func (sm *SchedulerManager) parseInterval(spec string) time.Duration {
	duration, err := time.ParseDuration(spec)
	if err != nil {
		sm.logger.Warnw("Failed to parse interval duration", "spec", spec, "error", err)
		return time.Minute
	}
	return duration
}

func (sm *SchedulerManager) RegisterTask(pluginName string, taskType SchedulerType, spec string, callbackID string, maxExec int, extraData map[string]interface{}, executor TaskExecutor) (*ScheduledTask, error) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	task := &ScheduledTask{
		ID:         generateTaskID(),
		PluginName: pluginName,
		Type:       taskType,
		Spec:       spec,
		Status:     TaskStatusRunning,
		ExecCount:  0,
		MaxExec:    maxExec,
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
		CallbackID: callbackID,
		ExtraData:  extraData,
	}

	if executor != nil {
		sm.executors[callbackID] = executor
	}

	var entryID cron.EntryID
	var err error

	taskFunc := sm.createTaskFunc(task)

	switch task.Type {
	case SchedulerTypeCron:
		entryID, err = sm.scheduler.AddFunc(spec, taskFunc)

	default:
		return nil, fmt.Errorf("unsupported task type: %s", task.Type)
	}

	if err != nil {
		return nil, err
	}

	task.NextExecAt = sm.getNextExecTime(task)
	sm.tasks[task.ID] = task
	sm.cronEntries[task.ID] = entryID

	if sm.persistStore != nil {
		if err := sm.persistStore.SaveTask(task); err != nil {
			sm.logger.Warnw("Failed to persist task", "task_id", task.ID, "error", err)
		}
	}

	sm.logger.Infow("Task registered",
		"task_id", task.ID,
		"plugin_name", pluginName,
		"type", taskType,
		"spec", spec,
	)

	return task, nil
}

func (sm *SchedulerManager) createTaskFunc(task *ScheduledTask) func() {
	return func() {
		sm.mu.Lock()
		currentTask, exists := sm.tasks[task.ID]
		if !exists {
			sm.mu.Unlock()
			return
		}

		executor := sm.executors[task.CallbackID]

		if currentTask.Status != TaskStatusRunning || executor == nil {
			sm.mu.Unlock()
			if executor == nil {
				sm.logger.Warnw("Executor not found, cancelling task", "task_id", task.ID)
				sm.CancelTask(task.ID)
			}
			return
		}

		currentTask.ExecCount++
		currentTask.LastExecAt = time.Now()
		currentTask.UpdatedAt = time.Now()

		sm.mu.Unlock()

		err := executor(currentTask)
		if err != nil {
			sm.logger.Warnw("Task execution failed",
				"task_id", task.ID,
				"error", err,
			)
			sm.mu.Lock()
			if currentTask.Status == TaskStatusRunning {
				currentTask.Status = TaskStatusStopped
			}
			sm.mu.Unlock()

			if err.Error() == "Lua状态不可用，插件可能已卸载" {
				sm.logger.Warnw("Plugin unloaded, cancelling task", "task_id", task.ID)
				sm.CancelTask(task.ID)
			}
		}

		sm.mu.Lock()
		if currentTask.MaxExec > 0 && currentTask.ExecCount >= currentTask.MaxExec {
			sm.mu.Unlock()
			sm.CancelTask(task.ID)
			sm.mu.Lock()
			currentTask.Status = TaskStatusCompleted
		}
		sm.mu.Unlock()

		if sm.persistStore != nil {
			if err := sm.persistStore.UpdateTask(currentTask); err != nil {
				sm.logger.Warnw("Failed to update task persistence",
					"task_id", task.ID,
					"error", err,
				)
			}
		}
	}
}

func (sm *SchedulerManager) getNextExecTime(task *ScheduledTask) time.Time {
	if entryID, ok := sm.cronEntries[task.ID]; ok {
		entry := sm.scheduler.Entry(entryID)
		return entry.Next
	}
	return time.Now().Add(sm.parseInterval(task.Spec))
}

func (sm *SchedulerManager) CancelTask(taskID string) bool {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	task, exists := sm.tasks[taskID]
	if !exists {
		return false
	}

	if entryID, ok := sm.cronEntries[taskID]; ok {
		sm.scheduler.Remove(entryID)
	}

	task.Status = TaskStatusStopped
	task.UpdatedAt = time.Now()
	delete(sm.cronEntries, taskID)

	if task.CallbackID != "" {
		delete(sm.executors, task.CallbackID)
	}

	delete(sm.tasks, taskID)

	if sm.persistStore != nil {
		if err := sm.persistStore.DeleteTask(taskID); err != nil {
			sm.logger.Warnw("Failed to delete task from persistence",
				"task_id", taskID,
				"error", err,
			)
		}
	}

	sm.logger.Infow("Task cancelled", "task_id", taskID)
	return true
}

func (sm *SchedulerManager) PauseTask(taskID string) bool {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	task, exists := sm.tasks[taskID]
	if !exists {
		return false
	}

	if entryID, ok := sm.cronEntries[taskID]; ok {
		sm.scheduler.Remove(entryID)
	}

	task.Status = TaskStatusPaused
	task.UpdatedAt = time.Now()

	if sm.persistStore != nil {
		if err := sm.persistStore.UpdateTask(task); err != nil {
			sm.logger.Warnw("Failed to update task in persistence",
				"task_id", taskID,
				"error", err,
			)
		}
	}

	sm.logger.Infow("Task paused", "task_id", taskID)
	return true
}

func (sm *SchedulerManager) ResumeTask(taskID string) bool {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	task, exists := sm.tasks[taskID]
	if !exists {
		return false
	}

	entryID, err := sm.rescheduleTask(task)
	if err != nil {
		sm.logger.Warnw("Failed to reschedule task", "task_id", taskID, "error", err)
		return false
	}

	task.Status = TaskStatusRunning
	task.UpdatedAt = time.Now()
	sm.cronEntries[taskID] = entryID

	if sm.persistStore != nil {
		if err := sm.persistStore.UpdateTask(task); err != nil {
			sm.logger.Warnw("Failed to update task in persistence",
				"task_id", taskID,
				"error", err,
			)
		}
	}

	sm.logger.Infow("Task resumed", "task_id", taskID)
	return true
}

func (sm *SchedulerManager) GetTaskStatus(taskID string) (*ScheduledTask, bool) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	task, exists := sm.tasks[taskID]
	if !exists {
		return nil, false
	}

	if entryID, ok := sm.cronEntries[taskID]; ok {
		entry := sm.scheduler.Entry(entryID)
		task.NextExecAt = entry.Next
	}

	return task, true
}

func (sm *SchedulerManager) ListTasks(pluginName string) []*ScheduledTask {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	var result []*ScheduledTask
	for _, task := range sm.tasks {
		if pluginName == "" || task.PluginName == pluginName {
			if entryID, ok := sm.cronEntries[task.ID]; ok {
				entry := sm.scheduler.Entry(entryID)
				task.NextExecAt = entry.Next
			}
			result = append(result, task)
		}
	}

	return result
}

func (sm *SchedulerManager) CancelPluginTasks(pluginName string) {
	tasks := sm.ListTasks(pluginName)
	for _, task := range tasks {
		sm.CancelTask(task.ID)
	}
}

func (sm *SchedulerManager) RegisterExecutor(callbackID string, executor TaskExecutor) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.executors[callbackID] = executor
}

func (sm *SchedulerManager) UnregisterExecutor(callbackID string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	delete(sm.executors, callbackID)
}

func (sm *SchedulerManager) CleanupPluginReferences(selfID, pluginName string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	prefix := selfID + "/" + pluginName + "_"

	for callbackID := range sm.executors {
		if strings.HasPrefix(callbackID, prefix) {
			delete(sm.executors, callbackID)
		}
	}

	for taskID, task := range sm.tasks {
		if strings.Contains(task.PluginName, pluginName) {
			task.Status = TaskStatusStopped
			delete(sm.tasks, taskID)
			delete(sm.cronEntries, taskID)
		}
	}
}

func generateTaskID() string {
	return fmt.Sprintf("task_%d_%d", time.Now().UnixNano(), time.Now().UnixNano()%10000)
}
