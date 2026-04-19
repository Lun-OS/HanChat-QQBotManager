package services

import (
	"runtime"
	"runtime/debug"
	"sync"
	"sync/atomic"
	"time"

	"go.uber.org/zap"
)

const (
	MemoryTargetMB    = 20
	MemorySoftLimitMB = 30
	MemoryHardLimitMB = 50
	IdleTimeoutSecs   = 30
	MonitorInterval   = 2 * time.Second
	GCCheckInterval   = 1000
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
	mapPool           sync.Pool
	cachedMemStats    runtime.MemStats
	cachedMemStatsMu  sync.RWMutex
	lastMemStatsTime  atomic.Int64
	memStatsCacheTime time.Duration
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
			mapPool: sync.Pool{
				New: func() interface{} {
					m := make(map[string]interface{}, 16)
					return &m
				},
			},
		}
	})
	return memManager
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

	debug.SetGCPercent(10)

	go m.monitorLoop()
	go m.idleDetectorLoop()
	m.logger.Infow("内存管理器已启动",
		"target_mb", MemoryTargetMB,
		"soft_limit_mb", MemorySoftLimitMB,
		"hard_limit_mb", MemoryHardLimitMB,
		"gc_percent", 10,
		"gc_check_interval", GCCheckInterval)
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
	if count%GCCheckInterval == 0 {
		go m.checkAndGC("periodic")
	}
}

func (m *MemoryManager) AcquireMap() *map[string]interface{} {
	ptr := m.mapPool.Get()
	if ptr == nil {
		m := make(map[string]interface{}, 16)
		return &m
	}
	return ptr.(*map[string]interface{})
}

func (m *MemoryManager) ReleaseMap(ptr *map[string]interface{}) {
	if ptr == nil {
		return
	}
	mp := *ptr
	for k := range mp {
		delete(mp, k)
	}
	if len(mp) > 64 {
		return
	}
	m.mapPool.Put(ptr)
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

	if allocMB <= MemoryTargetMB {
		return
	}

	if allocMB > MemoryHardLimitMB {
		m.executeCleanup("hard_limit")
		return
	}

	if allocMB > MemorySoftLimitMB {
		m.executeCleanup("soft_limit")
		return
	}

	if reason == "periodic" && allocMB > MemoryTargetMB {
		runtime.GC()
	}
}

func (m *MemoryManager) monitorLoop() {
	ticker := time.NewTicker(MonitorInterval)
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
			if allocMB > MemorySoftLimitMB {
				m.executeCleanup("monitor")
			}
		}
	}
}

func (m *MemoryManager) idleDetectorLoop() {
	ticker := time.NewTicker(5 * time.Second)
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
			if elapsed >= IdleTimeoutSecs {
				allocMB := m.GetAllocMB()
				if allocMB > MemoryTargetMB/2 {
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
