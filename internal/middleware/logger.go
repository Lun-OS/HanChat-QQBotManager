package middleware

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// RequestLogger 记录请求开始与结束
func RequestLogger(base *zap.Logger) gin.HandlerFunc {
	_ = base // 避免"declared and not used"错误
	return func(c *gin.Context) {
		rid := uuid.New().String()
		c.Set("requestId", rid)
		start := time.Now()

		// 注释掉HTTP请求日志，减少日志输出
		// logger.Infow("收到 HTTP 请求",
		// 	"requestId", rid,
		// 	"method", c.Request.Method,
		// 	"path", c.Request.URL.Path,
		// 	"query", c.Request.URL.RawQuery,
		// 	"ip", c.ClientIP(),
		// 	"userAgent", c.Request.UserAgent(),
		// )

		c.Next()

		// 使用下划线标识符避免"declared and not used"错误
		_ = time.Since(start) // duration
		_ = c.Writer.Status() // status
		// level := "info"
		// if c.Writer.Status() >= 400 {
			// level = "error"
		// }
		_ = c.Writer.Header().Get("Content-Length") // contentLength

		// 只记录错误请求，成功请求不记录
		// if level == "error" {
			// 注释掉错误请求日志，减少日志输出
			// logger.Errorw("HTTP 请求完成",
			// 	"requestId", rid,
			// 	"method", c.Request.Method,
			// 	"path", c.Request.URL.Path,
			// 	"statusCode", c.Writer.Status(),
			// 	"durationMs", time.Since(start).Milliseconds(),
			// 	"contentLength", c.Writer.Header().Get("Content-Length"),
			// )
		// }
	}
}
