package api

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"HanChat-QQBotManager/internal/services"
	"HanChat-QQBotManager/internal/utils"
)

// WebLoginHandler Web登录API处理器
type WebLoginHandler struct {
	logger     *zap.SugaredLogger
	loginSvc   *services.WebLoginService
}

// NewWebLoginHandler 创建Web登录处理器
func NewWebLoginHandler(baseLogger *zap.Logger, loginSvc *services.WebLoginService) *WebLoginHandler {
	return &WebLoginHandler{
		logger:   utils.NewModuleLogger(baseLogger, "api.web_login"),
		loginSvc: loginSvc,
	}
}

// Login 登录接口
// POST /api/auth/login
func (h *WebLoginHandler) Login(c *gin.Context) {
	var req services.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "请求参数错误",
		})
		return
	}

	// 获取客户端IP
	clientIP := c.ClientIP()

	// 执行登录
	resp := h.loginSvc.Login(&req, clientIP)

	if resp.Success {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"token":      resp.Token,
				"expires_at": resp.ExpiresAt,
			},
			"message": resp.Message,
		})
	} else {
		// 根据错误类型返回不同状态码
		if resp.Message == "系统出现严重错误，请联系系统管理员" {
			c.JSON(http.StatusForbidden, gin.H{
				"success": false,
				"message": resp.Message,
			})
		} else {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"message": resp.Message,
			})
		}
	}
}

// Logout 登出接口
// POST /api/auth/logout
func (h *WebLoginHandler) Logout(c *gin.Context) {
	token := h.extractToken(c)
	if token != "" {
		h.loginSvc.Logout(token)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "登出成功",
	})
}

// VerifyToken 验证Token接口
// POST /api/auth/verify
func (h *WebLoginHandler) VerifyToken(c *gin.Context) {
	token := h.extractToken(c)
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "缺少token",
		})
		return
	}

	if h.loginSvc.ValidateToken(token) {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "token有效",
		})
	} else {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "token无效或已过期",
		})
	}
}

// GetBanIPList 获取封禁IP列表（需要管理员权限）
// GET /api/auth/banip
func (h *WebLoginHandler) GetBanIPList(c *gin.Context) {
	ips := h.loginSvc.GetBanIPList()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"banned_ips": ips,
			"count":      len(ips),
		},
	})
}

// UnbanIP 解封IP（需要管理员权限）
// POST /api/auth/unbanip
func (h *WebLoginHandler) UnbanIP(c *gin.Context) {
	var req struct {
		IP string `json:"ip" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "缺少IP参数",
		})
		return
	}

	if err := h.loginSvc.UnbanIP(req.IP); err != nil {
		h.logger.Errorw("解封IP失败", "ip", req.IP, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "解封失败",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "解封成功",
	})
}

// extractToken 从请求中提取token
func (h *WebLoginHandler) extractToken(c *gin.Context) string {
	// 1. 从Authorization头获取
	authHeader := c.GetHeader("Authorization")
	if authHeader != "" {
		if strings.HasPrefix(authHeader, "Bearer ") {
			return strings.TrimPrefix(authHeader, "Bearer ")
		}
		return authHeader
	}

	// 2. 从Cookie获取
	if cookieToken, err := c.Cookie("auth_token"); err == nil {
		return cookieToken
	}

	// 3. 从Query参数获取（用于SSE等无法设置header的场景）
	if queryToken := c.Query("token"); queryToken != "" {
		return queryToken
	}

	return ""
}

// AuthMiddleware 认证中间件（带自动续期）
func (h *WebLoginHandler) AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := h.extractToken(c)
		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"message": "缺少认证token",
			})
			c.Abort()
			return
		}

		if !h.loginSvc.ValidateToken(token) {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"message": "token无效或已过期",
			})
			c.Abort()
			return
		}

		// Token有效，进行智能续期检查
		renewResult := h.loginSvc.RenewTokenIfNeeded(token)

		// 将续期信息记录到响应头
		if renewResult.Renewed {
			c.Header("X-Token-Renewed", "true")
			c.Header("X-Token-Expires-At", renewResult.NewExpiresAt.Format("2006-01-02T15:04:05Z07:00"))
		}

		// 将token信息存储到上下文
		c.Set("token", token)
		c.Set("token_renew_result", renewResult)

		c.Next()
	}
}

// RegisterRoutes 注册登录相关路由
func (h *WebLoginHandler) RegisterRoutes(r *gin.RouterGroup) {
	auth := r.Group("/auth")
	{
		auth.POST("/login", h.Login)
		auth.POST("/logout", h.Logout)
		auth.POST("/verify", h.VerifyToken)

		// 需要认证的路由
		authWithAuth := auth.Group("", h.AuthMiddleware())
		{
			authWithAuth.GET("/banip", h.GetBanIPList)
			authWithAuth.POST("/unbanip", h.UnbanIP)
		}
	}
}
