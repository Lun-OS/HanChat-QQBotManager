package proxy

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"time"

	"HanChat-QQBotManager/internal/models"
)

// HTTPClientAdapter HTTP客户端/WebHook适配器
type HTTPClientAdapter struct {
	*BaseAdapter
	config  models.HTTPClientConfig
	client  *http.Client
	filter  *EventFilter
	// 关键修复: 限流器 + 全局超时上下文，避免下游故障时 OnEvent 长时间阻塞。
	// 每个事件的最坏耗时 = 串行重试 maxRetries 次。
	// 引入 workerSem 控制并发数，sendCtx 控制单次 OnEvent 整体上限。
	workerSem chan struct{}
}

// NewHTTPClientAdapter 创建HTTP客户端适配器
func NewHTTPClientAdapter(config models.HTTPClientConfig, logger Logger) *HTTPClientAdapter {
	if config.MessagePostFormat == "" {
		config.MessagePostFormat = "array"
	}

	timeout := time.Duration(config.Timeout) * time.Millisecond
	if timeout == 0 {
		timeout = 10 * time.Second
	}

	maxRetries := config.MaxRetries
	if maxRetries > 20 {
		maxRetries = 20
	}

	return &HTTPClientAdapter{
		BaseAdapter: NewBaseAdapter(config.Name, models.AdapterTypeHTTPClient, logger),
		config:      config,
		client: &http.Client{
			Timeout: timeout,
		},
		filter: NewEventFilter(config.EventFilter, logger),
		// 关键修复: 限制单个 WebHook 同时只有 4 个事件在处理，避免下游慢/故障时
		// OnEvent goroutine 无限堆积。
		workerSem: make(chan struct{}, 4),
	}
}

// Config 返回配置
func (a *HTTPClientAdapter) Config() interface{} { return &a.config }

// Open 启动适配器（HTTP Client无需启动，只需标记为活跃）
func (a *HTTPClientAdapter) Open() error {
	a.SetEnable(true)
	a.SetActive(true)
	a.logger.Infow("WebHook适配器已启用", "name", a.Name(), "url", a.config.URL,
		"timeout_ms", a.config.Timeout, "max_retries", a.config.MaxRetries)
	return nil
}

// Close 停止适配器
func (a *HTTPClientAdapter) Close() error {
	a.SetActive(false)
	a.SetEnable(false)
	return nil
}

// Reload 重载配置
func (a *HTTPClientAdapter) Reload(config interface{}) error {
	newConfig := config.(models.HTTPClientConfig)

	a.Close()
	time.Sleep(100 * time.Millisecond)

	a.config = newConfig
	a.BaseAdapter.status.Name = newConfig.Name
	a.filter.UpdateConfig(newConfig.EventFilter)

	timeout := time.Duration(newConfig.Timeout) * time.Millisecond
	if timeout == 0 {
		timeout = 10 * time.Second
	}
	a.client = &http.Client{Timeout: timeout}

	if newConfig.Enable {
		return a.Open()
	}

	return nil
}

// OnEvent 发送原始事件到目标URL (WebHook推送，支持重试，纯透传)
func (a *HTTPClientAdapter) OnEvent(selfID string, rawData []byte) {
	if !a.IsActive() || !a.IsEnable() {
		return
	}

	if IsHeartbeatEvent(rawData) {
		return
	}

	if a.filter != nil && !a.filter.ShouldPass(rawData) {
		a.logger.Infow("事件被过滤(WebHook)",
			"name", a.Name(),
			"event_type", extractEventType(rawData),
			"filter_mode", a.filter.GetMode(),
			"filter_rules", a.filter.GetRulesSummary(),
			"event_preview", truncateString(string(rawData), 200),
		)
		return
	}

	// 关键修复: 限流器满则丢弃，避免 goroutine 无限堆积。
	// 这里采用非阻塞获取令牌的方式，丢弃而非排队等待。
	select {
	case a.workerSem <- struct{}{}:
	default:
		a.logger.Warnw("WebHook并发已饱和，丢弃事件",
			"name", a.Name(),
			"event_preview", truncateString(string(rawData), 100),
		)
		a.UpdateMetrics(func(m *models.AdapterMetrics) { m.EventsFailed++ })
		return
	}
	defer func() { <-a.workerSem }()

	// 关键修复: 给整个发送流程一个总超时上下文，避免 maxRetries * (sleep+request) 失控。
	maxRetries := a.config.MaxRetries
	if maxRetries > 20 {
		maxRetries = 20
	}
	// 总超时 = (maxRetries + 1) * 单次超时 + 累计重试退避（线性），并留 30% 余量。
	totalBudget := time.Duration(maxRetries+1) * a.client.Timeout
	backoffBudget := time.Duration(0)
	for i := 1; i <= maxRetries; i++ {
		backoffBudget += time.Duration(i*200) * time.Millisecond
	}
	totalBudget += backoffBudget
	totalBudget = totalBudget * 13 / 10 // +30% 缓冲
	if totalBudget > 2*time.Minute {
		totalBudget = 2 * time.Minute // 硬上限
	}
	sendCtx, cancel := context.WithTimeout(context.Background(), totalBudget)
	defer cancel()

	eventType := extractEventType(rawData)

	a.logger.Infow("发送WebHook事件",
		"name", a.Name(),
		"event_type", eventType,
		"data_length", len(rawData),
		"target_url", a.config.URL,
		"event_preview", truncateString(string(rawData), 300),
		"total_budget_ms", totalBudget.Milliseconds(),
	)

	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		// 关键修复: 检查 sendCtx.Done() 提前退出可中断重试循环。
		if sendCtx.Err() != nil {
			a.logger.Warnw("WebHook发送被总超时上下文取消",
				"name", a.Name(),
				"attempt", attempt,
				"error", sendCtx.Err(),
			)
			lastErr = sendCtx.Err()
			break
		}

		if attempt > 0 {
			a.logger.Infow("WebHook重试发送",
				"name", a.Name(),
				"attempt", attempt,
				"max_retries", maxRetries,
				"event_type", eventType,
				"last_error", lastErr,
				"retry_delay_ms", attempt*200,
			)
			// 关键修复: 用 select 让 sleep 可被 sendCtx 取消。
			select {
			case <-time.After(time.Duration(attempt*200) * time.Millisecond):
			case <-sendCtx.Done():
				lastErr = sendCtx.Err()
				attempt = maxRetries + 1 // 跳出外层 for
			}
			if attempt > maxRetries {
				break
			}
		}

		lastErr = a.doSend(selfID, rawData)
		if lastErr == nil {
			a.logger.Infow("WebHook发送成功",
				"name", a.Name(),
				"event_type", eventType,
				"target_url", a.config.URL,
				"attempts", attempt+1,
			)
			return
		}
	}

	a.logger.Errorw("WebHook发送最终失败",
		"name", a.Name(),
		"url", a.config.URL,
		"event_type", eventType,
		"retries", maxRetries,
		"error", lastErr,
	)
	a.UpdateMetrics(func(m *models.AdapterMetrics) { m.EventsFailed++ })
	a.SetError(lastErr)
}

// doSend 执行单次HTTP请求发送
func (a *HTTPClientAdapter) doSend(selfID string, data []byte) error {
	req, err := http.NewRequest("POST", a.config.URL, bytes.NewReader(data))
	if err != nil {
		a.logger.Warnw("创建WebHook请求失败",
			"name", a.Name(),
			"error", err,
			"url", a.config.URL,
		)
		return fmt.Errorf("创建请求失败: %w", err)
	}

	req.Header.Set(HeaderContentType, "application/json")
	req.Header.Set(HeaderUserAgent, BuildUserAgent(""))
	req.Header.Set(HeaderSelfID, selfID)

	if a.config.Token != "" {
		req.Header.Set(HeaderAuth, "Bearer "+a.config.Token)
	}

	startTime := timeNow()

	resp, err := a.client.Do(req)
	if err != nil {
		a.logger.Warnw("WebHook HTTP请求失败",
			"name", a.Name(),
			"error", err,
			"url", a.config.URL,
			"latency_ms", time.Since(startTime).Milliseconds(),
		)
		return fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	latency := time.Since(startTime).Milliseconds()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		a.UpdateMetrics(func(m *models.AdapterMetrics) {
			m.EventsSent++
			m.LastEventTime = startTime

			totalLatency := m.AvgLatencyMs * float64(m.EventsSent-1)
			m.AvgLatencyMs = (totalLatency + float64(latency)) / float64(m.EventsSent)
		})

		if latency > 1000 {
			a.logger.Warnw("WebHook响应较慢",
				"name", a.Name(),
				"latency_ms", latency,
				"status", resp.StatusCode,
				"url", a.config.URL,
			)
		} else if latency > 500 {
			a.logger.Infow("WebHook响应正常",
				"name", a.Name(),
				"latency_ms", latency,
				"status", resp.StatusCode,
				"url", a.config.URL,
			)
		}

		return nil
	}

	a.logger.Warnw("WebHook返回错误状态码",
		"name", a.Name(),
		"status_code", resp.StatusCode,
		"url", a.config.URL,
		"latency_ms", latency,
	)

	return fmt.Errorf("HTTP错误状态码: %d", resp.StatusCode)
}
