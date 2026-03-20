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

		c.Next()
	}
}
