package models

import (
	"time"
)

// AdapterType 适配器类型枚举
type AdapterType string

const (
	AdapterTypeWSClient   AdapterType = "websocket_client"
	AdapterTypeWSServer   AdapterType = "websocket_server"
	AdapterTypeHTTPServer AdapterType = "http_server"
	AdapterTypeHTTPClient AdapterType = "http_client"
)

// FilterMode 过滤器模式
type FilterMode string

const (
	FilterModeWhitelist FilterMode = "whitelist"
	FilterModeBlacklist FilterMode = "blacklist"
)

// FilterMatchType 匹配方式
type FilterMatchType string

const (
	FilterMatchExact   FilterMatchType = "exact"
	FilterMatchContain FilterMatchType = "contain"
	FilterMatchRegex   FilterMatchType = "regex"
)

// EventFilterRule 单个事件过滤规则
type EventFilterRule struct {
	Field     string          `json:"field"`
	Value     string          `json:"value"`
	MatchType FilterMatchType `json:"match_type"`
	IsEnabled bool            `json:"is_enabled"`
}

// EventFilterConfig 事件过滤器配置
type EventFilterConfig struct {
	Mode      FilterMode        `json:"mode"`
	IsEnabled bool              `json:"is_enabled"`
	Rules     []EventFilterRule `json:"rules"`
}

// ProxyConfig 完整代理配置结构
type ProxyConfig struct {
	Network NetworkConfig `json:"network"`
}

// NetworkConfig 网络配置
type NetworkConfig struct {
	WebSocketClients []WSClientConfig   `json:"websocketClients"`
	WebSocketServers []WSServerConfig   `json:"websocketServers"`
	HTTPServers      []HTTPServerConfig `json:"httpServers"`
	HTTPClients      []HTTPClientConfig `json:"httpClients"`
}

// WSClientConfig WebSocket正向连接配置（服务端模式：只需名称，地址自动生成）
type WSClientConfig struct {
	Name        string            `json:"name"`
	SelfID      string            `json:"self_id"`
	Enable      bool              `json:"enable"`
	Token       string            `json:"token"`
	EventFilter EventFilterConfig `json:"event_filter,omitempty"`
}

// WSServerConfig WebSocket反向连接配置（客户端模式：输入完整URL）
type WSServerConfig struct {
	Name                 string            `json:"name"`
	SelfID               string            `json:"self_id"`
	Enable               bool              `json:"enable"`
	URL                  string            `json:"url"` // 完整URL: ws://或wss://
	Token                string            `json:"token"`
	ReconnectInterval    int               `json:"reconnectInterval"`    // 重连间隔(ms)，默认5000
	MaxReconnectAttempts int               `json:"maxReconnectAttempts"` // 最大重连次数，0=不限制
	EventFilter          EventFilterConfig `json:"event_filter,omitempty"`
}

// HTTPServerConfig HTTP服务端配置（简化：地址自动生成）
type HTTPServerConfig struct {
	Name        string            `json:"name"`
	SelfID      string            `json:"self_id"` // 关联的QQ账号ID
	Enable      bool              `json:"enable"`
	Token       string            `json:"token"`
	EnableCors  bool              `json:"enableCors"`
	Timeout     int               `json:"timeout"` // 超时时间(ms)，默认10000
	EventFilter EventFilterConfig `json:"event_filter,omitempty"`
}

// HTTPClientConfig HTTP客户端/WebHook配置
type HTTPClientConfig struct {
	Name              string            `json:"name"`
	Enable            bool              `json:"enable"`
	URL               string            `json:"url"`
	Token             string            `json:"token"`
	MessagePostFormat string            `json:"messagePostFormat"`
	Timeout           int               `json:"timeout"`    // 超时时间(ms)，默认10000
	MaxRetries        int               `json:"maxRetries"` // 最大重试次数，0=不重试，最大20
	EventFilter       EventFilterConfig `json:"event_filter,omitempty"`
}

// AdapterStatus 适配器状态
type AdapterStatus struct {
	Name        string          `json:"name"`
	Type        AdapterType     `json:"type"`
	Enabled     bool            `json:"enabled"` // 前端兼容
	Enable      bool            `json:"enable"`   // 原始字段
	Active      bool            `json:"active"`
	ConnectedAt *time.Time      `json:"connected_at,omitempty"`
	LastError   string          `json:"last_error,omitempty"`
	Config      interface{}     `json:"config,omitempty"` // 完整配置信息
	Metrics     *AdapterMetrics `json:"metrics,omitempty"`
}

// AdapterMetrics 性能指标
type AdapterMetrics struct {
	EventsSent      int64     `json:"events_sent"`
	EventsFailed    int64     `json:"events_failed"`
	RequestsHandled int64     `json:"requests_handled"`
	AvgLatencyMs    float64   `json:"avg_latency_ms"`
	LastEventTime   time.Time `json:"last_event_time"`
	ClientsCount    int       `json:"clients_count"` // WS Server用
}

// AddAdapterRequest 新增适配器请求
type AddAdapterRequest struct {
	Type   string      `json:"type"`   // websocket_client | websocket_server | http_server | http_client
	Config interface{} `json:"config"` // 对应类型的配置
}
