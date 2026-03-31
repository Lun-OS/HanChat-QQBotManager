package plugins

import (
	"context"
	"fmt"
	"sync"
	"time"

	"go.uber.org/zap"
)

type TimeWheelTask struct {
	ID         string
	PluginName string
	TaskType   TaskType
	Interval   time.Duration
	Callback   interface{}
	ExecFunc   func()
	Expiration time.Time
	PluginTask *PluginTimerTask
}

// MultiLevelTimeWheel 多级时间轮
type MultiLevelTimeWheel struct {
	levels  []*timeWheelLevel
	logger  *zap.SugaredLogger
	ctx     context.Context
	cancel  context.CancelFunc
	wg      sync.WaitGroup
	running bool
	mu      sync.RWMutex
}

// timeWheelLevel 单级时间轮
type timeWheelLevel struct {
	interval  time.Duration
	wheelSize int64
	current   int64
	mu        sync.Mutex // 保护 current 指针的并发访问
	slots     [][]*TimeWheelTask
	slotMap   map[string]*TimeWheelTask
	ticker    *time.Ticker
	nextLevel *timeWheelLevel
}

// NewMultiLevelTimeWheel 创建多级时间轮
func NewMultiLevelTimeWheel(logger *zap.SugaredLogger) *MultiLevelTimeWheel {
	ctx, cancel := context.WithCancel(context.Background())

	// 初始化多级时间轮，支持不同精度
	// 级别1: 1ms精度，1000个槽位，覆盖1秒
	// 级别2: 1s精度，60个槽位，覆盖1分钟
	// 级别3: 1min精度，60个槽位，覆盖1小时
	// 级别4: 1h精度，24个槽位，覆盖1天
	// 级别5: 1d精度，365个槽位，覆盖1年
	levels := make([]*timeWheelLevel, 5)
	levels[4] = &timeWheelLevel{
		interval:  24 * time.Hour,
		wheelSize: 365,
		slotMap:   make(map[string]*TimeWheelTask),
		slots:     make([][]*TimeWheelTask, 365),
	}
	levels[3] = &timeWheelLevel{
		interval:  time.Hour,
		wheelSize: 24,
		slotMap:   make(map[string]*TimeWheelTask),
		slots:     make([][]*TimeWheelTask, 24),
		nextLevel: levels[4],
	}
	levels[2] = &timeWheelLevel{
		interval:  time.Minute,
		wheelSize: 60,
		slotMap:   make(map[string]*TimeWheelTask),
		slots:     make([][]*TimeWheelTask, 60),
		nextLevel: levels[3],
	}
	levels[1] = &timeWheelLevel{
		interval:  time.Second,
		wheelSize: 60,
		slotMap:   make(map[string]*TimeWheelTask),
		slots:     make([][]*TimeWheelTask, 60),
		nextLevel: levels[2],
	}
	levels[0] = &timeWheelLevel{
		interval:  time.Millisecond,
		wheelSize: 1000,
		slotMap:   make(map[string]*TimeWheelTask),
		slots:     make([][]*TimeWheelTask, 1000),
		nextLevel: levels[1],
	}

	return &MultiLevelTimeWheel{
		levels: levels,
		logger: logger,
		ctx:    ctx,
		cancel: cancel,
	}
}

// Start 启动多级时间轮
func (mtw *MultiLevelTimeWheel) Start() {
	mtw.mu.Lock()
	if mtw.running {
		mtw.mu.Unlock()
		return
	}
	mtw.running = true
	mtw.mu.Unlock()

	// 启动各级时间轮
	for i, level := range mtw.levels {
		level.ticker = time.NewTicker(level.interval)
		mtw.wg.Add(1)
		go mtw.runLevel(i)
	}

	// 检查logger是否为nil，避免空指针引用
	if mtw.logger != nil {
		mtw.logger.Info("多级时间轮已启动")
	}
}

// Stop 停止多级时间轮
func (mtw *MultiLevelTimeWheel) Stop() {
	mtw.cancel()
	mtw.wg.Wait()

	mtw.mu.Lock()
	mtw.running = false
	mtw.mu.Unlock()

	// 检查logger是否为nil，避免空指针引用
	if mtw.logger != nil {
		mtw.logger.Info("多级时间轮已停止")
	}
}

// runLevel 运行单级时间轮
func (mtw *MultiLevelTimeWheel) runLevel(levelIndex int) {
	defer mtw.wg.Done()
	level := mtw.levels[levelIndex]

	for {
		select {
		case <-level.ticker.C:
			mtw.tickLevel(levelIndex)
		case <-mtw.ctx.Done():
			level.ticker.Stop()
			return
		}
	}
}

// tickLevel 处理单级时间轮的tick
func (mtw *MultiLevelTimeWheel) tickLevel(levelIndex int) {
	level := mtw.levels[levelIndex]

	level.mu.Lock()
	current := level.current
	level.mu.Unlock()

	// 复制当前槽位的任务，避免立即清空导致的竞态条件
	currentSlot := level.slots[current]
	if len(currentSlot) > 0 {
		// 先复制任务列表再启动执行，避免立即清空导致的问题
		tasksToExec := make([]*TimeWheelTask, len(currentSlot))
		copy(tasksToExec, currentSlot)
		// 清空当前槽位
		level.slots[current] = nil

		// 执行当前槽位的所有任务
		for _, task := range tasksToExec {
			if task.ExecFunc != nil {
				go task.ExecFunc()
			}
		}
	}

	// 推进时间轮指针
	level.mu.Lock()
	level.current = (level.current + 1) % level.wheelSize
	level.mu.Unlock()
}

// AddTask 添加任务到多级时间轮
func (mtw *MultiLevelTimeWheel) AddTask(task *TimeWheelTask, expiration time.Time) error {
	mtw.mu.Lock()
	running := mtw.running
	mtw.mu.Unlock()

	if !running {
		return fmt.Errorf("时间轮未运行")
	}

	task.Expiration = expiration
	duration := time.Until(expiration)

	// 根据任务的过期时间，选择合适的时间轮级别
	// 修复：使用 < 而不是 <=，避免边界值判断错误
	for i, level := range mtw.levels {
		if duration < level.interval*time.Duration(level.wheelSize) {
			mtw.addTaskToLevel(level, task, duration)
			// 检查logger是否为nil，避免空指针引用
			if mtw.logger != nil {
				mtw.logger.Debugw("任务已添加到时间轮", "taskID", task.ID, "level", i, "expiration", expiration)
			}
			return nil
		}
	}

	// 如果超过最大级别，添加到最高级别
	mtw.addTaskToLevel(mtw.levels[len(mtw.levels)-1], task, duration)
	// 检查logger是否为nil，避免空指针引用
	if mtw.logger != nil {
		mtw.logger.Debugw("任务已添加到最高级别时间轮", "taskID", task.ID, "expiration", expiration)
	}
	return nil
}

// addTaskToLevel 添加任务到指定级别的时间轮
func (mtw *MultiLevelTimeWheel) addTaskToLevel(level *timeWheelLevel, task *TimeWheelTask, duration time.Duration) {
	level.mu.Lock()
	current := level.current
	level.mu.Unlock()

	slotIndex := int((current + int64(duration/level.interval)) % level.wheelSize)
	level.slots[slotIndex] = append(level.slots[slotIndex], task)
	level.slotMap[task.ID] = task
}

// RemoveTask 从多级时间轮中移除任务
func (mtw *MultiLevelTimeWheel) RemoveTask(taskID string) bool {
	for _, level := range mtw.levels {
		if _, exists := level.slotMap[taskID]; exists {
			delete(level.slotMap, taskID)
			// 遍历所有槽位找到并移除任务，而不是依赖时间计算
			for slotIndex, slot := range level.slots {
				for i, t := range slot {
					if t.ID == taskID {
						if i < len(slot)-1 {
							slot[i] = slot[len(slot)-1]
						}
						level.slots[slotIndex] = slot[:len(slot)-1]
						return true
					}
				}
			}
			return true
		}
	}
	return false
}

// IsRunning 检查多级时间轮是否正在运行
func (mtw *MultiLevelTimeWheel) IsRunning() bool {
	mtw.mu.RLock()
	defer mtw.mu.RUnlock()
	return mtw.running
}
