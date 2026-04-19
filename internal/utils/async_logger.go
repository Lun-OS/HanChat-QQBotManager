package utils

import (
	"context"
	"fmt"
	"runtime"
	"sync"
	"sync/atomic"
	"time"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// AsyncLogger 异步日志器
type AsyncLogger struct {
	logger      *zap.Logger
	sugar       *zap.SugaredLogger
	logChan     chan *logEntry
	wg          sync.WaitGroup
	ctx         context.Context
	cancel      context.CancelFunc
	dropped     int64
	processed   int64
	bufferSize  int
	workerCount int
	closed      atomic.Bool
}

// logEntry 日志条目
type logEntry struct {
	level   zapcore.Level
	msg     string
	fields  []zap.Field
	time    time.Time
}

// NewAsyncLogger 创建异步日志器
func NewAsyncLogger(baseLogger *zap.Logger, bufferSize int, workerCount int) *AsyncLogger {
	if bufferSize <= 0 {
		bufferSize = 10000 // 默认缓冲区大小
	}
	if workerCount <= 0 {
		workerCount = runtime.NumCPU() // 默认工作协程数
	}

	ctx, cancel := context.WithCancel(context.Background())
	
	al := &AsyncLogger{
		logger:      baseLogger,
		sugar:       baseLogger.Sugar(),
		logChan:     make(chan *logEntry, bufferSize),
		ctx:         ctx,
		cancel:      cancel,
		bufferSize:  bufferSize,
		workerCount: workerCount,
	}

	// 启动工作协程
	al.wg.Add(workerCount)
	for i := 0; i < workerCount; i++ {
		go al.worker(i)
	}

	// 启动监控协程
	go al.monitor()

	return al
}

// worker 日志处理工作协程
func (al *AsyncLogger) worker(id int) {
	defer al.wg.Done()
	
	for {
		select {
		case entry, ok := <-al.logChan:
			if !ok {
				return
			}
			
			// 处理日志条目
			al.writeLog(entry)
			atomic.AddInt64(&al.processed, 1)
			
		case <-al.ctx.Done():
			// 处理剩余的日志
			for {
				select {
				case entry := <-al.logChan:
					al.writeLog(entry)
					atomic.AddInt64(&al.processed, 1)
				default:
					return
				}
			}
		}
	}
}

// writeLog 写入日志
func (al *AsyncLogger) writeLog(entry *logEntry) {
	// 根据级别写入日志
	switch entry.level {
	case zapcore.DebugLevel:
		if ce := al.logger.Check(entry.level, entry.msg); ce != nil {
			ce.Write(entry.fields...)
		}
	case zapcore.InfoLevel:
		if ce := al.logger.Check(entry.level, entry.msg); ce != nil {
			ce.Write(entry.fields...)
		}
	case zapcore.WarnLevel:
		if ce := al.logger.Check(entry.level, entry.msg); ce != nil {
			ce.Write(entry.fields...)
		}
	case zapcore.ErrorLevel:
		if ce := al.logger.Check(entry.level, entry.msg); ce != nil {
			ce.Write(entry.fields...)
		}
	case zapcore.DPanicLevel, zapcore.PanicLevel, zapcore.FatalLevel:
		if ce := al.logger.Check(entry.level, entry.msg); ce != nil {
			ce.Write(entry.fields...)
		}
	}
}

// monitor 监控协程
func (al *AsyncLogger) monitor() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	
	for {
		select {
		case <-ticker.C:
			dropped := atomic.LoadInt64(&al.dropped)
			processed := atomic.LoadInt64(&al.processed)
			queueSize := len(al.logChan)
			
			if dropped > 0 {
				al.sugar.Warnw("异步日志器状态",
					"dropped", dropped,
					"processed", processed,
					"queue_size", queueSize,
					"buffer_size", al.bufferSize,
				)
			}
			
		case <-al.ctx.Done():
			return
		}
	}
}

// Debug 异步调试日志
func (al *AsyncLogger) Debug(msg string, fields ...zap.Field) {
	al.log(zapcore.DebugLevel, msg, fields...)
}

// Info 异步信息日志
func (al *AsyncLogger) Info(msg string, fields ...zap.Field) {
	al.log(zapcore.InfoLevel, msg, fields...)
}

// Warn 异步警告日志
func (al *AsyncLogger) Warn(msg string, fields ...zap.Field) {
	al.log(zapcore.WarnLevel, msg, fields...)
}

// Error 异步错误日志
func (al *AsyncLogger) Error(msg string, fields ...zap.Field) {
	al.log(zapcore.ErrorLevel, msg, fields...)
}

// log 异步写入日志
func (al *AsyncLogger) log(level zapcore.Level, msg string, fields ...zap.Field) {
	if al.closed.Load() {
		atomic.AddInt64(&al.dropped, 1)
		return
	}

	entry := &logEntry{
		level:  level,
		msg:    msg,
		fields: fields,
		time:   time.Now(),
	}

	defer func() {
		if r := recover(); r != nil {
			atomic.AddInt64(&al.dropped, 1)
		}
	}()

	select {
	case al.logChan <- entry:
		// 成功写入
	default:
		// 缓冲区满，丢弃日志
		atomic.AddInt64(&al.dropped, 1)
	}
}

// Sugar 获取SugaredLogger
func (al *AsyncLogger) Sugar() *AsyncSugarLogger {
	return &AsyncSugarLogger{al: al}
}

// Close 关闭异步日志器
func (al *AsyncLogger) Close() error {
	if !al.closed.CompareAndSwap(false, true) {
		return nil
	}
	al.cancel()
	close(al.logChan)
	al.wg.Wait()

	// 记录最终统计
	dropped := atomic.LoadInt64(&al.dropped)
	processed := atomic.LoadInt64(&al.processed)

	if dropped > 0 {
		al.sugar.Warnw("异步日志器关闭统计",
			"dropped", dropped,
			"processed", processed,
			"drop_rate", float64(dropped)/float64(dropped+processed)*100,
		)
	}

	return nil
}

// GetStats 获取统计信息
func (al *AsyncLogger) GetStats() map[string]interface{} {
	return map[string]interface{}{
		"dropped":   atomic.LoadInt64(&al.dropped),
		"processed": atomic.LoadInt64(&al.processed),
		"queue_size": len(al.logChan),
		"buffer_size": al.bufferSize,
		"worker_count": al.workerCount,
	}
}

// AsyncSugarLogger 异步SugaredLogger
type AsyncSugarLogger struct {
	al *AsyncLogger
}

// Debugw 异步调试日志（结构化）
func (s *AsyncSugarLogger) Debugw(msg string, keysAndValues ...interface{}) {
	fields := s.keysAndValuesToFields(keysAndValues...)
	s.al.log(zapcore.DebugLevel, msg, fields...)
}

// Infow 异步信息日志（结构化）
func (s *AsyncSugarLogger) Infow(msg string, keysAndValues ...interface{}) {
	fields := s.keysAndValuesToFields(keysAndValues...)
	s.al.log(zapcore.InfoLevel, msg, fields...)
}

// Warnw 异步警告日志（结构化）
func (s *AsyncSugarLogger) Warnw(msg string, keysAndValues ...interface{}) {
	fields := s.keysAndValuesToFields(keysAndValues...)
	s.al.log(zapcore.WarnLevel, msg, fields...)
}

// Errorw 异步错误日志（结构化）
func (s *AsyncSugarLogger) Errorw(msg string, keysAndValues ...interface{}) {
	fields := s.keysAndValuesToFields(keysAndValues...)
	s.al.log(zapcore.ErrorLevel, msg, fields...)
}

// keysAndValuesToFields 将keysAndValues转换为zap.Field
func (s *AsyncSugarLogger) keysAndValuesToFields(keysAndValues ...interface{}) []zap.Field {
	if len(keysAndValues)%2 != 0 {
		return []zap.Field{zap.String("error", "keysAndValues must be even")}
	}
	
	fields := make([]zap.Field, 0, len(keysAndValues)/2)
	for i := 0; i < len(keysAndValues); i += 2 {
		key, ok := keysAndValues[i].(string)
		if !ok {
			fields = append(fields, zap.String(fmt.Sprintf("key_%d", i), fmt.Sprintf("%v", keysAndValues[i])))
			continue
		}
		
		value := keysAndValues[i+1]
		switch v := value.(type) {
		case string:
			fields = append(fields, zap.String(key, v))
		case int, int8, int16, int32, int64:
			fields = append(fields, zap.Int64(key, int64(v.(int))))
		case uint, uint8, uint16, uint32, uint64:
			fields = append(fields, zap.Uint64(key, uint64(v.(uint))))
		case float32, float64:
			fields = append(fields, zap.Float64(key, float64(v.(float64))))
		case bool:
			fields = append(fields, zap.Bool(key, v))
		case error:
			fields = append(fields, zap.Error(v))
		default:
			fields = append(fields, zap.String(key, fmt.Sprintf("%v", v)))
		}
	}
	
	return fields
}