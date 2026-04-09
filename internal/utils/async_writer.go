package utils

import (
	"context"
	"sync"
	"sync/atomic"
	"time"
)

// AsyncWriter 异步写入器
type AsyncWriter struct {
	writer      WriteSyncer
	buffer      chan []byte
	ctx         context.Context
	cancel      context.CancelFunc
	wg          sync.WaitGroup
	dropped     int64
	written     int64
	bufferSize  int
	flushTicker *time.Ticker
}

// WriteSyncer 同步写入接口
type WriteSyncer interface {
	Write([]byte) (int, error)
	Sync() error
}

// NewAsyncWriter 创建异步写入器
func NewAsyncWriter(writer WriteSyncer, bufferSize int) WriteSyncer {
	if bufferSize <= 0 {
		bufferSize = 1000
	}

	ctx, cancel := context.WithCancel(context.Background())
	
	aw := &AsyncWriter{
		writer:      writer,
		buffer:      make(chan []byte, bufferSize),
		ctx:         ctx,
		cancel:      cancel,
		bufferSize:  bufferSize,
		flushTicker: time.NewTicker(5 * time.Second), // 每5秒强制刷新
	}

	aw.wg.Add(1)
	go aw.writerLoop()

	return aw
}

// writerLoop 写入协程
func (aw *AsyncWriter) writerLoop() {
	defer aw.wg.Done()
	defer aw.flushTicker.Stop()

	for {
		select {
		case data, ok := <-aw.buffer:
			if !ok {
				// 缓冲区关闭，写入剩余数据
				aw.flush()
				return
			}
			
			// 写入数据
			if _, err := aw.writer.Write(data); err != nil {
				// 写入失败，增加丢弃计数
				atomic.AddInt64(&aw.dropped, 1)
			} else {
				atomic.AddInt64(&aw.written, 1)
			}
			
		case <-aw.flushTicker.C:
			// 定时刷新
			aw.flush()
			
		case <-aw.ctx.Done():
			// 上下文取消，写入剩余数据
			aw.flush()
			return
		}
	}
}

// Write 异步写入数据
func (aw *AsyncWriter) Write(data []byte) (int, error) {
	if aw.ctx.Err() != nil {
		return 0, aw.ctx.Err()
	}

	// 复制数据，避免外部修改影响
	dataCopy := make([]byte, len(data))
	copy(dataCopy, data)

	defer func() {
		if r := recover(); r != nil {
			atomic.AddInt64(&aw.dropped, 1)
		}
	}()

	select {
	case aw.buffer <- dataCopy:
		return len(data), nil
	default:
		// 缓冲区满，丢弃数据
		atomic.AddInt64(&aw.dropped, 1)
		return 0, nil
	}
}

// Sync 同步刷新数据
func (aw *AsyncWriter) Sync() error {
	// 等待缓冲区清空
	timeout := time.After(10 * time.Second)
	for {
		select {
		case <-timeout:
			return context.DeadlineExceeded
		default:
			if len(aw.buffer) == 0 {
				return aw.writer.Sync()
			}
			time.Sleep(10 * time.Millisecond)
		}
	}
}

// flush 刷新所有缓冲数据
func (aw *AsyncWriter) flush() {
	// 写入所有剩余数据
	for {
		select {
		case data := <-aw.buffer:
			if _, err := aw.writer.Write(data); err != nil {
				atomic.AddInt64(&aw.dropped, 1)
			} else {
				atomic.AddInt64(&aw.written, 1)
			}
		default:
			return
		}
	}
}

// Close 关闭异步写入器
func (aw *AsyncWriter) Close() error {
	aw.cancel()
	close(aw.buffer)
	
	// 等待写入协程完成
	done := make(chan struct{})
	go func() {
		aw.wg.Wait()
		close(done)
	}()
	
	// 设置超时
	select {
	case <-done:
		// 获取统计信息
		dropped := atomic.LoadInt64(&aw.dropped)
		written := atomic.LoadInt64(&aw.written)
		
		if dropped > 0 {
			// 记录丢弃统计（这里不能使用异步写入器本身）
			// 可以在关闭前记录到标准输出
			_ = written // 避免未使用变量警告
		}
		
		return nil
	case <-time.After(30 * time.Second):
		return context.DeadlineExceeded
	}
}

// GetStats 获取统计信息
func (aw *AsyncWriter) GetStats() map[string]interface{} {
	return map[string]interface{}{
		"dropped":    atomic.LoadInt64(&aw.dropped),
		"written":    atomic.LoadInt64(&aw.written),
		"buffer_size": len(aw.buffer),
		"max_buffer": aw.bufferSize,
	}
}