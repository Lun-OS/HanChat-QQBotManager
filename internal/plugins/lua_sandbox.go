package plugins

import (
	"fmt"
	"regexp"
	"runtime"
	"sync"
	"sync/atomic"
	"time"

	lua "github.com/yuin/gopher-lua"
)

const (
	// MaxStackDepth 最大堆栈深度
	MaxStackDepth = 1000
	// MaxInstructions 最大指令数（用于限制死循环）
	MaxInstructions = 10000000
	// MemoryCheckInterval 内存检查间隔（指令数）
	MemoryCheckInterval = 10000
)

var maxMemoryUsage uint64 = 128 * 1024 * 1024 // 128MB 默认值

// SetMaxMemoryUsage 设置最大内存使用量（字节）
func SetMaxMemoryUsage(bytes uint64) {
	maxMemoryUsage = bytes
}

// GetMaxMemoryUsage 获取最大内存使用量（字节）
func GetMaxMemoryUsage() uint64 {
	return maxMemoryUsage
}

// LuaSandbox Lua沙箱安全控制器
type LuaSandbox struct {
	instance           *LuaPluginInstance
	stackDepth         int64  // 当前堆栈深度
	instructionCount   int64  // 指令计数
	halted             int32  // 是否已停止（原子操作）
	permanentlyHalted  int32  // 是否永久停止（原子操作）- 一旦设置不可恢复
	lastMemoryCheck    int64  // 上次内存检查时的指令计数
	// 增强型沙箱字段（V7.12.x+）
	config            *SandboxConfig      // 沙箱配置
	startTime         time.Time           // 启动时间（用于执行时间限制）
	auditMu           sync.RWMutex        // 审计日志锁
	auditLogs         []SandboxAuditLog   // 审计日志
	maxAuditLog       int                 // 最大审计日志数
	hostCheckMu       sync.RWMutex        // HTTP主机检查锁
	hostCheckCache    map[string]bool     // HTTP主机检查缓存
	hostCheckPattern  []*regexp.Regexp    // HTTP主机黑名单模式
}

// NewLuaSandbox 创建新的Lua沙箱控制器
func NewLuaSandbox(instance *LuaPluginInstance) *LuaSandbox {
	return &LuaSandbox{
		instance:           instance,
		stackDepth:         0,
		instructionCount:   0,
		halted:             0,
		permanentlyHalted:  0,
	}
}

// CheckStackDepth 检查堆栈深度，如果超过限制则返回错误
func (s *LuaSandbox) CheckStackDepth() error {
	// 检查是否已被停止
	if atomic.LoadInt32(&s.halted) == 1 {
		return fmt.Errorf("插件已被安全机制终止")
	}

	// 增加堆栈深度计数
	depth := atomic.AddInt64(&s.stackDepth, 1)

	// 检查是否超过最大深度
	if depth > MaxStackDepth {
		// 标记为已停止
		atomic.StoreInt32(&s.halted, 1)
		
		// 记录错误日志
		s.instance.addPluginLog("ERROR", fmt.Sprintf("堆栈溢出: 当前深度 %d, 超过最大限制 %d", depth, MaxStackDepth))
		
		return fmt.Errorf("堆栈溢出: 当前深度 %d, 超过最大限制 %d", depth, MaxStackDepth)
	}

	return nil
}

// DecreaseStackDepth 减少堆栈深度计数
func (s *LuaSandbox) DecreaseStackDepth() {
	atomic.AddInt64(&s.stackDepth, -1)
}

// GetCurrentStackDepth 获取当前堆栈深度
func (s *LuaSandbox) GetCurrentStackDepth() int64 {
	return atomic.LoadInt64(&s.stackDepth)
}

// IsHalted 检查沙箱是否已被停止
func (s *LuaSandbox) IsHalted() bool {
	return atomic.LoadInt32(&s.halted) == 1
}

// Halt 强制停止沙箱
// 修复：添加永久停止标志，防止Reset()后继续执行不安全的代码
func (s *LuaSandbox) Halt(reason string) {
	atomic.StoreInt32(&s.halted, 1)
	atomic.StoreInt32(&s.permanentlyHalted, 1) // 标记为永久停止，不可恢复
	s.instance.addPluginLog("ERROR", fmt.Sprintf("插件被强制终止: %s", reason))
}

// GetLState 获取Lua状态（导出方法）
func (s *LuaSandbox) GetLState() *lua.LState {
	if s.instance == nil {
		return nil
	}
	return s.instance.L
}

// Reset 重置沙箱状态
func (s *LuaSandbox) Reset() {
	if atomic.LoadInt32(&s.permanentlyHalted) == 1 {
		atomic.StoreInt64(&s.stackDepth, 0)
		atomic.StoreInt64(&s.instructionCount, 0)
		atomic.StoreInt64(&s.lastMemoryCheck, 0)
		return
	}

	atomic.StoreInt64(&s.stackDepth, 0)
	atomic.StoreInt64(&s.instructionCount, 0)
	atomic.StoreInt32(&s.halted, 0)
	atomic.StoreInt64(&s.lastMemoryCheck, 0)
	s.startTime = time.Now()
}

// SafeCall 安全调用Lua函数，带堆栈保护
func (s *LuaSandbox) SafeCall(L *lua.LState, fn *lua.LFunction, args ...lua.LValue) error {
	if err := s.CheckStackDepth(); err != nil {
		return err
	}
	defer s.DecreaseStackDepth()

	if s.IsHalted() {
		return fmt.Errorf("插件已被安全机制终止，无法执行")
	}

	L.Push(fn)
	for _, arg := range args {
		L.Push(arg)
	}

	if err := L.PCall(len(args), lua.MultRet, nil); err != nil {
		return err
	}

	return nil
}

// IsInstructionCountExceeded 检查指令数是否超过限制（用于外部定期检查）
func (s *LuaSandbox) IsInstructionCountExceeded() bool {
	return atomic.LoadInt64(&s.instructionCount) > MaxInstructions
}

// GetStackInfo 获取当前堆栈信息
func GetStackInfo() string {
	buf := make([]byte, 4096)
	n := runtime.Stack(buf, false)
	return string(buf[:n])
}

// checkMemoryUsage 检查内存使用情况
func (s *LuaSandbox) checkMemoryUsage() bool {
	if s.instance == nil || s.instance.L == nil {
		return false
	}

	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	memLimit := maxMemoryUsage
	maxDepth := int64(MaxStackDepth)
	if s.config != nil {
		if s.config.MaxMemoryUsage > 0 {
			memLimit = s.config.MaxMemoryUsage
		}
		if s.config.MaxStackDepth > 0 {
			maxDepth = s.config.MaxStackDepth
		}
	}

	if memStats.HeapAlloc > memLimit {
		s.Halt(fmt.Sprintf("内存使用超过限制: %.1fMB / %dMB", float64(memStats.HeapAlloc)/1024/1024, memLimit/1024/1024))
		return false
	}

	currentDepth := atomic.LoadInt64(&s.stackDepth)
	if currentDepth > maxDepth {
		s.Halt(fmt.Sprintf("堆栈深度超过限制: %d", currentDepth))
		return false
	}

	return true
}

// CreateSandboxHook 创建Lua钩子函数，用于监控执行
func CreateSandboxHook(sandbox *LuaSandbox) func(L *lua.LState) {
	maxInstr := int64(MaxInstructions)
	memCheckInterval := int64(MemoryCheckInterval)
	if sandbox.config != nil {
		if sandbox.config.MaxInstructions > 0 {
			maxInstr = sandbox.config.MaxInstructions
		}
		if sandbox.config.InstructionInterval > 0 {
			memCheckInterval = sandbox.config.InstructionInterval
		}
	}

	return func(L *lua.LState) {
		if sandbox.IsHalted() {
			L.RaiseError("插件已被安全机制终止")
			return
		}

		count := atomic.AddInt64(&sandbox.instructionCount, 1)

		if count > maxInstr {
			sandbox.Halt(fmt.Sprintf("指令数超过限制: %d", maxInstr))
			L.RaiseError("指令数超过限制，可能存在死循环")
			return
		}

		lastCheck := atomic.LoadInt64(&sandbox.lastMemoryCheck)
		if count-lastCheck >= memCheckInterval {
			atomic.StoreInt64(&sandbox.lastMemoryCheck, count)
			if !sandbox.checkMemoryUsage() {
				L.RaiseError("内存使用超过限制")
				return
			}
		}
	}
}
