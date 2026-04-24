// 给lua插件运行套一个沙箱环境，限制其访问系统资源的能力，防止恶意代码破坏主程序，我可真聪明，虽然但是也没人会给我写lua插件啊
package plugins

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"runtime/debug"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"HanChat-QQBotManager/internal/services"
	"HanChat-QQBotManager/internal/utils"

	lua "github.com/yuin/gopher-lua"
	"go.uber.org/zap"
)

// AccountPluginContainer 账号插件容器
// 每个账号拥有独立的插件容器，插件实例完全隔离
type AccountPluginContainer struct {
	SelfID        string                           // 账号ID
	LuaPlugins    map[string]*LuaPluginInstance    // 该账号运行的插件实例 map[pluginName]instance
	PluginConfigs map[string]*PluginInfo           // 该账号的插件配置信息
	mu            sync.RWMutex                     // 保护容器的锁
}

// LuaPluginInstance Lua插件实例
// MessageFilterConfig 消息过滤配置
type MessageFilterConfig struct {
	WhitelistTypes    []string `json:"whitelistTypes"`    // 白名单类型
	BlacklistTypes    []string `json:"blacklistTypes"`    // 黑名单类型
	WhitelistKeywords []string `json:"whitelistKeywords"` // 白名单关键词
	BlacklistKeywords []string `json:"blacklistKeywords"` // 黑名单关键词
}

type LuaPluginInstance struct {
	L             *lua.LState
	Name          string
	Config        map[string]interface{}
	EventHandlers map[string]*lua.LFunction
	StartTime     time.Time
	mu            sync.Mutex           // 保护实例状态（配置、卸载等）
	execMu        sync.Mutex           // ⭐ 执行锁：保护Lua状态机的并发访问（必须串行化）
	llService     *services.LLOneBotService
	reverseWS     *services.ReverseWebSocketService // 新的反向WebSocket服务
	SelfID        string                              // 绑定的账号ID（固定）
	Logs          []string                            // 插件日志
	logMu         sync.Mutex
	unloading     bool                 // 是否正在卸载
	unloadingMu   sync.RWMutex         // 保护unloading标志
	wg            sync.WaitGroup       // 等待所有事件处理器完成
	filter        *MessageFilterConfig // 过滤配置
	// 资源监控
	eventCount    int64     // 处理的事件数量
	errorCount    int64     // 错误数量
	lastEventTime time.Time // 最后一次事件处理时间
	// 安全沙箱
	sandbox       *LuaSandbox  // Lua沙箱安全控制器
	luaCorrupted  int32        // ⭐ LState损坏标志（panic后设置，原子操作）
	corruptReason string       // 损坏原因（用于日志）
	// 性能监控
	cpuTime       int64     // CPU时间（纳秒）
	memoryUsage   int64     // 内存使用量（字节）
	// 图像处理器存储（安全句柄机制）
	imageProcessors   map[int]*utils.SimpleImageProcessor // 图像处理器映射表
	imageProcessorMu  sync.RWMutex                        // 保护图像处理器映射
	nextProcessorID   int                                 // 下一个处理器ID
	// 调度器回调函数
	schedulerCallbacks map[string]*lua.LFunction
}

// IsUnloading 检查插件是否正在卸载（导出方法）
func (l *LuaPluginInstance) IsUnloading() bool {
	if l == nil {
		return true
	}
	l.unloadingMu.RLock()
	defer l.unloadingMu.RUnlock()
	return l.unloading
}

// IsLuaCorrupted 检查LState是否已损坏（导出方法）
func (l *LuaPluginInstance) IsLuaCorrupted() bool {
	if l == nil {
		return true
	}
	return atomic.LoadInt32(&l.luaCorrupted) == 1
}

// GetCorruptReason 获取LState损坏原因（导出方法）
func (l *LuaPluginInstance) GetCorruptReason() string {
	if l == nil {
		return "实例为空"
	}
	return l.corruptReason
}

// ResetLuaState 重置LState损坏标志（插件重载时调用）
func (l *LuaPluginInstance) ResetLuaState() {
	if l == nil {
		return
	}
	atomic.StoreInt32(&l.luaCorrupted, 0)
	l.corruptReason = ""
}

// Sandbox 获取插件沙箱（导出方法）
func (l *LuaPluginInstance) Sandbox() *LuaSandbox {
	if l == nil {
		return nil
	}
	return l.sandbox
}

// PluginInfo 插件信息
type PluginInfo struct {
	Name       string                 `json:"name"`
	Lang       string                 `json:"lang"`
	Entry      string                 `json:"entry"`
	Path       string                 `json:"path"`
	Config     map[string]interface{} `json:"config"`
	ConfigPath string                 `json:"configPath,omitempty"`
	Enabled    bool                   `json:"enabled"` // 该账号是否启用此插件
	Version    string                 `json:"version"` // 插件版本
	Remark     string                 `json:"remark"`  // 插件备注
}

// AutoStartConfig 预启动配置文件结构
type AutoStartConfig struct {
	AutoStart []string `json:"autoStart"`
}

// PriorityEventQueue 优先级事件队列 - 使用分级通道减少锁竞争
// 优化：支持动态扩容和背压机制，减少高并发下的消息丢失
type PriorityEventQueue struct {
	highPriority   chan pluginEventTask   // 紧急优先级通道
	normalPriority chan pluginEventTask   // 普通优先级通道
	lowPriority    chan pluginEventTask   // 低优先级通道
	maxSize        int                    // 初始最大容量
	currentSize    int                    // 当前实际容量（支持扩容）
	droppedCount   int64                  // 丢弃的任务计数
	mu             sync.RWMutex           // 保护扩容操作
	backpressureEnabled bool              // 是否启用背压模式
}

// NewPriorityEventQueue 创建优先级事件队列
func NewPriorityEventQueue(maxSize int) *PriorityEventQueue {
	// 分级分配容量：高优先级30%，普通50%，低20%
	highSize := maxSize * 3 / 10
	normalSize := maxSize * 5 / 10
	lowSize := maxSize * 2 / 10
	
	if highSize < 100 {
		highSize = 100
	}
	if normalSize < 100 {
		normalSize = 100
	}
	if lowSize < 50 {
		lowSize = 50
	}
	
	return &PriorityEventQueue{
		highPriority:   make(chan pluginEventTask, highSize),
		normalPriority: make(chan pluginEventTask, normalSize),
		lowPriority:    make(chan pluginEventTask, lowSize),
		maxSize:        maxSize,
		currentSize:    maxSize,
		backpressureEnabled: true,
	}
}

// Push 添加任务到队列（根据优先级选择通道）
// 优化：当队列满时自动扩容而不是直接丢弃，最大可扩容到初始大小的4倍
func (q *PriorityEventQueue) Push(task pluginEventTask) bool {
PushLoop:
	for {
		switch task.priority {
		case PriorityCritical, PriorityHigh:
			select {
			case q.highPriority <- task:
				return true
			default:
				if q.tryExpand() {
					continue PushLoop
				}
				select {
				case <-q.lowPriority:
					atomic.AddInt64(&q.droppedCount, 1)
					q.highPriority <- task
					return true
				default:
					break PushLoop
				}
			}
		case PriorityNormal:
			select {
			case q.normalPriority <- task:
				return true
			default:
				if q.tryExpand() {
					continue PushLoop
				}
				select {
				case <-q.lowPriority:
					atomic.AddInt64(&q.droppedCount, 1)
					q.normalPriority <- task
					return true
				default:
					break PushLoop
				}
			}
		default:
			select {
			case q.lowPriority <- task:
				return true
			default:
				if q.tryExpand() {
					continue PushLoop
				}
				break PushLoop
			}
		}
	}
	atomic.AddInt64(&q.droppedCount, 1)
	return false
}

// tryExpand 尝试动态扩容队列
// 最大可扩容到初始大小的4倍
func (q *PriorityEventQueue) tryExpand() bool {
	if !q.backpressureEnabled {
		return false
	}

	q.mu.Lock()
	defer q.mu.Unlock()

	// 检查是否已达到最大扩容限制（初始大小的4倍）
	maxExpanded := q.maxSize * 4
	if q.currentSize >= maxExpanded {
		return false
	}

	// 计算新的容量（每次扩容50%）
	newSize := q.currentSize + q.currentSize/2
	if newSize > maxExpanded {
		newSize = maxExpanded
	}

	// 分级分配新容量
	highNew := newSize * 3 / 10
	normalNew := newSize * 5 / 10
	lowNew := newSize * 2 / 10

	// 创建新的通道
	newHigh := make(chan pluginEventTask, highNew)
	newNormal := make(chan pluginEventTask, normalNew)
	newLow := make(chan pluginEventTask, lowNew)

	// 将旧通道中的数据迁移到新通道
	migrated := 0
	for {
		select {
		case task := <-q.highPriority:
			newHigh <- task
			migrated++
		default:
			goto done_high
		}
	}
done_high:
	for {
		select {
		case task := <-q.normalPriority:
			newNormal <- task
			migrated++
		default:
			goto done_normal
		}
	}
done_normal:
	for {
		select {
		case task := <-q.lowPriority:
			newLow <- task
			migrated++
		default:
			goto done_low
		}
	}
done_low:

	// 替换通道
	q.highPriority = newHigh
	q.normalPriority = newNormal
	q.lowPriority = newLow
	q.currentSize = newSize

	return true
}

// Pop 从队列头部取出任务（按优先级顺序）
func (q *PriorityEventQueue) Pop() (pluginEventTask, bool) {
	// 优先处理高优先级任务
	select {
	case task := <-q.highPriority:
		return task, true
	default:
	}
	
	// 其次处理普通优先级任务
	select {
	case task := <-q.normalPriority:
		return task, true
	default:
	}
	
	// 最后处理低优先级任务
	select {
	case task := <-q.lowPriority:
		return task, true
	default:
		return pluginEventTask{}, false
	}
}

// Len 返回队列长度
func (q *PriorityEventQueue) Len() int {
	return len(q.highPriority) + len(q.normalPriority) + len(q.lowPriority)
}

// GetDroppedCount 获取丢弃的任务数
func (q *PriorityEventQueue) GetDroppedCount() int64 {
	return atomic.LoadInt64(&q.droppedCount)
}

// Manager 插件管理器
type Manager struct {
	cfg         *utils.Config
	containers  map[string]*AccountPluginContainer // 账号容器 map[self_id]container
	containersMu sync.RWMutex                      // 保护容器的锁
	pluginInfos map[string]*PluginInfo             // 全局插件信息（扫描到的所有插件）
	infosMu     sync.RWMutex                       // 保护pluginInfos的锁
	pluginsDir  string
	logger      *zap.SugaredLogger
	llService   *services.LLOneBotService
	reverseWS   *services.ReverseWebSocketService // 新的反向WebSocket服务
	// 定时任务系统
	timerSystem *TimerSystem
	//事件处理工作池
	priorityQueue *PriorityEventQueue // 优先级事件队列
	workers       int
	minWorkers    int                 // 最小worker数量
	maxWorkers    int                 // 最大worker数量（动态扩容上限）
	queueSize     int
	workerWg      sync.WaitGroup      // 等待所有worker完成
	ctx           context.Context
	cancel        context.CancelFunc
	// 工作池统计
	queuedEvents    int64 // 排队的事件数
	droppedEvents   int64 // 丢弃的事件数
	activeWorkers   int64 // 当前活跃的worker数
	busyWorkers     int64 // 正在处理任务的worker数
	// 动态扩容控制
	scaleUpChan        chan struct{}         // 扩容信号通道
	scaleDownChan      chan struct{}         // 缩容信号通道
	workerMutex        sync.Mutex           // 保护worker增减操作
	enableAutoScale    bool                 // 是否启用动态扩缩容
	scaleCheckInterval time.Duration        // 扩缩容检查间隔

	// ========== 性能优化：Channel通知机制替代忙等待 ==========
	taskAvailable chan struct{} // 任务可用通知通道（替代sync.Cond，更安全）

	// ========== 系统负载自适应 ==========
	systemLoad    float64               // 当前系统负载 (0.0 - 1.0)
	loadMu        sync.RWMutex          // 保护系统负载
	lastScaleTime time.Time             // 上次扩容/缩容时间（冷却机制）
	scaleCooldown time.Duration         // 扩容冷却时间（默认10秒）
	// HTTP接口管理器
	httpInterfaceManager *HTTPInterfaceManager
	// Lua脚本缓存
	luaScriptCache *LuaScriptCache
	// 插件文件检查定时器
	fileCheckTicker *time.Ticker
	fileCheckStop   chan struct{}
	// 调度器管理器
	schedulerManager *SchedulerManager
}

// NewManager 创建插件管理器
func NewManager(cfg *utils.Config, llService *services.LLOneBotService) *Manager {
	pluginsDir := "plugins"
	if err := os.MkdirAll(pluginsDir, 0755); err != nil {
		// 如果创建失败，使用默认目录
		pluginsDir = "plugins"
	}

	// 自动创建 blockly 目录（用于 Blockly 可视化编辑器项目）
	// 这是安全操作，由后端控制，不暴露给前端 API
	blocklyDir := filepath.Join(pluginsDir, "blockly")
	if err := os.MkdirAll(blocklyDir, 0755); err != nil {
		// 记录错误但不中断启动
		fmt.Printf("Warning: failed to create blockly directory: %v\n", err)
	}

	ctx, cancel := context.WithCancel(context.Background())

	// 从配置读取工作池参数
	minWorkers := cfg.Plugin.Workers
	if minWorkers <= 0 {
		minWorkers = 1 // 最小worker数保持1
	}
	
	// 计算最大worker数：基于CPU核心数动态调整
	maxWorkers := cfg.Plugin.MaxWorkers
	if maxWorkers <= 0 {
		// 自动计算：CPU核心数的2倍，但不超过8
		cpuCores := runtime.NumCPU()
		maxWorkers = cpuCores * 2
		if maxWorkers < minWorkers+1 {
			maxWorkers = minWorkers + 1
		}
		if maxWorkers > 8 {
			maxWorkers = 8
		}
	}
	queueSize := cfg.Plugin.QueueSize
	if queueSize <= 0 {
		queueSize = 2048 // 减少队列大小
	}

	// 从配置读取动态扩缩容参数
	enableAutoScale := cfg.Plugin.EnableAutoScale
	scaleCheckIntervalSec := cfg.Plugin.ScaleCheckIntervalSec
	if scaleCheckIntervalSec <= 0 {
		scaleCheckIntervalSec = 30 // 默认30秒检查间隔
	}

	m := &Manager{
		cfg:                 cfg,
		containers:          make(map[string]*AccountPluginContainer),
		pluginInfos:         make(map[string]*PluginInfo),
		pluginsDir:          pluginsDir,
		logger:              zap.NewNop().Sugar(),
		llService:           llService,
		queueSize:           queueSize,
		workers:             minWorkers,
		minWorkers:          minWorkers,
		maxWorkers:          maxWorkers, // 优化：限制最大worker数为CPU核心数*2，避免过度扩展
		ctx:                 ctx,
		cancel:              cancel,
		queuedEvents:        0,
		droppedEvents:       0,
		activeWorkers:       int64(minWorkers),
		busyWorkers:         0,
		scaleUpChan:         make(chan struct{}, 1),
		scaleDownChan:       make(chan struct{}, 1),
		enableAutoScale:     enableAutoScale,
		scaleCheckInterval:  time.Duration(scaleCheckIntervalSec) * time.Second,
		// 初始化任务通知通道（带缓冲，避免阻塞Push操作）
		taskAvailable:       make(chan struct{}, 1),
		// 初始化负载监控
		scaleCooldown:       10 * time.Second, // 扩容冷却时间10秒
		lastScaleTime:       time.Now(),
		systemLoad:          0.0,
	}

	// 初始化定时任务系统
	m.timerSystem = NewTimerSystem(m, m.logger)

	// 初始化调度器管理器
	m.schedulerManager = NewSchedulerManager(m, m.logger, nil)

	// 初始化HTTP接口管理器
	m.httpInterfaceManager = NewHTTPInterfaceManager(m, m.logger)

	// 初始化Lua脚本缓存
	m.luaScriptCache = NewLuaScriptCache(m.logger, "cache/lua_scripts")

	// 初始化优先级事件队列（支持动态扩容）
	m.priorityQueue = NewPriorityEventQueue(m.queueSize)

	// 启动初始工作池
	for i := 0; i < m.workers; i++ {
		m.workerWg.Add(1)
		go func(id int) {
			// 修复：添加启动延迟，避免所有worker同时启动造成CPU spike
			time.Sleep(time.Duration(id) * 100 * time.Millisecond)
			m.workerLoop(id)
		}(i)
	}

	// 启动动态扩容监控协程
	if m.enableAutoScale {
		go m.scaleMonitor() // 启用扩缩容监控，根据负载自动调整worker数量
		m.logger.Infow("动态扩缩容监控已启用", "checkInterval", m.scaleCheckInterval.String())
	} else {
		m.logger.Infow("动态扩缩容监控已禁用")
	}

	// 预编译Lua脚本
	if err := m.luaScriptCache.PrecompileScripts(m.pluginsDir); err != nil {
		m.logger.Warnw("预编译Lua脚本失败", "error", err)
	}

	// 启动插件文件存在性检查器
	m.StartPluginFileChecker()

	return m
}

// SetLogger 设置日志记录器
func (m *Manager) SetLogger(logger *zap.SugaredLogger) {
	m.logger = logger
	if m.timerSystem != nil {
		m.timerSystem.SetLogger(logger)
	}
	if m.httpInterfaceManager != nil {
		m.httpInterfaceManager.logger = logger
	}
}

// SetReverseWebSocketService 设置反向WebSocket服务
func (m *Manager) SetReverseWebSocketService(reverseWS *services.ReverseWebSocketService) {
	m.reverseWS = reverseWS
}

// broadcastLog 广播日志到前端
// source: 日志来源，如 "plugin", "websocket", "system"
func (m *Manager) broadcastLog(selfID, level, message, source string, data map[string]interface{}) {
	if m.reverseWS == nil {
		return
	}
	m.reverseWS.BroadcastLog(services.LogEntry{
		SelfID:  selfID,
		Level:   level,
		Message: message,
		Source:  source,
		Time:    time.Now(),
		Data:    data,
	})
}

// GetHTTPInterfaceManager 获取HTTP接口管理器
func (m *Manager) GetHTTPInterfaceManager() *HTTPInterfaceManager {
	return m.httpInterfaceManager
}

// getOrCreateContainer 获取或创建账号容器
func (m *Manager) getOrCreateContainer(selfID string) *AccountPluginContainer {
	m.containersMu.Lock()
	defer m.containersMu.Unlock()

	if container, exists := m.containers[selfID]; exists {
		return container
	}

	// 创建新容器
	container := &AccountPluginContainer{
		SelfID:        selfID,
		LuaPlugins:    make(map[string]*LuaPluginInstance),
		PluginConfigs: make(map[string]*PluginInfo),
	}
	m.containers[selfID] = container
	return container
}

// getContainer 获取账号容器（只读，不创建）
func (m *Manager) getContainer(selfID string) *AccountPluginContainer {
	m.containersMu.RLock()
	defer m.containersMu.RUnlock()
	return m.containers[selfID]
}

// AutoStartPlugins 自动启动预配置的插件
func (m *Manager) AutoStartPlugins() {
	// 读取预启动配置文件
	autoStartConfig := AutoStartConfig{}
	configPath := "config/plugins_auto_start.json"

	// 检查配置文件是否存在
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		return
	}

	// 读取配置文件
	data, err := os.ReadFile(configPath)
	if err != nil {
		m.logger.Errorw("读取预启动配置文件失败", "error", err)
		return
	}

	if err := json.Unmarshal(data, &autoStartConfig); err != nil {
		m.logger.Errorw("解析预启动配置文件失败", "error", err)
		return
	}

	if len(autoStartConfig.AutoStart) == 0 {
		return
	}

	// 扫描所有可用插件
	plugins, err := m.ScanPlugins("")
	if err != nil {
		m.logger.Errorw("扫描插件失败", "error", err)
		return
	}

	// 创建可用插件名称映射
	availablePlugins := make(map[string]bool)
	for _, plugin := range plugins {
		availablePlugins[plugin.Name] = true
	}

	// 启动预配置的插件（每个账号都启动）
	// 注意：预启动配置现在需要指定账号，格式为 "self_id/plugin_name"
	for _, pluginEntry := range autoStartConfig.AutoStart {
		parts := strings.SplitN(pluginEntry, "/", 2)
		if len(parts) != 2 {
			m.logger.Warnw("预启动配置格式错误，应为 'self_id/plugin_name'", "entry", pluginEntry)
			continue
		}
		selfID := parts[0]
		pluginName := parts[1]

		if !availablePlugins[pluginName] {
			m.logger.Warnw("预启动插件不存在", "plugin", pluginName)
			continue
		}

		// 尝试加载插件到指定账号
		if err := m.LoadLuaPlugin(selfID, pluginName); err != nil {
			m.logger.Errorw("预启动插件加载失败", "self_id", selfID, "plugin", pluginName, "error", err)
		}
	}
}

// EventPriority 事件优先级
type EventPriority int

const (
	PriorityLow EventPriority = iota
	PriorityNormal
	PriorityHigh
	PriorityCritical
)

// pluginEventTask 插件事件任务
type pluginEventTask struct {
	instance   *LuaPluginInstance
	handler    *lua.LFunction
	pluginName string
	eventType  string
	eventData  map[string]interface{}
	priority   EventPriority // 事件优先级
	enqueueTime time.Time     // 入队时间
}

// workerLoop 工作协程：从队列中消费事件并执行
// 优化重写：使用条件变量替代500ms忙等待，彻底消除CPU空转
func (m *Manager) workerLoop(id int) {
	defer m.workerWg.Done()

	// 修复：复用timer，避免频繁创建
	timer := time.NewTimer(5 * time.Second)
	defer timer.Stop()

	for {
		// 检查是否应该退出
		select {
		case <-m.ctx.Done():
			return
		case <-m.scaleDownChan:
			// 收到缩容信号，检查是否可以退出
			currentWorkers := atomic.LoadInt64(&m.activeWorkers)
			if currentWorkers > int64(m.minWorkers) {
				atomic.AddInt64(&m.activeWorkers, -1)
				m.logger.Debugw("Worker因缩容退出",
					"workerId", id,
					"remaining", currentWorkers-1)
				return
			}
			// 已达到最小值，忽略缩容信号
		default:
		}

		// ========== 优化：使用Channel等待任务（零CPU消耗，绝对安全） ==========
		// 尝试非阻塞获取任务（快速路径）
		task, ok := m.priorityQueue.Pop()
		if !ok {
			// 队列为空，阻塞等待任务通知或超时
			// 修复：重置timer而不是创建新的，增加超时时间减少唤醒
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
			timer.Reset(30 * time.Second) // 增加到 30秒，减少唤醒频率

			select {
			case <-m.taskAvailable:
				// 收到任务通知，重新尝试获取
				continue
			case <-timer.C:
				// 超时保护，重新检查（防止死锁）
				continue
			case <-m.ctx.Done():
				return
			}
		}

		// 减少排队计数
		atomic.AddInt64(&m.queuedEvents, -1)

		// 计算排队等待时间（用于性能监控）
		queueWaitTime := time.Since(task.enqueueTime)

		// ⭐ 关键优化：排队超时检查（避免无效的 execMu 等待）
		maxQueueWaitTime := 5 * time.Second
		if queueWaitTime > maxQueueWaitTime {
			m.logger.Warnw("事件排队超时，丢弃任务",
				"workerId", id,
				"plugin", task.pluginName,
				"event", task.eventType,
				"queueWaitTime", queueWaitTime.String(),
				"queueLen", atomic.LoadInt64(&m.queuedEvents))
			atomic.AddInt64(&m.droppedEvents, 1)
			continue
		}

		if queueWaitTime > 100*time.Millisecond {
			m.logger.Debugw("事件排队等待时间较长",
				"workerId", id,
				"plugin", task.pluginName,
				"event", task.eventType,
				"queueWaitTime", queueWaitTime.String(),
				"queueLen", atomic.LoadInt64(&m.queuedEvents))
		}

		// 标记worker为忙碌状态
		atomic.AddInt64(&m.busyWorkers, 1)

		// 检查插件实例是否正在卸载，避免处理已卸载插件的事件
		task.instance.unloadingMu.RLock()
		isUnloading := task.instance.unloading
		task.instance.unloadingMu.RUnlock()

		if isUnloading {
			m.logger.Debugw("跳过正在卸载的插件事件",
				"workerId", id,
				"plugin", task.pluginName,
				"event", task.eventType)
			// 释放忙碌状态
			atomic.AddInt64(&m.busyWorkers, -1)
			continue
		}

		// 执行任务（传入剩余执行超时时间）
		totalTimeout := 10 * time.Second
		if task.eventType != "message" {
			totalTimeout = 30 * time.Second
		}
		remainingTimeout := totalTimeout - queueWaitTime // 剩余执行时间 = 总超时 - 已排队时间

		if err := m.callEventHandler(task.instance, task.handler, task.eventType, task.eventData, remainingTimeout); err != nil {
			m.logger.Errorw("执行事件处理器失败",
				"workerId", id,
				"plugin", task.pluginName,
				"event", task.eventType,
				"error", err)
		}

		task.eventData = nil

		// 释放忙碌状态
		atomic.AddInt64(&m.busyWorkers, -1)
	}
}

// scaleMonitor 动态扩容监控协程
// 根据队列积压情况和worker利用率动态调整worker数量
func (m *Manager) scaleMonitor() {
	ticker := time.NewTicker(m.scaleCheckInterval)
	defer ticker.Stop()

	for {
		select {
		case <-m.ctx.Done():
			return
		case <-ticker.C:
			m.checkAndScale()
		}
	}
}

// checkAndScale 检查并执行扩容/缩容操作
// 优化重写：添加冷却机制、系统负载感知、更保守的扩容策略
func (m *Manager) checkAndScale() {
	m.workerMutex.Lock()
	defer m.workerMutex.Unlock()

	currentWorkers := atomic.LoadInt64(&m.activeWorkers)
	busyCount := atomic.LoadInt64(&m.busyWorkers)
	queueLen := m.priorityQueue.Len()

	// 计算worker利用率（0.0 - 1.0）
	var utilization float64
	if currentWorkers > 0 {
		utilization = float64(busyCount) / float64(currentWorkers)
	}

	// ========== 冷却机制检查 ==========
	now := time.Now()
	if now.Sub(m.lastScaleTime) < m.scaleCooldown {
		// 冷却期内，不执行扩容/缩容
		return
	}

	// ========== 系统负载评估 ==========
	// 综合考虑队列积压、worker利用率、时间因素
	systemLoad := m.calculateSystemLoad(utilization, queueLen, currentWorkers)
	m.loadMu.Lock()
	m.systemLoad = systemLoad
	m.loadMu.Unlock()

	// ========== 扩容条件（更保守） ==========
	// 1. Worker利用率超过85%（原70%太敏感）
	// 2. 队列中有明显积压（>20，原10太小）
	// 3. 当前worker数未达到上限
	// 4. 系统负载超过阈值
	// 5. 不在冷却期
	shouldScaleUp := utilization > 0.85 &&
		queueLen > 20 &&
		currentWorkers < int64(m.maxWorkers) &&
		systemLoad > 0.7

	// ========== 缩容条件（更保守） ==========
	// 1. Worker利用率低于10%（原20%）
	// 2. 当前worker数大于最小值
	// 3. 连续低负载
	shouldScaleDown := utilization < 0.1 &&
		currentWorkers > int64(m.minWorkers) &&
		queueLen == 0 // 只有队列为空时才缩容

	if shouldScaleUp {
		// 优化：每次只增加1-2个worker（原min(当前数/2, 4)太激进）
		addWorkers := int64(2)
		if queueLen > 100 {
			addWorkers = int64(3) // 队列严重积压时多增加一些
		}
		if currentWorkers+addWorkers > int64(m.maxWorkers) {
			addWorkers = int64(m.maxWorkers) - currentWorkers
		}

		for i := int64(0); i < addWorkers; i++ {
			m.workerWg.Add(1)
			go m.workerLoop(int(currentWorkers + i))
		}

		atomic.AddInt64(&m.activeWorkers, addWorkers)
		m.lastScaleTime = now // 更新冷却时间

		m.logger.Infow("Worker池扩容",
			"current", currentWorkers+addWorkers,
			"added", addWorkers,
			"max", m.maxWorkers,
			"utilization", fmt.Sprintf("%.2f%%", utilization*100),
			"queueLen", queueLen,
			"systemLoad", fmt.Sprintf("%.2f", systemLoad))

	} else if shouldScaleDown && len(m.scaleDownChan) == 0 {
		// 缩容：发送信号让空闲worker退出
		select {
		case m.scaleDownChan <- struct{}{}:
			m.lastScaleTime = now // 更新冷却时间
			m.logger.Infow("Worker池缩容信号",
				"current", currentWorkers,
				"utilization", fmt.Sprintf("%.2f%%", utilization*100))
		default:
		}
	}
}

// calculateSystemLoad 计算系统综合负载
// 考虑因素：worker利用率、队列积压程度、处理延迟
func (m *Manager) calculateSystemLoad(utilization float64, queueLen int, currentWorkers int64) float64 {
	// 基础负载：worker利用率（权重50%）
	baseLoad := utilization * 0.5

	// 队列负载：队列积压程度（权重30%）
	queueLoad := 0.0
	if queueLen > 0 {
		// 使用对数函数平滑队列影响，避免剧烈波动
		queueLoad = math.Log1p(float64(queueLen)) / math.Log1p(float64(m.queueSize)) * 0.3
	}

	// 时间衰减因子：最近是否有频繁扩容（权重20%）
	timeFactor := 0.2
	if time.Since(m.lastScaleTime) < time.Minute {
		// 最近刚扩容过，降低负载评估，避免频繁扩容
		timeFactor = 0.1
	}

	totalLoad := baseLoad + queueLoad + timeFactor

	// 限制在0-1范围
	if totalLoad > 1.0 {
		totalLoad = 1.0
	}
	if totalLoad < 0.0 {
		totalLoad = 0.0
	}

	return totalLoad
}

// GetSystemStatus 获取系统状态（用于监控和调试）
// 返回worker池状态、队列状态、系统负载等关键指标
func (m *Manager) GetSystemStatus() map[string]interface{} {
	currentWorkers := atomic.LoadInt64(&m.activeWorkers)
	busyWorkers := atomic.LoadInt64(&m.busyWorkers)
	queuedEvents := atomic.LoadInt64(&m.queuedEvents)
	droppedEvents := atomic.LoadInt64(&m.droppedEvents)

	var utilization float64
	if currentWorkers > 0 {
		utilization = float64(busyWorkers) / float64(currentWorkers) * 100
	}

	m.loadMu.RLock()
	systemLoad := m.systemLoad
	m.loadMu.RUnlock()

	return map[string]interface{}{
		"timestamp":      time.Now().Format("2006-01-02 15:04:05"),
		// Worker池状态
		"workers": map[string]interface{}{
			"active":    currentWorkers,
			"busy":      busyWorkers,
			"min":       m.minWorkers,
			"max":       m.maxWorkers,
			"utilization": fmt.Sprintf("%.2f%%", utilization),
		},
		// 队列状态
		"queue": map[string]interface{}{
			"size":        m.queueSize,
			"current_len": m.priorityQueue.Len(),
			"queued":      queuedEvents,
			"dropped":     droppedEvents,
		},
		// 系统负载
		"system_load": fmt.Sprintf("%.2f", systemLoad),
		"status":      m.getSystemStatusString(systemLoad, utilization),
		// 扩容控制
		"scale_cooldown": m.scaleCooldown.String(),
		"last_scale_time": m.lastScaleTime.Format("2006-01-02 15:04:05"),
	}
}

// getSystemStatusString 获取系统状态描述字符串
func (m *Manager) getSystemStatusString(systemLoad float64, utilization float64) string {
	switch {
	case systemLoad > 0.9:
		return "CRITICAL - 系统严重过载"
	case systemLoad > 0.7:
		return "WARNING - 系统负载较高"
	case utilization > 80:
		return "BUSY - Worker利用率高"
	default:
		return "NORMAL - 系统运行正常"
	}
}

// ScanPlugins 扫描plugins目录，查找所有Lua插件
// 如果指定了selfID，则只扫描该账号的插件目录
func (m *Manager) ScanPlugins(selfID string) ([]*PluginInfo, error) {
	plugins := make([]*PluginInfo, 0)

	// 如果没有指定selfID，扫描所有账号的插件目录
	if selfID == "" {
		entries, err := os.ReadDir(m.pluginsDir)
		if err != nil {
			if os.IsNotExist(err) {
				return plugins, nil
			}
			return plugins, fmt.Errorf("读取插件目录失败: %w", err)
		}

		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			// 检查是否是账号目录（纯数字）
			accountDir := entry.Name()
			accountPlugins, err := m.scanAccountPlugins(accountDir)
			if err != nil {
				m.logger.Warnw("扫描账号插件目录失败", "self_id", accountDir, "error", err)
				continue
			}
			plugins = append(plugins, accountPlugins...)
		}
	} else {
		// 扫描指定账号的插件
		accountPlugins, err := m.scanAccountPlugins(selfID)
		if err != nil {
			return plugins, err
		}
		plugins = append(plugins, accountPlugins...)
	}

	return plugins, nil
}

// scanAccountPlugins 扫描指定账号的插件目录
func (m *Manager) scanAccountPlugins(selfID string) ([]*PluginInfo, error) {
	plugins := make([]*PluginInfo, 0)
	accountDir := filepath.Join(m.pluginsDir, selfID)

	entries, err := os.ReadDir(accountDir)
	if err != nil {
		if os.IsNotExist(err) {
			return plugins, nil
		}
		return plugins, fmt.Errorf("读取账号插件目录失败: %w", err)
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		pluginName := entry.Name()
		pluginDir := filepath.Join(accountDir, pluginName)
		mainLua := filepath.Join(pluginDir, "main.lua")

		// 检查是否存在main.lua文件
		if _, err := os.Stat(mainLua); os.IsNotExist(err) {
			continue
		}

		// 读取配置（可选）
		configPath := filepath.Join(pluginDir, "config.json")
		config := make(map[string]interface{})
		if content, err := os.ReadFile(configPath); err == nil {
			// 检查内容是否为空或只有空白字符
			contentStr := strings.TrimSpace(string(content))
			if contentStr != "" && contentStr != "{}" {
				if err := json.Unmarshal(content, &config); err != nil {
					m.logger.Warnw("解析插件配置失败", "name", pluginName, "error", err)
				}
			}
		}

		// 从main.lua中解析版本和备注
		version, remark := m.parsePluginInfoFromLua(mainLua)

		// 如果lua中没有，尝试从config.json中读取
		if version == "" {
			if v, ok := config["version"].(string); ok {
				version = v
			}
		}
		if remark == "" {
			if r, ok := config["remark"].(string); ok {
				remark = r
			}
		}

		info := &PluginInfo{
			Name:       pluginName,
			Lang:       "lua",
			Entry:      "main.lua",
			Path:       pluginDir,
			Config:     config,
			ConfigPath: configPath,
			Enabled:    true, // 默认启用
			Version:    version,
			Remark:     remark,
		}

		plugins = append(plugins, info)

		// 更新全局插件信息
		m.infosMu.Lock()
		m.pluginInfos[fmt.Sprintf("%s/%s", selfID, pluginName)] = info
		m.infosMu.Unlock()
	}

	return plugins, nil
}

// parsePluginInfoFromLua 从Lua文件中解析插件信息（版本和备注）
// 查找 plugin.version = "x.x.x" 和 plugin.description = "xxx" 格式的定义
func (m *Manager) parsePluginInfoFromLua(luaPath string) (version, remark string) {
	content, err := readFileUTF8(luaPath)
	if err != nil {
		return "", ""
	}

	contentStr := string(content)

	// 解析版本号：查找 plugin.version = "x.x.x" 或 plugin.version = 'x.x.x'
	versionPatterns := []string{
		`plugin\.version\s*=\s*"([^"]+)"`,
		`plugin\.version\s*=\s*'([^']+)'`,
	}
	for _, pattern := range versionPatterns {
		if matches := regexp.MustCompile(pattern).FindStringSubmatch(contentStr); len(matches) > 1 {
			version = matches[1]
			break
		}
	}

	// 解析备注/描述：查找 plugin.description = "xxx" 或 plugin.description = 'xxx'
	remarkPatterns := []string{
		`plugin\.description\s*=\s*"([^"]*)"`,
		`plugin\.description\s*=\s*'([^']*)'`,
	}
	for _, pattern := range remarkPatterns {
		if matches := regexp.MustCompile(pattern).FindStringSubmatch(contentStr); len(matches) > 1 {
			remark = matches[1]
			break
		}
	}

	// 如果备注为空，检查是否是Blockly生成的插件
	if remark == "" {
		// 检查是否包含Blockly生成的特征代码
		if strings.Contains(contentStr, "-- 由Blockly生成") ||
			strings.Contains(contentStr, "-- Blockly generated") ||
			strings.Contains(contentStr, "blockly") {
			remark = "插件由Blockly生成"
		}
	}

	return version, remark
}

// LoadLuaPlugin 加载Lua插件到指定账号
func (m *Manager) LoadLuaPlugin(selfID string, name string) error {
	loadStart := time.Now()
	runtime.GC()
	runtime.GC()
	var memBeforeLoad uint64
	{
		var ms runtime.MemStats
		runtime.ReadMemStats(&ms)
		memBeforeLoad = ms.HeapAlloc
	}
	memSnap := func(step string) uint64 {
		runtime.GC()
		var ms runtime.MemStats
		runtime.ReadMemStats(&ms)
		delta := int64(ms.HeapAlloc) - int64(memBeforeLoad)
		m.logger.Infow("[MEM-PROFILE] 插件加载步骤",
			"plugin", name, "self_id", selfID,
			"step", step,
			"heap_alloc_mb", fmt.Sprintf("%.2f", float64(ms.HeapAlloc)/1024/1024),
			"delta_mb", fmt.Sprintf("%.2f", float64(delta)/1024/1024),
			"heap_sys_mb", fmt.Sprintf("%.2f", float64(ms.HeapSys)/1024/1024),
			"stack_inuse_mb", fmt.Sprintf("%.2f", float64(ms.StackInuse)/1024/1024),
			"num_gc", ms.NumGC,
		)
		return ms.HeapAlloc
	}
	memSnap("start")

	if selfID == "" {
		return errors.New("必须指定账号ID")
	}

	container := m.getOrCreateContainer(selfID)
	container.mu.Lock()

	// 检查插件是否已在该账号中加载
	if _, exists := container.LuaPlugins[name]; exists {
		container.mu.Unlock()
		return errors.New("插件已在该账号中运行")
	}

	// 扫描该账号的插件
	plugins, err := m.scanAccountPlugins(selfID)
	if err != nil {
		container.mu.Unlock()
		return fmt.Errorf("扫描插件失败: %w", err)
	}

	// 查找指定插件
	var pluginInfo *PluginInfo
	for _, p := range plugins {
		if p.Name == name {
			pluginInfo = p
			break
		}
	}

	if pluginInfo == nil {
		container.mu.Unlock()
		return fmt.Errorf("插件不存在: %s (账号: %s)", name, selfID)
	}

	// 创建Lua状态机
	L := lua.NewState(lua.Options{
		CallStackSize:      120,
		RegistrySize:       512,
		RegistryMaxSize:    1024 * 20,
		RegistryGrowStep:   16,
		SkipOpenLibs:       true,
		MinimizeStackMemory: true,
	})
	memSnap("lua.NewState")

	if err := m.setupSandbox(L, selfID, name); err != nil {
		L.Close()
		container.mu.Unlock()
		return fmt.Errorf("设置沙箱环境失败: %w", err)
	}
	memSnap("setupSandbox")

	// 创建插件实例
	instance := &LuaPluginInstance{
		L:                   L,
		Name:                name,
		Config:              pluginInfo.Config,
		EventHandlers:       make(map[string]*lua.LFunction),
		StartTime:           time.Now(),
		llService:           m.llService,
		reverseWS:           m.reverseWS,
		SelfID:              selfID,
		Logs:                make([]string, 0, 1000),
		eventCount:          0,
		errorCount:           0,
		lastEventTime:        time.Now(),
		sandbox:              NewLuaSandbox(nil),
		cpuTime:              0,
		memoryUsage:          0,
		imageProcessors:      make(map[int]*utils.SimpleImageProcessor),
		nextProcessorID:      1,
		schedulerCallbacks:   make(map[string]*lua.LFunction),
	}

	// 设置沙箱的instance引用
	instance.sandbox.instance = instance

	// 注意：gopher-lua v1.1.1 不支持SetHook API
	// 我们通过超时机制和指令计数（在每次事件处理前重置）来提供安全保障
	// 指令计数将在事件处理器执行期间监控

	// 解析过滤配置
	if filterConfig, exists := pluginInfo.Config["filter"]; exists {
		if filterMap, ok := filterConfig.(map[string]interface{}); ok {
			instance.filter = m.parseFilterConfig(filterMap)
		}
	}

	m.registerAPI(instance)
	memSnap("registerAPI")

	// 重要：在执行 Lua 代码之前释放锁，避免死锁
	// Lua 代码中的 log.info 等 API 需要获取 container.mu.RLock()
	container.mu.Unlock()

	// 使用缓存加载插件主文件，并在沙箱保护下执行
	entryPath := filepath.Join(pluginInfo.Path, pluginInfo.Entry)

	// 重置沙箱状态，准备执行全局代码
	instance.sandbox.Reset()

	// 执行全局代码（带超时保护）
	// 修复：使用 context 实现协作式取消，避免 goroutine 泄漏和数据竞争
	execCtx, execCancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer execCancel()

	done := make(chan error, 1)

	go func() {
		defer func() {
			if r := recover(); r != nil {
				done <- fmt.Errorf("插件全局代码执行panic: %v", r)
			}
		}()

		// 检查 context 是否已取消（超时或外部取消）
		select {
		case <-execCtx.Done():
			done <- fmt.Errorf("执行前已取消: %v", execCtx.Err())
			return
		default:
		}

		if m.luaScriptCache != nil {
			fn, err := m.luaScriptCache.LoadAndCompileScript(L, entryPath)
			if err != nil {
				done <- fmt.Errorf("加载插件文件失败: %w", err)
				return
			}

			L.Push(fn)
			if err := L.PCall(0, lua.MultRet, nil); err != nil {
				done <- fmt.Errorf("执行Lua脚本失败: %w", err)
				return
			}
		} else {
			// 没有缓存，直接加载
			if err := L.DoFile(entryPath); err != nil {
				done <- fmt.Errorf("加载插件文件失败: %w", err)
				return
			}
		}

		done <- nil
	}()

	m.logger.Infow("插件goroutine已启动，即将等待执行结果", "plugin", name, "self_id", selfID)
	memSnap("before_execute_script")

	m.logger.Infow("[TIME] L.PCall执行开始",
		"plugin", name, "self_id", selfID,
		"elapsed_since_load", time.Since(loadStart).String())

	execStart := time.Now()

	// 熔断清理辅助函数
	haltAndCleanup := func(reason string) {
		instance.sandbox.Halt(reason)
		atomic.StoreInt32(&instance.luaCorrupted, 1)
		instance.corruptReason = reason
		// 清理 Lua 回调引用
		instance.mu.Lock()
		instance.schedulerCallbacks = nil
		instance.EventHandlers = nil
		instance.mu.Unlock()
		// 关闭 LState
		if instance.L != nil {
			instance.L.Close()
		}
		instance.L = nil
		// GC 清理
		runtime.GC()
		runtime.GC()
		debug.FreeOSMemory()
		runtime.GC()
		debug.FreeOSMemory()
	}

	select {
	case err := <-done:
		if err != nil {
			haltAndCleanup(fmt.Sprintf("插件加载失败: %v", err))
			return err
		}
	case <-execCtx.Done():
		instance.sandbox.Halt("插件全局代码执行超时（超过60秒）")
		atomic.StoreInt32(&instance.luaCorrupted, 1)
		instance.corruptReason = "插件全局代码执行超时"
		select {
		case <-done:
			m.logger.Debugw("全局代码goroutine在超时后及时退出",
				"plugin", name,
				"self_id", selfID)
		case <-time.After(5 * time.Second):
			m.logger.Warnw("全局代码goroutine未能在超时后及时退出，但不再强制关闭LState以避免panic",
				"plugin", name,
				"self_id", selfID)
		}
		m.logger.Infow("[TIME] L.PCall执行超时返回",
			"plugin", name, "self_id", selfID,
			"elapsed_since_load", time.Since(loadStart).String(),
			"pcall_duration", time.Since(execStart).String())

		return fmt.Errorf("插件全局代码执行超时，请将耗时操作移到on_init或事件处理器中")
	}

	memSnap("after_execute_script")

	m.logger.Infow("[TIME] after_execute_script完成",
		"plugin", name, "self_id", selfID,
		"total_since_load", time.Since(loadStart).String(),
		"pcall_duration", time.Since(execStart).String())

	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)
	memDelta := int64(memStats.HeapAlloc) - int64(memBeforeLoad)
	if memDelta > int64(maxMemoryUsage) {
		// 熔断时完整清理（插件尚未注册到map，无法使用UnloadLuaPlugin）
		instance.schedulerCallbacks = nil
		instance.EventHandlers = nil
		if instance.L != nil {
			instance.L.Close()
		}
		instance.L = nil
		atomic.StoreInt32(&instance.luaCorrupted, 1)
		instance.corruptReason = "插件加载后内存增量超限"
		instance.sandbox.Halt(fmt.Sprintf("插件加载后内存增量超限: %.1fMB / %dMB", float64(memDelta)/1024/1024, maxMemoryUsage/1024/1024))
		runtime.GC()
		runtime.GC()
		debug.FreeOSMemory()
		runtime.GC()
		debug.FreeOSMemory()

		return fmt.Errorf("插件加载后内存增量超限(%.1fMB)，请优化插件代码减少内存占用", float64(memDelta)/1024/1024)
	}

	// 重新获取锁来注册插件
	container.mu.Lock()
	container.LuaPlugins[name] = instance
	container.PluginConfigs[name] = pluginInfo
	container.mu.Unlock()

	m.registerEventHandlers(instance)
	memSnap("registerEventHandlers")

	go func() {
		defer func() {
			if r := recover(); r != nil {
				m.logger.Errorw("插件初始化函数panic",
					"self_id", selfID, "name", name, "error", r)
			}
		}()
		if err := m.callInitFunction(instance); err != nil {
			m.logger.Warnw("插件初始化函数执行失败", "self_id", selfID, "name", name, "error", err)
		}
	}()

	m.logger.Infow("Lua插件已加载", "self_id", selfID, "name", name)
	memSnap("load_complete")
	return nil
}

// AddPluginToAutoStart 将插件添加到预启动配置（导出供外部调用）
func (m *Manager) AddPluginToAutoStart(selfID string, pluginName string) error {
	// 读取当前预启动配置
	autoStartConfig := AutoStartConfig{}
	configPath := "config/plugins_auto_start.json"

	// 如果配置文件存在，读取现有配置
	if _, err := os.Stat(configPath); err == nil {
		data, err := os.ReadFile(configPath)
		if err != nil {
			return fmt.Errorf("读取预启动配置文件失败: %w", err)
		}
		if err := json.Unmarshal(data, &autoStartConfig); err != nil {
			return fmt.Errorf("解析预启动配置文件失败: %w", err)
		}
	}

	// 构建完整的插件标识符
	pluginIdentifier := fmt.Sprintf("%s/%s", selfID, pluginName)

	// 检查插件是否已经在预启动列表中
	for _, name := range autoStartConfig.AutoStart {
		if name == pluginIdentifier {
			return nil
		}
	}

	// 添加插件到预启动列表
	autoStartConfig.AutoStart = append(autoStartConfig.AutoStart, pluginIdentifier)

	// 写回配置文件
	data, err := json.MarshalIndent(autoStartConfig, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化预启动配置失败: %w", err)
	}

	// 确保配置目录存在
	if err := os.MkdirAll("config", 0755); err != nil {
		return fmt.Errorf("创建配置目录失败: %w", err)
	}

	if err := os.WriteFile(configPath, data, 0644); err != nil {
		return fmt.Errorf("写入预启动配置文件失败: %w", err)
	}

	return nil
}

// RemovePluginFromAutoStart 从预启动配置中移除插件（导出供外部调用）
func (m *Manager) RemovePluginFromAutoStart(selfID string, pluginName string) error {
	// 读取当前预启动配置
	autoStartConfig := AutoStartConfig{}
	configPath := "config/plugins_auto_start.json"

	// 如果配置文件不存在，直接返回
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		return nil
	}

	// 读取配置文件
	data, err := os.ReadFile(configPath)
	if err != nil {
		return fmt.Errorf("读取预启动配置文件失败: %w", err)
	}
	if err := json.Unmarshal(data, &autoStartConfig); err != nil {
		return fmt.Errorf("解析预启动配置文件失败: %w", err)
	}

	// 构建完整的插件标识符
	pluginIdentifier := fmt.Sprintf("%s/%s", selfID, pluginName)

	// 查找并移除插件
	newAutoStart := make([]string, 0, len(autoStartConfig.AutoStart))
	found := false
	for _, name := range autoStartConfig.AutoStart {
		if name == pluginIdentifier {
			found = true
			continue
		}
		newAutoStart = append(newAutoStart, name)
	}

	// 如果没有找到插件，无需更新文件
	if !found {
		return nil
	}

	// 更新配置
	autoStartConfig.AutoStart = newAutoStart

	// 写回配置文件
	data, err = json.MarshalIndent(autoStartConfig, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化预启动配置失败: %w", err)
	}

	if err := os.WriteFile(configPath, data, 0644); err != nil {
		return fmt.Errorf("写入预启动配置文件失败: %w", err)
	}

	return nil
}

// luaFormatToGoFormat 将 Lua 的 strftime 格式转换为 Go 的 time 格式
// Lua 格式: %Y-%m-%d %H:%M:%S
// Go 格式: 2006-01-02 15:04:05
func luaFormatToGoFormat(luaFormat string) string {
	// 如果已经是 Go 格式（包含数字），直接返回
	if strings.Contains(luaFormat, "2006") || strings.Contains(luaFormat, "01") || strings.Contains(luaFormat, "02") {
		return luaFormat
	}

	// 定义 Lua 格式到 Go 格式的映射
	replacements := map[string]string{
		"%Y": "2006",        // 四位年份
		"%y": "06",          // 两位年份
		"%m": "01",          // 月份 (01-12)
		"%d": "02",          // 日期 (01-31)
		"%H": "15",          // 小时 (00-23)
		"%I": "03",          // 小时 (01-12)
		"%M": "04",          // 分钟 (00-59)
		"%S": "05",          // 秒 (00-59)
		"%p": "PM",          // AM/PM
		"%a": "Mon",         // 缩写星期名
		"%A": "Monday",      // 完整星期名
		"%b": "Jan",         // 缩写月份名
		"%B": "January",     // 完整月份名
		"%c": "2006-01-02 15:04:05", // 完整日期时间
		"%x": "2006-01-02",  // 日期
		"%X": "15:04:05",    // 时间
		"%Z": "MST",         // 时区名
		"%z": "-0700",       // 时区偏移
		"%%": "%",           // 百分号
	}

	result := luaFormat
	for luaFmt, goFmt := range replacements {
		result = strings.ReplaceAll(result, luaFmt, goFmt)
	}

	return result
}

// setupSandbox 设置沙箱环境
func (m *Manager) setupSandbox(L *lua.LState, selfID string, pluginName string) error {
	for _, lib := range []struct {
		name string
		fn   lua.LGFunction
	}{
		{"_G", lua.OpenBase},
		{lua.StringLibName, lua.OpenString},
		{lua.TabLibName, lua.OpenTable},
		{lua.MathLibName, lua.OpenMath},
		{lua.CoroutineLibName, lua.OpenCoroutine},
	} {
		L.Push(L.NewFunction(lib.fn))
		L.Push(lua.LString(lib.name))
		L.Call(1, 0)
	}

	L.SetGlobal("io", lua.LNil)
	L.SetGlobal("package", lua.LNil)
	L.SetGlobal("debug", lua.LNil)

	osTable := L.NewTable()
	L.SetField(osTable, "time", L.NewFunction(func(L *lua.LState) int {
		L.Push(lua.LNumber(time.Now().Unix()))
		return 1
	}))
	L.SetField(osTable, "date", L.NewFunction(func(L *lua.LState) int {
		format := L.OptString(1, "%c")
		timestamp := L.OptNumber(2, lua.LNumber(time.Now().Unix()))
		
		goFormat := luaFormatToGoFormat(format)
		
		t := time.Unix(int64(timestamp), 0)
		L.Push(lua.LString(t.Format(goFormat)))
		return 1
	}))
	L.SetGlobal("os", osTable)

	// 设置插件工作目录
	pluginDir := filepath.Join(m.pluginsDir, selfID, pluginName)
	if err := os.MkdirAll(pluginDir, 0755); err != nil {
		return fmt.Errorf("创建插件目录失败: %w", err)
	}
	L.SetGlobal("PLUGIN_DIR", lua.LString(pluginDir))

	return nil
}

// loadLuaRuntimeLibrary 加载 Lua 运行时辅助库
// 提供便捷的字段访问辅助函数，避免在后端为每个字段都注册函数
func (m *Manager) loadLuaRuntimeLibrary(L *lua.LState, instance *LuaPluginInstance) {
	runtimeLib := `
-- 消息事件辅助函数库
-- 这些函数直接操作 event 表，无需后端提供 API

-- 先初始化全局表（确保在函数定义之前）
if msg == nil then msg = {} end
if db == nil then db = {} end
if file == nil then file = {} end
if __blc_var___ == nil then __blc_var___ = {} end

-- 通用类型转换函数：将字符串 "true"/"false" 或其他值转换为布尔值
local function toboolean(value)
	if value == nil then return false end
	if type(value) == "boolean" then return value end
	if type(value) == "number" then return value ~= 0 end
	if type(value) == "string" then
		local lower = string.lower(value)
		if lower == "true" or lower == "1" or lower == "yes" then return true end
		if lower == "false" or lower == "0" or lower == "no" then return false end
	end
	return false
end

-- 将 toboolean 注册为全局函数
toboolean = toboolean

-- 安全获取嵌套字段
local function safe_get(t, ...)
	if t == nil then return nil end
	local current = t
	for _, key in ipairs({...}) do
		if type(current) ~= "table" then return nil end
		current = current[key]
		if current == nil then return nil end
	end
	return current
end

-- 获取发送者ID (兼容群消息和私聊消息)
function msg.get_sender_id(event)
	if event == nil then return nil end
	-- 优先从 user_id 获取
	if event.user_id then return event.user_id end
	-- 从 sender 表获取
	if event.sender and event.sender.user_id then
		return event.sender.user_id
	end
	return nil
end

-- 获取发送者昵称
function msg.get_sender_nickname(event)
	if event == nil or event.sender == nil then return "" end
	-- 优先返回 nickname
	if event.sender.nickname then return event.sender.nickname end
	-- 返回群名片 card
	if event.sender.card then return event.sender.card end
	return ""
end

-- 获取群组ID
function msg.get_group_id(event)
	if event == nil then return nil end
	return event.group_id
end

-- 获取消息类型
function msg.get_type(event)
	if event == nil then return "" end
	return event.message_type or ""
end

-- 获取消息时间
function msg.get_time(event)
	if event == nil or event.time == nil then
		return os.time()
	end
	return event.time
end

-- 检查是否为群消息
function msg.is_group_message(event)
	if event == nil then return false end
	return event.message_type == "group"
end

-- 检查是否为私聊消息
function msg.is_private_message(event)
	if event == nil then return false end
	return event.message_type == "private"
end

-- 获取消息中第一张图片的URL
function msg.get_first_image(event)
	if event == nil or event.message == nil then return nil end
	
	-- 遍历消息段
	for _, segment in ipairs(event.message) do
		if type(segment) == "table" then
			-- 检查图片类型
			if segment.type == "image" and segment.data then
				return segment.data.url or segment.data.file
			end
		end
	end
	return nil
end

-- 获取消息类型（基于消息段类型）
function msg.get_message_type(event)
	if event == nil or event.message == nil then return "text" end
	
	-- 遍历消息段，返回第一个非文本类型的类型
	for _, segment in ipairs(event.message) do
		if type(segment) == "table" and segment.type then
			if segment.type ~= "text" then
				return segment.type
			end
		end
	end
	return "text"
end

-- ========== 文件管理增强功能 ==========

-- 文件过滤函数
function file.filter_files(files, pattern)
	if not files or type(files) ~= "table" then return {} end
	if not pattern or pattern == "" then return files end
	
	local filtered = {}
	for _, fileInfo in ipairs(files) do
		if type(fileInfo) == "table" and fileInfo.name then
			-- 支持通配符模式匹配
			local name = fileInfo.name
			local match = false
			
			-- 简单的通配符匹配
			if pattern:find("%*") then
				-- 转换通配符为正则表达式
				local regex = pattern:gsub("%.", "%%."):gsub("%*", ".*")
				match = name:match(regex) ~= nil
			else
				-- 普通包含匹配
				match = name:find(pattern, 1, true) ~= nil
			end
			
			if match then
				table.insert(filtered, fileInfo)
			end
		end
	end
	return filtered
end

-- 安全读取文件（带错误处理）
function file.read_safe(filePath)
	if not filePath or filePath == "" then
		return nil, "文件路径不能为空"
	end
	
	-- 检查路径合法性
	if filePath:find("%.%.") then
		return nil, "非法文件路径"
	end
	
	local content, err = file.read(filePath)
	if not content then
		return nil, err or "读取文件失败"
	end
	
	return content
end

-- 安全写入文件（带错误处理）
function file.write_safe(filePath, content)
	if not filePath or filePath == "" then
		return false, "文件路径不能为空"
	end
	
	if not content then
		return false, "内容不能为空"
	end
	
	-- 检查路径合法性
	if filePath:find("%.%.") then
		return false, "非法文件路径"
	end
	
	local success, err = file.write(filePath, content)
	if not success then
		return false, err or "写入文件失败"
	end
	
	return true
end

-- 检查文件是否存在（使用 file.list 的辅助实现）
-- 注意：如果 Go 后端已注册 file.exists，则不会覆盖
function file._lua_exists(filePath)
	if not filePath or filePath == "" then
		return false
	end
	
	local files = file.list()
	for _, f in ipairs(files) do
		if f.name == filePath then
			return true
		end
	end
	return false
end

-- 获取文件信息（使用 file.list 的辅助实现）
-- 注意：如果 Go 后端已注册 file.get_info，则不会覆盖
function file._lua_get_info(filePath)
	if not filePath or filePath == "" then
		return nil
	end
	
	local files = file.list()
	for _, f in ipairs(files) do
		if f.name == filePath then
			return f
		end
	end
	return nil
end

-- ========== 数据库管理功能 ==========

-- 数据库对象
local Database = {}
Database.__index = Database

-- 创建或打开数据库
function db.open(dbName)
	if not dbName or dbName == "" then
		return nil, "数据库名称不能为空"
	end
	
	-- 确保数据库名称符合规范
	if not dbName:match("%.db%.csv$") then
		dbName = dbName .. ".db.csv"
	end
	
	local self = setmetatable({}, Database)
	self.name = dbName
	self.filePath = dbName
	self.records = {}
	self.nextId = 1
	
	-- 尝试加载现有数据
	-- 优先使用 Go 后端注册的 file.exists，如果不存在则使用 Lua 实现
	local exists_func = file.exists or file._lua_exists
	if exists_func(dbName) then
		local content, err = file.read(dbName)
		if content then
			local success = self:load_from_csv(content)
			if not success then
				return nil, "加载数据库失败"
			end
		end
	end
	
	return self
end

-- 从CSV加载数据
function Database:load_from_csv(content)
	if not content or content == "" then
		return true
	end
	
	self.records = {}
	self.nextId = 1
	
	local lines = {}
	for line in content:gmatch("([^\r\n]+)") do
		table.insert(lines, line)
	end
	
	if #lines == 0 then
		return true
	end
	
	-- 解析表头
	local headers = {}
	for header in lines[1]:gmatch("([^,]+)") do
		table.insert(headers, header:gsub('"', ''))
	end
	
	-- 解析数据行
	for i = 2, #lines do
		local record = {}
		local colIndex = 1
		local line = lines[i]
		
		-- 处理带引号的字段
		local fields = {}
		local inQuotes = false
		local currentField = ""
		
		for j = 1, #line do
			local char = line:sub(j, j)
			
			if char == '"' then
				inQuotes = not inQuotes
			elseif char == ',' and not inQuotes then
				table.insert(fields, currentField)
				currentField = ""
			else
				currentField = currentField .. char
			end
		end
		table.insert(fields, currentField)
		
		-- 构建记录对象
		for j, header in ipairs(headers) do
			local value = fields[j] or ""
			value = value:gsub('"', '')
			
			-- 尝试转换为数字
			local numValue = tonumber(value)
			if numValue then
				record[header] = numValue
			elseif value == "true" then
				record[header] = true
			elseif value == "false" then
				record[header] = false
			else
				record[header] = value
			end
		end
		
		-- 自动分配ID
		if record.id then
			if record.id >= self.nextId then
				self.nextId = record.id + 1
			end
		else
			record.id = self.nextId
			self.nextId = self.nextId + 1
		end
		
		table.insert(self.records, record)
	end
	
	return true
end

-- 保存到CSV
function Database:save_to_csv()
	if #self.records == 0 then
		return file.write_safe(self.filePath, "")
	end
	
	-- 收集所有字段
	local allFields = { "id" }
	for _, record in ipairs(self.records) do
		for key, _ in pairs(record) do
			if key ~= "id" then
				local exists = false
				for _, f in ipairs(allFields) do
					if f == key then
						exists = true
						break
					end
				end
				if not exists then
					table.insert(allFields, key)
				end
			end
		end
	end
	
	-- 生成CSV内容
	local lines = {}
	
	-- 表头
	table.insert(lines, table.concat(allFields, ","))
	
	-- 数据行
	for _, record in ipairs(self.records) do
		local values = {}
		for _, field in ipairs(allFields) do
			local value = record[field]
			if value == nil then
				value = ""
			elseif type(value) == "string" then
				-- 如果包含逗号或引号，需要转义
				if value:find(",") or value:find('"') or value:find("\n") then
					value = '"' .. value:gsub('"', '""') .. '"'
				end
			else
				value = tostring(value)
			end
			table.insert(values, value)
		end
		table.insert(lines, table.concat(values, ","))
	end
	
	return file.write_safe(self.filePath, table.concat(lines, "\n"))
end

-- 插入记录
function Database:insert(record)
	if not record or type(record) ~= "table" then
		return nil, "记录必须是表类型"
	end
	
	record.id = self.nextId
	self.nextId = self.nextId + 1
	
	table.insert(self.records, record)
	
	local success, err = self:save_to_csv()
	if not success then
		return nil, err
	end
	
	return record.id
end

-- 查询记录
function Database:query(conditions)
	if not conditions or type(conditions) ~= "table" then
		-- 返回所有记录
		local result = {}
		for _, record in ipairs(self.records) do
			table.insert(result, record)
		end
		return result
	end
	
	local result = {}
	for _, record in ipairs(self.records) do
		local match = true
		for key, value in pairs(conditions) do
			if record[key] ~= value then
				match = false
				break
			end
		end
		if match then
			table.insert(result, record)
		end
	end
	
	return result
end

-- 查询单条记录
function Database:query_one(conditions)
	local results = self:query(conditions)
	if #results > 0 then
		return results[1]
	end
	return nil
end

-- 更新记录
function Database:update(id, updates)
	if not id then
		return false, "ID不能为空"
	end
	
	if not updates or type(updates) ~= "table" then
		return false, "更新内容必须是表类型"
	end
	
	for _, record in ipairs(self.records) do
		if record.id == id then
			for key, value in pairs(updates) do
				if key ~= "id" then
					record[key] = value
				end
			end
			
			local success, err = self:save_to_csv()
			if not success then
				return false, err
			end
			return true
		end
	end
	
	return false, "记录不存在"
end

-- 删除记录
function Database:delete(id)
	if not id then
		return false, "ID不能为空"
	end
	
	for i, record in ipairs(self.records) do
		if record.id == id then
			table.remove(self.records, i)
			
			local success, err = self:save_to_csv()
			if not success then
				return false, err
			end
			return true
		end
	end
	
	return false, "记录不存在"
end

-- 备份数据库
function Database:backup(backupName)
	if not backupName or backupName == "" then
		backupName = self.name .. ".backup." .. os.time()
	end
	
	if not backupName:match("%.db%.csv$") then
		backupName = backupName .. ".db.csv"
	end
	
	local content, err = file.read(self.filePath)
	if not content then
		return false, err or "读取数据库失败"
	end
	
	return file.write_safe(backupName, content)
end

-- 恢复数据库
function Database:restore(backupName)
	if not backupName or backupName == "" then
		return false, "备份文件名不能为空"
	end
	
	if not backupName:match("%.db%.csv$") then
		backupName = backupName .. ".db.csv"
	end
	
	local content, err = file.read(backupName)
	if not content then
		return false, err or "读取备份失败"
	end
	
	return file.write_safe(self.filePath, content)
end

-- 获取记录数量
function Database:count()
	return #self.records
end

-- 清空数据库
function Database:clear()
	self.records = {}
	self.nextId = 1
	return self:save_to_csv()
end

-- ========== 简化版数据库API（键值存储）==========
-- 简化版数据库，直接操作单个CSV文件，键值对存储

-- 打开或创建数据库文件
local function openSimpleDb(dbName)
	if not dbName or dbName == "" then
		return nil, "数据库名称不能为空"
	end
	-- 如果已经带有 .db.csv 后缀，直接返回
	if dbName:match("%.db%.csv$") then
		return dbName
	end
	-- 如果路径中包含斜杠，说明是带目录的路径，只给文件名部分添加后缀
	local dir, file = dbName:match("^(.-)/?([^/]+)$")
	if dir and dir ~= "" then
		return dir .. "/" .. file .. ".db.csv"
	end
	-- 普通数据库名，直接添加后缀
	return dbName .. ".db.csv"
end

-- 存储键值对
function db.set(dbName, key, value)
	local filePath, err = openSimpleDb(dbName)
	if not filePath then
		return false, err
	end
	-- 将键转换为字符串，确保类型一致
	key = tostring(key)
	if key == "" then
		return false, "键不能为空"
	end
	if value == nil then
		value = ""
	end

	-- 读取现有数据
	local data = {}
	local content = ""
	local exists_func = file.exists or file._lua_exists
	if exists_func(filePath) then
		content = file.read(filePath) or ""
	end

	-- 解析现有数据（格式：key=value）
	for line in content:gmatch("[^\r\n]+") do
		local eqPos = line:find("=")
		if eqPos then
			local k = line:sub(1, eqPos - 1)
			local v = line:sub(eqPos + 1)
			data[k] = v
		end
	end

	-- 更新数据
	if type(value) == "table" then
		data[key] = blockly_json.encode(value)
	else
		data[key] = tostring(value)
	end

	-- 保存数据
	local lines = {}
	for k, v in pairs(data) do
		table.insert(lines, k .. "=" .. v)
	end
	local newContent = table.concat(lines, "\n")
	
	-- 确保目录存在
	local dir = filePath:match("^(.+)/[^/]+$")
	if dir and dir ~= "" then
		file.mkdir(dir)
	end
	
	return file.write(filePath, newContent)
end

-- 读取键值对
function db.get(dbName, key, default)
	local filePath, err = openSimpleDb(dbName)
	if not filePath then
		return default
	end
	-- 将键转换为字符串，确保类型一致
	key = tostring(key)
	if key == "" then
		return default
	end

	-- 检查文件是否存在
	local exists_func = file.exists or file._lua_exists
	if not exists_func(filePath) then
		return default
	end

	local content = file.read(filePath)
	if not content or content == "" then
		return default
	end

	for line in content:gmatch("[^\r\n]+") do
		local eqPos = line:find("=")
		if eqPos then
			local k = line:sub(1, eqPos - 1)
			local v = line:sub(eqPos + 1)
			if k == key then
				-- 尝试转为数字
				local num = tonumber(v)
				if num then
					return num
				end
				-- 尝试转为布尔值
				if v == "true" then
					return true
				elseif v == "false" then
					return false
				end
				return v
			end
		end
	end
	return default
end

-- 删除键值对
function db.delete(dbName, key)
	local filePath, err = openSimpleDb(dbName)
	if not filePath then
		return false, err
	end
	if not key or key == "" then
		return false, "键不能为空"
	end

	local exists_func = file.exists or file._lua_exists
	if not exists_func(filePath) then
		return true
	end

	local content = file.read(filePath) or ""
	local lines = {}
	local found = false

	for line in content:gmatch("[^\r\n]+") do
		local eqPos = line:find("=")
		if eqPos then
			local k = line:sub(1, eqPos - 1)
			if k == key then
				found = true
			else
				table.insert(lines, line)
			end
		end
	end

	if not found then
		return true
	end

	local newContent = table.concat(lines, "\n")
	return file.write_safe(filePath, newContent)
end

-- ========== 时间处理辅助函数库 ==========
-- 为 Blockly 时间积木提供支持

blockly_time = {}

-- 将日期字符串转换为时间戳
-- 支持格式：YYYY-MM-DD, YYYY/MM/DD, YYYY-MM-DD HH:MM:SS, 等
function blockly_time.date_to_timestamp(date_str)
	if not date_str or date_str == "" then
		return 0
	end
	
	-- 标准化日期字符串
	local normalized = tostring(date_str)
	
	-- 提取年月日时分秒
	local year, month, day, hour, min, sec = 1970, 1, 1, 0, 0, 0
	
	-- 尝试匹配 YYYY-MM-DD 或 YYYY/MM/DD
	local y, m, d = normalized:match("(%d%d%d%d)[/-](%d%d?)[/-](%d%d?)")
	if y then
		year, month, day = tonumber(y), tonumber(m), tonumber(d)
	end
	
	-- 尝试匹配时间部分 HH:MM:SS 或 HH:MM
	local h, mi, s = normalized:match("(%d%d?):(%d%d?):?(%d*)")
	if h then
		hour, min = tonumber(h), tonumber(mi)
		if s and s ~= "" then
			sec = tonumber(s)
		end
	end
	
	-- 使用 os.time 计算时间戳
	local t = {
		year = year,
		month = month,
		day = day,
		hour = hour,
		min = min,
		sec = sec
	}
	
	local ts = os.time(t)
	return ts or 0
end

-- 判断是否为闰年
function blockly_time.is_leap_year(year)
	if not year then return false end
	year = tonumber(year)
	if not year then return false end
	
	-- 闰年规则：能被4整除但不能被100整除，或者能被400整除
	return (year % 4 == 0 and year % 100 ~= 0) or (year % 400 == 0)
end

-- 获取指定月份的天数
function blockly_time.days_in_month(year, month)
	if not year or not month then return 0 end
	year, month = tonumber(year), tonumber(month)
	if not year or not month then return 0 end
	
	-- 各月天数表
	local days_in_month = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31}
	
	-- 二月特殊处理
	if month == 2 then
		if blockly_time.is_leap_year(year) then
			return 29
		else
			return 28
		end
	end
	
	return days_in_month[month] or 0
end

-- 对时间进行加减运算（支持月和年）
function blockly_time.add_unit(timestamp, operation, amount, unit)
	if not timestamp then timestamp = os.time() end
	if not amount then amount = 0 end
	if not unit then unit = "seconds" end
	
	timestamp = tonumber(timestamp) or os.time()
	amount = tonumber(amount) or 0
	
	-- 秒、分钟、小时、天、周直接计算
	local multipliers = {
		seconds = 1,
		minutes = 60,
		hours = 3600,
		days = 86400,
		weeks = 604800
	}
	
	if multipliers[unit] then
		local multiplier = multipliers[unit]
		if operation == "add" then
			return timestamp + (amount * multiplier)
		else
			return timestamp - (amount * multiplier)
		end
	end
	
	-- 月和年需要特殊处理
	local date = os.date("*t", timestamp)
	
	if unit == "months" then
		if operation == "add" then
			date.month = date.month + amount
		else
			date.month = date.month - amount
		end
		
		-- 处理月份溢出
		while date.month > 12 do
			date.month = date.month - 12
			date.year = date.year + 1
		end
		while date.month < 1 do
			date.month = date.month + 12
			date.year = date.year - 1
		end
		
		-- 处理日期溢出（如1月31日加1个月）
		local max_day = blockly_time.days_in_month(date.year, date.month)
		if date.day > max_day then
			date.day = max_day
		end
		
	elseif unit == "years" then
		if operation == "add" then
			date.year = date.year + amount
		else
			date.year = date.year - amount
		end
		
		-- 处理闰年2月29日的情况
		if date.month == 2 and date.day == 29 then
			if not blockly_time.is_leap_year(date.year) then
				date.day = 28
			end
		end
	end
	
	return os.time(date)
end

-- 获取当天开始的时间戳（0点0分0秒）
function blockly_time.start_of_day(timestamp)
	if not timestamp then timestamp = os.time() end
	timestamp = tonumber(timestamp) or os.time()
	
	local date = os.date("*t", timestamp)
	date.hour = 0
	date.min = 0
	date.sec = 0
	
	return os.time(date)
end

-- 获取当天结束的时间戳（23点59分59秒）
function blockly_time.end_of_day(timestamp)
	if not timestamp then timestamp = os.time() end
	timestamp = tonumber(timestamp) or os.time()
	
	local date = os.date("*t", timestamp)
	date.hour = 23
	date.min = 59
	date.sec = 59
	
	return os.time(date)
end

`
	runtime.GC()
	var msBefore runtime.MemStats
	runtime.ReadMemStats(&msBefore)

	fn, loadErr := L.LoadString(runtimeLib)
	if loadErr != nil {
		m.logger.Warnw("加载 Lua 运行时库失败", "plugin", instance.Name, "error", loadErr)
		return
	}

	runtime.GC()
	var msAfterCompile runtime.MemStats
	runtime.ReadMemStats(&msAfterCompile)
	m.logger.Infow("[MEM-PROFILE] runtimeLib编译",
		"plugin", instance.Name,
		"source_len", len(runtimeLib),
		"compile_delta_kb", (msAfterCompile.HeapAlloc-msBefore.HeapAlloc)/1024,
	)

	L.Push(fn)
	L.Call(0, 0)

	runtime.GC()
	var msAfterExec runtime.MemStats
	runtime.ReadMemStats(&msAfterExec)
	m.logger.Infow("[MEM-PROFILE] runtimeLib执行",
		"plugin", instance.Name,
		"exec_delta_kb", (msAfterExec.HeapAlloc-msAfterCompile.HeapAlloc)/1024,
		"total_delta_kb", (msAfterExec.HeapAlloc-msBefore.HeapAlloc)/1024,
	)
}

// registerAPI 注册API函数
func (m *Manager) registerAPI(instance *LuaPluginInstance) {
	if instance.L == nil {
		m.logger.Errorw("无法注册API：Lua状态机为空",
			"plugin", instance.Name,
			"self_id", instance.SelfID)
		return
	}
	L := instance.L
	pluginName := instance.Name
	selfID := instance.SelfID

	// 日志API
	logTable := L.NewTable()
	L.SetField(logTable, "info", L.NewFunction(m.luaLogInfo(selfID, pluginName)))
	L.SetField(logTable, "warn", L.NewFunction(m.luaLogWarn(selfID, pluginName)))
	L.SetField(logTable, "error", L.NewFunction(m.luaLogError(selfID, pluginName)))
	L.SetField(logTable, "debug", L.NewFunction(m.luaLogDebug(selfID, pluginName)))
	L.SetGlobal("log", logTable)

	// 配置API
	configTable := L.NewTable()
	L.SetField(configTable, "get", L.NewFunction(m.luaConfigGet(instance)))
	L.SetField(configTable, "all", L.NewFunction(m.luaConfigAll(instance)))
	L.SetGlobal("config", configTable)

	// 消息API
	messageTable := L.NewTable()
	L.SetField(messageTable, "send_group", L.NewFunction(m.luaSendGroupMessage(instance)))
	L.SetField(messageTable, "send_private", L.NewFunction(m.luaSendPrivateMessage(instance)))
	L.SetField(messageTable, "reply_private", L.NewFunction(m.luaReplyPrivateMessage(instance)))
	L.SetField(messageTable, "reply_group", L.NewFunction(m.luaReplyGroupMessage(instance)))
	m.logger.Infow("注册回复消息函数", "plugin", instance.Name)
	L.SetField(messageTable, "send_group_image", L.NewFunction(m.luaSendGroupImage(instance)))
	L.SetField(messageTable, "send_private_image", L.NewFunction(m.luaSendPrivateImage(instance)))
	L.SetField(messageTable, "send_group_forward", L.NewFunction(m.luaSendGroupForwardMessage(instance)))
	L.SetField(messageTable, "send_private_forward", L.NewFunction(m.luaSendPrivateForwardMessage(instance)))
	L.SetField(messageTable, "get_msg", L.NewFunction(m.luaGetMsg(instance)))
	L.SetField(messageTable, "get_forward_msg", L.NewFunction(m.luaGetForwardMsg(instance)))
	L.SetField(messageTable, "voice_to_text", L.NewFunction(m.luaVoiceMsgToText(instance)))
	L.SetField(messageTable, "get_image", L.NewFunction(m.luaGetImage(instance)))
	L.SetField(messageTable, "get_msg_image", L.NewFunction(m.luaGetMsgImage(instance)))
	L.SetField(messageTable, "get_file", L.NewFunction(m.luaGetMsgFile(instance)))
	L.SetField(messageTable, "get_video", L.NewFunction(m.luaGetVideo(instance)))
	L.SetField(messageTable, "get_record", L.NewFunction(m.luaGetRecord(instance)))
	L.SetField(messageTable, "ocr_image", L.NewFunction(m.luaOcrImage(instance)))
	L.SetField(messageTable, "scan_qrcode", L.NewFunction(m.luaScanQRCode(instance)))
	L.SetField(messageTable, "image_has_qrcode", L.NewFunction(m.luaImageHasQRCode(instance)))
	L.SetField(messageTable, "image_count_qrcodes", L.NewFunction(m.luaImageCountQRCodes(instance)))
	L.SetField(messageTable, "image_get_qrcodes", L.NewFunction(m.luaImageGetQRCodes(instance)))
	L.SetField(messageTable, "delete_msg", L.NewFunction(m.luaDeleteMsg(instance)))
	L.SetField(messageTable, "set_essence", L.NewFunction(m.luaSetEssenceMsg(instance)))
	L.SetField(messageTable, "delete_essence_msg", L.NewFunction(m.luaDeleteEssenceMsg(instance)))
	L.SetField(messageTable, "get_essence_list", L.NewFunction(m.luaGetEssenceMsgList(instance)))
	L.SetField(messageTable, "check_url_safely", L.NewFunction(m.luaCheckUrlSafely(instance)))
	L.SetField(messageTable, "send_like", L.NewFunction(m.luaSendLike(instance)))
	L.SetField(messageTable, "send_group_image", L.NewFunction(m.luaSendGroupImage(instance)))
	L.SetField(messageTable, "send_private_image", L.NewFunction(m.luaSendPrivateImage(instance)))
	L.SetField(messageTable, "mark_msg_as_read", L.NewFunction(m.luaMarkMsgAsRead(instance)))
	L.SetField(messageTable, "forward_group_single_msg", L.NewFunction(m.luaForwardGroupSingleMsg(instance)))
	L.SetField(messageTable, "forward_friend_single_msg", L.NewFunction(m.luaForwardFriendSingleMsg(instance)))
	L.SetField(messageTable, "get_group_msg_history", L.NewFunction(m.luaGetGroupMsgHistory(instance)))
	L.SetField(messageTable, "get_friend_msg_history", L.NewFunction(m.luaGetFriendMsgHistory(instance)))
	L.SetField(messageTable, "set_msg_emoji_like", L.NewFunction(m.luaSetMsgEmojiLike(instance)))
	L.SetField(messageTable, "unset_msg_emoji_like", L.NewFunction(m.luaUnsetMsgEmojiLike(instance)))
	L.SetField(messageTable, "send_group_ai_record", L.NewFunction(m.luaSendGroupAIRecord(instance)))
	L.SetField(messageTable, "get_ai_characters", L.NewFunction(m.luaGetAICharacters(instance)))
	L.SetField(messageTable, "create_image_processor", L.NewFunction(m.luaCreateImageProcessor(instance)))
	L.SetField(messageTable, "send_poke", L.NewFunction(m.luaSendPoke(instance)))
	L.SetGlobal("message", messageTable)

	// 用户API
	userTable := L.NewTable()
	L.SetField(userTable, "get_info", L.NewFunction(m.luaGetUserInfo(instance)))
	L.SetField(userTable, "get_friends", L.NewFunction(m.luaGetFriends(instance)))
	L.SetField(userTable, "get_friend_list", L.NewFunction(m.luaGetFriends(instance))) // 别名，兼容Blockly
	L.SetField(userTable, "set_remark", L.NewFunction(m.luaSetFriendRemark(instance)))
	L.SetField(userTable, "poke", L.NewFunction(m.luaFriendPoke(instance)))
	L.SetField(userTable, "send_like", L.NewFunction(m.luaSendLike(instance)))
	L.SetField(userTable, "delete_friend", L.NewFunction(m.luaDeleteFriend(instance)))
	L.SetField(userTable, "get_friend_info", L.NewFunction(m.luaGetFriendInfo(instance)))
	L.SetField(userTable, "get_stranger_info", L.NewFunction(m.luaGetStrangerInfo(instance)))
	L.SetField(userTable, "upload_file", L.NewFunction(m.luaUploadPrivateFile(instance)))
	L.SetField(userTable, "set_qq_profile", L.NewFunction(m.luaSetQQProfile(instance)))
	L.SetGlobal("user", userTable)

	// 群组API
	groupTable := L.NewTable()
	L.SetField(groupTable, "get_list", L.NewFunction(m.luaGetGroupList(instance)))
	L.SetField(groupTable, "get_info", L.NewFunction(m.luaGetGroupInfo(instance)))
	L.SetField(groupTable, "get_members", L.NewFunction(m.luaGetGroupMembers(instance)))
	L.SetField(groupTable, "get_member_info", L.NewFunction(m.luaGetGroupMemberInfo(instance)))
	L.SetField(groupTable, "set_ban", L.NewFunction(m.luaSetGroupBan(instance)))
	L.SetField(groupTable, "set_whole_ban", L.NewFunction(m.luaSetGroupWholeBan(instance)))
	L.SetField(groupTable, "set_admin", L.NewFunction(m.luaSetGroupAdmin(instance)))
	L.SetField(groupTable, "set_card", L.NewFunction(m.luaSetGroupCard(instance)))
	L.SetField(groupTable, "kick", L.NewFunction(m.luaSetGroupKick(instance)))
	L.SetField(groupTable, "poke", L.NewFunction(m.luaGroupPoke(instance)))
	L.SetField(groupTable, "set_name", L.NewFunction(m.luaSetGroupName(instance)))
	L.SetField(groupTable, "set_special_title", L.NewFunction(m.luaSetGroupSpecialTitle(instance)))
	L.SetField(groupTable, "set_leave", L.NewFunction(m.luaSetGroupLeave(instance)))
	L.SetField(groupTable, "get_file_url", L.NewFunction(m.luaGetGroupFileUrl(instance)))
	L.SetField(groupTable, "get_file_system_info", L.NewFunction(m.luaGetGroupFileSystemInfo(instance)))
	L.SetField(groupTable, "get_root_files", L.NewFunction(m.luaGetGroupRootFiles(instance)))
	L.SetField(groupTable, "get_files_by_folder", L.NewFunction(m.luaGetGroupFilesByFolder(instance)))
	L.SetField(groupTable, "upload_file", L.NewFunction(m.luaUploadGroupFile(instance)))
	L.SetField(groupTable, "get_honor_info", L.NewFunction(m.luaGetGroupHonorInfo(instance)))
	L.SetGlobal("group", groupTable)

	// 存储API
	storageTable := L.NewTable()
	L.SetField(storageTable, "set", L.NewFunction(m.luaStorageSet(selfID, pluginName)))
	L.SetField(storageTable, "get", L.NewFunction(m.luaStorageGet(selfID, pluginName)))
	L.SetField(storageTable, "delete", L.NewFunction(m.luaStorageDelete(selfID, pluginName)))
	L.SetGlobal("storage", storageTable)

	// 文件操作API
	fileTable := L.NewTable()
	L.SetField(fileTable, "read", L.NewFunction(m.luaFileRead(selfID, pluginName)))
	L.SetField(fileTable, "write", L.NewFunction(m.luaFileWrite(selfID, pluginName)))
	L.SetField(fileTable, "delete", L.NewFunction(m.luaFileDelete(selfID, pluginName)))
	L.SetField(fileTable, "list", L.NewFunction(m.luaFileList(selfID, pluginName)))
	L.SetField(fileTable, "exists", L.NewFunction(m.luaFileExists(selfID, pluginName)))
	L.SetField(fileTable, "mkdir", L.NewFunction(m.luaFileMkdir(selfID, pluginName)))
	L.SetField(fileTable, "read_base64", L.NewFunction(m.luaFileReadBase64(selfID, pluginName)))
	L.SetField(fileTable, "write_base64", L.NewFunction(m.luaFileWriteBase64(selfID, pluginName)))
	// 群文件API
	L.SetField(fileTable, "delete_group_file", L.NewFunction(m.luaDeleteGroupFile(instance)))
	L.SetField(fileTable, "get_group_file_system_info", L.NewFunction(m.luaGetGroupFileSystemInfo(instance)))
	L.SetField(fileTable, "get_group_root_files", L.NewFunction(m.luaGetGroupRootFiles(instance)))
	L.SetField(fileTable, "get_group_files_by_folder", L.NewFunction(m.luaGetGroupFilesByFolder(instance)))
	L.SetField(fileTable, "create_group_file_folder", L.NewFunction(m.luaCreateGroupFileFolder(instance)))
	L.SetField(fileTable, "delete_group_folder", L.NewFunction(m.luaDeleteGroupFolder(instance)))
	L.SetField(fileTable, "move_group_file", L.NewFunction(m.luaMoveGroupFile(instance)))
	L.SetField(fileTable, "download_file", L.NewFunction(m.luaDownloadFile(instance)))
	L.SetField(fileTable, "rename_group_file", L.NewFunction(m.luaRenameGroupFile(instance)))
	L.SetField(fileTable, "reshare_flash_file", L.NewFunction(m.luaReshareFlashFile(instance)))
	L.SetGlobal("file", fileTable)

	// 网络请求API
	httpTable := L.NewTable()
	L.SetField(httpTable, "request", L.NewFunction(m.luaHttpRequest(selfID, pluginName)))
	L.SetField(httpTable, "download_base64", L.NewFunction(m.luaHttpDownloadBase64(pluginName)))
	L.SetField(httpTable, "get", L.NewFunction(m.luaHttpGet(pluginName)))
	L.SetField(httpTable, "post", L.NewFunction(m.luaHttpPost(pluginName)))
	L.SetGlobal("http", httpTable)

	requestTable := L.NewTable()
	L.SetField(requestTable, "approve_friend", L.NewFunction(m.luaApproveFriendAddRequest(instance)))
	L.SetField(requestTable, "approve_group", L.NewFunction(m.luaApproveGroupAddRequest(instance)))
	L.SetField(requestTable, "set_friend_add_request", L.NewFunction(m.luaSetFriendAddRequest(instance)))
	L.SetField(requestTable, "set_group_add_request", L.NewFunction(m.luaSetGroupAddRequest(instance)))
	L.SetField(requestTable, "get_doubt_friends", L.NewFunction(m.luaGetDoubtFriendsAddRequest(instance)))
	L.SetField(requestTable, "handle_doubt_friend", L.NewFunction(m.luaHandleDoubtFriendsAddRequest(instance)))
	L.SetGlobal("request", requestTable)

	networkTable := L.NewTable()
	L.SetField(networkTable, "udp_send", L.NewFunction(m.luaUdpSend(selfID, pluginName)))
	L.SetField(networkTable, "tcp_connect", L.NewFunction(m.luaTcpConnect(selfID, pluginName)))
	L.SetGlobal("network", networkTable)

	// 系统/时间API
	systemTable := L.NewTable()
	L.SetField(systemTable, "now", L.NewFunction(m.luaSystemNow()))
	L.SetField(systemTable, "status", L.NewFunction(m.luaSystemStatus(selfID)))
	L.SetField(systemTable, "get_cookies", L.NewFunction(m.luaSystemCookies()))
	L.SetField(systemTable, "call_api", L.NewFunction(m.luaSystemCallAPI(instance)))
	L.SetField(systemTable, "get_timestamp_seconds", L.NewFunction(m.luaGetTimestampSeconds()))
	L.SetField(systemTable, "get_timestamp_milliseconds", L.NewFunction(m.luaGetTimestampMilliseconds()))
	L.SetField(systemTable, "get_login_info", L.NewFunction(m.luaGetLoginInfo(instance)))
	L.SetField(systemTable, "get_version_info", L.NewFunction(m.luaGetVersionInfo(instance)))
	L.SetGlobal("system", systemTable)

	// 工具/编码API
	utilsTable := L.NewTable()
	L.SetField(utilsTable, "url_encode", L.NewFunction(m.luaURLEncode()))
	L.SetField(utilsTable, "url_decode", L.NewFunction(m.luaURLDecode()))
	L.SetField(utilsTable, "unicode_escape", L.NewFunction(m.luaUnicodeEscape()))
	L.SetField(utilsTable, "base64_encode", L.NewFunction(m.luaBase64Encode()))
	L.SetField(utilsTable, "base64_decode", L.NewFunction(m.luaBase64Decode()))
	L.SetField(utilsTable, "html_escape", L.NewFunction(m.luaHTMLEscape()))
	L.SetField(utilsTable, "html_unescape", L.NewFunction(m.luaHTMLUnescape()))
	L.SetGlobal("utils", utilsTable)

	// JSON解析API
	jsonTable := L.NewTable()
	L.SetField(jsonTable, "encode", L.NewFunction(m.luaJSONEncode))
	L.SetField(jsonTable, "decode", L.NewFunction(m.luaJSONDecode))
	L.SetField(jsonTable, "get", L.NewFunction(m.luaJSONGet))
	L.SetGlobal("json", jsonTable)

	// 表操作API
	tableTable := L.NewTable()
	L.SetField(tableTable, "get", L.NewFunction(m.luaTableGet))
	L.SetField(tableTable, "set", L.NewFunction(m.luaTableSet))
	L.SetGlobal("table_utils", tableTable)

	// 调度器API
	schedulerTable := L.NewTable()
	L.SetField(schedulerTable, "interval", L.NewFunction(m.luaScheduleInterval(instance)))
	L.SetField(schedulerTable, "daily", L.NewFunction(m.luaScheduleDaily(instance)))
	L.SetField(schedulerTable, "weekly", L.NewFunction(m.luaScheduleWeekly(instance)))
	L.SetField(schedulerTable, "monthly", L.NewFunction(m.luaScheduleMonthly(instance)))
	L.SetField(schedulerTable, "cancel", L.NewFunction(m.luaCancelSchedulerTask(instance)))
	L.SetField(schedulerTable, "pause", L.NewFunction(m.luaPauseSchedulerTask(instance)))
	L.SetField(schedulerTable, "resume", L.NewFunction(m.luaResumeSchedulerTask(instance)))
	L.SetField(schedulerTable, "get_status", L.NewFunction(m.luaGetSchedulerTaskStatus(instance)))
	L.SetField(schedulerTable, "list", L.NewFunction(m.luaListSchedulerTasks(instance)))
	L.SetGlobal("scheduler", schedulerTable)

	// 消息解析API
	msgTable := L.NewTable()
	L.SetField(msgTable, "is_at_bot", L.NewFunction(m.luaMsgIsAtBot()))
	L.SetField(msgTable, "get_plain_text", L.NewFunction(m.luaMsgGetPlainText()))
	L.SetField(msgTable, "contains_keyword", L.NewFunction(m.luaMsgContainsKeyword()))
	L.SetField(msgTable, "get_images", L.NewFunction(m.luaMsgGetImages()))
	L.SetField(msgTable, "get_at_users", L.NewFunction(m.luaMsgGetAtUsers()))
	L.SetField(msgTable, "has_image", L.NewFunction(m.luaMsgHasImage()))
	L.SetField(msgTable, "has_voice", L.NewFunction(m.luaMsgHasVoice()))
	L.SetField(msgTable, "get_reply_id", L.NewFunction(m.luaMsgGetReplyId()))
	// 新增：发送者角色相关
	L.SetField(msgTable, "get_sender_role", L.NewFunction(m.luaMsgGetSenderRole()))
	L.SetField(msgTable, "is_sender_owner", L.NewFunction(m.luaMsgIsSenderOwner()))
	L.SetField(msgTable, "is_sender_admin", L.NewFunction(m.luaMsgIsSenderAdmin()))
	L.SetField(msgTable, "is_sender_member", L.NewFunction(m.luaMsgIsSenderMember()))
	// 新增：回复消息相关
	L.SetField(msgTable, "has_reply", L.NewFunction(m.luaMsgHasReply()))
	// 新增：前端需要的msg.*函数
	L.SetField(msgTable, "is_group_message", L.NewFunction(m.luaMsgIsGroupMessage()))
	L.SetField(msgTable, "is_private_message", L.NewFunction(m.luaMsgIsPrivateMessage()))
	L.SetField(msgTable, "get_type", L.NewFunction(m.luaMsgGetType()))
	L.SetField(msgTable, "get_first_image", L.NewFunction(m.luaMsgGetFirstImage()))
	L.SetField(msgTable, "get_sender_id", L.NewFunction(m.luaMsgGetSenderId()))
	L.SetField(msgTable, "get_sender_nickname", L.NewFunction(m.luaMsgGetSenderNickname()))
	L.SetField(msgTable, "get_group_id", L.NewFunction(m.luaMsgGetGroupId()))
	L.SetField(msgTable, "get_time", L.NewFunction(m.luaMsgGetTime()))
	L.SetField(msgTable, "get_message_type", L.NewFunction(m.luaMsgGetMessageType()))
	L.SetField(msgTable, "has_video", L.NewFunction(m.luaMsgHasVideo()))
	L.SetField(msgTable, "has_face", L.NewFunction(m.luaMsgHasFace()))
	L.SetField(msgTable, "is_at_all", L.NewFunction(m.luaMsgIsAtAll()))
	L.SetField(msgTable, "has_url", L.NewFunction(m.luaMsgHasURL()))
	L.SetField(msgTable, "count_urls", L.NewFunction(m.luaMsgCountURLs()))
	L.SetField(msgTable, "get_urls", L.NewFunction(m.luaMsgGetURLs()))
	L.SetField(msgTable, "has_json", L.NewFunction(m.luaMsgHasJSON()))
	L.SetField(msgTable, "is_contact_card", L.NewFunction(m.luaMsgIsContactCard()))
	L.SetField(msgTable, "is_group_card", L.NewFunction(m.luaMsgIsGroupCard()))
	L.SetField(msgTable, "is_channel_card", L.NewFunction(m.luaMsgIsChannelCard()))
	L.SetField(msgTable, "get_json_data", L.NewFunction(m.luaMsgGetJSONData()))
	L.SetField(msgTable, "parse_card", L.NewFunction(m.luaMsgParseCard()))
	L.SetField(msgTable, "get_card_info", L.NewFunction(m.luaMsgGetCardInfo()))
	L.SetField(msgTable, "json_has_app", L.NewFunction(m.luaMsgJSONHasApp()))
	L.SetField(msgTable, "get_json_app_type", L.NewFunction(m.luaMsgGetJSONAppType()))
	L.SetField(msgTable, "get_json_field", L.NewFunction(m.luaMsgGetJSONField()))
	L.SetField(msgTable, "get_card_id_from_url", L.NewFunction(m.luaMsgGetCardIDFromURL()))
	L.SetField(msgTable, "parse_card_full", L.NewFunction(m.luaMsgParseCardFull()))
	L.SetGlobal("msg", msgTable)

	// 管理员验证API
	L.SetField(msgTable, "is_group_admin", L.NewFunction(m.luaIsGroupAdmin(instance)))

	// 事件注册API
	L.SetGlobal("on_message", L.NewFunction(m.luaOnMessage(instance)))
	L.SetGlobal("on_notice", L.NewFunction(m.luaOnNotice(instance)))
	L.SetGlobal("on_request", L.NewFunction(m.luaOnRequest(instance)))
	L.SetGlobal("on_message_sent", L.NewFunction(m.luaOnMessageSent(instance)))

	// 加载 Lua 运行时辅助库
	m.loadLuaRuntimeLibrary(L, instance)

	// HTTP接口API
	httpTable = L.NewTable()
	L.SetField(httpTable, "register", L.NewFunction(m.luaRegisterHTTPInterface(instance)))
	L.SetField(httpTable, "unregister", L.NewFunction(m.luaUnregisterHTTPInterface(instance)))
	L.SetGlobal("http_interface", httpTable)

	// 插件管理API（跨插件查看与配置读写删除）
	// 安全增强：save_config, delete_config, json_read, json_save, json_delete 现在只操作当前插件
	pluginsTable := L.NewTable()
	L.SetField(pluginsTable, "list", L.NewFunction(m.luaPluginsList(selfID)))
	L.SetField(pluginsTable, "status", L.NewFunction(m.luaPluginsStatus(selfID)))
	L.SetField(pluginsTable, "get_config", L.NewFunction(m.luaPluginsGetConfig(selfID)))
	L.SetField(pluginsTable, "save_config", L.NewFunction(m.luaPluginsSaveConfig(selfID, instance.Name)))
	L.SetField(pluginsTable, "delete_config", L.NewFunction(m.luaPluginsDeleteConfig(selfID, instance.Name)))
	// 任意JSON文件（限制在当前插件目录内）
	L.SetField(pluginsTable, "json_read", L.NewFunction(m.luaPluginsReadJson(selfID, instance.Name)))
	L.SetField(pluginsTable, "json_save", L.NewFunction(m.luaPluginsSaveJson(selfID, instance.Name)))
	L.SetField(pluginsTable, "json_delete", L.NewFunction(m.luaPluginsDeleteJson(selfID, instance.Name)))
	L.SetGlobal("plugins", pluginsTable)

	// 机器人管理API
	botTable := L.NewTable()
	L.SetField(botTable, "get_list", L.NewFunction(m.luaGetBots()))
	L.SetField(botTable, "get_info", L.NewFunction(m.luaGetBotInfo()))
	L.SetField(botTable, "get_count", L.NewFunction(m.luaGetBotCount()))
	L.SetField(botTable, "is_online", L.NewFunction(m.luaIsBotOnline(instance)))
	L.SetField(botTable, "disconnect", L.NewFunction(m.luaDisconnectBot()))
	L.SetField(botTable, "get_status", L.NewFunction(m.luaGetBotStatus(instance)))
	L.SetField(botTable, "get_version", L.NewFunction(m.luaGetVersionInfo(instance)))
	L.SetGlobal("bot", botTable)

	// 当前插件管理API
	pluginTable := L.NewTable()
	L.SetField(pluginTable, "name", lua.LString(pluginName))
	L.SetField(pluginTable, "self_id", lua.LString(selfID))
	L.SetField(pluginTable, "reload", L.NewFunction(m.luaReloadPlugin(instance)))
	L.SetField(pluginTable, "reload_self", L.NewFunction(m.luaReloadPlugin(instance)))
	L.SetField(pluginTable, "stop", L.NewFunction(m.luaStopPlugin(instance)))
	L.SetField(pluginTable, "stop_self", L.NewFunction(m.luaStopPlugin(instance)))
	L.SetField(pluginTable, "unload_self", L.NewFunction(m.luaUnloadSelf(instance)))
	L.SetGlobal("plugin", pluginTable)

	// 自定义API请求
	apiTable := L.NewTable()
	L.SetField(apiTable, "call", L.NewFunction(m.luaSendCustomAPI(instance)))
	L.SetGlobal("api", apiTable)

	// 插件间通信API
	pluginCommTable := L.NewTable()
	L.SetField(pluginCommTable, "connect", L.NewFunction(m.luaConnectToPlugin(instance)))
	L.SetField(pluginCommTable, "accept", L.NewFunction(m.luaAcceptPluginConnection(instance)))
	L.SetField(pluginCommTable, "reject", L.NewFunction(m.luaRejectPluginConnection(instance)))
	L.SetField(pluginCommTable, "send", L.NewFunction(m.luaSendToPlugin(instance)))
	L.SetField(pluginCommTable, "receive", L.NewFunction(m.luaReceiveFromPlugin(instance)))
	L.SetField(pluginCommTable, "get_pending", L.NewFunction(m.luaGetPendingConnections(instance)))
	L.SetField(pluginCommTable, "close", L.NewFunction(m.luaClosePluginConnection(instance)))
	L.SetGlobal("plugin_comm", pluginCommTable)

	// 插件RPC API（声明事件/调用函数/返回函数）
	rpcTable := L.NewTable()
	L.SetField(rpcTable, "declare_event", L.NewFunction(m.luaDeclareEvent(instance)))
	L.SetField(rpcTable, "call_function", L.NewFunction(m.luaCallFunction(instance)))
	L.SetField(rpcTable, "return_function", L.NewFunction(m.luaReturnFunction(instance)))
	L.SetGlobal("plugin_rpc", rpcTable)

	// 事件监听API
	L.SetGlobal("on_bot_status_change", L.NewFunction(m.luaOnBotStatusChange(instance)))
}

// registerEventHandlers 注册事件处理器
func (m *Manager) registerEventHandlers(instance *LuaPluginInstance) {
	if instance.L == nil {
		m.logger.Errorw("无法注册事件处理器：Lua状态机为空",
			"plugin", instance.Name,
			"self_id", instance.SelfID)
		return
	}
	L := instance.L

	// 检查是否定义了事件处理器（已在registerAPI中注册）
	_ = L
}

// callInitFunction 调用初始化函数
func (m *Manager) callInitFunction(instance *LuaPluginInstance) error {
	if instance.L == nil {
		m.logger.Errorw("无法调用初始化函数：Lua状态机为空",
			"plugin", instance.Name,
			"self_id", instance.SelfID)
		return errors.New("Lua状态机为空")
	}
	L := instance.L
	fn := L.GetGlobal("on_init")
	if fn == lua.LNil || fn.Type() != lua.LTFunction {
		return nil // 没有初始化函数，不是错误
	}

	// 安全检查 fn 类型
	fnVal, ok := fn.(*lua.LFunction)
	if !ok {
		m.logger.Warnw("on_init 不是有效的函数类型", "plugin", instance.Name)
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	done := make(chan error, 1)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				m.logger.Errorw("初始化函数panic",
					"plugin", instance.Name,
					"error", r)
				done <- fmt.Errorf("初始化函数panic: %v", r)
			}
		}()
		
		// 重置沙箱状态，准备执行初始化函数
		if instance.sandbox != nil {
			instance.sandbox.Reset()
		}
		
		L.Push(fnVal)
		if err := L.PCall(0, 0, nil); err != nil {
			done <- err
			return
		}
		done <- nil
	}()

	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		return errors.New("初始化函数执行超时")
	}
}

// UnloadLuaPlugin 卸载指定账号的Lua插件
func (m *Manager) UnloadLuaPlugin(selfID string, name string) error {
	runtime.GC()
	var memBeforeUnload uint64
	{
		var ms runtime.MemStats
		runtime.ReadMemStats(&ms)
		memBeforeUnload = ms.HeapAlloc
	}
	unloadSnap := func(step string) {
		runtime.GC()
		var ms runtime.MemStats
		runtime.ReadMemStats(&ms)
		delta := int64(ms.HeapAlloc) - int64(memBeforeUnload)
		m.logger.Infow("[MEM-PROFILE] 插件卸载步骤",
			"plugin", name, "self_id", selfID,
			"step", step,
			"heap_alloc_mb", fmt.Sprintf("%.2f", float64(ms.HeapAlloc)/1024/1024),
			"heap_sys_mb", fmt.Sprintf("%.2f", float64(ms.HeapSys)/1024/1024),
			"delta_mb", fmt.Sprintf("%.2f", float64(delta)/1024/1024),
		)
	}
	unloadSnap("start")

	if selfID == "" {
		return errors.New("必须指定账号ID")
	}

	container := m.getContainer(selfID)
	if container == nil {
		return errors.New("账号容器不存在")
	}

	container.mu.Lock()
	instance, exists := container.LuaPlugins[name]
	if !exists {
		container.mu.Unlock()
		return errors.New("插件未在该账号中运行")
	}

	// 标记为正在卸载，阻止新的事件处理器启动
	instance.unloadingMu.Lock()
	instance.unloading = true
	instance.unloadingMu.Unlock()

	// 从map中移除，防止新事件被分发到此插件
	delete(container.LuaPlugins, name)
	container.mu.Unlock()

	// 等待所有正在执行的事件处理器完成（最多等待5秒）
	done := make(chan bool, 1)
	go func() {
		instance.wg.Wait()
		done <- true
	}()

	select {
	case <-done:
		// 所有事件处理器已完成
	case <-time.After(5 * time.Second):
		// 超时，强制继续
		m.logger.Warnw("等待插件事件处理器完成超时，强制卸载", "self_id", selfID, "name", name)
	}

	atomic.StoreInt32(&instance.luaCorrupted, 1)
	instance.corruptReason = "插件已卸载"

	// 调用清理函数（在确保没有代码在执行后）
	m.callDestroyFunction(instance)
	unloadSnap("after_on_destroy")

	// 取消该插件的所有定时任务（必须在 L.Close() 之前）
	if m.timerSystem != nil {
		m.timerSystem.CancelPluginTasks(fmt.Sprintf("%s/%s", selfID, name))
	}

	// 取消该插件的调度器任务（必须在 L.Close() 之前）
	if m.schedulerManager != nil {
		m.schedulerManager.CancelPluginTasks(fmt.Sprintf("%s/%s", selfID, name))
	}

	// 清理调度器回调函数引用，防止Lua LFunction对象阻止GC回收
	instance.mu.Lock()
	instance.schedulerCallbacks = nil
	instance.EventHandlers = nil
	instance.mu.Unlock()

	// 彻底清理调度器相关的所有引用（在 L.Close() 之前）
	if m.schedulerManager != nil {
		m.schedulerManager.CleanupPluginReferences(selfID, name)
	}

	unloadSnap("after_ref_cleanup")

	// 在关闭前清理全局表中的插件数据，减少allocator保留的内存
	if instance.L != nil {
		func() {
			defer func() { recover() }()
			instance.L.SetGlobal("_G", lua.LNil)
			instance.L.DoString(`
				for k in pairs(_G) do
					_G[k] = nil
				end
				_G = nil
			`)
		}()
	}

	// 清理该插件注册的所有HTTP接口处理器
	if m.httpInterfaceManager != nil {
		m.httpInterfaceManager.UnregisterPluginHandlers(fmt.Sprintf("%s/%s", selfID, name))
	}

	// 关闭Lua状态机（只调用一次）
	if instance.L != nil {
		instance.L.Close()
	}
	instance.L = nil // 明确释放引用，帮助GC
	unloadSnap("after_L.Close")

	// 第一阶段GC：回收Lua状态机相关的对象
	runtime.GC()
	unloadSnap("after_phase1_gc")

	// 清理图像处理器资源，防止内存泄漏
	instance.imageProcessorMu.Lock()
	processorCount := len(instance.imageProcessors)
	if processorCount > 0 {
		m.logger.Debugw("清理图像处理器", "self_id", selfID, "plugin", name, "processor_count", processorCount)
	}
	instance.imageProcessors = nil
	instance.imageProcessorMu.Unlock()

	// 清理插件的所有RPC处理器
	prm := GetPluginRPCManager(m.logger)
	prm.UnregisterAllPluginHandlers(selfID, name)

	// 第二阶段GC：回收所有被延迟释放的对象
	runtime.GC()
	runtime.GC()
	unloadSnap("after_phase2_gc")

	// 第三阶段GC：在LState关闭后再次GC，确保所有Lua对象被回收
	runtime.GC()
	runtime.GC()
	unloadSnap("after_phase3_gc")

	// 强制将内存归还OS
	debug.FreeOSMemory()
	unloadSnap("after_FreeOSMemory")

	// 第四阶段GC：最终清理
	runtime.GC()
	debug.FreeOSMemory()
	unloadSnap("after_final_cleanup")

	// 清理沙箱引用，打破循环引用，帮助GC回收
	if instance.sandbox != nil {
		instance.sandbox.instance = nil
	}
	instance.sandbox = nil

	m.logger.Infow("Lua插件已卸载", "self_id", selfID, "name", name)
	return nil
}

// callDestroyFunction 调用清理函数
func (m *Manager) callDestroyFunction(instance *LuaPluginInstance) {
	if instance.L == nil {
		m.logger.Warnw("无法调用清理函数：Lua状态机为空，跳过",
			"plugin", instance.Name,
			"self_id", instance.SelfID)
		return
	}
	L := instance.L
	fn := L.GetGlobal("on_destroy")
	if fn == lua.LNil || fn.Type() != lua.LTFunction {
		return // 没有清理函数，不是错误
	}

	// 安全检查 fn 类型
	fnVal, ok := fn.(*lua.LFunction)
	if !ok {
		m.logger.Warnw("on_destroy 不是有效的函数类型", "plugin", instance.Name)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	done := make(chan bool, 1)
	go func() {
		defer func() {
			// 捕获panic，防止崩溃
			if r := recover(); r != nil {
				m.logger.Errorw("清理函数panic",
					"plugin", instance.Name,
					"error", r)
			}
			done <- true
		}()

		instance.mu.Lock()
		defer instance.mu.Unlock()

		L.Push(fnVal)
		_ = L.PCall(0, 0, nil) // 忽略错误
	}()

	select {
	case <-done:
		return
	case <-ctx.Done():
		m.logger.Warnw("清理函数执行超时", "name", instance.Name)
		return
	}
}

// getEventPriority 根据事件类型获取优先级
func (m *Manager) getEventPriority(eventType string, eventData map[string]interface{}) EventPriority {
	// 元事件（连接、心跳等）- 最高优先级
	if postType, ok := eventData["post_type"].(string); ok && postType == "meta_event" {
		return PriorityCritical
	}

	// 通知事件 - 高优先级
	if eventType == "notice" {
		return PriorityHigh
	}

	// 请求事件 - 高优先级
	if eventType == "request" {
		return PriorityHigh
	}

	// 消息事件 - 普通优先级
	if eventType == "message" || eventType == "message_sent" {
		return PriorityNormal
	}

	// 其他事件 - 低优先级
	return PriorityLow
}

// HandleEvent 处理事件 - 分发给对应账号的所有插件
// 优化：添加过载保护和系统负载感知
func (m *Manager) HandleEvent(eventType string, eventData map[string]interface{}) {
	// 从事件数据中获取self_id
	selfID, ok := eventData["self_id"].(string)
	if !ok {
		// 尝试从其他字段获取
		if id, ok := eventData["_self_id"].(string); ok {
			selfID = id
		} else {
			m.logger.Warnw("无法从事件数据中获取self_id，无法分发事件", "event_type", eventType)
			return
		}
	}

	container := m.getContainer(selfID)
	if container == nil {
		// 该账号没有运行中的插件
		return
	}

	// 获取事件优先级
	priority := m.getEventPriority(eventType, eventData)

	// ========== 过载保护：检查系统负载 ==========
	m.loadMu.RLock()
	systemLoad := m.systemLoad
	m.loadMu.RUnlock()

	// 如果系统负载超过阈值（0.9），丢弃低优先级事件
	if systemLoad > 0.9 && priority <= PriorityNormal {
		atomic.AddInt64(&m.droppedEvents, 1)
		m.logger.Warnw("系统过载，丢弃低优先级事件",
			"self_id", selfID,
			"event", eventType,
			"priority", priority,
			"systemLoad", fmt.Sprintf("%.2f", systemLoad),
			"droppedTotal", atomic.LoadInt64(&m.droppedEvents))
		return
	}

	// 如果系统负载较高（0.7-0.9），只处理高优先级事件
	if systemLoad > 0.7 && priority == PriorityLow {
		atomic.AddInt64(&m.droppedEvents, 1)
		m.logger.Debugw("系统负载较高，丢弃低优先级事件",
			"self_id", selfID,
			"event", eventType,
			"systemLoad", fmt.Sprintf("%.2f", systemLoad))
		return
	}

	container.mu.RLock()
	// 优化：先复制插件列表，减少读锁持有时间，避免阻塞加载/卸载操作
	type pluginEntry struct {
		instance   *LuaPluginInstance
		handler    *lua.LFunction
		pluginName string
	}
	plugins := make([]pluginEntry, 0, len(container.LuaPlugins))
	for name, instance := range container.LuaPlugins {
		handler, exists := instance.EventHandlers[eventType]
		if !exists {
			continue
		}

		// 检查是否需要过滤此事件（在持锁期间快速检查）
		if !m.shouldProcessEvent(instance, eventData) {
			continue
		}

		plugins = append(plugins, pluginEntry{
			instance:   instance,
			handler:    handler,
			pluginName: name,
		})
	}
	container.mu.RUnlock()

	// 优化：在无锁状态下执行入队操作，避免阻塞其他goroutine
	for _, entry := range plugins {
		task := pluginEventTask{
			instance:    entry.instance,
			handler:     entry.handler,
			pluginName:  entry.pluginName,
			eventType:   eventType,
			eventData:   eventData,
			priority:    priority,
			enqueueTime: time.Now(),
		}

		// 将任务放入优先级队列
		if m.priorityQueue.Push(task) {
			atomic.AddInt64(&m.queuedEvents, 1)
			// 优化：通知等待中的worker（使用channel，绝对安全）
			select {
			case m.taskAvailable <- struct{}{}:
				// 成功发送通知
			default:
				// 通道已满（已有待处理通知），忽略（不影响正确性）
			}
		} else {
			atomic.AddInt64(&m.droppedEvents, 1)
			m.logger.Warnw("插件事件队列已满，丢弃事件",
				"self_id", selfID,
				"plugin", entry.pluginName,
				"event", eventType,
				"priority", priority,
				"queueSize", m.queueSize,
				"droppedTotal", atomic.LoadInt64(&m.droppedEvents))
		}
	}
}

// callEventHandler 调用事件处理器
// 优化：减少锁持有时间，将锁从整个执行过程缩小到仅保护关键状态检查
// remainingTimeout: 剩余执行超时时间（总超时 - 已排队时间），如果 <= 0 则立即返回错误
func (m *Manager) callEventHandler(instance *LuaPluginInstance, handler *lua.LFunction, eventType string, eventData map[string]interface{}, remainingTimeout time.Duration) error {
	// ⭐ 快速失败：如果剩余执行时间已经不足，直接返回（避免无效等待）
	if remainingTimeout <= 0 {
		m.logger.Debugw("事件已超时，跳过执行",
			"plugin", instance.Name,
			"self_id", instance.SelfID,
			"event", eventType,
			"remainingTimeout", "0s")
		return errors.New("事件已超时")
	}

	// 快速路径：检查沙箱是否已被停止（无锁）
	if instance.sandbox != nil && instance.sandbox.IsHalted() {
		m.logger.Errorw("插件已被安全机制终止，跳过事件处理",
			"plugin", instance.Name,
			"self_id", instance.SelfID)
		return errors.New("插件已被安全机制终止")
	}

	// 快速路径：检查是否正在卸载（读锁，尽快释放）
	instance.unloadingMu.RLock()
	if instance.unloading {
		instance.unloadingMu.RUnlock()
		return errors.New("插件正在卸载")
	}
	instance.unloadingMu.RUnlock()

	// 更新统计信息
	atomic.AddInt64(&instance.eventCount, 1)
	instance.lastEventTime = time.Now()

	// 设置反向WebSocket服务
	instance.reverseWS = m.reverseWS

	// ⭐ 使用传入的剩余执行超时时间（已扣除排队等待时间）
	execTimeout := remainingTimeout
	if execTimeout <= 0 {
		execTimeout = 1 * time.Second // 最小保护值，防止立即超时
	}
	ctx, cancel := context.WithTimeout(context.Background(), execTimeout)
	defer cancel()

	done := make(chan error, 1)
	go func() {
		defer func() {
			// 捕获panic，防止崩溃
			if r := recover(); r != nil {
				stack := make([]byte, 4096)
				n := runtime.Stack(stack, false)
				atomic.AddInt64(&instance.errorCount, 1)

				// ⭐ 关键修复：标记LState为损坏状态，阻止后续使用
				atomic.StoreInt32(&instance.luaCorrupted, 1)
				instance.corruptReason = fmt.Sprintf("%v", r)

				m.logger.Errorw("事件处理器panic - LState已标记为损坏",
					"plugin", instance.Name,
					"self_id", instance.SelfID,
					"error", r,
					"stack", string(stack[:n]),
					"action", "后续事件将被跳过直到插件重载")
				m.addPluginLog(instance.SelfID, instance.Name, "ERROR", fmt.Sprintf("panic: %v (LState已损坏)", r))
				done <- fmt.Errorf("事件处理器panic: %v (LState已损坏)", r)
			}
		}()

		// ⭐ 关键修复：获取执行锁，确保Lua状态机串行化访问
		// gopher-lua的LState不是线程安全的，必须保证同一时刻只有一个goroutine在操作
		instance.execMu.Lock()
		defer instance.execMu.Unlock()

		// ⭐ 关键修复：先检查卸载状态，再增加等待组计数
		// 防止在UnloadLuaPlugin调用wg.Wait()之后才调用wg.Add(1)导致的panic
		instance.unloadingMu.RLock()
		unloading := instance.unloading
		instance.unloadingMu.RUnlock()

		if unloading {
			done <- errors.New("插件正在卸载")
			return
		}

		// 在确认未卸载后，安全地增加等待组计数
		instance.wg.Add(1)
		defer instance.wg.Done()

		// 优化：缩小mu锁的范围 - 只在状态检查时持锁
		instance.mu.Lock()

		// 检查沙箱状态
		if instance.sandbox != nil && instance.sandbox.IsHalted() {
			instance.mu.Unlock()
			done <- errors.New("插件已被安全机制终止")
			return
		}

		// ⭐ 关键检查：LState是否已损坏（上次panic后标记）
		if atomic.LoadInt32(&instance.luaCorrupted) == 1 {
			instance.mu.Unlock()
			m.logger.Warnw("LState已损坏，跳过事件处理 - 需要重载插件恢复",
				"plugin", instance.Name,
				"self_id", instance.SelfID,
				"corruptReason", instance.corruptReason,
				"action", "请通过管理界面或API重载此插件")
			done <- errors.New(fmt.Sprintf("LState已损坏: %s (需要重载插件)", instance.corruptReason))
			return
		}

		// 重置沙箱状态，准备新的执行
		if instance.sandbox != nil {
			instance.sandbox.Reset()
		}

		// 记录开始时间（用于CPU时间统计）
		startTime := time.Now()

		L := instance.L
		if L == nil {
			instance.mu.Unlock()
			m.logger.Errorw("Lua状态机为空，无法执行事件处理器",
				"plugin", instance.Name,
				"self_id", instance.SelfID)
			done <- errors.New("Lua状态机为空")
			return
		}
		L.Push(handler)

		// 释放mu锁（状态检查完成），但保持execMu锁（保护Lua执行）
		instance.mu.Unlock()

		// Process CQ codes in the event data（在execMu锁保护下执行）
		processedEventData := m.processCQCodes(eventData)

		// 将eventData直接转换为Lua表传递（保持JSON数据结构，无需序列化/反序列化）
		luaEventTable := m.convertToLuaTable(L, processedEventData)
		L.Push(luaEventTable)

		// 设置全局变量 __blc_var___ 供插件内的函数使用
		L.SetGlobal("__blc_var___", luaEventTable)

		if err := L.PCall(1, 0, nil); err != nil {
			atomic.AddInt64(&instance.errorCount, 1)
			m.logger.Errorw("Lua脚本执行错误",
				"plugin", instance.Name,
					"self_id", instance.SelfID,
				"error", err)
			done <- fmt.Errorf("Lua脚本执行错误: %w", err)
			return
		}

		L.SetGlobal("__blc_var___", lua.LNil)

		elapsed := time.Since(startTime).Nanoseconds()
		atomic.AddInt64(&instance.cpuTime, elapsed)

		done <- nil
	}()

	select {
	case err := <-done:
		if err != nil {
			atomic.AddInt64(&instance.errorCount, 1)
		}
		return err
	case <-ctx.Done():
		atomic.AddInt64(&instance.errorCount, 1)
		m.logger.Warnw("事件处理超时",
			"plugin", instance.Name,
			"self_id", instance.SelfID,
			"timeout", ctx.Err().Error())
		return errors.New("事件处理超时")
	}
}

// GetLuaPluginStatus 获取Lua插件状态
func (m *Manager) GetLuaPluginStatus(selfID string, name string) (map[string]interface{}, error) {
	if selfID == "" {
		return nil, errors.New("必须指定账号ID")
	}

	container := m.getContainer(selfID)
	if container == nil {
		return map[string]interface{}{
			"running": false,
		}, nil
	}

	container.mu.RLock()
	instance, exists := container.LuaPlugins[name]
	container.mu.RUnlock()

	if !exists {
		return map[string]interface{}{
			"running": false,
		}, nil
	}

	instance.logMu.Lock()
	logs := make([]string, len(instance.Logs))
	copy(logs, instance.Logs)
	instance.logMu.Unlock()

	uptime := time.Since(instance.StartTime)
	eventCount := atomic.LoadInt64(&instance.eventCount)
	errorCount := atomic.LoadInt64(&instance.errorCount)
	cpuTime := atomic.LoadInt64(&instance.cpuTime)
	
	// 获取沙箱状态
	sandboxHalted := false
	stackDepth := int64(0)
	if instance.sandbox != nil {
		sandboxHalted = instance.sandbox.IsHalted()
		stackDepth = instance.sandbox.GetCurrentStackDepth()
	}

	return map[string]interface{}{
		"running":       true,
		"self_id":       selfID,
		"uptime":        uptime.String(),
		"config":        instance.Config,
		"logs":          logs,
		"eventCount":    eventCount,
		"errorCount":    errorCount,
		"lastEventTime": instance.lastEventTime.Format("2006-01-02 15:04:05"),
		"errorRate":     calculateErrorRate(eventCount, errorCount),
		// 性能数据
		"cpuTime":       cpuTime,
		"cpuTimeMs":     cpuTime / 1000000, // 转换为毫秒
		// 安全状态
		"sandboxHalted": sandboxHalted,
		"stackDepth":    stackDepth,
	}, nil
}

// calculateErrorRate 计算错误率
func calculateErrorRate(eventCount, errorCount int64) float64 {
	if eventCount == 0 {
		return 0.0
	}
	return float64(errorCount) / float64(eventCount) * 100
}

// GetLuaPluginLogs 获取Lua插件日志
func (m *Manager) GetLuaPluginLogs(selfID string, name string, limit int) ([]string, error) {
	if selfID == "" {
		return nil, errors.New("必须指定账号ID")
	}

	container := m.getContainer(selfID)
	if container == nil {
		return nil, errors.New("账号容器不存在")
	}

	container.mu.RLock()
	instance, exists := container.LuaPlugins[name]
	container.mu.RUnlock()

	if !exists {
		return nil, errors.New("插件未运行")
	}

	instance.logMu.Lock()
	defer instance.logMu.Unlock()

	logs := instance.Logs
	if limit > 0 && limit < len(logs) {
		logs = logs[len(logs)-limit:]
	}

	result := make([]string, len(logs))
	copy(result, logs)
	return result, nil
}

// addPluginLog 添加插件日志（实例方法版本）
func (instance *LuaPluginInstance) addPluginLog(level string, message string) {
	timestamp := time.Now().Format("15:04:05")
	logEntry := fmt.Sprintf("[%s] [%s] %s", timestamp, level, message)

	instance.logMu.Lock()
	defer instance.logMu.Unlock()
	instance.Logs = append(instance.Logs, logEntry)

	if len(instance.Logs) > 1000 {
		newLogs := make([]string, 0, 1000)
		newLogs = append(newLogs, instance.Logs[len(instance.Logs)-1000:]...)
		instance.Logs = newLogs
	}
}

// getLastLogs 获取最后N条日志
func (instance *LuaPluginInstance) getLastLogs(n int) []string {
	instance.logMu.Lock()
	defer instance.logMu.Unlock()

	if n <= 0 || len(instance.Logs) == 0 {
		return []string{}
	}

	if n > len(instance.Logs) {
		n = len(instance.Logs)
	}

	result := make([]string, n)
	copy(result, instance.Logs[len(instance.Logs)-n:])
	return result
}

// addPluginLog 添加插件日志（Manager方法版本）
func (m *Manager) addPluginLog(selfID string, pluginName string, level string, message string) {
	container := m.getContainer(selfID)
	if container == nil {
		return
	}

	container.mu.RLock()
	instance, exists := container.LuaPlugins[pluginName]
	container.mu.RUnlock()

	if !exists {
		return
	}

	timestamp := time.Now().Format("15:04:05")
	logEntry := fmt.Sprintf("[%s] [%s] %s", timestamp, level, message)

	instance.logMu.Lock()
	instance.Logs = append(instance.Logs, logEntry)

	if len(instance.Logs) > 1000 {
		newLogs := make([]string, 0, 1000)
		newLogs = append(newLogs, instance.Logs[len(instance.Logs)-1000:]...)
		instance.Logs = newLogs
	}
	instance.logMu.Unlock()

	// 写入日志文件
	if m.reverseWS != nil && m.reverseWS.GetLogManager() != nil {
		m.reverseWS.GetLogManager().WritePluginLog(selfID, pluginName, level, message)
	}
}

// GetRunningLuaPlugins 获取指定账号所有运行中的Lua插件
func (m *Manager) GetRunningLuaPlugins(selfID string) []string {
	if selfID == "" {
		return []string{}
	}

	container := m.getContainer(selfID)
	if container == nil {
		return []string{}
	}

	container.mu.RLock()
	defer container.mu.RUnlock()

	names := make([]string, 0, len(container.LuaPlugins))
	for name := range container.LuaPlugins {
		names = append(names, name)
	}
	return names
}

// GetRunningPlugins 获取所有运行中的插件（兼容旧接口）
func (m *Manager) GetRunningPlugins(selfID string) []string {
	return m.GetRunningLuaPlugins(selfID)
}

// GetStatus 获取插件状态（兼容旧接口）
func (m *Manager) GetStatus(selfID string, name string) (map[string]interface{}, error) {
	return m.GetLuaPluginStatus(selfID, name)
}

// Load 加载插件（兼容旧接口，需要指定self_id）
func (m *Manager) Load(selfID string, name string) error {
	return m.LoadLuaPlugin(selfID, name)
}

// Unload 卸载插件（兼容旧接口，需要指定self_id）
func (m *Manager) Unload(selfID string, name string) error {
	return m.UnloadLuaPlugin(selfID, name)
}

// GetAllPlugins 获取所有插件信息（包括运行状态）
// 如果指定了selfID，则只返回该账号的插件
func (m *Manager) GetAllPlugins(selfID string) ([]map[string]interface{}, error) {
	// 重新扫描插件
	plugins, err := m.ScanPlugins(selfID)
	if err != nil {
		return nil, err
	}

	// 构建结果
	result := make([]map[string]interface{}, len(plugins))
	for i, info := range plugins {
		// 检查该插件是否在运行
		isRunning := false
		container := m.getContainer(selfID)
		if container != nil {
			container.mu.RLock()
			_, isRunning = container.LuaPlugins[info.Name]
			container.mu.RUnlock()
		}

		result[i] = map[string]interface{}{
			"name":     info.Name,
			"self_id":  selfID,
			"lang":     info.Lang,
			"entry":    info.Entry,
			"path":     info.Path,
			"config":   info.Config,
			"running":  isRunning,
			"enabled":  info.Enabled,
			"version":  info.Version,
			"remark":   info.Remark,
		}
	}

	return result, nil
}

// GetPluginConfig 获取插件配置文件内容
func (m *Manager) GetPluginConfig(selfID string, name string) (map[string]interface{}, error) {
	if selfID == "" {
		return nil, errors.New("必须指定账号ID")
	}

	// 重新扫描插件以获取最新信息
	plugins, err := m.scanAccountPlugins(selfID)
	if err != nil {
		return nil, fmt.Errorf("扫描插件失败: %w", err)
	}

	var pluginInfo *PluginInfo
	for _, p := range plugins {
		if p.Name == name {
			pluginInfo = p
			break
		}
	}

	if pluginInfo == nil {
		return nil, fmt.Errorf("插件不存在: %s (账号: %s)", name, selfID)
	}

	// 读取配置文件
	config := make(map[string]interface{})
	if pluginInfo.ConfigPath != "" {
		if content, err := os.ReadFile(pluginInfo.ConfigPath); err == nil {
			if err := json.Unmarshal(content, &config); err != nil {
				return nil, fmt.Errorf("解析配置文件失败: %w", err)
			}
		} else if !os.IsNotExist(err) {
			return nil, fmt.Errorf("读取配置文件失败: %w", err)
		}
	}

	return config, nil
}

// SavePluginConfig 保存插件配置文件
func (m *Manager) SavePluginConfig(selfID string, name string, config map[string]interface{}) error {
	if selfID == "" {
		return errors.New("必须指定账号ID")
	}

	// 重新扫描插件以获取最新信息
	plugins, err := m.scanAccountPlugins(selfID)
	if err != nil {
		return fmt.Errorf("扫描插件失败: %w", err)
	}

	var pluginInfo *PluginInfo
	for _, p := range plugins {
		if p.Name == name {
			pluginInfo = p
			break
		}
	}

	if pluginInfo == nil {
		return fmt.Errorf("插件不存在: %s (账号: %s)", name, selfID)
	}

	// 确定配置文件路径
	configPath := pluginInfo.ConfigPath
	if configPath == "" {
		configPath = filepath.Join(pluginInfo.Path, "config.json")
	}

	// 将配置序列化为JSON（带缩进）
	content, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化配置失败: %w", err)
	}

	// 确保插件目录存在
	if err := os.MkdirAll(pluginInfo.Path, 0755); err != nil {
		return fmt.Errorf("创建插件目录失败: %w", err)
	}

	// 写入配置文件
	if err := os.WriteFile(configPath, content, 0644); err != nil {
		return fmt.Errorf("写入配置文件失败: %w", err)
	}

	// 更新内存中的配置信息
	pluginInfo.Config = config
	pluginInfo.ConfigPath = configPath

	// 如果插件正在运行，更新运行实例的配置
	container := m.getContainer(selfID)
	if container != nil {
		container.mu.RLock()
		instance, exists := container.LuaPlugins[name]
		container.mu.RUnlock()

		if exists {
			instance.mu.Lock()
			instance.Config = config
			instance.mu.Unlock()
		}
	}

	return nil
}

// DeletePluginConfig 删除插件配置文件（config.json）
func (m *Manager) DeletePluginConfig(selfID string, name string) error {
	if selfID == "" {
		return errors.New("必须指定账号ID")
	}

	// 重新扫描插件以获取最新信息
	plugins, err := m.scanAccountPlugins(selfID)
	if err != nil {
		return fmt.Errorf("扫描插件失败: %w", err)
	}

	var pluginInfo *PluginInfo
	for _, p := range plugins {
		if p.Name == name {
			pluginInfo = p
			break
		}
	}

	if pluginInfo == nil {
		return fmt.Errorf("插件不存在: %s (账号: %s)", name, selfID)
	}

	// 配置文件路径
	configPath := pluginInfo.ConfigPath
	if configPath == "" {
		configPath = filepath.Join(pluginInfo.Path, "config.json")
	}

	// 如果文件存在则删除
	if err := os.Remove(configPath); err != nil {
		if !os.IsNotExist(err) {
			return fmt.Errorf("删除配置文件失败: %w", err)
		}
	}

	// 更新内存配置为空
	pluginInfo.Config = make(map[string]interface{})

	// 如果插件正在运行，清空运行实例的配置
	container := m.getContainer(selfID)
	if container != nil {
		container.mu.RLock()
		instance, exists := container.LuaPlugins[name]
		container.mu.RUnlock()

		if exists {
			instance.mu.Lock()
			instance.Config = make(map[string]interface{})
			instance.mu.Unlock()
		}
	}

	return nil
}

// Shutdown 优雅关闭插件管理器
func (m *Manager) Shutdown(timeout time.Duration) error {
	m.logger.Infow("正在关闭插件管理器...")

	// 取消context，通知所有worker停止
	if m.cancel != nil {
		m.cancel()
	}

	// 关闭优先级事件队列（通过上下文取消通知worker退出）
	// 注意：priorityQueue 不需要显式关闭，通过 ctx.Done() 通知即可

	// 等待所有worker完成（带超时）
	done := make(chan struct{})
	go func() {
		m.workerWg.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(timeout):
		m.logger.Warnw("等待工作协程超时", "timeout", timeout)
	}

	// 卸载所有账号的所有插件
	m.containersMu.RLock()
	containers := make([]*AccountPluginContainer, 0, len(m.containers))
	for _, container := range m.containers {
		containers = append(containers, container)
	}
	m.containersMu.RUnlock()

	for _, container := range containers {
		container.mu.RLock()
		pluginNames := make([]string, 0, len(container.LuaPlugins))
		for name := range container.LuaPlugins {
			pluginNames = append(pluginNames, name)
		}
		container.mu.RUnlock()

		for _, name := range pluginNames {
			if err := m.UnloadLuaPlugin(container.SelfID, name); err != nil {
				m.logger.Errorw("卸载插件失败", "self_id", container.SelfID, "name", name, "error", err)
			}
		}
	}

	// 关闭定时任务系统
	if m.timerSystem != nil {
		m.timerSystem.Shutdown()
	}

	// 停止插件文件检查定时器（防止goroutine泄漏）
	m.StopPluginFileChecker()

	// 停止调度器管理器
	if m.schedulerManager != nil {
		m.schedulerManager.Shutdown()
	}

	// 关闭Lua脚本缓存（停止后台清理goroutine）
	if m.luaScriptCache != nil {
		m.luaScriptCache.Close()
	}

	m.logger.Infow("插件管理器已关闭",
		"totalDroppedEvents", atomic.LoadInt64(&m.droppedEvents))

	return nil
}

// processCQCodes processes CQ codes in the event data
func (m *Manager) processCQCodes(eventData map[string]interface{}) map[string]interface{} {
	var rawMessage string
	var hasMessageEvent bool

	if _, exists := eventData["message_type"].(string); exists {
		hasMessageEvent = true
	} else if postType, exists := eventData["post_type"].(string); exists &&
		(postType == "message" || postType == "message_sent" || strings.HasPrefix(postType, "message.")) {
		hasMessageEvent = true
	}

	if !hasMessageEvent {
		return eventData
	}

	if rm, exists := eventData["raw_message"].(string); exists && rm != "" {
		rawMessage = rm
	} else if msg, exists := eventData["message"].(string); exists && msg != "" {
		rawMessage = msg
	}

	if rawMessage == "" {
		return eventData
	}

	processedData := make(map[string]interface{}, len(eventData)+2)
	for k, v := range eventData {
		processedData[k] = v
	}

	messageSegments := utils.ConvertCQMessageToSegments(rawMessage)
	processedData["message"] = messageSegments
	plainText := utils.GetPlainMessage(rawMessage)
	processedData["plain_text"] = plainText

	return processedData
}

// shouldProcessEvent checks if an event should be processed by a plugin
func (m *Manager) shouldProcessEvent(instance *LuaPluginInstance, eventData map[string]interface{}) bool {
	if instance.filter == nil {
		return true
	}

	if !m.checkTypeFilter(instance.filter, eventData) {
		return false
	}

	if !m.checkKeywordFilter(instance.filter, eventData) {
		return false
	}

	return true
}

// checkTypeFilter checks if the event matches the type filters
func (m *Manager) checkTypeFilter(filter *MessageFilterConfig, eventData map[string]interface{}) bool {
	eventType := m.buildEventType(eventData)

	if len(filter.WhitelistTypes) > 0 {
		matched := false
		for _, whitelistType := range filter.WhitelistTypes {
			if m.isTypeMatch(strings.ToLower(whitelistType), eventType, eventData) {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}

	for _, blacklistType := range filter.BlacklistTypes {
		if m.isTypeMatch(strings.ToLower(blacklistType), eventType, eventData) {
			return false
		}
	}

	return true
}

// checkKeywordFilter checks if the event matches the keyword filters
func (m *Manager) checkKeywordFilter(filter *MessageFilterConfig, eventData map[string]interface{}) bool {
	messageText := m.extractMessageText(eventData)

	if len(filter.WhitelistKeywords) > 0 {
		matched := false
		for _, keyword := range filter.WhitelistKeywords {
			if strings.Contains(strings.ToLower(messageText), strings.ToLower(keyword)) {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}

	for _, keyword := range filter.BlacklistKeywords {
		if strings.Contains(strings.ToLower(messageText), strings.ToLower(keyword)) {
			return false
		}
	}

	return true
}

// buildEventType constructs an event type string from event data
func (m *Manager) buildEventType(eventData map[string]interface{}) string {
	postType, _ := eventData["post_type"].(string)
	messageType, _ := eventData["message_type"].(string)
	noticeType, _ := eventData["notice_type"].(string)
	requestType, _ := eventData["request_type"].(string)
	metaEventType, _ := eventData["meta_event_type"].(string)
	subType, _ := eventData["sub_type"].(string)

	var eventType string
	if postType != "" {
		eventType = postType
		if messageType != "" {
			eventType += "." + messageType
		} else if noticeType != "" {
			eventType += "." + noticeType
		} else if requestType != "" {
			eventType += "." + requestType
		} else if metaEventType != "" {
			eventType += "." + metaEventType
		}
		if subType != "" {
			eventType += "." + subType
		}
	}

	if message, exists := eventData["message"]; exists {
		if messageArray, ok := message.([]interface{}); ok {
			for _, segment := range messageArray {
				if segmentMap, ok := segment.(map[string]interface{}); ok {
					if segType, exists := segmentMap["type"].(string); exists {
						eventType += ",cq." + segType
					}
				}
			}
		}
	}

	return strings.ToLower(eventType)
}

// isTypeMatch checks if an event type matches a filter type
func (m *Manager) isTypeMatch(filterType, eventType string, eventData map[string]interface{}) bool {
	if filterType == eventType {
		return true
	}

	if strings.HasPrefix(eventType, filterType+".") {
		return true
	}

	if strings.HasPrefix(filterType, "sub.") {
		expectedSubType := strings.TrimPrefix(filterType, "sub.")
		if actualSubType, exists := eventData["sub_type"].(string); exists {
			if actualSubType == expectedSubType {
				return true
			}
		}
	}

	if strings.Contains(eventType, ",cq.") {
		parts := strings.Split(eventType, ",")
		for _, part := range parts {
			if strings.HasPrefix(part, "cq.") && part == filterType {
				return true
			}
		}
	}

	return false
}

// extractMessageText extracts text content from event data
func (m *Manager) extractMessageText(eventData map[string]interface{}) string {
	if rawMessage, exists := eventData["raw_message"].(string); exists {
		return utils.GetPlainMessage(rawMessage)
	}

	if message, exists := eventData["message"].(string); exists {
		return utils.GetPlainMessage(message)
	}

	if message, exists := eventData["message"].([]interface{}); exists {
		var textParts []string
		for _, segment := range message {
			if segmentMap, ok := segment.(map[string]interface{}); ok {
				if segType, exists := segmentMap["type"].(string); exists && segType == "text" {
					if data, exists := segmentMap["data"].(map[string]interface{}); exists {
						if text, exists := data["text"].(string); exists {
							textParts = append(textParts, text)
						}
					}
				}
			}
		}
		return strings.Join(textParts, " ")
	}

	return ""
}

// parseFilterConfig parses filter configuration from a map
func (m *Manager) parseFilterConfig(filterMap map[string]interface{}) *MessageFilterConfig {
	config := &MessageFilterConfig{}

	if whitelistTypes, exists := filterMap["whitelistTypes"].([]interface{}); exists {
		for _, item := range whitelistTypes {
			if str, ok := item.(string); ok {
				config.WhitelistTypes = append(config.WhitelistTypes, str)
			}
		}
	}

	if blacklistTypes, exists := filterMap["blacklistTypes"].([]interface{}); exists {
		for _, item := range blacklistTypes {
			if str, ok := item.(string); ok {
				config.BlacklistTypes = append(config.BlacklistTypes, str)
			}
		}
	}

	if whitelistKeywords, exists := filterMap["whitelistKeywords"].([]interface{}); exists {
		for _, item := range whitelistKeywords {
			if str, ok := item.(string); ok {
				config.WhitelistKeywords = append(config.WhitelistKeywords, str)
			}
		}
	}

	if blacklistKeywords, exists := filterMap["blacklistKeywords"].([]interface{}); exists {
		for _, item := range blacklistKeywords {
			if str, ok := item.(string); ok {
				config.BlacklistKeywords = append(config.BlacklistKeywords, str)
			}
		}
	}

	return config
}

// GetWorkerPoolStats 获取工作池统计信息
func (m *Manager) GetWorkerPoolStats() map[string]interface{} {
	return map[string]interface{}{
		"workers":       m.workers,
		"queueSize":     m.queueSize,
		"queuedEvents":  atomic.LoadInt64(&m.queuedEvents),
		"droppedEvents": atomic.LoadInt64(&m.droppedEvents),
		"queueUsage":    float64(atomic.LoadInt64(&m.queuedEvents)) / float64(m.queueSize) * 100,
	}
}

// GetAccountContainers 获取所有账号容器信息
func (m *Manager) GetAccountContainers() []map[string]interface{} {
	// 从 account manager 获取所有账号，而不是只从 containers 获取
	if m.reverseWS == nil {
		return []map[string]interface{}{}
	}

	accounts := m.reverseWS.GetAccountManager().GetAllAccounts()
	result := make([]map[string]interface{}, 0, len(accounts))

	for selfID, account := range accounts {
		// 获取容器信息（如果存在）
		m.containersMu.RLock()
		container, exists := m.containers[selfID]

		pluginCount := 0
		if exists {
			pluginCount = len(container.LuaPlugins)
		}
		m.containersMu.RUnlock()

		result = append(result, map[string]interface{}{
			"self_id":       selfID,
			"plugin_count":  pluginCount,
			"ws_name":       account.CustomName,
		})
	}
	return result
}

// GetPluginInstance 获取指定账号的插件实例（导出方法）
func (m *Manager) GetPluginInstance(selfID, pluginName string) *LuaPluginInstance {
	container := m.getContainer(selfID)
	if container == nil {
		return nil
	}

	container.mu.RLock()
	defer container.mu.RUnlock()
	return container.LuaPlugins[pluginName]
}

// GetAccountContainer 获取指定账号的容器（导出方法）
func (m *Manager) GetAccountContainer(selfID string) *AccountPluginContainer {
	return m.getContainer(selfID)
}

// CreateAccountPluginDir 创建账号插件目录
// 当新机器人连接时调用，自动创建对应的插件目录
func (m *Manager) CreateAccountPluginDir(selfID string) error {
	if selfID == "" {
		return errors.New("selfID不能为空")
	}

	accountDir := filepath.Join(m.pluginsDir, selfID)
	if err := os.MkdirAll(accountDir, 0755); err != nil {
		return fmt.Errorf("创建账号插件目录失败: %w", err)
	}

	m.logger.Infow("自动创建账号插件目录", "self_id", selfID, "dir", accountDir)
	return nil
}

// StartPluginFileChecker 启动插件文件存在检查定时器
func (m *Manager) StartPluginFileChecker() {
	if m.fileCheckTicker != nil {
		return
	}

	m.fileCheckStop = make(chan struct{})
	m.fileCheckTicker = time.NewTicker(5 * time.Minute)

	go func() {
		for {
			select {
			case <-m.fileCheckTicker.C:
				m.checkPluginFilesExist()
			case <-m.fileCheckStop:
				return
			}
		}
	}()

	m.logger.Infow("插件文件检查定时器已启动", "interval", "5分钟")
}

// StopPluginFileChecker 停止插件文件存在检查定时器
func (m *Manager) StopPluginFileChecker() {
	if m.fileCheckTicker != nil {
		m.fileCheckTicker.Stop()
		close(m.fileCheckStop)
		m.fileCheckTicker = nil
	}
}

// CleanupAccount 清理指定账号的所有插件资源
// 防止账号断开后插件容器和内存泄漏
func (m *Manager) CleanupAccount(selfID string) {
	m.containersMu.Lock()
	defer m.containersMu.Unlock()

	// 从 map 中删除容器，让 GC 清理
	delete(m.containers, selfID)

	m.logger.Infow("账号插件容器清理完成", "self_id", selfID)
}

// CheckPluginFilesExist 手动检查插件文件是否存在
func (m *Manager) CheckPluginFilesExist() int {
	return m.checkPluginFilesExist()
}

// checkPluginFilesExist 检查所有运行中的插件文件是否存在，不存在的则卸载
func (m *Manager) checkPluginFilesExist() int {
	m.containersMu.RLock()
	containers := make([]*AccountPluginContainer, 0, len(m.containers))
	for _, container := range m.containers {
		containers = append(containers, container)
	}
	m.containersMu.RUnlock()

	removedCount := 0
	for _, container := range containers {
		container.mu.RLock()
		plugins := make(map[string]*LuaPluginInstance)
		for name, instance := range container.LuaPlugins {
			plugins[name] = instance
		}
		container.mu.RUnlock()

		for name := range plugins {
			// 检查插件文件是否存在
			pluginPath := filepath.Join(m.pluginsDir, container.SelfID, name)
			if _, err := os.Stat(pluginPath); os.IsNotExist(err) {
				m.logger.Warnw("插件文件不存在，自动卸载",
					"self_id", container.SelfID,
					"plugin", name,
					"path", pluginPath)
				removedCount++

				// 异步卸载插件，避免阻塞检查循环
				go func(selfID, pluginName string) {
					if err := m.UnloadLuaPlugin(selfID, pluginName); err != nil {
						m.logger.Errorw("自动卸载插件失败",
							"self_id", selfID,
							"plugin", pluginName,
							"error", err)
					}
				}(container.SelfID, name)
			} else {
				// 检查主文件是否存在
				mainFile := filepath.Join(pluginPath, "main.lua")
				if _, err := os.Stat(mainFile); os.IsNotExist(err) {
					m.logger.Warnw("插件主文件不存在，自动卸载",
						"self_id", container.SelfID,
						"plugin", name,
						"main_file", mainFile)
					removedCount++

					go func(selfID, pluginName string) {
						if err := m.UnloadLuaPlugin(selfID, pluginName); err != nil {
							m.logger.Errorw("自动卸载插件失败",
								"self_id", selfID,
								"plugin", pluginName,
								"error", err)
						}
					}(container.SelfID, name)
				}
			}
		}
	}
	return removedCount
}
