package middleware

import (
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// RateLimiter 限流器
type RateLimiter struct {
	mu          sync.RWMutex
	requests    map[string][]time.Time // IP -> 请求时间列表
	limit       int                    // 时间窗口内最大请求数
	window      time.Duration          // 时间窗口
	cleanupInterval time.Duration      // 清理间隔
}

// NewRateLimiter 创建限流器
func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		requests:        make(map[string][]time.Time),
		limit:           limit,
		window:          window,
		cleanupInterval: 5 * time.Minute,
	}

	// 启动定期清理任务
	go rl.cleanupTask()

	return rl
}

// Allow 检查是否允许请求
func (rl *RateLimiter) Allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-rl.window)

	// 获取该IP的请求历史
	times, exists := rl.requests[ip]
	if !exists {
		// 首次请求
		rl.requests[ip] = []time.Time{now}
		return true
	}

	// 过滤掉过期的请求记录
	validTimes := make([]time.Time, 0)
	for _, t := range times {
		if t.After(cutoff) {
			validTimes = append(validTimes, t)
		}
	}

	// 检查是否超过限制
	if len(validTimes) >= rl.limit {
		rl.requests[ip] = validTimes
		return false
	}

	// 添加当前请求
	validTimes = append(validTimes, now)
	rl.requests[ip] = validTimes

	return true
}

// GetRemaining 获取剩余请求次数
func (rl *RateLimiter) GetRemaining(ip string) int {
	rl.mu.RLock()
	defer rl.mu.RUnlock()

	cutoff := time.Now().Add(-rl.window)
	times, exists := rl.requests[ip]
	if !exists {
		return rl.limit
	}

	// 计算有效请求数
	validCount := 0
	for _, t := range times {
		if t.After(cutoff) {
			validCount++
		}
	}

	remaining := rl.limit - validCount
	if remaining < 0 {
		remaining = 0
	}

	return remaining
}

// cleanupTask 定期清理过期的请求记录
func (rl *RateLimiter) cleanupTask() {
	ticker := time.NewTicker(rl.cleanupInterval)
	defer ticker.Stop()

	for range ticker.C {
		rl.mu.Lock()
		cutoff := time.Now().Add(-rl.window)

		for ip, times := range rl.requests {
			validTimes := make([]time.Time, 0)
			for _, t := range times {
				if t.After(cutoff) {
					validTimes = append(validTimes, t)
				}
			}

			if len(validTimes) == 0 {
				delete(rl.requests, ip)
			} else {
				rl.requests[ip] = validTimes
			}
		}

		rl.mu.Unlock()
	}
}

// RateLimit 限流中间件
func RateLimit(limit int, window time.Duration, logger *zap.Logger) gin.HandlerFunc {
	limiter := NewRateLimiter(limit, window)
	sugar := logger.Sugar()

	return func(c *gin.Context) {
		ip := c.ClientIP()

		if !limiter.Allow(ip) {
			sugar.Warnw("请求过于频繁",
				"ip", ip,
				"path", c.Request.URL.Path,
				"method", c.Request.Method)

			c.JSON(http.StatusTooManyRequests, gin.H{
				"success": false,
				"message": "请求过于频繁，请稍后再试",
			})
			c.Abort()
			return
		}

		// 设置限流响应头
	remaining := limiter.GetRemaining(ip)
	c.Header("X-RateLimit-Limit", strconv.Itoa(limit))
	c.Header("X-RateLimit-Remaining", strconv.Itoa(remaining))
	c.Header("X-RateLimit-Window", window.String())

		c.Next()
	}
}

// RateLimitByPath 按路径限流中间件
func RateLimitByPath(limits map[string]int, window time.Duration, logger *zap.Logger) gin.HandlerFunc {
	limiters := make(map[string]*RateLimiter)
	for path, limit := range limits {
		limiters[path] = NewRateLimiter(limit, window)
	}
	sugar := logger.Sugar()

	return func(c *gin.Context) {
		path := c.Request.URL.Path
		ip := c.ClientIP()

		limiter, exists := limiters[path]
		if !exists {
			// 如果没有为该路径配置限流，使用默认限流
			c.Next()
			return
		}

		if !limiter.Allow(ip) {
			sugar.Warnw("请求过于频繁",
				"ip", ip,
				"path", path,
				"method", c.Request.Method)

			c.JSON(http.StatusTooManyRequests, gin.H{
				"success": false,
				"message": "请求过于频繁，请稍后再试",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}
