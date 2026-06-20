package proxy

import (
	"bytes"
	"fmt"
	"net/http"
	"time"

	"HanChat-QQBotManager/internal/models"
)

// HTTPClientAdapter HTTP客户端/WebHook适配器
type HTTPClientAdapter struct {
	*BaseAdapter
	config models.HTTPClientConfig
	client *http.Client
	filter *EventFilter
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

	eventType := extractEventType(rawData)

	a.logger.Infow("发送WebHook事件",
		"name", a.Name(),
		"event_type", eventType,
		"data_length", len(rawData),
		"target_url", a.config.URL,
		"event_preview", truncateString(string(rawData), 300),
	)

	maxRetries := a.config.MaxRetries
	if maxRetries > 20 {
		maxRetries = 20
	}

	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			a.logger.Infow("WebHook重试发送",
				"name", a.Name(),
				"attempt", attempt,
				"max_retries", maxRetries,
				"event_type", eventType,
				"last_error", lastErr,
				"retry_delay_ms", attempt*200,
			)
			time.Sleep(time.Duration(attempt*200) * time.Millisecond)
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
