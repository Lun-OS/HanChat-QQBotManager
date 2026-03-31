package plugins

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"

	"go.uber.org/zap"
)

type TaskPersistence interface {
	SaveTask(task *ScheduledTask) error
	UpdateTask(task *ScheduledTask) error
	DeleteTask(taskID string) error
	LoadTasks() ([]*ScheduledTask, error)
	SaveTaskLog(log *TaskExecutionLog) error
	GetTaskLogs(taskID string, limit int) ([]*TaskExecutionLog, error)
}

type TaskPersistenceStore struct {
	logger *zap.SugaredLogger
	mu     sync.RWMutex
	dataDir string
}

func NewTaskPersistenceStore(dataDir string, logger *zap.SugaredLogger) *TaskPersistenceStore {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		logger.Warnw("Failed to create data directory", "dir", dataDir, "error", err)
	}

	return &TaskPersistenceStore{
		logger:  logger,
		dataDir: dataDir,
	}
}

func (tps *TaskPersistenceStore) tasksFilePath() string {
	return filepath.Join(tps.dataDir, "scheduled_tasks.json")
}

func (tps *TaskPersistenceStore) logsDirPath() string {
	return filepath.Join(tps.dataDir, "task_logs")
}

func (tps *TaskPersistenceStore) SaveTask(task *ScheduledTask) error {
	tps.mu.Lock()
	defer tps.mu.Unlock()

	tasks, err := tps.loadTasksUnsafe()
	if err != nil {
		tasks = []*ScheduledTask{}
	}

	for i, existingTask := range tasks {
		if existingTask.ID == task.ID {
			tasks[i] = task
			return tps.saveTasksUnsafe(tasks)
		}
	}

	tasks = append(tasks, task)
	return tps.saveTasksUnsafe(tasks)
}

func (tps *TaskPersistenceStore) UpdateTask(task *ScheduledTask) error {
	return tps.SaveTask(task)
}

func (tps *TaskPersistenceStore) DeleteTask(taskID string) error {
	tps.mu.Lock()
	defer tps.mu.Unlock()

	tasks, err := tps.loadTasksUnsafe()
	if err != nil {
		return err
	}

	filtered := make([]*ScheduledTask, 0, len(tasks))
	for _, task := range tasks {
		if task.ID != taskID {
			filtered = append(filtered, task)
		}
	}

	return tps.saveTasksUnsafe(filtered)
}

func (tps *TaskPersistenceStore) LoadTasks() ([]*ScheduledTask, error) {
	tps.mu.RLock()
	defer tps.mu.RUnlock()

	return tps.loadTasksUnsafe()
}

func (tps *TaskPersistenceStore) loadTasksUnsafe() ([]*ScheduledTask, error) {
	data, err := os.ReadFile(tps.tasksFilePath())
	if err != nil {
		if os.IsNotExist(err) {
			return []*ScheduledTask{}, nil
		}
		return nil, err
	}

	if len(data) == 0 {
		return []*ScheduledTask{}, nil
	}

	var tasks []*ScheduledTask
	if err := json.Unmarshal(data, &tasks); err != nil {
		return nil, err
	}

	return tasks, nil
}

func (tps *TaskPersistenceStore) saveTasksUnsafe(tasks []*ScheduledTask) error {
	data, err := json.MarshalIndent(tasks, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(tps.tasksFilePath(), data, 0644)
}

func (tps *TaskPersistenceStore) SaveTaskLog(log *TaskExecutionLog) error {
	tps.mu.Lock()
	defer tps.mu.Unlock()

	if err := os.MkdirAll(tps.logsDirPath(), 0755); err != nil {
		return err
	}

	logFilePath := filepath.Join(tps.logsDirPath(), log.TaskID+"_logs.json")

	var logs []*TaskExecutionLog
	existingData, err := os.ReadFile(logFilePath)
	if err == nil && len(existingData) > 0 {
		if err := json.Unmarshal(existingData, &logs); err != nil {
			logs = []*TaskExecutionLog{}
		}
	}

	logs = append(logs, log)

	if len(logs) > 1000 {
		logs = logs[len(logs)-1000:]
	}

	data, err := json.MarshalIndent(logs, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(logFilePath, data, 0644)
}

func (tps *TaskPersistenceStore) GetTaskLogs(taskID string, limit int) ([]*TaskExecutionLog, error) {
	tps.mu.RLock()
	defer tps.mu.RUnlock()

	logFilePath := filepath.Join(tps.logsDirPath(), taskID+"_logs.json")

	data, err := os.ReadFile(logFilePath)
	if err != nil {
		if os.IsNotExist(err) {
			return []*TaskExecutionLog{}, nil
		}
		return nil, err
	}

	var logs []*TaskExecutionLog
	if err := json.Unmarshal(data, &logs); err != nil {
		return nil, err
	}

	if limit > 0 && len(logs) > limit {
		return logs[len(logs)-limit:], nil
	}

	return logs, nil
}

type TaskExecutionLog struct {
	ID        string                 `json:"id"`
	TaskID    string                 `json:"task_id"`
	StartTime string                 `json:"start_time"`
	EndTime   string                 `json:"end_time"`
	Duration  int64                  `json:"duration_ms"`
	Success   bool                   `json:"success"`
	Error     string                 `json:"error,omitempty"`
	ExtraData map[string]interface{} `json:"extra_data,omitempty"`
}
