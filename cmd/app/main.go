package main

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"HanChat-QQBotManager/internal/api"
	"HanChat-QQBotManager/internal/config"
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

// writeToLogFile 将消息写入日志文件
func writeToLogFile(message string) {
	logDir := "./logs"
	if err := os.MkdirAll(logDir, 0755); err != nil {
		return
	}

	logFile := filepath.Join(logDir, "combined.log")
	file, err := os.OpenFile(logFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	defer file.Close()

	timestamp := time.Now().Format("2006-01-02 15:04:05.000")
	logEntry := fmt.Sprintf("[%s] %s\n", timestamp, message)
	file.WriteString(logEntry)
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

	// Gin 模式：生产环境强制使用Release模式
	gin.SetMode(gin.ReleaseMode)

	r := gin.New()

	// 禁用Gin默认的访问日志输出
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

	// 启动服务器
	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	appLogger.Infow("服务器启动成功",
		"addr", addr,
		"env", cfg.Env,
		"websocket_path", "/ws/{customName}",
	)

	if err := r.Run(addr); err != nil {
		appLogger.Errorw("服务器启动失败", "error", err)
	}
}
