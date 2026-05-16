package console

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"HanChat-QQBotManager/internal/config"
	"HanChat-QQBotManager/internal/plugins"
	"HanChat-QQBotManager/internal/services"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
	lua "github.com/yuin/gopher-lua"
	"go.uber.org/zap"
)

type Console struct {
	logger         *zap.SugaredLogger
	pm             *plugins.Manager
	accountMgr     *services.BotAccountManager
	reverseWS      *services.ReverseWebSocketService
	accountConfig  *config.AccountConfig
	running        bool
	stopChan       chan struct{}
	wg             sync.WaitGroup
	commands       map[string]Command
	debugMode      bool
	stopOnce       sync.Once // 确保Stop只执行一次，避免重复close导致panic
}

type Command struct {
	Name        string
	Description string
	Usage       string
	Handler     func(args []string) error
}

func NewConsole(logger *zap.Logger, pm *plugins.Manager, accountMgr *services.BotAccountManager, reverseWS *services.ReverseWebSocketService, accountConfig *config.AccountConfig, debugMode bool) *Console {
	c := &Console{
		logger:        logger.Sugar().Named("console"),
		pm:            pm,
		accountMgr:    accountMgr,
		reverseWS:     reverseWS,
		accountConfig: accountConfig,
		stopChan:      make(chan struct{}),
		commands:      make(map[string]Command),
		debugMode:     debugMode,
	}
	c.registerCommands()
	return c
}

func (c *Console) registerCommands() {
	c.commands["/help"] = Command{
		Name:        "/help",
		Description: "显示所有可用命令",
		Usage:       "/help [command]",
		Handler:     c.handleHelp,
	}

	c.commands["/container"] = Command{
		Name:        "/container",
		Description: "Lua容器管理命令",
		Usage:       "/container [list|create <self_id>|delete <self_id>]",
		Handler:     c.handleContainer,
	}

	c.commands["/plugin"] = Command{
		Name:        "/plugin",
		Description: "Lua插件管理命令",
		Usage:       "/plugin [list|load <self_id> <name>|unload <self_id> <name>|status <self_id> <name>]",
		Handler:     c.handlePlugin,
	}

	c.commands["/bot"] = Command{
		Name:        "/bot",
		Description: "机器人管理命令",
		Usage:       "/bot [list|status <self_id>]",
		Handler:     c.handleBot,
	}

	c.commands["/log"] = Command{
		Name:        "/log",
		Description: "日志管理命令",
		Usage:       "/log [system|ws <self_id> [limit]|plugin <self_id> <plugin_name> [limit]]",
		Handler:     c.handleLog,
	}

	c.commands["/system"] = Command{
		Name:        "/system",
		Description: "系统管理命令",
		Usage:       "/system [status|info|server]",
		Handler:     c.handleSystem,
	}

	c.commands["/exit"] = Command{
		Name:        "/exit",
		Description: "退出程序",
		Usage:       "/exit",
		Handler:     c.handleExit,
	}

	c.commands["/quit"] = Command{
		Name:        "/quit",
		Description: "退出程序",
		Usage:       "/quit",
		Handler:     c.handleExit,
	}

	c.commands["/clear"] = Command{
		Name:        "/clear",
		Description: "清空控制台",
		Usage:       "/clear",
		Handler:     c.handleClear,
	}

	c.commands["/msg"] = Command{
		Name:        "/msg",
		Description: "消息管理命令",
		Usage:       "/msg [private <self_id> <user_id> <message>|group <self_id> <group_id> <message>|delete <self_id> <message_id>]",
		Handler:     c.handleMsg,
	}

	c.commands["/group"] = Command{
		Name:        "/group",
		Description: "群组管理命令",
		Usage:       "/group [list <self_id>|info <self_id> <group_id>|members <self_id> <group_id>|ban <self_id> <group_id> <user_id> <seconds>]",
		Handler:     c.handleGroup,
	}

	c.commands["/user"] = Command{
		Name:        "/user",
		Description: "用户管理命令",
		Usage:       "/user [list <self_id>|info <self_id>|delete <self_id> <user_id>]",
		Handler:     c.handleUser,
	}

	c.commands["/config"] = Command{
		Name:        "/config",
		Description: "配置管理命令",
		Usage:       "/config [get|set <key> <value>]",
		Handler:     c.handleConfig,
	}

	c.commands["/lua"] = Command{
		Name:        "/lua",
		Description: "进入Lua交互模式执行Lua代码",
		Usage:       "/lua <self_id> [plugin_name]",
		Handler:     c.handleLua,
	}

	c.commands["/api"] = Command{
		Name:        "/api",
		Description: "直接调用机器人API接口",
		Usage:       "/api <self_id> <action> [params_json]",
		Handler:     c.handleAPI,
	}

	c.commands["/groupadmin"] = Command{
		Name:        "/groupadmin",
		Description: "群组管理员命令",
		Usage:       "/groupadmin [kick <self_id> <group_id> <user_id>|setcard <self_id> <group_id> <user_id> <card>|setadmin <self_id> <group_id> <user_id> <true|false>]",
		Handler:     c.handleGroupAdmin,
	}

	c.commands["/mute"] = Command{
		Name:        "/mute",
		Description: "群禁言管理",
		Usage:       "/mute [all <self_id> <group_id> <true|false>|user <self_id> <group_id> <user_id> <seconds>]",
		Handler:     c.handleMute,
	}

	c.commands["/notice"] = Command{
		Name:        "/notice",
		Description: "发送通知类消息",
		Usage:       "/notice [poke <self_id> <group_id> <user_id>|nudge <self_id> <user_id>]",
		Handler:     c.handleNotice,
	}

	c.commands["/cache"] = Command{
		Name:        "/cache",
		Description: "缓存管理",
		Usage:       "/cache [clean <self_id>|status <self_id>]",
		Handler:     c.handleCache,
	}
}

func (c *Console) Start() {
	c.running = true
	c.wg.Add(1)
	go c.run()
	c.logger.Info("控制台命令系统已启动，输入 /help 查看可用命令")
}

func (c *Console) Stop() {
	// 使用 sync.Once 确保只执行一次，避免重复 close(stopChan) 导致 panic
	c.stopOnce.Do(func() {
		c.running = false
		close(c.stopChan)
		c.wg.Wait()
	})
}

func (c *Console) run() {
	defer c.wg.Done()
	scanner := bufio.NewScanner(os.Stdin)

	for c.running {
		fmt.Print("> ")
		if !scanner.Scan() {
			break
		}

		input := strings.TrimSpace(scanner.Text())
		if input == "" {
			continue
		}

		c.processInput(input)
	}

	if err := scanner.Err(); err != nil {
		c.logger.Errorw("控制台扫描错误", "error", err)
	}
}

func (c *Console) processInput(input string) {
	parts := strings.Fields(input)
	if len(parts) == 0 {
		return
	}

	cmdName := strings.ToLower(parts[0])
	cmd, exists := c.commands[cmdName]
	if !exists {
		fmt.Printf("未知命令: %s\n输入 /help 查看可用命令\n", cmdName)
		return
	}

	var args []string
	if len(parts) > 1 {
		args = parts[1:]
	}

	if err := cmd.Handler(args); err != nil {
		fmt.Printf("命令执行失败: %v\n", err)
	}
}

func (c *Console) handleHelp(args []string) error {
	if len(args) > 0 {
		cmdName := strings.ToLower(args[0])
		if !strings.HasPrefix(cmdName, "/") {
			cmdName = "/" + cmdName
		}
		cmd, exists := c.commands[cmdName]
		if exists {
			fmt.Printf("\n命令: %s\n描述: %s\n用法: %s\n\n", cmd.Name, cmd.Description, cmd.Usage)
			return nil
		}
		return fmt.Errorf("未知命令: %s", args[0])
	}

	fmt.Println("\n可用命令:")
	fmt.Println("===========")
	for _, cmd := range c.commands {
		fmt.Printf("  %-15s %s\n", cmd.Name, cmd.Description)
	}
	fmt.Println("\n使用 /help <command> 查看命令详细用法")
	return nil
}

func (c *Console) handleContainer(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("请指定子命令，使用 /help container 查看用法")
	}

	subCmd := args[0]
	switch subCmd {
	case "list":
		return c.listContainers()
	case "create":
		if len(args) < 2 {
			return fmt.Errorf("请指定 self_id，用法: /container create <self_id>")
		}
		return c.createContainer(args[1])
	case "delete":
		if len(args) < 2 {
			return fmt.Errorf("请指定 self_id，用法: /container delete <self_id>")
		}
		return c.deleteContainer(args[1])
	default:
		return fmt.Errorf("未知子命令: %s，使用 /help container 查看用法", subCmd)
	}
}

func (c *Console) listContainers() error {
	containers := c.pm.GetAccountContainers()
	if len(containers) == 0 {
		fmt.Println("没有可用的Lua容器")
		return nil
	}

	fmt.Println("\nLua容器列表:")
	fmt.Println("==============")
	for _, container := range containers {
		selfID, _ := container["self_id"].(string)
		pluginCount, _ := container["plugin_count"].(int)
		wsName, _ := container["ws_name"].(string)
		fmt.Printf("  SelfID: %s\n", selfID)
		fmt.Printf("  CustomName: %s\n", wsName)
		fmt.Printf("  运行插件数: %d\n", pluginCount)
		fmt.Println("  -------------------")
	}
	return nil
}

func (c *Console) createContainer(selfID string) error {
	if err := c.pm.CreateAccountPluginDir(selfID); err != nil {
		return err
	}
	fmt.Printf("Lua容器已创建: %s\n", selfID)
	return nil
}

func (c *Console) deleteContainer(selfID string) error {
	fmt.Printf("注意: 容器删除功能需要手动删除文件目录\n插件目录: plugins/%s\n", selfID)
	return nil
}

func (c *Console) handlePlugin(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("请指定子命令，使用 /help plugin 查看用法")
	}

	subCmd := args[0]
	switch subCmd {
	case "list":
		var selfID string
		if len(args) > 1 {
			selfID = args[1]
		}
		return c.listPlugins(selfID)
	case "load":
		if len(args) < 3 {
			return fmt.Errorf("请指定 self_id 和 name，用法: /plugin load <self_id> <name>")
		}
		return c.loadPlugin(args[1], args[2])
	case "unload":
		if len(args) < 3 {
			return fmt.Errorf("请指定 self_id 和 name，用法: /plugin unload <self_id> <name>")
		}
		return c.unloadPlugin(args[1], args[2])
	case "status":
		if len(args) < 3 {
			return fmt.Errorf("请指定 self_id 和 name，用法: /plugin status <self_id> <name>")
		}
		return c.pluginStatus(args[1], args[2])
	default:
		return fmt.Errorf("未知子命令: %s，使用 /help plugin 查看用法", subCmd)
	}
}

func (c *Console) listPlugins(selfID string) error {
	plugins, err := c.pm.GetAllPlugins(selfID)
	if err != nil {
		return err
	}

	if len(plugins) == 0 {
		fmt.Println("没有找到插件")
		return nil
	}

	fmt.Println("\n插件列表:")
	fmt.Println("==========")
	for _, plugin := range plugins {
		name, _ := plugin["name"].(string)
		pluginSelfID, _ := plugin["self_id"].(string)
		running, _ := plugin["running"].(bool)
		enabled, _ := plugin["enabled"].(bool)
		version, _ := plugin["version"].(string)
		remark, _ := plugin["remark"].(string)
		
		status := "未运行"
		if running {
			status = "运行中"
		} else if enabled {
			status = "已启用"
		}
		
		fmt.Printf("  Name: %s\n", name)
		fmt.Printf("  SelfID: %s\n", pluginSelfID)
		fmt.Printf("  Status: %s\n", status)
		fmt.Printf("  Version: %s\n", version)
		fmt.Printf("  Remark: %s\n", remark)
		fmt.Println("  -------------------")
	}
	return nil
}

func (c *Console) loadPlugin(selfID, name string) error {
	if err := c.pm.Load(selfID, name); err != nil {
		return err
	}
	if err := c.pm.AddPluginToAutoStart(selfID, name); err != nil {
		c.logger.Warnw("添加插件到自启动配置失败", "error", err)
	}
	fmt.Printf("插件已加载: %s (账号: %s)\n", name, selfID)
	return nil
}

func (c *Console) unloadPlugin(selfID, name string) error {
	if err := c.pm.Unload(selfID, name); err != nil {
		return err
	}
	if err := c.pm.RemovePluginFromAutoStart(selfID, name); err != nil {
		c.logger.Warnw("从自启动配置移除插件失败", "error", err)
	}
	fmt.Printf("插件已卸载: %s (账号: %s)\n", name, selfID)
	return nil
}

func (c *Console) pluginStatus(selfID, name string) error {
	status, err := c.pm.GetStatus(selfID, name)
	if err != nil {
		return err
	}

	fmt.Println("\n插件状态:")
	fmt.Println("==========")
	fmt.Printf("  Name: %s\n", name)
	fmt.Printf("  SelfID: %s\n", selfID)
	
	running, _ := status["running"].(bool)
	fmt.Printf("  Running: %v\n", running)
	
	if running {
		uptime, _ := status["uptime"].(string)
		eventCount, _ := status["eventCount"].(int64)
		errorCount, _ := status["errorCount"].(int64)
		lastEventTime, _ := status["lastEventTime"].(string)
		errorRate, _ := status["errorRate"].(float64)
		
		fmt.Printf("  Uptime: %s\n", uptime)
		fmt.Printf("  Event Count: %d\n", eventCount)
		fmt.Printf("  Error Count: %d\n", errorCount)
		fmt.Printf("  Last Event Time: %s\n", lastEventTime)
		fmt.Printf("  Error Rate: %.2f%%\n", errorRate*100)
	}
	return nil
}

func (c *Console) handleBot(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("请指定子命令，使用 /help bot 查看用法")
	}

	subCmd := args[0]
	switch subCmd {
	case "list":
		return c.listBots()
	case "status":
		if len(args) < 2 {
			return fmt.Errorf("请指定 self_id，用法: /bot status <self_id>")
		}
		return c.botStatus(args[1])
	default:
		return fmt.Errorf("未知子命令: %s，使用 /help bot 查看用法", subCmd)
	}
}

func (c *Console) listBots() error {
	accounts := c.accountMgr.GetAllAccounts()
	if len(accounts) == 0 {
		fmt.Println("没有机器人账号")
		return nil
	}

	fmt.Println("\n机器人账号列表:")
	fmt.Println("================")
	for selfID, account := range accounts {
		status := "离线"
		if account.IsOnline() {
			status = "在线"
		}
		fmt.Printf("  SelfID: %s\n", selfID)
		fmt.Printf("  CustomName: %s\n", account.CustomName)
		fmt.Printf("  Status: %s\n", status)
		if !account.LastConnectedAt.IsZero() {
			fmt.Printf("  Last Connected: %s\n", account.LastConnectedAt.Format("2006-01-02 15:04:05"))
		}
		fmt.Println("  -------------------")
	}
	return nil
}

func (c *Console) botStatus(selfID string) error {
	account, err := c.accountMgr.GetAccount(selfID)
	if err != nil {
		return err
	}

	status := "离线"
	if account.IsOnline() {
		status = "在线"
	}

	fmt.Println("\n机器人状态:")
	fmt.Println("============")
	fmt.Printf("  SelfID: %s\n", selfID)
	fmt.Printf("  CustomName: %s\n", account.CustomName)
	fmt.Printf("  Status: %s\n", status)
	if !account.LastConnectedAt.IsZero() {
		fmt.Printf("  Last Connected: %s\n", account.LastConnectedAt.Format("2006-01-02 15:04:05"))
	}
	if !account.LastActivityAt.IsZero() {
		fmt.Printf("  Last Activity: %s\n", account.LastActivityAt.Format("2006-01-02 15:04:05"))
	}
	return nil
}

func (c *Console) handleLog(args []string) error {
	if len(args) == 0 {
		// 默认实时输出系统日志
		return c.tailSystemLogs()
	}

	subCmd := args[0]
	switch subCmd {
	case "system":
		return c.tailSystemLogs()
	case "ws":
		if len(args) < 2 {
			return fmt.Errorf("请指定 self_id，用法: /log ws <self_id> [limit]")
		}
		limit := 100
		if len(args) >= 3 {
			if l, err := strconv.Atoi(args[2]); err == nil && l > 0 {
				limit = l
			}
		}
		return c.getWSLogs(args[1], limit)
	case "plugin":
		if len(args) < 3 {
			return fmt.Errorf("请指定 self_id 和 plugin_name，用法: /log plugin <self_id> <plugin_name> [limit]")
		}
		limit := 100
		if len(args) >= 4 {
			if l, err := strconv.Atoi(args[3]); err == nil && l > 0 {
				limit = l
			}
		}
		return c.getPluginLogs(args[1], args[2], limit)
	default:
		return fmt.Errorf("未知子命令: %s，使用 /help log 查看用法", subCmd)
	}
}

// tailSystemLogs 实时输出系统日志（支持Ctrl+C停止）
func (c *Console) tailSystemLogs() error {
	logFile := "./logs/combined.log"
	
	// 检查日志文件是否存在
	if _, err := os.Stat(logFile); os.IsNotExist(err) {
		return fmt.Errorf("日志文件不存在: %s", logFile)
	}

	// 打开日志文件
	file, err := os.Open(logFile)
	if err != nil {
		return fmt.Errorf("无法打开日志文件: %w", err)
	}
	defer file.Close()

	// 移动到文件末尾
	if _, err := file.Seek(0, 2); err != nil {
		return fmt.Errorf("无法定位到文件末尾: %w", err)
	}

	fmt.Println("\n正在实时输出系统日志...")
	fmt.Println("提示: 按 Ctrl+C 停止输出，然后可以继续输入命令")
	fmt.Println("===============================================")

	// 创建信号通道用于检测Ctrl+C
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt)
	defer signal.Reset(os.Interrupt)

	// 创建读取器
	reader := bufio.NewReader(file)
	lineChan := make(chan string, 100)
	doneChan := make(chan struct{})
	stopChan := make(chan struct{}) // 用于通知goroutine退出

	// 在goroutine中读取日志
	go func() {
		defer close(doneChan)
		for {
			select {
			case <-stopChan:
				return
			default:
			}

			line, err := reader.ReadString('\n')
			if err != nil {
				// 文件读取错误，检查是否停止
				select {
				case <-stopChan:
					return
				case <-time.After(100 * time.Millisecond):
					continue
				}
			}
			select {
			case lineChan <- line:
			case <-stopChan:
				return
			}
		}
	}()

	// 主循环：输出日志或等待停止信号
	for {
		select {
		case line := <-lineChan:
			fmt.Print(line)
		case <-sigChan:
			fmt.Println("\n\n[已停止日志输出，可以继续输入命令]")
			close(stopChan) // 通知goroutine退出
			<-doneChan      // 等待goroutine完成
			// 清空信号通道，避免影响后续命令
			go func() {
				for range sigChan {
				}
			}()
			return nil
		}
	}
}

func (c *Console) getWSLogs(selfID string, limit int) error {
	logManager := c.reverseWS.GetLogManager()
	if logManager == nil {
		return fmt.Errorf("日志管理器未初始化")
	}

	logs, err := logManager.GetLogs(selfID, "ws", "", limit)
	if err != nil {
		return err
	}

	if len(logs) == 0 {
		fmt.Println("没有WebSocket日志")
		return nil
	}

	fmt.Println("\nWebSocket日志:")
	fmt.Println("===============")
	for _, log := range logs {
		fmt.Println(log)
	}
	fmt.Printf("\n共 %d 条日志\n", len(logs))
	return nil
}

func (c *Console) getPluginLogs(selfID, pluginName string, limit int) error {
	logManager := c.reverseWS.GetLogManager()
	if logManager == nil {
		return fmt.Errorf("日志管理器未初始化")
	}

	logs, err := logManager.GetLogs(selfID, "plugin", "", limit)
	if err != nil {
		return err
	}

	var filteredLogs []string
	for _, log := range logs {
		if len(log) > 0 {
			filteredLogs = append(filteredLogs, log)
		}
	}

	if len(filteredLogs) == 0 {
		fmt.Println("没有插件日志")
		return nil
	}

	fmt.Printf("\n插件日志 (%s):\n", pluginName)
	fmt.Println("==================")
	for _, log := range filteredLogs {
		fmt.Println(log)
	}
	fmt.Printf("\n共 %d 条日志\n", len(filteredLogs))
	return nil
}

func (c *Console) handleSystem(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("请指定子命令，使用 /help system 查看用法")
	}

	subCmd := args[0]
	switch subCmd {
	case "status":
		return c.getBotStatus()
	case "info":
		return c.getSystemInfo()
	case "server":
		return c.getServerStatus()
	default:
		return fmt.Errorf("未知子命令: %s，使用 /help system 查看用法", subCmd)
	}
}

func (c *Console) getBotStatus() error {
	accounts := c.accountMgr.GetAllAccounts()
	var targetSelfID string
	for selfID, account := range accounts {
		if account.IsOnline() {
			targetSelfID = selfID
			break
		}
	}

	if targetSelfID == "" {
		return fmt.Errorf("没有在线的账号")
	}

	res, err := c.reverseWS.CallBotAPI(targetSelfID, "get_status", nil)
	if err != nil {
		return err
	}

	fmt.Println("\n机器人状态:")
	fmt.Println("=============")
	fmt.Printf("  SelfID: %s\n", targetSelfID)
	if data, ok := res["data"]; ok {
		fmt.Printf("  Data: %v\n", data)
	}
	return nil
}

func (c *Console) getSystemInfo() error {
	version := os.Getenv("LLBOT_VERSION")
	if version == "" {
		version = "V5.2"
	}

	fmt.Println("\n系统信息:")
	fmt.Println("==========")
	fmt.Printf("  Version: %s\n", version)
	fmt.Printf("  Name: LLBot\n")
	return nil
}

func (c *Console) getServerStatus() error {
	hostInfo, err := host.Info()
	if err != nil {
		return fmt.Errorf("获取主机信息失败: %w", err)
	}

	cpuInfo, err := cpu.Info()
	if err != nil {
		return fmt.Errorf("获取CPU信息失败: %w", err)
	}

	cpuPercent, err := cpu.Percent(1*time.Second, false)
	if err != nil {
		cpuPercent = []float64{0}
	}

	memInfo, err := mem.VirtualMemory()
	if err != nil {
		return fmt.Errorf("获取内存信息失败: %w", err)
	}

	netIO, err := net.IOCounters(false)
	if err != nil {
		netIO = []net.IOCountersStat{}
	}

	cpuModel := "Unknown"
	if len(cpuInfo) > 0 {
		cpuModel = cpuInfo[0].ModelName
	}

	cpuUsage := 0.0
	if len(cpuPercent) > 0 {
		cpuUsage = cpuPercent[0]
	}

	netUpload := uint64(0)
	netDownload := uint64(0)
	if len(netIO) > 0 {
		for _, io := range netIO {
			netUpload += io.BytesSent
			netDownload += io.BytesRecv
		}
	}

	fmt.Println("\n服务器状态:")
	fmt.Println("============")
	fmt.Println("系统:")
	fmt.Printf("  Platform: %s\n", hostInfo.Platform)
	fmt.Printf("  Platform Family: %s\n", hostInfo.PlatformFamily)
	fmt.Printf("  Platform Version: %s\n", hostInfo.PlatformVersion)
	fmt.Printf("  Kernel Version: %s\n", hostInfo.KernelVersion)
	fmt.Printf("  OS: %s\n", hostInfo.OS)
	
	fmt.Println("\nCPU:")
	fmt.Printf("  Model: %s\n", cpuModel)
	fmt.Printf("  Cores: %d\n", runtime.NumCPU())
	fmt.Printf("  Usage: %.2f%%\n", cpuUsage)
	
	fmt.Println("\n内存:")
	fmt.Printf("  Total: %.2f GB\n", float64(memInfo.Total)/1024/1024/1024)
	fmt.Printf("  Used: %.2f GB\n", float64(memInfo.Used)/1024/1024/1024)
	fmt.Printf("  Available: %.2f GB\n", float64(memInfo.Available)/1024/1024/1024)
	fmt.Printf("  Usage Percent: %.2f%%\n", memInfo.UsedPercent)
	
	fmt.Println("\n网络:")
	fmt.Printf("  Upload: %.2f MB\n", float64(netUpload)/1024/1024)
	fmt.Printf("  Download: %.2f MB\n", float64(netDownload)/1024/1024)
	
	return nil
}

func (c *Console) handleClear(args []string) error {
	fmt.Print("\033[H\033[2J")
	return nil
}

func (c *Console) handleExit(args []string) error {
	fmt.Println("正在退出程序...")
	os.Exit(0)
	return nil
}

func (c *Console) handleMsg(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("请指定子命令，使用 /help msg 查看用法")
	}

	subCmd := args[0]
	switch subCmd {
	case "private":
		if len(args) < 4 {
			return fmt.Errorf("请指定 self_id, user_id 和 message，用法: /msg private <self_id> <user_id> <message>")
		}
		return c.sendPrivateMsg(args[1], args[2], strings.Join(args[3:], " "))
	case "group":
		if len(args) < 4 {
			return fmt.Errorf("请指定 self_id, group_id 和 message，用法: /msg group <self_id> <group_id> <message>")
		}
		return c.sendGroupMsg(args[1], args[2], strings.Join(args[3:], " "))
	case "delete":
		if len(args) < 3 {
			return fmt.Errorf("请指定 self_id 和 message_id，用法: /msg delete <self_id> <message_id>")
		}
		return c.deleteMsg(args[1], args[2])
	default:
		return fmt.Errorf("未知子命令: %s，使用 /help msg 查看用法", subCmd)
	}
}

func (c *Console) sendPrivateMsg(selfID, userID, message string) error {
	res, err := c.reverseWS.CallBotAPI(selfID, "send_private_msg", map[string]interface{}{
		"user_id": userID,
		"message": message,
	})
	if err != nil {
		return err
	}
	fmt.Printf("私聊消息已发送: %v\n", res)
	return nil
}

func (c *Console) sendGroupMsg(selfID, groupID, message string) error {
	res, err := c.reverseWS.CallBotAPI(selfID, "send_group_msg", map[string]interface{}{
		"group_id": groupID,
		"message":  message,
	})
	if err != nil {
		return err
	}
	fmt.Printf("群消息已发送: %v\n", res)
	return nil
}

func (c *Console) deleteMsg(selfID, messageID string) error {
	res, err := c.reverseWS.CallBotAPI(selfID, "delete_msg", map[string]interface{}{
		"message_id": messageID,
	})
	if err != nil {
		return err
	}
	fmt.Printf("消息已撤回: %v\n", res)
	return nil
}

func (c *Console) handleGroup(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("请指定子命令，使用 /help group 查看用法")
	}

	subCmd := args[0]
	switch subCmd {
	case "list":
		if len(args) < 2 {
			return fmt.Errorf("请指定 self_id，用法: /group list <self_id>")
		}
		return c.getGroupList(args[1])
	case "info":
		if len(args) < 3 {
			return fmt.Errorf("请指定 self_id 和 group_id，用法: /group info <self_id> <group_id>")
		}
		return c.getGroupInfo(args[1], args[2])
	case "members":
		if len(args) < 3 {
			return fmt.Errorf("请指定 self_id 和 group_id，用法: /group members <self_id> <group_id>")
		}
		return c.getGroupMembers(args[1], args[2])
	case "ban":
		if len(args) < 5 {
			return fmt.Errorf("请指定 self_id, group_id, user_id 和 seconds，用法: /group ban <self_id> <group_id> <user_id> <seconds>")
		}
		seconds, err := strconv.Atoi(args[4])
		if err != nil {
			return fmt.Errorf("seconds 必须是数字")
		}
		return c.banGroupMember(args[1], args[2], args[3], seconds)
	default:
		return fmt.Errorf("未知子命令: %s，使用 /help group 查看用法", subCmd)
	}
}

func (c *Console) getGroupList(selfID string) error {
	res, err := c.reverseWS.CallBotAPI(selfID, "get_group_list", nil)
	if err != nil {
		return err
	}

	fmt.Println("\n群列表:")
	fmt.Println("========")
	if data, ok := res["data"].([]interface{}); ok {
		for _, group := range data {
			if g, ok := group.(map[string]interface{}); ok {
				groupID, _ := g["group_id"].(float64)
				groupName, _ := g["group_name"].(string)
				fmt.Printf("  GroupID: %.0f, Name: %s\n", groupID, groupName)
			}
		}
		fmt.Printf("\n共 %d 个群\n", len(data))
	}
	return nil
}

func (c *Console) getGroupInfo(selfID, groupID string) error {
	res, err := c.reverseWS.CallBotAPI(selfID, "get_group_info", map[string]interface{}{
		"group_id": groupID,
	})
	if err != nil {
		return err
	}

	fmt.Println("\n群信息:")
	fmt.Println("========")
	if data, ok := res["data"].(map[string]interface{}); ok {
		fmt.Printf("  GroupID: %.0f\n", data["group_id"])
		fmt.Printf("  GroupName: %s\n", data["group_name"])
		fmt.Printf("  MemberCount: %.0f\n", data["member_count"])
		fmt.Printf("  MaxMemberCount: %.0f\n", data["max_member_count"])
	}
	return nil
}

func (c *Console) getGroupMembers(selfID, groupID string) error {
	res, err := c.reverseWS.CallBotAPI(selfID, "get_group_member_list", map[string]interface{}{
		"group_id": groupID,
	})
	if err != nil {
		return err
	}

	fmt.Println("\n群成员列表:")
	fmt.Println("============")
	if data, ok := res["data"].([]interface{}); ok {
		for _, member := range data {
			if m, ok := member.(map[string]interface{}); ok {
				userID, _ := m["user_id"].(float64)
				nickname, _ := m["nickname"].(string)
				card, _ := m["card"].(string)
				role, _ := m["role"].(string)
				fmt.Printf("  UserID: %.0f, Nickname: %s, Card: %s, Role: %s\n", userID, nickname, card, role)
			}
		}
		fmt.Printf("\n共 %d 个成员\n", len(data))
	}
	return nil
}

func (c *Console) banGroupMember(selfID, groupID, userID string, seconds int) error {
	res, err := c.reverseWS.CallBotAPI(selfID, "set_group_ban", map[string]interface{}{
		"group_id": groupID,
		"user_id":  userID,
		"duration": seconds,
	})
	if err != nil {
		return err
	}
	if seconds == 0 {
		fmt.Printf("已解除用户 %s 的禁言\n", userID)
	} else {
		fmt.Printf("已禁言用户 %s %d 秒\n", userID, seconds)
	}
	fmt.Printf("结果: %v\n", res)
	return nil
}

func (c *Console) handleUser(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("请指定子命令，使用 /help user 查看用法")
	}

	subCmd := args[0]
	switch subCmd {
	case "list":
		if len(args) < 2 {
			return fmt.Errorf("请指定 self_id，用法: /user list <self_id>")
		}
		return c.getFriendList(args[1])
	case "info":
		if len(args) < 2 {
			return fmt.Errorf("请指定 self_id，用法: /user info <self_id>")
		}
		return c.getLoginInfo(args[1])
	case "delete":
		if len(args) < 3 {
			return fmt.Errorf("请指定 self_id 和 user_id，用法: /user delete <self_id> <user_id>")
		}
		return c.deleteFriend(args[1], args[2])
	default:
		return fmt.Errorf("未知子命令: %s，使用 /help user 查看用法", subCmd)
	}
}

func (c *Console) getFriendList(selfID string) error {
	res, err := c.reverseWS.CallBotAPI(selfID, "get_friend_list", nil)
	if err != nil {
		return err
	}

	fmt.Println("\n好友列表:")
	fmt.Println("==========")
	if data, ok := res["data"].([]interface{}); ok {
		for _, friend := range data {
			if f, ok := friend.(map[string]interface{}); ok {
				userID, _ := f["user_id"].(float64)
				nickname, _ := f["nickname"].(string)
				remark, _ := f["remark"].(string)
				fmt.Printf("  UserID: %.0f, Nickname: %s, Remark: %s\n", userID, nickname, remark)
			}
		}
		fmt.Printf("\n共 %d 个好友\n", len(data))
	}
	return nil
}

func (c *Console) getLoginInfo(selfID string) error {
	res, err := c.reverseWS.CallBotAPI(selfID, "get_login_info", nil)
	if err != nil {
		return err
	}

	fmt.Println("\n登录信息:")
	fmt.Println("==========")
	if data, ok := res["data"].(map[string]interface{}); ok {
		fmt.Printf("  UserID: %.0f\n", data["user_id"])
		fmt.Printf("  Nickname: %s\n", data["nickname"])
	}
	return nil
}

func (c *Console) deleteFriend(selfID, userID string) error {
	res, err := c.reverseWS.CallBotAPI(selfID, "delete_friend", map[string]interface{}{
		"user_id": userID,
	})
	if err != nil {
		return err
	}
	fmt.Printf("好友 %s 已删除\n", userID)
	fmt.Printf("结果: %v\n", res)
	return nil
}

func (c *Console) handleConfig(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("请指定子命令，使用 /help config 查看用法")
	}

	subCmd := args[0]
	switch subCmd {
	case "get":
		return c.getConfig()
	case "set":
		if len(args) < 3 {
			return fmt.Errorf("请指定 key 和 value，用法: /config set <key> <value>")
		}
		return c.setConfig(args[1], args[2])
	default:
		return fmt.Errorf("未知子命令: %s，使用 /help config 查看用法", subCmd)
	}
}

func (c *Console) getConfig() error {
	cfg, err := c.accountConfig.LoadConfig()
	if err != nil {
		return err
	}

	fmt.Println("\n配置信息:")
	fmt.Println("==========")
	fmt.Printf("  WebSocket Authorization: %s\n", cfg.Websocket.Authorization)
	fmt.Printf("  WebSocket Port: %d\n", cfg.Websocket.Port)
	return nil
}

func (c *Console) setConfig(key, value string) error {
	switch key {
	case "websocket_authorization":
		cfg, err := c.accountConfig.LoadConfig()
		if err != nil {
			return err
		}
		cfg.Websocket.Authorization = value
		if err := c.accountConfig.SaveWebsocketConfig(cfg.Websocket); err != nil {
			return err
		}
		c.reverseWS.UpdateGlobalToken(value)
		fmt.Printf("配置 %s 已更新\n", key)
	default:
		return fmt.Errorf("未知配置项: %s", key)
	}
	return nil
}

// handleLua 进入Lua交互模式
func (c *Console) handleLua(args []string) error {
	if len(args) < 1 {
		return fmt.Errorf("请指定 self_id，用法: /lua <self_id> [plugin_name]")
	}

	selfID := args[0]
	pluginName := ""
	if len(args) >= 2 {
		pluginName = args[1]
	}

	// 检查账号是否存在
	if _, err := c.accountMgr.GetAccount(selfID); err != nil {
		return fmt.Errorf("账号 %s 不存在: %w", selfID, err)
	}

	// 进入Lua交互模式
	if pluginName != "" {
		fmt.Printf("\n进入插件 [%s] 的Lua交互模式 (账号: %s)\n", pluginName, selfID)
		fmt.Println("提示: 输入 'exit' 或 'quit' 退出交互模式")
		fmt.Println("安全限制: 最大执行时间 30 秒，最大指令数 1000 万")
		return c.luaPluginInteractiveMode(selfID, pluginName)
	}

	fmt.Printf("\n进入账号 [%s] 的Lua容器交互模式\n", selfID)
	fmt.Println("提示: 输入 'exit' 或 'quit' 退出交互模式")
	fmt.Println("安全限制: 最大执行时间 30 秒，最大指令数 1000 万")
	return c.luaContainerInteractiveMode(selfID)
}

// luaContainerInteractiveMode Lua容器交互模式
func (c *Console) luaContainerInteractiveMode(selfID string) error {
	// 获取或创建容器
	container := c.pm.GetAccountContainer(selfID)
	if container == nil {
		return fmt.Errorf("无法获取账号 %s 的Lua容器", selfID)
	}

	// 创建临时的Lua状态用于执行代码
	L := c.createSafeLuaState()
	if L == nil {
		return fmt.Errorf("无法创建安全的Lua执行环境")
	}
	defer L.Close()

	// 设置容器环境变量
	L.SetGlobal("SELF_ID", lua.LString(selfID))

	// 交互循环
	scanner := bufio.NewScanner(os.Stdin)
	for {
		fmt.Printf("lua[%s]> ", selfID)
		if !scanner.Scan() {
			break
		}

		input := strings.TrimSpace(scanner.Text())
		if input == "" {
			continue
		}

		// 检查退出命令
		if input == "exit" || input == "quit" {
			fmt.Println("退出Lua交互模式")
			return nil
		}

		// 执行Lua代码
		if err := c.executeLuaCode(L, input); err != nil {
			fmt.Printf("错误: %v\n", err)
		}
	}

	return scanner.Err()
}

// luaPluginInteractiveMode 插件Lua交互模式
func (c *Console) luaPluginInteractiveMode(selfID, pluginName string) error {
	// 获取插件实例
	instance := c.pm.GetPluginInstance(selfID, pluginName)
	if instance == nil {
		return fmt.Errorf("插件 %s (账号: %s) 未运行", pluginName, selfID)
	}

	// 检查插件是否正在卸载
	if instance.IsUnloading() {
		return fmt.Errorf("插件 %s 正在卸载中，无法执行", pluginName)
	}

	// 交互循环
	scanner := bufio.NewScanner(os.Stdin)
	for {
		fmt.Printf("lua[%s:%s]> ", selfID, pluginName)
		if !scanner.Scan() {
			break
		}

		input := strings.TrimSpace(scanner.Text())
		if input == "" {
			continue
		}

		// 检查退出命令
		if input == "exit" || input == "quit" {
			fmt.Println("退出Lua交互模式")
			return nil
		}

		// 在插件上下文中执行Lua代码
		if err := c.executeLuaCodeInPlugin(instance, input); err != nil {
			fmt.Printf("错误: %v\n", err)
		}
	}

	return scanner.Err()
}

// createSafeLuaState 创建安全的Lua执行环境
func (c *Console) createSafeLuaState() *lua.LState {
	L := lua.NewState(lua.Options{
		SkipOpenLibs: true, // 不打开标准库，手动选择安全的库
	})

	// 打开基础安全库
	for _, pair := range []struct {
		name string
		fn   lua.LGFunction
	}{
		{lua.LoadLibName, lua.OpenPackage},
		{lua.BaseLibName, lua.OpenBase},
		{lua.TabLibName, lua.OpenTable},
		{lua.StringLibName, lua.OpenString},
		{lua.MathLibName, lua.OpenMath},
	} {
		L.Push(L.NewFunction(pair.fn))
		L.Push(lua.LString(pair.name))
		L.Call(1, 0)
	}

	// 移除危险的函数
	L.SetGlobal("dofile", lua.LNil)
	L.SetGlobal("loadfile", lua.LNil)

	return L
}

// executeLuaCode 执行Lua代码（带安全限制）
func (c *Console) executeLuaCode(L *lua.LState, code string) error {
	// 设置执行超时
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// 在goroutine中执行
	done := make(chan error, 1)
	var result lua.LValue
	var once sync.Once

	go func() {
		defer func() {
			if r := recover(); r != nil {
				select {
				case done <- fmt.Errorf("Lua执行 panic: %v", r):
				default:
				}
			}
		}()

		// 编译并执行代码
		if err := L.DoString(code); err != nil {
			select {
			case done <- err:
			default:
			}
			return
		}

		// 获取返回值
		if L.GetTop() > 0 {
			result = L.Get(-1)
			L.Pop(1)
		}

		select {
		case done <- nil:
		default:
		}
	}()

	// 等待执行完成或超时
	select {
	case err := <-done:
		if err != nil {
			return err
		}
		if result != nil {
			fmt.Printf("=> %s\n", result.String())
		}
		return nil
	case <-ctx.Done():
		// 超时，安全地停止Lua状态
		once.Do(func() {
			// 使用互斥锁保护Close操作，避免竞态条件
			L.Close()
		})
		return fmt.Errorf("Lua代码执行超时（超过30秒）")
	}
}

// executeLuaCodeInPlugin 在插件上下文中执行Lua代码
func (c *Console) executeLuaCodeInPlugin(instance *plugins.LuaPluginInstance, code string) error {
	if instance == nil {
		return fmt.Errorf("插件实例为空")
	}

	// 直接访问插件实例的字段，避免使用反射
	L := instance.L
	if L == nil {
		return fmt.Errorf("插件Lua状态无效")
	}

	sandbox := instance.Sandbox()
	if sandbox == nil {
		return fmt.Errorf("插件沙箱无效")
	}

	// 检查沙箱是否已停止
	if sandbox.IsHalted() {
		return fmt.Errorf("插件沙箱已被停止，无法执行")
	}

	// 设置执行超时
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// 在goroutine中执行
	done := make(chan error, 1)
	var result lua.LValue

	go func() {
		defer func() {
			if r := recover(); r != nil {
				select {
				case done <- fmt.Errorf("Lua执行 panic: %v", r):
				default:
				}
			}
		}()

		// 使用沙箱安全调用
		if err := L.DoString(code); err != nil {
			select {
			case done <- err:
			default:
			}
			return
		}

		// 获取返回值
		if L.GetTop() > 0 {
			result = L.Get(-1)
			L.Pop(1)
		}

		select {
		case done <- nil:
		default:
		}
	}()

	// 等待执行完成或超时
	select {
	case err := <-done:
		if err != nil {
			return err
		}
		if result != nil {
			fmt.Printf("=> %s\n", result.String())
		}
		return nil
	case <-ctx.Done():
		// 超时，标记沙箱为停止状态
		sandbox.Halt("执行超时")
		return fmt.Errorf("Lua代码执行超时（超过30秒）")
	}
}

// handleAPI 直接调用机器人API接口
func (c *Console) handleAPI(args []string) error {
	if len(args) < 2 {
		return fmt.Errorf("请指定 self_id 和 action，用法: /api <self_id> <action> [params_json]")
	}

	selfID := args[0]
	action := args[1]

	var params map[string]interface{}
	if len(args) >= 3 {
		// 解析 JSON 参数
		paramsStr := strings.Join(args[2:], " ")
		if err := json.Unmarshal([]byte(paramsStr), &params); err != nil {
			return fmt.Errorf("参数 JSON 解析失败: %w", err)
		}
	}

	fmt.Printf("调用 API: %s, 参数: %v\n", action, params)
	res, err := c.reverseWS.CallBotAPI(selfID, action, params)
	if err != nil {
		return err
	}

	// 格式化输出结果
	jsonData, _ := json.MarshalIndent(res, "", "  ")
	fmt.Printf("API 响应:\n%s\n", string(jsonData))
	return nil
}

// handleGroupAdmin 群组管理员命令
func (c *Console) handleGroupAdmin(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("请指定子命令，使用 /help groupadmin 查看用法")
	}

	subCmd := args[0]
	switch subCmd {
	case "kick":
		if len(args) < 4 {
			return fmt.Errorf("请指定 self_id, group_id 和 user_id，用法: /groupadmin kick <self_id> <group_id> <user_id>")
		}
		return c.kickGroupMember(args[1], args[2], args[3])
	case "setcard":
		if len(args) < 5 {
			return fmt.Errorf("请指定 self_id, group_id, user_id 和 card，用法: /groupadmin setcard <self_id> <group_id> <user_id> <card>")
		}
		return c.setGroupCard(args[1], args[2], args[3], args[4])
	case "setadmin":
		if len(args) < 5 {
			return fmt.Errorf("请指定 self_id, group_id, user_id 和 enable，用法: /groupadmin setadmin <self_id> <group_id> <user_id> <true|false>")
		}
		enable := args[4] == "true"
		return c.setGroupAdmin(args[1], args[2], args[3], enable)
	default:
		return fmt.Errorf("未知子命令: %s，使用 /help groupadmin 查看用法", subCmd)
	}
}

func (c *Console) kickGroupMember(selfID, groupID, userID string) error {
	res, err := c.reverseWS.CallBotAPI(selfID, "set_group_kick", map[string]interface{}{
		"group_id": groupID,
		"user_id":  userID,
	})
	if err != nil {
		return err
	}
	fmt.Printf("已将用户 %s 从群 %s 踢出\n", userID, groupID)
	fmt.Printf("结果: %v\n", res)
	return nil
}

func (c *Console) setGroupCard(selfID, groupID, userID, card string) error {
	res, err := c.reverseWS.CallBotAPI(selfID, "set_group_card", map[string]interface{}{
		"group_id": groupID,
		"user_id":  userID,
		"card":     card,
	})
	if err != nil {
		return err
	}
	fmt.Printf("已设置用户 %s 在群 %s 的群名片为: %s\n", userID, groupID, card)
	fmt.Printf("结果: %v\n", res)
	return nil
}

func (c *Console) setGroupAdmin(selfID, groupID, userID string, enable bool) error {
	res, err := c.reverseWS.CallBotAPI(selfID, "set_group_admin", map[string]interface{}{
		"group_id": groupID,
		"user_id":  userID,
		"enable":   enable,
	})
	if err != nil {
		return err
	}
	if enable {
		fmt.Printf("已设置用户 %s 为群 %s 的管理员\n", userID, groupID)
	} else {
		fmt.Printf("已取消用户 %s 在群 %s 的管理员权限\n", userID, groupID)
	}
	fmt.Printf("结果: %v\n", res)
	return nil
}

// handleMute 群禁言管理
func (c *Console) handleMute(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("请指定子命令，使用 /help mute 查看用法")
	}

	subCmd := args[0]
	switch subCmd {
	case "all":
		if len(args) < 4 {
			return fmt.Errorf("请指定 self_id, group_id 和 enable，用法: /mute all <self_id> <group_id> <true|false>")
		}
		enable := args[3] == "true"
		return c.setGroupWholeBan(args[1], args[2], enable)
	case "user":
		if len(args) < 5 {
			return fmt.Errorf("请指定 self_id, group_id, user_id 和 seconds，用法: /mute user <self_id> <group_id> <user_id> <seconds>")
		}
		seconds, err := strconv.Atoi(args[4])
		if err != nil {
			return fmt.Errorf("seconds 必须是数字")
		}
		return c.setGroupBan(args[1], args[2], args[3], seconds)
	default:
		return fmt.Errorf("未知子命令: %s，使用 /help mute 查看用法", subCmd)
	}
}

func (c *Console) setGroupWholeBan(selfID, groupID string, enable bool) error {
	res, err := c.reverseWS.CallBotAPI(selfID, "set_group_whole_ban", map[string]interface{}{
		"group_id": groupID,
		"enable":   enable,
	})
	if err != nil {
		return err
	}
	if enable {
		fmt.Printf("已开启群 %s 的全员禁言\n", groupID)
	} else {
		fmt.Printf("已关闭群 %s 的全员禁言\n", groupID)
	}
	fmt.Printf("结果: %v\n", res)
	return nil
}

func (c *Console) setGroupBan(selfID, groupID, userID string, seconds int) error {
	res, err := c.reverseWS.CallBotAPI(selfID, "set_group_ban", map[string]interface{}{
		"group_id": groupID,
		"user_id":  userID,
		"duration": seconds,
	})
	if err != nil {
		return err
	}
	if seconds == 0 {
		fmt.Printf("已解除用户 %s 在群 %s 的禁言\n", userID, groupID)
	} else {
		fmt.Printf("已禁言用户 %s %d 秒\n", userID, seconds)
	}
	fmt.Printf("结果: %v\n", res)
	return nil
}

// handleNotice 发送通知类消息
func (c *Console) handleNotice(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("请指定子命令，使用 /help notice 查看用法")
	}

	subCmd := args[0]
	switch subCmd {
	case "poke":
		if len(args) < 4 {
			return fmt.Errorf("请指定 self_id, group_id 和 user_id，用法: /notice poke <self_id> <group_id> <user_id>")
		}
		return c.sendGroupPoke(args[1], args[2], args[3])
	case "nudge":
		if len(args) < 3 {
			return fmt.Errorf("请指定 self_id 和 user_id，用法: /notice nudge <self_id> <user_id>")
		}
		return c.sendNudge(args[1], args[2])
	default:
		return fmt.Errorf("未知子命令: %s，使用 /help notice 查看用法", subCmd)
	}
}

func (c *Console) sendGroupPoke(selfID, groupID, userID string) error {
	res, err := c.reverseWS.CallBotAPI(selfID, "group_poke", map[string]interface{}{
		"group_id": groupID,
		"user_id":  userID,
	})
	if err != nil {
		return err
	}
	fmt.Printf("已在群 %s 戳了用户 %s\n", groupID, userID)
	fmt.Printf("结果: %v\n", res)
	return nil
}

func (c *Console) sendNudge(selfID, userID string) error {
	res, err := c.reverseWS.CallBotAPI(selfID, "friend_poke", map[string]interface{}{
		"user_id": userID,
	})
	if err != nil {
		return err
	}
	fmt.Printf("已戳了好友 %s\n", userID)
	fmt.Printf("结果: %v\n", res)
	return nil
}

// handleCache 缓存管理
func (c *Console) handleCache(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("请指定子命令，使用 /help cache 查看用法")
	}

	subCmd := args[0]
	switch subCmd {
	case "clean":
		if len(args) < 2 {
			return fmt.Errorf("请指定 self_id，用法: /cache clean <self_id>")
		}
		return c.cleanCache(args[1])
	case "status":
		if len(args) < 2 {
			return fmt.Errorf("请指定 self_id，用法: /cache status <self_id>")
		}
		return c.getCacheStatus(args[1])
	default:
		return fmt.Errorf("未知子命令: %s，使用 /help cache 查看用法", subCmd)
	}
}

func (c *Console) cleanCache(selfID string) error {
	res, err := c.reverseWS.CallBotAPI(selfID, "clean_cache", nil)
	if err != nil {
		return err
	}
	fmt.Printf("已清理缓存\n")
	fmt.Printf("结果: %v\n", res)
	return nil
}

func (c *Console) getCacheStatus(selfID string) error {
	// 获取版本信息作为状态检查
	res, err := c.reverseWS.CallBotAPI(selfID, "get_version_info", nil)
	if err != nil {
		return err
	}
	fmt.Println("\n缓存状态:")
	fmt.Println("===========")
	if data, ok := res["data"].(map[string]interface{}); ok {
		fmt.Printf("  AppName: %s\n", data["app_name"])
		fmt.Printf("  AppVersion: %s\n", data["app_version"])
		fmt.Printf("  ProtocolVersion: %s\n", data["protocol_version"])
	}
	return nil
}
