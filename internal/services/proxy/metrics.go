package proxy

import "fmt"

// OneBot 标准请求头常量
const (
	HeaderUserAgent   = "User-Agent"
	HeaderSelfID      = "X-Self-ID"
	HeaderAuth        = "Authorization"
	HeaderContentType = "Content-Type"
)

var hanchatVersion = "1.0.0"

// botAppName 和 botAppVersion 缓存机器人版本信息（由外部设置）
var botAppName = "OneBot"
var botAppVersion = "11"

// SetHanChatVersion 设置 HanChat 版本号（由外部注入，来自 main.go 常量）
func SetHanChatVersion(version string) {
	if version != "" {
		hanchatVersion = version
	}
}

// SetBotVersionInfo 设置机器人版本信息（由 reverse_websocket.go 在获取版本后调用）
func SetBotVersionInfo(appName, appVersion string) {
	if appName != "" {
		botAppName = appName
	}
	if appVersion != "" {
		botAppVersion = appVersion
	}
}

// BuildUserAgent 构建 User-Agent：HanChat 版本号(原始UA或机器人标识)
func BuildUserAgent(originalUA string) string {
	if originalUA == "" {
		originalUA = fmt.Sprintf("%s %s", botAppName, botAppVersion)
	}
	return fmt.Sprintf("HanChat %s(%s)", hanchatVersion, originalUA)
}

// SetOneBotHeaders 设置 OneBot 标准请求头（不含 Token）
func SetOneBotHeaders(headers map[string]string, selfID string, originalUA string) {
	headers[HeaderUserAgent] = BuildUserAgent(originalUA)
	headers[HeaderSelfID] = selfID
}

// Logger 日志接口
type Logger interface {
	Infow(msg string, keysAndValues ...interface{})
	Warnw(msg string, keysAndValues ...interface{})
	Errorw(msg string, keysAndValues ...interface{})
	Debugw(msg string, keysAndValues ...interface{})
}

// ZapLogger zap日志包装器
type ZapLogger struct {
	logger interface {
		Sugar() SugarLogger
	}
}

type SugarLogger interface {
	Infow(msg string, keysAndValues ...interface{})
	Warnw(msg string, keysAndValues ...interface{})
	Errorw(msg string, keysAndValues ...interface{})
	Debugw(msg string, keysAndValues ...interface{})
	Named(name string) SugarLogger
}