package plugins

import (
	"fmt"
	"runtime"
	"sync/atomic"

	lua "github.com/yuin/gopher-lua"
)

const (
	// MaxStackDepth 最大堆栈深度
	MaxStackDepth = 1000
	// MaxInstructions 最大指令数（用于限制死循环）
	MaxInstructions = 10000000
	// MaxMemoryUsage 最大内存使用量（字节）
	MaxMemoryUsage = 100 * 1024 * 1024 // 100MB
	// MemoryCheckInterval 内存检查间隔（指令数）
	MemoryCheckInterval = 10000
)

// LuaSandbox Lua沙箱安全控制器
type LuaSandbox struct {
	instance           *LuaPluginInstance
	stackDepth         int64  // 当前堆栈深度
	instructionCount   int64  // 指令计数
	halted             int32  // 是否已停止（原子操作）
	permanentlyHalted  int32  // 是否永久停止（原子操作）- 一旦设置不可恢复
	lastMemoryCheck    int64  // 上次内存检查时的指令计数
}

// NewLuaSandbox 创建新的Lua沙箱控制器
func NewLuaSandbox(instance *LuaPluginInstance) *LuaSandbox {
	return &LuaSandbox{
		instance:         instance,
		stackDepth:       0,
		instructionCount: 0,
		halted:           0,
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
// 修复：如果已被永久停止（如堆栈溢出、指令数超限），则不允许重置 halted 状态
func (s *LuaSandbox) Reset() {
	// 检查是否被永久停止
	if atomic.LoadInt32(&s.permanentlyHalted) == 1 {
		// 只重置计数器，但保持 halted 状态，阻止后续执行
		atomic.StoreInt64(&s.stackDepth, 0)
		atomic.StoreInt64(&s.instructionCount, 0)
		atomic.StoreInt64(&s.lastMemoryCheck, 0)
		return // halted 保持为 1，插件将无法继续执行
	}

	// 正常情况：完全重置所有状态
	atomic.StoreInt64(&s.stackDepth, 0)
	atomic.StoreInt64(&s.instructionCount, 0)
	atomic.StoreInt32(&s.halted, 0)
	atomic.StoreInt64(&s.lastMemoryCheck, 0)
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

	// 获取当前内存使用量
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	// 检查是否超过内存限制
	// 注意：gopher-lua没有直接暴露内存使用，我们使用指令计数和栈深度作为替代
	// 同时我们也可以监控Go进程的内存使用作为辅助
	
	// 获取当前栈深度
	currentDepth := atomic.LoadInt64(&s.stackDepth)
	if currentDepth > MaxStackDepth {
		s.Halt(fmt.Sprintf("堆栈深度超过限制: %d", currentDepth))
		return false
	}

	return true
}

// CreateSandboxHook 创建Lua钩子函数，用于监控执行
func CreateSandboxHook(sandbox *LuaSandbox) func(L *lua.LState) {
	return func(L *lua.LState) {
		// 检查是否已停止
		if sandbox.IsHalted() {
			L.RaiseError("插件已被安全机制终止")
			return
		}

		// 增加指令计数
		count := atomic.AddInt64(&sandbox.instructionCount, 1)

		// 检查指令数限制
		if count > MaxInstructions {
			sandbox.Halt(fmt.Sprintf("指令数超过限制: %d", MaxInstructions))
			L.RaiseError("指令数超过限制，可能存在死循环")
			return
		}

		// 定期检查内存使用
		lastCheck := atomic.LoadInt64(&sandbox.lastMemoryCheck)
		if count-lastCheck >= MemoryCheckInterval {
			atomic.StoreInt64(&sandbox.lastMemoryCheck, count)
			if !sandbox.checkMemoryUsage() {
				L.RaiseError("内存使用超过限制")
				return
			}
		}
	}
}
