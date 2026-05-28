// 设置相关API - 需要认证
package api

import (
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"HanChat-QQBotManager/internal/config"
	"HanChat-QQBotManager/internal/services"
)

var (
	settingsStore = make(map[string]string)
	settingsMu    sync.RWMutex
)

func containsControlChars(s string) bool {
	for _, r := range s {
		if (r < 32 && r != '\t' && r != '\n' && r != '\r') || r == 127 {
			return true
		}
	}
	return false
}

func RegisterSettingsRoutes(r *gin.RouterGroup, base *zap.Logger, accountConfig *config.AccountConfig, reverseWS *services.ReverseWebSocketService) {
	logger := base.With(zap.String("module", "api.settings")).Sugar()

	r.GET("", func(c *gin.Context) {
		logger.Infow("获取系统设置", "requestId", c.GetString("requestId"))

		settingsMu.RLock()
		websocketAuth := settingsStore["websocket_authorization"]
		settingsMu.RUnlock()

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

	r.POST("", func(c *gin.Context) {
		logger.Infow("保存系统设置", "requestId", c.GetString("requestId"))

		var body struct {
			WebsocketAuthorization string `json:"websocket_authorization"`
			WSPort                 *int   `json:"ws_port"`
			LogLevel               string `json:"log_level"`
			CorsOrigins            string `json:"cors_origins"`
			LogRetentionDays       *int   `json:"log_retention_days"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "参数错误",
			})
			return
		}

		const maxTokenLength = 512
		if len(body.WebsocketAuthorization) > maxTokenLength {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "WebSocket Authorization 长度不能超过512字符",
			})
			return
		}

		if containsControlChars(body.WebsocketAuthorization) {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "WebSocket Authorization 包含非法字符",
			})
			return
		}

		settingsMu.Lock()
		settingsStore["websocket_authorization"] = body.WebsocketAuthorization
		settingsMu.Unlock()

		os.Setenv("WEBSOCKET_AUTHORIZATION", body.WebsocketAuthorization)

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

		if reverseWS != nil {
			reverseWS.UpdateGlobalToken(body.WebsocketAuthorization)
		}

		if accountConfig != nil && (body.WSPort != nil || body.LogLevel != "" || body.CorsOrigins != "" || body.LogRetentionDays != nil) {
			cfg, err := accountConfig.LoadConfig()
			if err == nil {
				advanced := cfg.Advanced
				if body.WSPort != nil {
					if *body.WSPort < 1024 || *body.WSPort > 65535 {
						c.JSON(http.StatusBadRequest, gin.H{
							"success": false,
							"message": "ws_port 必须在 1024-65535 之间",
						})
						return
					}
					advanced.WSPort = *body.WSPort
				}
				if body.LogLevel != "" {
					validLevels := map[string]bool{"debug": true, "info": true, "warn": true, "error": true}
					if !validLevels[body.LogLevel] {
						c.JSON(http.StatusBadRequest, gin.H{
							"success": false,
							"message": "log_level 必须为 debug/info/warn/error 之一",
						})
						return
					}
					advanced.LogLevel = body.LogLevel
				}
				if body.CorsOrigins != "" {
					origins := strings.Split(body.CorsOrigins, ",")
					for i, o := range origins {
						origins[i] = strings.TrimSpace(o)
					}
					advanced.CorsOrigins = origins
				}
				if body.LogRetentionDays != nil {
					if *body.LogRetentionDays < 1 || *body.LogRetentionDays > 365 {
						c.JSON(http.StatusBadRequest, gin.H{
							"success": false,
							"message": "log_retention_days 必须在 1-365 之间",
						})
						return
					}
					advanced.LogRetentionDays = *body.LogRetentionDays
				}
				if saveErr := accountConfig.SaveAdvancedConfig(advanced); saveErr != nil {
					logger.Warnw("保存高级配置到文件失败", "error", saveErr)
				} else {
					logger.Infow("高级配置已保存到文件")
				}
			}
		}

		logger.Infow("系统设置已保存",
			"websocket_authorization_configured", body.WebsocketAuthorization != "",
		)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "设置已保存",
		})
	})

	r.GET("/log-cleanup", func(c *gin.Context) {
		logger.Infow("获取日志清理配置", "requestId", c.GetString("requestId"))

		if accountConfig == nil {
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"data": gin.H{
					"enabled":   true,
					"interval":  24,
					"retention": 7,
					"scope": gin.H{
						"pluginLog":   true,
						"loginLog":    true,
						"fileOpLog":   true,
						"pluginOpLog": true,
						"proxyLog":    true,
						"botConnLog":  true,
					},
				},
			})
			return
		}

		cfg, err := accountConfig.LoadConfig()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"message": "加载配置失败",
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"enabled":   cfg.LogCleanup.Enabled,
				"interval":  cfg.LogCleanup.Interval,
				"retention": cfg.LogCleanup.Retention,
				"scope": gin.H{
					"pluginLog":   cfg.LogCleanup.Scope.PluginLog,
					"loginLog":    cfg.LogCleanup.Scope.LoginLog,
					"fileOpLog":   cfg.LogCleanup.Scope.FileOpLog,
					"pluginOpLog": cfg.LogCleanup.Scope.PluginOpLog,
					"proxyLog":    cfg.LogCleanup.Scope.ProxyLog,
					"botConnLog":  cfg.LogCleanup.Scope.BotConnLog,
				},
			},
		})
	})

	r.POST("/log-cleanup", func(c *gin.Context) {
		logger.Infow("保存日志清理配置", "requestId", c.GetString("requestId"))

		var body struct {
			Enabled   bool `json:"enabled"`
			Interval  int  `json:"interval"`
			Retention int  `json:"retention"`
			Scope     struct {
				PluginLog   bool `json:"pluginLog"`
				LoginLog    bool `json:"loginLog"`
				FileOpLog   bool `json:"fileOpLog"`
				PluginOpLog bool `json:"pluginOpLog"`
				ProxyLog    bool `json:"proxyLog"`
				BotConnLog  bool `json:"botConnLog"`
			} `json:"scope"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "参数错误",
			})
			return
		}

		if body.Interval < 1 || body.Interval > 168 {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "interval 必须在 1-168 之间",
			})
			return
		}
		if body.Retention < 1 || body.Retention > 365 {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "retention 必须在 1-365 之间",
			})
			return
		}

		if accountConfig == nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"message": "配置服务不可用",
			})
			return
		}

		logCleanup := config.LogCleanupConfig{
			Enabled:   body.Enabled,
			Interval:  body.Interval,
			Retention: body.Retention,
			Scope: config.LogCleanupScope{
				PluginLog:   body.Scope.PluginLog,
				LoginLog:    body.Scope.LoginLog,
				FileOpLog:   body.Scope.FileOpLog,
				PluginOpLog: body.Scope.PluginOpLog,
				ProxyLog:    body.Scope.ProxyLog,
				BotConnLog:  body.Scope.BotConnLog,
			},
		}
		if err := accountConfig.SaveLogCleanupConfig(logCleanup); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"message": "保存日志清理配置失败",
			})
			return
		}

		logger.Infow("日志清理配置已保存",
			"enabled", body.Enabled,
			"interval", body.Interval,
			"retention", body.Retention,
		)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "日志清理配置已保存",
		})
	})

	r.GET("/appearance", func(c *gin.Context) {
		logger.Infow("获取外观配置", "requestId", c.GetString("requestId"))

		if accountConfig == nil {
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"data": gin.H{
					"theme":     "light",
					"fontSize":  16,
					"customCSS": map[string]string{},
				},
			})
			return
		}

		cfg, err := accountConfig.LoadConfig()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"message": "加载配置失败",
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"theme":     cfg.Appearance.Theme,
				"fontSize":  cfg.Appearance.FontSize,
				"customCSS": cfg.Appearance.CustomCSS,
			},
		})
	})

	r.POST("/appearance", func(c *gin.Context) {
		logger.Infow("保存外观配置", "requestId", c.GetString("requestId"))

		var body struct {
			Theme     string            `json:"theme"`
			FontSize  int               `json:"fontSize"`
			CustomCSS map[string]string `json:"customCSS"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "参数错误",
			})
			return
		}

		if body.Theme != "light" && body.Theme != "dark" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "theme 必须为 light 或 dark",
			})
			return
		}

		if body.FontSize < 12 || body.FontSize > 24 {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "fontSize 必须在 12-24 之间",
			})
			return
		}

		if accountConfig == nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"message": "配置服务不可用",
			})
			return
		}

		appearance := config.AppearanceConfig{
			Theme:     body.Theme,
			FontSize:  body.FontSize,
			CustomCSS: body.CustomCSS,
		}
		if appearance.CustomCSS == nil {
			appearance.CustomCSS = make(map[string]string)
		}

		if err := accountConfig.SaveAppearanceConfig(appearance); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"message": "保存外观配置失败",
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "外观配置已保存",
		})
	})

	r.GET("/advanced", func(c *gin.Context) {
		logger.Infow("获取高级配置", "requestId", c.GetString("requestId"))

		if accountConfig == nil {
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"data": gin.H{
					"wsPort":           59178,
					"logLevel":         "info",
					"corsOrigins":      []string{"*"},
					"logRetentionDays": 7,
				},
			})
			return
		}

		cfg, err := accountConfig.LoadConfig()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"message": "加载配置失败",
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"wsPort":           cfg.Advanced.WSPort,
				"logLevel":         cfg.Advanced.LogLevel,
				"corsOrigins":      cfg.Advanced.CorsOrigins,
				"logRetentionDays": cfg.Advanced.LogRetentionDays,
			},
		})
	})

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

	r.GET("/admins", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    []any{},
		})
	})

	r.GET("/operations", func(c *gin.Context) {
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "50"))

		if page < 1 {
			page = 1
		}
		if pageSize < 1 || pageSize > 100 {
			pageSize = 50
		}

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
