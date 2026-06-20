package proxy

import (
	"fmt"
	"strings"
)

// LogWriteFunc 日志写入函数类型
// 用于将日志写入外部 LogManager,避免循环依赖
type LogWriteFunc func(selfID string, adapterName string, level string, message string)

// ProxyLogger 代理服务日志适配器
// 将 proxy 模块的日志同时输出到外部日志系统和原有 logger
type ProxyLogger struct {
	logWriter   LogWriteFunc // 外部日志写入函数
	selfID       string
	adapterName string
	baseLogger   Logger // 保留原有logger用于错误处理和降级
}

// NewProxyLogger 创建代理日志适配器
func NewProxyLogger(logWriter LogWriteFunc, selfID string, adapterName string, baseLogger Logger) *ProxyLogger {
	return &ProxyLogger{
		logWriter:   logWriter,
		selfID:       selfID,
		adapterName: adapterName,
		baseLogger:   baseLogger,
	}
}

// formatMessage 格式化日志消息
func (l *ProxyLogger) formatMessage(msg string, keysAndValues ...interface{}) string {
	if len(keysAndValues) == 0 {
		return msg
	}

	var builder strings.Builder
	builder.WriteString(msg)

	for i := 0; i < len(keysAndValues); i += 2 {
		key := keysAndValues[i]
		var value interface{} = ""
		if i+1 < len(keysAndValues) {
			value = keysAndValues[i+1]
		}
		builder.WriteString(fmt.Sprintf(" %v=%v", key, value))
	}

	return builder.String()
}

// Infow 记录 INFO 级别日志
func (l *ProxyLogger) Infow(msg string, keysAndValues ...interface{}) {
	formattedMsg := l.formatMessage(msg, keysAndValues...)

	if l.logWriter != nil {
		l.logWriter(l.selfID, l.adapterName, "INFO", formattedMsg)
	}

	if l.baseLogger != nil {
		l.baseLogger.Infow(msg, keysAndValues...)
	}
}

// Warnw 记录 WARN 级别日志
func (l *ProxyLogger) Warnw(msg string, keysAndValues ...interface{}) {
	formattedMsg := l.formatMessage(msg, keysAndValues...)

	if l.logWriter != nil {
		l.logWriter(l.selfID, l.adapterName, "WARN", formattedMsg)
	}

	if l.baseLogger != nil {
		l.baseLogger.Warnw(msg, keysAndValues...)
	}
}

// Errorw 记录 ERROR 级别日志
func (l *ProxyLogger) Errorw(msg string, keysAndValues ...interface{}) {
	formattedMsg := l.formatMessage(msg, keysAndValues...)

	if l.logWriter != nil {
		l.logWriter(l.selfID, l.adapterName, "ERROR", formattedMsg)
	}

	if l.baseLogger != nil {
		l.baseLogger.Errorw(msg, keysAndValues...)
	}
}

// Debugw 记录 DEBUG 级别日志
func (l *ProxyLogger) Debugw(msg string, keysAndValues ...interface{}) {
	formattedMsg := l.formatMessage(msg, keysAndValues...)

	if l.logWriter != nil {
		l.logWriter(l.selfID, l.adapterName, "DEBUG", formattedMsg)
	}

	if l.baseLogger != nil {
		l.baseLogger.Debugw(msg, keysAndValues...)
	}
}
