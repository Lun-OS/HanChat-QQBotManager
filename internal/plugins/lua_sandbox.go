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
	// MemoryCheckInterval 内存检查间隔（指令数）
	MemoryCheckInterval = 10000

	// ========== API 权限常量 ==========
	// PermGroupAdmin 群管理权限：设置管理员、群名片、特殊头衔、修改群名等
	PermGroupAdmin = "group_admin"
	// PermGroupBan 群禁言权限：禁言用户、全员禁言
	PermGroupBan = "group_ban"
	// PermGroupKick 踢人权限：踢出群成员
	PermGroupKick = "group_kick"
	// PermGroupLeave 退群权限：退出群组、解散群组
	PermGroupLeave = "group_leave"
	// PermDeleteMsg 删除消息权限：撤回消息、删除精华消息
	PermDeleteMsg = "delete_msg"
	// PermDeleteFile 删除文件权限：删除群文件、群文件夹
	PermDeleteFile = "delete_file"
	// PermFriendManage 好友管理权限：删除好友、处理好友请求
	PermFriendManage = "friend_manage"
	// PermGroupRequest 群请求权限：处理加群请求
	PermGroupRequest = "group_request"
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

	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	if memStats.HeapAlloc > maxMemoryUsage {
		s.Halt(fmt.Sprintf("内存使用超过限制: %.1fMB / %dMB", float64(memStats.HeapAlloc)/1024/1024, maxMemoryUsage/1024/1024))
		return false
	}

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

// RequirePermission 检查插件是否拥有指定权限
// 权限配置存储在插件的 Config["permissions"] 字段中，应为字符串数组
// 如果未配置权限或权限列表为空，默认拒绝危险操作（安全优先原则）
func (s *LuaSandbox) RequirePermission(perm string) error {
	if s.instance == nil {
		return fmt.Errorf("沙箱实例未初始化")
	}

	// 从插件配置中读取权限列表
	config := s.instance.Config
	if config == nil {
		s.instance.addPluginLog("WARN", fmt.Sprintf("权限检查失败: 插件无配置 [所需权限: %s]", perm))
		return fmt.Errorf("权限不足: 插件无配置，需要权限 [%s]", perm)
	}

	// 获取 permissions 配置项
	permInterface, exists := config["permissions"]
	if !exists {
		s.instance.addPluginLog("WARN", fmt.Sprintf("权限检查失败: 未配置权限 [插件: %s, 所需权限: %s]", s.instance.Name, perm))
		return fmt.Errorf("权限不足: 未配置权限列表，需要权限 [%s] (请在插件 config.json 中配置 permissions 字段)", perm)
	}

	// 将权限列表转换为字符串切片
	var allowedPerms []string
	switch perms := permInterface.(type) {
	case []interface{}:
		for _, p := range perms {
			if str, ok := p.(string); ok {
				allowedPerms = append(allowedPerms, str)
			}
		}
	case []string:
		allowedPerms = perms
	default:
		s.instance.addPluginLog("ERROR", fmt.Sprintf("权限配置格式错误: permissions 应为字符串数组 [插件: %s]", s.instance.Name))
		return fmt.Errorf("权限配置格式错误: permissions 应为字符串数组")
	}

	// 检查是否拥有所需权限
	for _, allowed := range allowedPerms {
		if allowed == perm {
			return nil // 权限检查通过
		}
	}

	// 权限不足，记录日志并返回错误
	s.instance.addPluginLog("WARN", fmt.Sprintf("权限拒绝: 插件 [%s] 尝试调用需要权限 [%s] 的API，但未被授权", s.instance.Name, perm))
	return fmt.Errorf("权限不足: 插件 [%s] 无权执行此操作，需要权限 [%s] (当前权限: %v)", s.instance.Name, perm, allowedPerms)
}
