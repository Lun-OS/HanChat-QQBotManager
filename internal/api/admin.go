// 给webui开放的管理员相关API路由（已重构，使用WebLoginService替代AdminService）
package api

import (
	"net/http"

	"HanChat-QQBotManager/internal/services"
	"HanChat-QQBotManager/internal/utils"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// RegisterAdminRoutes 注册管理员相关路由（简化版，使用新的Web登录系统）
func RegisterAdminRoutes(r *gin.RouterGroup, loginSvc *services.WebLoginService, llSvc *services.LLOneBotService, base *zap.Logger, cfg *utils.Config) {
	logger := base.With(zap.String("module", "api.admin")).Sugar()

	// 验证令牌（用于登录页面）
	r.POST("/verify", func(c *gin.Context) {
		var body struct {
			Token string `json:"token"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.Token == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少token"})
			return
		}

		if !loginSvc.ValidateToken(body.Token) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "无效的token或已过期"})
			return
		}

		// 设置安全Cookie
		cookieDomain := ""
		if cfg != nil && cfg.Server.Host != "0.0.0.0" && cfg.Server.Host != "" {
			cookieDomain = cfg.Server.Host
		}

		// 设置HttpOnly Cookie（更安全）
		c.SetCookie("auth_token", body.Token, 86400, "/", cookieDomain, false, true) // HttpOnly=true

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "令牌验证成功",
		})
	})

	// 刷新令牌
	r.POST("/refresh", func(c *gin.Context) {
		// 从Cookie获取token
		token, err := c.Cookie("auth_token")
		if err != nil || token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "未认证"})
			return
		}

		if !loginSvc.ValidateToken(token) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "token无效或已过期"})
			return
		}

		logger.Infow("刷新令牌")

		// 注意：新的Web登录系统不支持刷新token，需要重新登录
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "请使用登录接口重新获取token",
		})
	})

	// 获取登录信息
	r.GET("/info", func(c *gin.Context) {
		// 从Cookie获取token
		token, err := c.Cookie("auth_token")
		if err != nil || token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "未认证"})
			return
		}

		if !loginSvc.ValidateToken(token) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "token无效或已过期"})
			return
		}

		// 获取机器人登录信息
		loginInfo, err := llSvc.GetLoginInfo()
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"success": false, "message": "获取登录信息失败"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"loginInfo": loginInfo,
			},
		})
	})

	// 获取登录信息（别名）
	r.GET("/me", func(c *gin.Context) {
		// 从Cookie获取token
		token, err := c.Cookie("auth_token")
		if err != nil || token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "未认证"})
			return
		}

		if !loginSvc.ValidateToken(token) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "token无效或已过期"})
			return
		}

		// 获取机器人登录信息
		loginInfo, err := llSvc.GetLoginInfo()
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"success": false, "message": "获取登录信息失败"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"loginInfo": loginInfo,
			},
		})
	})
}
