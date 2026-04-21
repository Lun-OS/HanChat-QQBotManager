package services

import (
	"math/rand"
	"runtime"
	"runtime/debug"
	"sync"
	"sync/atomic"
	"time"

	"HanChat-QQBotManager/internal/config"
	"HanChat-QQBotManager/internal/utils"
	"go.uber.org/zap"
)



type MemoryManager struct {
	logger            *zap.SugaredLogger
	lastMsgTime       atomic.Int64
	msgCounter        atomic.Int64
	cleanupFn         []func()
	cleanupMu         sync.RWMutex
	running           atomic.Bool
	stopChan          chan struct{}
	forceGCChan       chan struct{}
	gcCount           atomic.Int64
	lastAllocMB       atomic.Int64
	cachedMemStats    runtime.MemStats
	cachedMemStatsMu  sync.RWMutex
	lastMemStatsTime  atomic.Int64
	memStatsCacheTime time.Duration
	// 可配置的参数
	targetMB        atomic.Int64
	softLimitMB     atomic.Int64
	hardLimitMB     atomic.Int64
	idleTimeoutSecs atomic.Int64
	monitorInterval time.Duration
	gcCheckInterval atomic.Int64
}

var (
	memManager     *MemoryManager
	memManagerOnce sync.Once
)

func GetMemoryManager(logger *zap.SugaredLogger) *MemoryManager {
	memManagerOnce.Do(func() {
		memManager = &MemoryManager{
			logger:            logger,
			stopChan:          make(chan struct{}),
			forceGCChan:       make(chan struct{}, 1),
			memStatsCacheTime: 500 * time.Millisecond,
			// 默认配置
			monitorInterval: 10 * time.Second,
		}
		// 设置默认值
		memManager.targetMB.Store(20)
		memManager.softLimitMB.Store(30)
		memManager.hardLimitMB.Store(50)
		memManager.idleTimeoutSecs.Store(30)
		memManager.gcCheckInterval.Store(50000)
	})
	return memManager
}

// SetConfig 设置内存管理器配置
func (m *MemoryManager) SetConfig(cfg config.MemoryConfig) {
	// 设置默认值，防止配置值为 0
	if cfg.TargetMB <= 0 {
		cfg.TargetMB = 20
	}
	if cfg.SoftLimitMB <= 0 {
		cfg.SoftLimitMB = 30
	}
	if cfg.HardLimitMB <= 0 {
		cfg.HardLimitMB = 50
	}
	if cfg.IdleTimeoutSecs <= 0 {
		cfg.IdleTimeoutSecs = 30
	}
	if cfg.MonitorInterval <= 0 {
		cfg.MonitorInterval = 10000 // 10秒
	}
	if cfg.GCCheckInterval <= 0 {
		cfg.GCCheckInterval = 50000
	}

	m.targetMB.Store(int64(cfg.TargetMB))
	m.softLimitMB.Store(int64(cfg.SoftLimitMB))
	m.hardLimitMB.Store(int64(cfg.HardLimitMB))
	m.idleTimeoutSecs.Store(int64(cfg.IdleTimeoutSecs))
	m.monitorInterval = time.Duration(cfg.MonitorInterval) * time.Millisecond
	m.gcCheckInterval.Store(int64(cfg.GCCheckInterval))
	m.logger.Infow("内存管理器配置已更新",
		"target_mb", cfg.TargetMB,
		"soft_limit_mb", cfg.SoftLimitMB,
		"hard_limit_mb", cfg.HardLimitMB,
		"monitor_interval_ms", cfg.MonitorInterval)
}

func (m *MemoryManager) getMemStats() runtime.MemStats {
	now := time.Now().UnixNano()
	lastTime := m.lastMemStatsTime.Load()

	if now-lastTime < int64(m.memStatsCacheTime) {
		m.cachedMemStatsMu.RLock()
		stats := m.cachedMemStats
		m.cachedMemStatsMu.RUnlock()
		return stats
	}

	m.cachedMemStatsMu.Lock()
	defer m.cachedMemStatsMu.Unlock()

	if now-lastTime >= int64(m.memStatsCacheTime) {
		runtime.ReadMemStats(&m.cachedMemStats)
		m.lastMemStatsTime.Store(now)
	}

	return m.cachedMemStats
}

func (m *MemoryManager) Start() {
	if !m.running.CompareAndSwap(false, true) {
		return
	}

	debug.SetGCPercent(100) // 修复CPU过高：从10恢复到默认值100

	go m.monitorLoop()
	go m.idleDetectorLoop()
	m.logger.Infow("内存管理器已启动",
		"target_mb", m.targetMB.Load(),
		"soft_limit_mb", m.softLimitMB.Load(),
		"hard_limit_mb", m.hardLimitMB.Load(),
		"gc_percent", 100,
		"gc_check_interval", m.gcCheckInterval.Load())
}

func (m *MemoryManager) Stop() {
	if !m.running.CompareAndSwap(true, false) {
		return
	}
	close(m.stopChan)
	m.logger.Infow("内存管理器已停止", "total_gc_triggers", m.gcCount.Load())
}

func (m *MemoryManager) RegisterCleanup(fn func()) {
	m.cleanupMu.Lock()
	defer m.cleanupMu.Unlock()
	m.cleanupFn = append(m.cleanupFn, fn)
}

func (m *MemoryManager) RecordMessage() {
	m.lastMsgTime.Store(time.Now().Unix())
	count := m.msgCounter.Add(1)
	gcInterval := m.gcCheckInterval.Load()
	if gcInterval > 0 && count%gcInterval == 0 {
		go m.checkAndGC("periodic")
	}
}

func (m *MemoryManager) ForceGC() {
	select {
	case m.forceGCChan <- struct{}{}:
	default:
	}
}

func (m *MemoryManager) GetAllocMB() int {
	ms := m.getMemStats()
	return int(ms.Alloc / 1024 / 1024)
}

func (m *MemoryManager) GetMemoryStats() (allocMB, sysMB uint64, numGC uint32, goroutines int) {
	ms := m.getMemStats()
	return ms.Alloc / 1024 / 1024, ms.Sys / 1024 / 1024, ms.NumGC, runtime.NumGoroutine()
}

func (m *MemoryManager) checkAndGC(reason string) {
	allocMB := m.GetAllocMB()
	m.lastAllocMB.Store(int64(allocMB))

	target := int(m.targetMB.Load())
	softLimit := int(m.softLimitMB.Load())
	hardLimit := int(m.hardLimitMB.Load())

	if allocMB <= target {
		return
	}

	if allocMB > hardLimit {
		m.executeCleanup("hard_limit")
		return
	}

	if allocMB > softLimit {
		m.executeCleanup("soft_limit")
		return
	}

	if reason == "periodic" && allocMB > target/2 {
		runtime.GC()
	}
}

func (m *MemoryManager) monitorLoop() {
	// 添加随机初始延迟，避免与其他任务同时触发
	interval := m.monitorInterval
	if interval > 0 {
		initialDelay := time.Duration(rand.Int63n(int64(interval)))
		time.Sleep(initialDelay)
	}
	
	ticker := time.NewTicker(m.monitorInterval)
	defer ticker.Stop()

	for {
		select {
		case <-m.stopChan:
			return
		case <-m.forceGCChan:
			m.executeCleanup("force")
		case <-ticker.C:
			allocMB := m.GetAllocMB()
			m.lastAllocMB.Store(int64(allocMB))
			softLimit := int(m.softLimitMB.Load())
			if allocMB > softLimit {
				m.executeCleanup("monitor")
			}
		}
	}
}

func (m *MemoryManager) idleDetectorLoop() {
	idleInterval := 5 * time.Second
	// 添加随机初始延迟
	if idleInterval > 0 {
		initialDelay := time.Duration(rand.Int63n(int64(idleInterval)))
		time.Sleep(initialDelay)
	}
	
	ticker := time.NewTicker(idleInterval)
	defer ticker.Stop()

	for {
		select {
		case <-m.stopChan:
			return
		case <-ticker.C:
			lastMsg := m.lastMsgTime.Load()
			if lastMsg == 0 {
				continue
			}
			elapsed := time.Now().Unix() - lastMsg
			idleTimeout := m.idleTimeoutSecs.Load()
			if elapsed >= idleTimeout {
				allocMB := m.GetAllocMB()
				target := int(m.targetMB.Load())
				if allocMB > target/2 {
					m.executeCleanup("idle")
				}
			}
		}
	}
}

func (m *MemoryManager) executeCleanup(reason string) {
	m.gcCount.Add(1)

	allocBefore, _, _, _ := m.GetMemoryStats()

	m.cleanupMu.RLock()
	for _, fn := range m.cleanupFn {
		func() {
			defer func() {
				if r := recover(); r != nil {
					m.logger.Warnw("内存清理回调panic", "error", r)
				}
			}()
			fn()
		}()
	}
	m.cleanupMu.RUnlock()

	// 输出内存池统计信息
	if utils.GlobalMemoryPool != nil {
		stats := utils.GlobalMemoryPool.GetStats()
		m.logger.Debugw("内存池统计", "stats", stats)
	}

	runtime.GC()

	allocAfter, _, numGC, goroutines := m.GetMemoryStats()

	m.logger.Infow("内存清理",
		"reason", reason,
		"alloc_before_mb", allocBefore,
		"alloc_after_mb", allocAfter,
		"freed_mb", allocBefore-allocAfter,
		"goroutines", goroutines,
		"num_gc", numGC,
		"total_cleanups", m.gcCount.Load())
}
