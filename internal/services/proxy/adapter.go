package proxy

import (
	"HanChat-QQBotManager/internal/models"
	"strconv"
	"sync"
	"time"
)

// IProxyAdapter 代理适配器接口 (所有类型必须实现)
type IProxyAdapter interface {
	Name() string
	Type() models.AdapterType
	Config() interface{}

	Open() error
	Close() error
	Reload(config interface{}) error

	IsActive() bool
	IsEnable() bool
	SetEnable(enable bool)
	Status() *models.AdapterStatus

	OnEvent(selfID string, rawData []byte)
}

// BaseAdapter 基础适配器实现 (嵌入到具体适配器中)
type BaseAdapter struct {
	mu     sync.RWMutex
	status *models.AdapterStatus
	logger Logger
}

// NewBaseAdapter 创建基础适配器
func NewBaseAdapter(name string, adapterType models.AdapterType, logger Logger) *BaseAdapter {
	return &BaseAdapter{
		status: &models.AdapterStatus{
			Name:   name,
			Type:   adapterType,
			Enable: false,
			Active: false,
			Metrics: &models.AdapterMetrics{},
		},
		logger: logger,
	}
}

// Name 返回名称
func (a *BaseAdapter) Name() string { return a.status.Name }

// Type 返回类型
func (a *BaseAdapter) Type() models.AdapterType { return a.status.Type }

// IsActive 是否运行中
func (a *BaseAdapter) IsActive() bool {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.status.Active
}

// IsEnable 是否启用
func (a *BaseAdapter) IsEnable() bool {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.status.Enable
}

// Status 获取状态（包含配置信息）
func (a *BaseAdapter) Status() *models.AdapterStatus {
	a.mu.RLock()
	defer a.mu.RUnlock()

	// 创建副本避免并发问题
	statusCopy := *a.status
	if a.status.Metrics != nil {
		metricsCopy := *a.status.Metrics
		statusCopy.Metrics = &metricsCopy
	}
	return &statusCopy
}

// SetEnable 设置启用状态
func (a *BaseAdapter) SetEnable(enable bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.status.Enable = enable
	a.status.Enabled = enable // 同步前端兼容字段
}

// SetActive 设置运行状态
func (a *BaseAdapter) SetActive(active bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.status.Active = active
	if active {
		now := time.Now()
		a.status.ConnectedAt = &now
	}
}

// SetError 设置错误信息
func (a *BaseAdapter) SetError(err error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err != nil {
		a.status.LastError = err.Error()
	} else {
		a.status.LastError = ""
	}
}

// UpdateMetrics 更新指标
func (a *BaseAdapter) UpdateMetrics(fn func(*models.AdapterMetrics)) {
	a.mu.Lock()
	defer a.mu.Unlock()
	fn(a.status.Metrics)
}

// RateLimiter 令牌桶频率限制器
type RateLimiter struct {
	rate      float64
	capacity  float64
	tokens    float64
	lastCheck time.Time
	mu        sync.Mutex
}

func NewRateLimiter(requestsPerMinute int) *RateLimiter {
	if requestsPerMinute <= 0 {
		return nil
	}
	return &RateLimiter{
		rate:      float64(requestsPerMinute) / 60.0,
		capacity:  float64(requestsPerMinute),
		tokens:    float64(requestsPerMinute),
		lastCheck: timeNow(),
	}
}

func (rl *RateLimiter) Allow() bool {
	if rl == nil {
		return true
	}
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := timeNow()
	elapsed := now.Sub(rl.lastCheck).Seconds()
	rl.tokens = minFloat(rl.capacity, rl.tokens+elapsed*rl.rate)
	rl.lastCheck = now

	if rl.tokens >= 1 {
		rl.tokens--
		return true
	}
	return false
}

func timeNow() time.Time { return time.Now() }

func itoa(i int) string { return strconv.Itoa(i) }

func minFloat(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
