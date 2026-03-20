// 设置相关API - 需要认证
package api

import (
	"net/http"
	"os"
	"strconv"
	"sync"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"HanChat-QQBotManager/internal/config"
	"HanChat-QQBotManager/internal/services"
)

// 内存中的设置存储（实际应用中应该使用配置文件或数据库）
var (
	settingsStore = make(map[string]string)
	settingsMu    sync.RWMutex
)

// containsControlChars 检查字符串是否包含控制字符（防止注入攻击）
func containsControlChars(s string) bool {
	for _, r := range s {
		// 禁止控制字符（0-31）和DEL（127），但允许正常的空白字符
		if (r < 32 && r != '\t' && r != '\n' && r != '\r') || r == 127 {
			return true
		}
	}
	return false
}

// RegisterSettingsRoutes 注册设置相关路由（已添加认证中间件）
func RegisterSettingsRoutes(r *gin.RouterGroup, base *zap.Logger, accountConfig *config.AccountConfig, reverseWS *services.ReverseWebSocketService) {
	logger := base.With(zap.String("module", "api.settings")).Sugar()

	// 获取系统设置
	r.GET("", func(c *gin.Context) {
		logger.Infow("获取系统设置", "requestId", c.GetString("requestId"))

		settingsMu.RLock()
		websocketAuth := settingsStore["websocket_authorization"]
		settingsMu.RUnlock()

		// 如果内存中没有，尝试从环境变量读取
		if websocketAuth == "" {
			websocketAuth = os.Getenv("WEBSOCKET_AUTHORIZATION")
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"websocket_authorization": websocketAuth,
			},
		})
	})

	// 保存系统设置
	r.POST("", func(c *gin.Context) {
		logger.Infow("保存系统设置", "requestId", c.GetString("requestId"))

		var body struct {
			WebsocketAuthorization string `json:"websocket_authorization"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "参数错误",
			})
			return
		}

		// 输入验证：长度限制（最大512字符）
		const maxTokenLength = 512
		if len(body.WebsocketAuthorization) > maxTokenLength {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "WebSocket Authorization 长度不能超过512字符",
			})
			return
		}

		// 输入验证：禁止换行符和控制字符（防止注入）
		if containsControlChars(body.WebsocketAuthorization) {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "WebSocket Authorization 包含非法字符",
			})
			return
		}

		// 保存到内存
		settingsMu.Lock()
		settingsStore["websocket_authorization"] = body.WebsocketAuthorization
		settingsMu.Unlock()

		// 同时更新环境变量（仅当前进程有效）
		os.Setenv("WEBSOCKET_AUTHORIZATION", body.WebsocketAuthorization)

		// 更新配置文件
		if accountConfig != nil {
			cfg, err := accountConfig.LoadConfig()
			if err == nil {
				wsConfig := cfg.Websocket
				wsConfig.Authorization = body.WebsocketAuthorization
				if saveErr := accountConfig.SaveWebsocketConfig(wsConfig); saveErr != nil {
					logger.Warnw("保存WebSocket配置到文件失败", "error", saveErr)
				} else {
					logger.Infow("WebSocket配置已保存到文件")
				}
			}
		}

		// 实时更新ReverseWebSocketService的Token（使新连接立即生效）
		if reverseWS != nil {
			reverseWS.UpdateGlobalToken(body.WebsocketAuthorization)
		}

		// 安全日志：不记录Token内容，只记录是否设置
		logger.Infow("系统设置已保存",
			"websocket_authorization_configured", body.WebsocketAuthorization != "",
		)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "设置已保存",
		})
	})

	// 获取系统日志
	r.GET("/logs", func(c *gin.Context) {
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "50"))
		level := c.Query("level")

		if page < 1 {
			page = 1
		}
		if pageSize < 1 || pageSize > 100 {
			pageSize = 50
		}

		// TODO: 从日志文件读取系统日志
		// 暂时返回空列表
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"list":     []any{},
				"total":    0,
				"page":     page,
				"pageSize": pageSize,
				"level":    level,
			},
		})
	})

	// 获取管理员列表
	r.GET("/admins", func(c *gin.Context) {
		// TODO: 从配置文件或环境变量读取管理员列表
		// 暂时返回空列表
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    []any{},
		})
	})

	// 获取操作记录
	r.GET("/operations", func(c *gin.Context) {
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "50"))

		if page < 1 {
			page = 1
		}
		if pageSize < 1 || pageSize > 100 {
			pageSize = 50
		}

		// TODO: 从日志文件或存储读取操作记录
		// 暂时返回空列表
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"list":     []any{},
				"total":    0,
				"page":     page,
				"pageSize": pageSize,
			},
		})
	})
}
