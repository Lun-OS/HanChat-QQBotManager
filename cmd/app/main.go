package main

import (
	"context"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"HanChat-QQBotManager/internal/api"
	"HanChat-QQBotManager/internal/config"
	"HanChat-QQBotManager/internal/console"
	"HanChat-QQBotManager/internal/middleware"
	"HanChat-QQBotManager/internal/plugins"
	"HanChat-QQBotManager/internal/services"
	"HanChat-QQBotManager/internal/utils"
)

// ANSI颜色代码
const (
	colorRed    = "\033[31m"
	colorYellow = "\033[33m"
	colorReset  = "\033[0m"
)

// LogWriter 日志写入器
type LogWriter struct {
	file *os.File
	mu   sync.Mutex
}

// NewLogWriter 创建新的日志写入器
func NewLogWriter(logPath string) (*LogWriter, error) {
	logDir := filepath.Dir(logPath)
	if err := os.MkdirAll(logDir, 0755); err != nil {
		return nil, fmt.Errorf("创建日志目录失败: %w", err)
	}

	file, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return nil, fmt.Errorf("打开日志文件失败: %w", err)
	}

	return &LogWriter{file: file}, nil
}

// Write 写入日志
func (w *LogWriter) Write(message string) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	timestamp := time.Now().Format("2006-01-02 15:04:05.000")
	logEntry := fmt.Sprintf("[%s] %s\n", timestamp, message)
	_, err := w.file.WriteString(logEntry)
	return err
}

// Close 关闭日志文件
func (w *LogWriter) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.file.Close()
}

// writeToLogFile 将消息写入日志文件（兼容旧代码，线程安全）
var startupLogWriter *LogWriter
var startupLogMu sync.Mutex // 保护 startupLogWriter 的并发访问

func writeToLogFile(message string) {
	startupLogMu.Lock()
	defer startupLogMu.Unlock()
	if startupLogWriter != nil {
		startupLogWriter.Write(message)
	}
}

// checkEnvFile 检查环境变量文件是否存在
func checkEnvFile() {
	envPath := ".env"
	if _, err := os.Stat(envPath); os.IsNotExist(err) {
		errorMsg := fmt.Sprintf("%s错误: 环境变量文件不存在: %s，请从 .env.example 复制并配置%s", colorRed, envPath, colorReset)
		fmt.Println(errorMsg)

		logMsg := fmt.Sprintf("启动失败: 环境变量文件不存在 - %s，请从 .env.example 复制并配置", envPath)
		writeToLogFile(logMsg)

		os.Exit(1)
	}
}

// checkWebFolder 检查web文件夹是否存在
func checkWebFolder() {
	webPath := "./web"
	if _, err := os.Stat(webPath); os.IsNotExist(err) {
		warningMsg := fmt.Sprintf("%s警告: web文件夹不存在: %s，程序将继续运行%s", colorYellow, webPath, colorReset)
		fmt.Println(warningMsg)

		logMsg := fmt.Sprintf("启动警告: web文件夹不存在 - %s，程序将继续运行", webPath)
		writeToLogFile(logMsg)
	}
}

func main() {
	// 解析命令行参数
	debugMode := flag.Bool("debug", false, "启用调试模式，日志输出到终端")
	flag.Parse()

	// 初始化启动日志写入器
	var err error
	startupLogWriter, err = NewLogWriter("./logs/startup.log")
	if err != nil {
		fmt.Printf("警告: 无法创建启动日志: %v\n", err)
	} else {
		defer startupLogWriter.Close()
	}

	// 启动前检查：环境变量文件
	checkEnvFile()

	// 启动前检查：web文件夹
	checkWebFolder()

	// 加载配置
	cfg := utils.LoadConfig()

	// 初始化日志
	baseLogger := utils.InitLogger(cfg.Logger)
	defer baseLogger.Sync()
	appLogger := utils.NewModuleLogger(baseLogger, "app")

	// 设置信号处理，实现优雅关闭
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	
	// 创建可取消的上下文用于优雅关闭
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Gin 模式：生产环境强制使用Release模式
	gin.SetMode(gin.ReleaseMode)

	r := gin.New()

	// 禁用Gin默认的访问日志输出
	if *debugMode {
		appLogger.Info("调试模式已启用，日志输出到终端")
	}
	r.Use(gin.LoggerWithFormatter(func(param gin.LogFormatterParams) string {
		return ""
	}))

	// 中间件：恢复、请求日志、统一错误
	r.Use(middleware.Recovery(baseLogger))
	r.Use(middleware.RequestLogger(baseLogger))
	r.Use(middleware.ErrorHandler(baseLogger))

	// CORS配置（安全性增强）
	if cfg.Server.CORS.Enabled {
		corsConfig := cors.Config{
			AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
			AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Admin-Token", "X-Self-ID"},
			ExposeHeaders:    []string{"Content-Length"},
			AllowCredentials: true,
			MaxAge:           12 * time.Hour,
		}

		if cfg.Server.CORS.Origin == "*" {
			corsConfig.AllowAllOrigins = true
			appLogger.Warnw("CORS配置为*，允许所有来源，不推荐生产环境使用")
		} else {
			corsConfig.AllowOrigins = []string{cfg.Server.CORS.Origin}
		}

		r.Use(cors.New(corsConfig))
	}

	// 基础路由
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"success":   true,
			"message":   "Service is running",
			"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
		})
	})

	// ========== 多账号核心模块初始化 ==========
	// 初始化账号配置管理器
	accountConfig := config.NewAccountConfig("config.json")

	// 初始化账号管理器（单例）
	accountMgr := services.GetBotAccountManager(baseLogger, accountConfig)

	// ========== Web登录系统（替代MySQL） ==========
	// 初始化新的Web登录服务（基于环境变量）
	webLoginSvc := services.NewWebLoginService(baseLogger)
	webLoginHandler := api.NewWebLoginHandler(baseLogger, webLoginSvc)
	webLoginHandler.RegisterRoutes(r.Group("/api"))

	// ========== 日志管理器 ==========
	logManager := services.NewLogManager(baseLogger, "./logs")

	// ========== 反向WebSocket服务端 ==========
	// 从配置加载全局Token（优先从环境变量读取，否则从config.json读取）
	cfgFile, _ := accountConfig.LoadConfig()
	globalToken := cfgFile.Websocket.Authorization
	// 如果环境变量设置了WEBSOCKET_AUTHORIZATION，优先使用环境变量的值
	if envToken := os.Getenv("WEBSOCKET_AUTHORIZATION"); envToken != "" {
		globalToken = envToken
	}

	// 创建反向WebSocket服务
	reverseWS := services.NewReverseWebSocketService(baseLogger, accountMgr, accountConfig, globalToken)
	reverseWS.SetLogManager(logManager)

	// 设置最大连接数限制
	maxConnections := cfg.Websocket.MaxConnections
	if maxConnections > 0 {
		reverseWS.SetMaxConnections(maxConnections)
		appLogger.Infow("最大连接数限制已设置", "max", maxConnections)
	}

	// 注册反向WebSocket路由 /ws/{customName}
	r.GET("/ws/:customName", reverseWS.HandleWebSocket)

	// 启动定期清理任务（每5分钟清理一次过期连接）
	reverseWS.StartCleanupTask(5*time.Minute, 10*time.Minute)

	// ========== WebSocket调试服务 ==========
	// 创建WebSocket调试服务
	wsDebugService := services.NewWSDebugService(baseLogger, reverseWS)
	// 注册调试路由 /debug/{self_id}
	r.GET("/debug/:self_id", wsDebugService.HandleDebugWebSocket)
	appLogger.Infow("WebSocket调试服务已启动", "path", "/debug/{self_id}")

	// ========== 插件系统（多账号隔离）==========
	// 使用新的反向WebSocket服务
	pm := plugins.NewManager(cfg, nil)
	pm.SetLogger(utils.NewModuleLogger(baseLogger, "plugins.manager"))
	pm.SetReverseWebSocketService(reverseWS)

	// 自动启动预配置的插件
	pm.AutoStartPlugins()

	// 注册连接回调：当有新机器人连接时，自动创建对应的插件目录
	reverseWS.OnConnect(func(selfID string) {
		if err := pm.CreateAccountPluginDir(selfID); err != nil {
			baseLogger.Warn("自动创建插件目录失败", zap.String("self_id", selfID), zap.Error(err))
		}
	})

	// ========== 插件HTTP接口路由 ==========
	// 设置HTTP接口管理器
	api.SetHTTPInterfaceManager(pm.GetHTTPInterfaceManager())
	// 注册插件HTTP接口路由
	api.RegisterHTTPInterfaceRoutes(r, baseLogger)

	// ========== 多账号API路由 ==========
	// 注册多账号API路由（需要认证）
	apiGroup := r.Group("/api")
	apiGroup.Use(webLoginHandler.AuthMiddleware())

	// ========== 插件管理API路由 ==========
	// 注册插件管理API路由（需要认证）
	api.RegisterPluginManageRoutes(apiGroup.Group("/plugins"), pm, baseLogger)

	// ========== 插件文件管理API路由 ==========
	// 注册插件文件管理API路由（需要认证）
	pluginManagerHandler := api.NewPluginManagerHandler(baseLogger, reverseWS.GetAccountManager())
	pluginManagerHandler.RegisterRoutes(apiGroup)

	// 1. 先注册固定路由（设置、系统等）
	// 系统路由 /api/system/*
	api.RegisterSystemRoutes(apiGroup.Group("/system"), reverseWS, baseLogger)

	// 设置路由 /api/settings/* (需要认证)
	api.RegisterSettingsRoutes(apiGroup.Group("/settings"), baseLogger, accountConfig, reverseWS)

	// 日志路由 /api/logs (使用JWT认证)
	logHandler := api.NewLogHandler(baseLogger, reverseWS)
	logHandler.RegisterRoutes(apiGroup)

	// 2. 再注册多账号路由 /api/:self_id/*
	// 注意：这个路由会捕获所有 /api/xxx/yyy，所以要放在最后
	multiAccountHandler := api.NewMultiAccountHandler(baseLogger, accountMgr, reverseWS)
	multiAccountHandler.RegisterRoutes(apiGroup)

	// 创建SSE客户端
	sseClient := services.NewSSEClient(reverseWS, baseLogger, pm)
	sseClient.Start()

	// ========== WebQQ模块 ==========
	// 初始化WebQQ管理器
	webQQManager := api.GetWebQQManager(baseLogger, reverseWS)
	// 注册WebQQ路由
	api.RegisterWebQQRoutes(apiGroup.Group("/webqq"), webQQManager, baseLogger)

	// 静态页面（H5）- SPA支持
	// 根路径返回 index.html
	r.GET("/", func(c *gin.Context) { c.File("./web/index.html") })

	// 对于非API路径，返回index.html让前端HashRouter处理（前端使用HashRouter，路径格式为/#/xxx）
	// 排除 /assets, /api, /ws 等已知路径
	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		// 排除已知路径前缀
		if strings.HasPrefix(path, "/assets/") ||
			strings.HasPrefix(path, "/api/") ||
			strings.HasPrefix(path, "/ws/") ||
			strings.HasPrefix(path, "/health") {
			c.JSON(404, gin.H{"success": false, "message": "Not Found"})
			return
		}
		// 其他路径返回index.html，让前端HashRouter处理
		c.File("./web/index.html")
	})
	
	// 静态资源
	r.Static("/assets", "./web/assets")

	// ========== 控制台命令系统 ==========
	consoleSvc := console.NewConsole(baseLogger, pm, accountMgr, reverseWS, accountConfig, *debugMode)
	consoleSvc.Start()
	defer consoleSvc.Stop()

	// 启动服务器
	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	appLogger.Infow("服务器启动成功",
		"addr", addr,
		"env", cfg.Env,
		"websocket_path", "/ws/{customName}",
		"debug_mode", *debugMode,
	)

	// 在后台启动HTTP服务器
	srv := &http.Server{
		Addr:    addr,
		Handler: r,
	}

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			appLogger.Errorw("服务器启动失败", "error", err)
		}
	}()

	go func() {
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				var m runtime.MemStats
				runtime.ReadMemStats(&m)
				appLogger.Infow("内存状态",
					"alloc_mb", m.Alloc/1024/1024,
					"sys_mb", m.Sys/1024/1024,
					"num_gc", m.NumGC,
					"goroutines", runtime.NumGoroutine())
			}
		}
	}()

	// 等待信号或上下文取消
	select {
	case sig := <-sigChan:
		appLogger.Infow("收到信号，准备优雅关闭程序", "signal", sig)
	case <-ctx.Done():
		appLogger.Infow("上下文取消，准备优雅关闭程序")
	}

	// 优雅关闭：设置超时
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	appLogger.Infow("开始优雅关闭流程...")

	// ⭐ 关键优化：按依赖关系顺序关闭，避免事件处理异常
	// 原则：先停止事件源 → 再停止消费者 → 最后清理资源

	// 1. 首先停止HTTP服务器（不再接受新的API请求）
	if err := srv.Shutdown(shutdownCtx); err != nil {
		appLogger.Errorw("HTTP服务器关闭失败", "error", err)
	}
	appLogger.Infow("HTTP服务器已停止")

	// 2. 停止SSE客户端（停止事件分发源）
	sseClient.Stop()
	appLogger.Infow("SSE客户端已停止")

	// 3. 停止WebSocket服务（停止接收新消息，断开连接）
	reverseWS.Stop()
	appLogger.Infow("WebSocket服务已停止")

	// 4. 关闭插件管理器（此时没有新事件来源了，安全卸载所有插件）
	if err := pm.Shutdown(15 * time.Second); err != nil {
		appLogger.Errorw("插件管理器关闭失败", "error", err)
	}
	appLogger.Infow("插件管理器已关闭")

	// 5. 最后关闭日志管理器（确保所有日志都已写入磁盘）
	logManager.Close()
	appLogger.Infow("日志管理器已关闭")

	appLogger.Infow("程序已优雅关闭")
}
