package utils

import (
	"os"
	"strings"
	"time"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"gopkg.in/natefinch/lumberjack.v2"
)

// InitLogger 初始化基础 zap.Logger
func InitLogger(cfg LoggerConfig) *zap.Logger {
	level := zap.InfoLevel
	switch strings.ToLower(cfg.Level) {
	case "debug":
		level = zap.DebugLevel
	case "warn":
		level = zap.WarnLevel
	case "error":
		level = zap.ErrorLevel
	}

	encoderCfg := zapcore.EncoderConfig{
		TimeKey:       "timestamp",
		LevelKey:      "level",
		NameKey:       "logger",
		CallerKey:     "caller",
		MessageKey:    "message",
		StacktraceKey: "stack",
		LineEnding:    zapcore.DefaultLineEnding,
		EncodeLevel:   zapcore.LowercaseLevelEncoder,
		EncodeTime: func(t time.Time, enc zapcore.PrimitiveArrayEncoder) {
			enc.AppendString(t.Format("2006-01-02 15:04:05.000"))
		},
		EncodeDuration: zapcore.StringDurationEncoder,
		EncodeCaller:   zapcore.ShortCallerEncoder,
	}

	var encoder zapcore.Encoder
	if strings.ToLower(cfg.Format) == "json" {
		encoder = zapcore.NewJSONEncoder(encoderCfg)
	} else {
		encoder = zapcore.NewConsoleEncoder(encoderCfg)
	}

	// 文件输出（滚动）
	lj := &lumberjack.Logger{
		Filename:   cfg.Dir + "/combined.log",
		MaxSize:    20, // MB
		MaxBackups: 0,
		MaxAge:     14, // days
		Compress:   false,
	}

	fileWS := zapcore.AddSync(lj)
	consoleWS := zapcore.AddSync(os.Stdout)

	// 使用异步写入器，避免文件IO阻塞
	asyncFileWS := NewAsyncWriter(fileWS, 1000) // 1000条日志缓冲
	
	core := zapcore.NewTee(
		zapcore.NewCore(encoder, consoleWS, level),
		zapcore.NewCore(encoder, asyncFileWS, level),
	)

	logger := zap.New(core, zap.AddCaller())
	return logger
}

// NewModuleLogger 返回带 module 字段的 SugaredLogger
func NewModuleLogger(base *zap.Logger, module string) *zap.SugaredLogger {
	return base.With(zap.String("module", module)).Sugar()
}
