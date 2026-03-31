// 首页的管理员登录认证
package middleware

import (
	"net/http"
	"strings"

	"HanChat-QQBotManager/internal/services"

	"github.com/gin-gonic/gin"
)

// AdminAuth 管理员认证中间件
// 使用新的WebLoginService替代旧的AdminService
// 包含自动token续期机制
func AdminAuth(loginSvc *services.WebLoginService) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 从多个来源获取token
		token := ""

		// 1. 从Header获取（X-Admin-Token 或 Authorization: Bearer）
		if headerToken := c.GetHeader("X-Admin-Token"); headerToken != "" {
			token = headerToken
		} else if authHeader := c.GetHeader("Authorization"); authHeader != "" {
			if strings.HasPrefix(authHeader, "Bearer ") {
				token = strings.TrimPrefix(authHeader, "Bearer ")
			}
		}

		// 2. 从Cookie获取（仅用于Web页面）
		if token == "" {
			if cookieToken, err := c.Cookie("auth_token"); err == nil && cookieToken != "" {
				token = cookieToken
			}
		}

		// 注意：不再支持从Query参数获取token，因为不安全（可能泄露到日志、浏览器历史等）

		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"message": "缺少认证令牌",
			})
			c.Abort()
			return
		}

		// 验证token
		if !loginSvc.ValidateToken(token) {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"message": "无效的认证令牌或已过期",
			})
			c.Abort()
			return
		}

		// Token有效，进行智能续期检查
		renewResult := loginSvc.RenewTokenIfNeeded(token)

		// 将续期信息记录到响应头（可选，便于客户端感知续期状态）
		if renewResult.Renewed {
			c.Header("X-Token-Renewed", "true")
			c.Header("X-Token-Expires-At", renewResult.NewExpiresAt.Format("2006-01-02T15:04:05Z07:00"))
		}

		// 将token信息存储到上下文，供后续处理器使用
		c.Set("token", token)
		c.Set("token_renew_result", renewResult)

		c.Next()
	}
}
