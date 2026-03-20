package middleware

import (
	"net/http"
	"runtime"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// ErrorHandler 统一错误响应
func ErrorHandler(base *zap.Logger) gin.HandlerFunc {
	logger := base.With(zap.String("module", "middleware.errorHandler")).Sugar()
	return func(c *gin.Context) {
		c.Next()
		if len(c.Errors) > 0 {
			err := c.Errors.Last().Err
			status := http.StatusInternalServerError
			msg := "服务器内部错误"

			// 如果上下文已设置状态码，使用之
			if c.Writer.Status() >= 400 {
				status = c.Writer.Status()
			}

			// 记录错误日志
			logger.Errorw("请求处理错误",
				"requestId", c.GetString("requestId"),
				"method", c.Request.Method,
				"path", c.Request.URL.Path,
				"statusCode", status,
				"message", err.Error(),
			)

			// 返回错误响应
			c.JSON(status, gin.H{
				"success":   false,
				"message":   msg,
				"requestId": c.GetString("requestId"),
			})
		}
	}
}

// Recovery 捕获 panic，返回错误响应
func Recovery(base *zap.Logger) gin.HandlerFunc {
	logger := base.With(zap.String("module", "middleware.recovery")).Sugar()
	return gin.CustomRecovery(func(c *gin.Context, recovered interface{}) {
		// 获取堆栈信息
		stack := make([]byte, 4096)
		n := runtime.Stack(stack, false)

		// 记录详细的panic信息
		logger.Errorw("HTTP处理器panic",
			"requestId", c.GetString("requestId"),
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"query", c.Request.URL.RawQuery,
			"ip", c.ClientIP(),
			"error", recovered,
			"stack", string(stack[:n]))

		// 返回错误响应
		c.JSON(http.StatusInternalServerError, gin.H{
			"success":   false,
			"message":   "服务器内部错误",
			"requestId": c.GetString("requestId"),
		})
		c.Abort()
	})
}
