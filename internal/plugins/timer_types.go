package plugins

import (
	"time"
)

type TaskType string

const (
	TaskTypeInterval TaskType = "interval"
	TaskTypeCron     TaskType = "cron"
	TaskTypeAt       TaskType = "at"
	TaskTypeDelay    TaskType = "delay"
	TaskTypeOnce     TaskType = "once"
)

type TaskStatus string

const (
	TaskStatusRunning   TaskStatus = "running"
	TaskStatusPaused    TaskStatus = "paused"
	TaskStatusStopped   TaskStatus = "stopped"
	TaskStatusCompleted TaskStatus = "completed"
)

type TaskOptions struct {
	FirstExec time.Duration
	MaxExec   int
	Async     bool
	Params    map[string]interface{}
}

type PluginTimerTask struct {
	ID         string
	PluginName string
	TaskType   TaskType
	Spec       string
	Interval   time.Duration
	Callback   interface{}
	ExecCount  int
	Status     TaskStatus
	CreatedAt  time.Time
	NextExecAt time.Time
	LastExecAt time.Time
	Options    TaskOptions
	LastResult *TaskResult
}

type TaskResult struct {
	Success     bool
	TriggerTime time.Time
	Duration    time.Duration
	Error       string
}
