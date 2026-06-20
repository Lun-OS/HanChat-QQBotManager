package proxy

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"HanChat-QQBotManager/internal/models"
	"github.com/gin-gonic/gin"
)

// HTTPServerAdapter HTTP服务端适配器（路由注册到主Web服务）
type HTTPServerAdapter struct {
	*BaseAdapter
	config models.HTTPServerConfig
	wsSvc  ReverseWebSocketService
	filter *EventFilter
}

// NewHTTPServerAdapter 创建HTTP服务端适配器
func NewHTTPServerAdapter(config models.HTTPServerConfig, wsSvc ReverseWebSocketService, logger Logger, _ int) *HTTPServerAdapter {
	return &HTTPServerAdapter{
		BaseAdapter: NewBaseAdapter(config.Name, models.AdapterTypeHTTPServer, logger),
		config:      config,
		wsSvc:       wsSvc,
		filter:      NewEventFilter(config.EventFilter, logger),
	}
}

// buildPath 自动生成路径前缀: /onebot/{self_id}/{name}
func (a *HTTPServerAdapter) buildPath() string {
	selfID := a.config.SelfID
	if selfID == "" {
		selfID = "_"
	}
	return "/onebot/" + selfID + "/" + a.config.Name
}

// Config 返回配置
func (a *HTTPServerAdapter) Config() interface{} { return &a.config }

// CreateRouterGroup 创建Gin路由组（用于注册到外部Router）
func (a *HTTPServerAdapter) CreateRouterGroup(rg *gin.RouterGroup) {
	pathPrefix := a.buildPath()
	api := rg.Group(pathPrefix)

	middlewares := []gin.HandlerFunc{}

	if a.config.EnableCors {
		middlewares = append(middlewares, func(c *gin.Context) {
			c.Header("Access-Control-Allow-Origin", "*")
			c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
			if c.Request.Method == "OPTIONS" {
				c.AbortWithStatus(204)
				return
			}
			c.Next()
		})
	}

	if a.config.Token != "" {
		middlewares = append(middlewares, a.authMiddleware())
	}

	api.Use(middlewares...)
	{
		api.Use(func(c *gin.Context) {
			c.Header(HeaderUserAgent, BuildUserAgent(c.GetHeader(HeaderUserAgent)))
			c.Next()
		})
		api.POST("/*apiName", a.handleAPI)
		api.GET("/events", a.handleGetEvents)
		api.GET("/status", a.handleStatus)
	}

	a.logger.Infow("HTTP适配器路由已注册", "name", a.Name(), "path_prefix", pathPrefix)
}

// Open 启动适配器（仅标记为活跃，实际路由由外部注册）
func (a *HTTPServerAdapter) Open() error {
	a.SetEnable(true)
	a.SetActive(true)
	a.logger.Infow("HTTP适配器已启用", "name", a.Name())
	return nil
}

// Close 停止适配器
func (a *HTTPServerAdapter) Close() error {
	a.SetActive(false)
	return nil
}

// Reload 重载配置
func (a *HTTPServerAdapter) Reload(config interface{}) error {
	newConfig := config.(models.HTTPServerConfig)

	wasActive := a.IsActive()
	if wasActive {
		a.Close()
	}

	time.Sleep(100 * time.Millisecond)
	a.config = newConfig
	a.BaseAdapter.status.Name = newConfig.Name
	a.SetEnable(newConfig.Enable)
	a.filter.UpdateConfig(newConfig.EventFilter)

	if newConfig.Enable || wasActive {
		return a.Open()
	}

	return nil
}

// OnEvent HTTP服务端记录事件（纯透传，数据通过API轮询获取）
func (a *HTTPServerAdapter) OnEvent(selfID string, rawData []byte) {
	if a.filter != nil && !a.filter.ShouldPass(rawData) {
		a.logger.Infow("事件被过滤(HTTP服务)",
			"name", a.Name(),
			"event_type", extractEventType(rawData),
			"filter_mode", a.filter.GetMode(),
			"filter_rules", a.filter.GetRulesSummary(),
			"event_preview", truncateString(string(rawData), 200),
		)
		return
	}

	eventType := extractEventType(rawData)

	a.logger.Infow("记录HTTP服务事件",
		"name", a.Name(),
		"event_type", eventType,
		"data_length", len(rawData),
		"event_preview", truncateString(string(rawData), 300),
	)

	a.UpdateMetrics(func(m *models.AdapterMetrics) {
		m.EventsSent++
		m.LastEventTime = timeNow()
	})
}

// authMiddleware 鉴权中间件
func (a *HTTPServerAdapter) authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.GetHeader("Authorization")
		token = strings.TrimPrefix(token, "Bearer ")

		if token == "" {
			token = c.Query("token")
		}

		if token != a.config.Token {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error":   "unauthorized",
				"message": "无效的访问令牌",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

// handleAPI 处理API调用（带超时控制）
func (a *HTTPServerAdapter) handleAPI(c *gin.Context) {
	selfID := a.config.SelfID

	if selfID == "" {
		pathParts := strings.Split(strings.TrimPrefix(c.Request.URL.Path, "/"), "/")
		if len(pathParts) >= 2 && pathParts[0] == "onebot" {
			selfID = pathParts[1]
		}
	}

	if selfID == "" || selfID == "_" {
		selfID = c.Query("self_id")
	}
	if selfID == "" || selfID == "_" {
		selfID = c.GetHeader("X-Self-ID")
	}

	apiName := strings.TrimPrefix(c.Param("apiName"), "/")

	var params map[string]interface{}
	if err := c.ShouldBindJSON(&params); err != nil {
		params = make(map[string]interface{})
	}

	a.logger.Infow("收到HTTP API调用请求",
		"name", a.Name(),
		"api", apiName,
		"self_id", selfID,
		"method", c.Request.Method,
		"remote_addr", c.ClientIP(),
		"params_count", len(params),
		"params_preview", formatMapPreview(params, 5),
	)

	timeout := time.Duration(a.config.Timeout) * time.Millisecond
	if timeout <= 0 {
		timeout = 10 * time.Second // 默认10秒超时
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), timeout)
	defer cancel()

	startTime := timeNow()

	type apiResult struct {
		rawResp []byte
		err     error
	}

	resultChan := make(chan apiResult, 1)

	go func() {
		rawResp, err := a.wsSvc.CallBotAPIRaw(selfID, apiName, params)
		resultChan <- apiResult{rawResp: rawResp, err: err}
	}()

	select {
	case <-ctx.Done():
		latency := time.Since(startTime).Milliseconds()
		a.logger.Warnw("HTTP API调用超时",
			"name", a.Name(),
			"api", apiName,
			"self_id", selfID,
			"timeout_ms", timeout.Milliseconds(),
			"latency_ms", latency,
			"remote_addr", c.ClientIP(),
		)
		c.JSON(http.StatusGatewayTimeout, gin.H{
			"status":  "failed",
			"retcode": -1,
			"message": fmt.Sprintf("API调用超时 (%dms)", timeout.Milliseconds()),
		})
		return

	case result := <-resultChan:
		if result.err != nil {
			latency := time.Since(startTime).Milliseconds()
			a.logger.Warnw("HTTP API调用失败",
				"name", a.Name(),
				"api", apiName,
				"self_id", selfID,
				"error", result.err,
				"latency_ms", latency,
				"remote_addr", c.ClientIP(),
			)
			c.JSON(http.StatusBadGateway, gin.H{
				"status":  "failed",
				"retcode": -1,
				"message": result.err.Error(),
			})
			return
		}

		latency := time.Since(startTime).Milliseconds()
		a.UpdateMetrics(func(m *models.AdapterMetrics) {
			m.RequestsHandled++
			totalLatency := m.AvgLatencyMs * float64(m.RequestsHandled-1)
			m.AvgLatencyMs = (totalLatency + float64(latency)) / float64(m.RequestsHandled)
		})

		a.logger.Infow("HTTP API调用成功",
			"name", a.Name(),
			"api", apiName,
			"self_id", selfID,
			"response_length", len(result.rawResp),
			"latency_ms", latency,
			"remote_addr", c.ClientIP(),
			"response_preview", truncateString(string(result.rawResp), 150),
		)

		c.Data(http.StatusOK, "application/json", result.rawResp)
	}
}

// handleGetEvents 获取事件列表
func (a *HTTPServerAdapter) handleGetEvents(c *gin.Context) {
	limitStr := c.DefaultQuery("limit", "100")

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 || limit > 1000 {
		limit = 100
	}

	events := []interface{}{
		gin.H{"message": "请通过WebSocket连接获取实时事件流"},
	}

	c.JSON(http.StatusOK, gin.H{
		"events": events,
		"total":  len(events),
		"limit":  limit,
	})
}

// handleStatus 获取状态
func (a *HTTPServerAdapter) handleStatus(c *gin.Context) {
	status := a.Status()
	c.JSON(http.StatusOK, status)
}
