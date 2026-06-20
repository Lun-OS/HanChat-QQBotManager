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
	logger      *zap.SugaredLogger
	loginSvc    *services.WebLoginService
	captchaSvc  *services.CaptchaService
	logManager  *services.LogManager
}

// NewWebLoginHandler 创建Web登录处理器
func NewWebLoginHandler(baseLogger *zap.Logger, loginSvc *services.WebLoginService, captchaSvc *services.CaptchaService, logManager *services.LogManager) *WebLoginHandler {
	return &WebLoginHandler{
		logger:     utils.NewModuleLogger(baseLogger, "api.web_login"),
		loginSvc:   loginSvc,
		captchaSvc: captchaSvc,
		logManager: logManager,
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

	// 获取客户端IP和UA
	clientIP := c.ClientIP()
	userAgent := c.GetHeader("User-Agent")

	// 执行登录
	resp := h.loginSvc.Login(&req, clientIP)

	if resp.Success {
		if h.logManager != nil {
			h.logManager.WriteLoginLog("LOGIN_SUCCESS", req.Username, clientIP, userAgent, "登录成功")
		}
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"token":      resp.Token,
				"expires_at": resp.ExpiresAt,
			},
			"message": resp.Message,
		})
	} else {
		if h.logManager != nil {
			h.logManager.WriteLoginLog("LOGIN_FAILED", req.Username, clientIP, userAgent, resp.Message)
		}
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
	clientIP := c.ClientIP()
	userAgent := c.GetHeader("User-Agent")
	if token != "" {
		h.loginSvc.Logout(token)
	}
	if h.logManager != nil {
		h.logManager.WriteLoginLog("LOGOUT", "admin", clientIP, userAgent, "用户主动登出")
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
// 安全增强：不再支持从Query参数获取token，防止Token泄露
func (h *WebLoginHandler) extractToken(c *gin.Context) string {
	// 1. 从Authorization头获取（推荐方式）
	authHeader := c.GetHeader("Authorization")
	if authHeader != "" {
		if strings.HasPrefix(authHeader, "Bearer ") {
			return strings.TrimPrefix(authHeader, "Bearer ")
		}
		return authHeader
	}

	// 2. 从Cookie获取（次选方式）
	if cookieToken, err := c.Cookie("auth_token"); err == nil {
		return cookieToken
	}

	// 安全警告：已移除从Query参数获取Token的功能
	// 原因：Token出现在URL中会导致以下安全风险：
	//   - Token会保存在浏览器历史记录中
	//   - Token会出现在HTTP Referer头中（访问外部链接时）
	//   - Token会被Web服务器和代理服务器的访问日志记录
	//
	// 如果确实需要支持SSE等无法设置header的场景，
	// 请使用Cookie方式传递Token

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

// GetCaptcha 获取验证码
// GET /api/auth/captcha
func (h *WebLoginHandler) GetCaptcha(c *gin.Context) {
	resp, err := h.captchaSvc.GenerateCaptcha()
	if err != nil {
		h.logger.Errorw("生成验证码失败", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "生成验证码失败",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    resp,
	})
}

// RefreshCaptcha 刷新验证码
// POST /api/auth/captcha/refresh
func (h *WebLoginHandler) RefreshCaptcha(c *gin.Context) {
	var req struct {
		CaptchaID string `json:"captcha_id"`
	}
	c.ShouldBindJSON(&req)

	resp, err := h.captchaSvc.RefreshCaptcha(req.CaptchaID)
	if err != nil {
		h.logger.Errorw("刷新验证码失败", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "刷新验证码失败",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    resp,
	})
}

// RegisterRoutes 注册登录相关路由
func (h *WebLoginHandler) RegisterRoutes(r *gin.RouterGroup) {
	auth := r.Group("/auth")
	{
		// 验证码接口（不需要认证）
		auth.GET("/captcha", h.GetCaptcha)
		auth.POST("/captcha/refresh", h.RefreshCaptcha)

		auth.POST("/login", h.Login)
		auth.POST("/verify", h.VerifyToken)

		// 需要认证的路由
		authWithAuth := auth.Group("", h.AuthMiddleware())
		{
			authWithAuth.POST("/logout", h.Logout)
			authWithAuth.GET("/banip", h.GetBanIPList)
			authWithAuth.POST("/unbanip", h.UnbanIP)
		}
	}
}
