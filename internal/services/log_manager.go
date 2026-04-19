package services

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"go.uber.org/zap"
	"HanChat-QQBotManager/internal/utils"
)

// LogManager 日志管理器
// 负责管理 WebSocket 消息日志和插件日志的持久化
type LogManager struct {
	logger     *zap.SugaredLogger
	logsDir    string
	files      map[string]*os.File // filename -> 日志文件
	filesMu    sync.RWMutex
	fileOpenTimes map[string]time.Time // 文件打开时间，用于清理过期句柄
	writeLocks map[string]*sync.Mutex // 每个文件的写入锁
	locksMu    sync.RWMutex
	maxSize    int64 // 单个文件最大大小（字节），默认 100MB
	maxFiles   int   // 保留的日志文件数量，默认 7 天
	maxOpenFiles int // 最大同时打开的文件数，防止文件描述符耗尽
	writeCount int64 // 写入计数器，用于触发定期清理
	// 内存日志缓存
	logCache map[string][]string // key: "ws:selfID:date" or "plugin:selfID:date" -> 日志行
	logCacheMu sync.RWMutex
	maxCacheLines int // 每个缓存最多保留的行数
	// 磁盘写入缓冲
	writeBuffer map[string][]byte // filename -> 缓冲内容
	writeBufferMu sync.Mutex
	bufferSize int // 缓冲大小（字节），默认 64KB
	flushInterval time.Duration // 刷新间隔，默认 5秒
	stopChan chan struct{} // 停止信号
	wg sync.WaitGroup // 等待 goroutine 退出
}

// NewLogManager 创建日志管理器
func NewLogManager(baseLogger *zap.Logger, logsDir string) *LogManager {
	if logsDir == "" {
		logsDir = "./logs"
	}

	// 确保日志目录存在
	if err := os.MkdirAll(logsDir, 0755); err != nil {
		baseLogger.Error("创建日志目录失败", zap.Error(err))
	}

	m := &LogManager{
		logger:        utils.NewModuleLogger(baseLogger, "log_manager"),
		logsDir:       logsDir,
		files:         make(map[string]*os.File),
		fileOpenTimes: make(map[string]time.Time),
		writeLocks:    make(map[string]*sync.Mutex),
		maxSize:       100 * 1024 * 1024, // 100MB
		maxFiles:      7,
		maxOpenFiles:  50, // 最大同时打开50个文件，防止文件描述符耗尽
		logCache:      make(map[string][]string),
		maxCacheLines: 50, // 内存中最多保留50条日志
		writeBuffer:   make(map[string][]byte),
		bufferSize:    64 * 1024, // 64KB 缓冲
		flushInterval: 5 * time.Second,
		stopChan:      make(chan struct{}),
	}

	// 启动定期刷新 goroutine
	m.wg.Add(1)
	go m.flushLoop()

	return m
}

// WriteWSLog 写入 WebSocket 日志
// direction: "recv" 或 "send"
// 过滤掉 ping/pong 消息
func (m *LogManager) WriteWSLog(selfID string, direction string, data []byte) {
	if bytes.Contains(data, []byte(`"heartbeat"`)) {
		return
	}

	timestamp := time.Now().Format("2006-01-02 15:04:05.000")
	logLine := fmt.Sprintf("[%s] [%s] %s\n", timestamp, direction, string(data))

	m.writeToFile(selfID, "ws", logLine)
}

// WritePluginLog 写入插件日志
func (m *LogManager) WritePluginLog(selfID string, pluginName string, level string, message string) {
	timestamp := time.Now().Format("2006-01-02 15:04:05.000")
	logLine := fmt.Sprintf("[%s] [%s] [%s] %s\n", timestamp, pluginName, level, message)

	// 写入文件
	m.writeToFile(selfID, "plugin", logLine)
}

// writeToFile 写入日志文件和内存缓存（带缓冲）
// logType: "ws" 或 "plugin"
func (m *LogManager) writeToFile(selfID string, logType string, content string) {
	date := time.Now().Format("2006-01-02")
	
	// 先写入内存缓存
	cacheKey := fmt.Sprintf("%s:%s:%s", logType, selfID, date)
	logLine := content
	// 去掉末尾的换行符
	if len(logLine) > 0 && logLine[len(logLine)-1] == '\n' {
		logLine = logLine[:len(logLine)-1]
	}
	m.logCacheMu.Lock()
	cache := m.logCache[cacheKey]
	cache = append(cache, logLine)
	if len(cache) > m.maxCacheLines {
		cache = cache[len(cache)-m.maxCacheLines:]
	}
	m.logCache[cacheKey] = cache
	m.logCacheMu.Unlock()

	// 构建文件路径
	filename := fmt.Sprintf("%s_%s_%s.log", selfID, logType, date)

	// ⭐ 定期清理过期文件句柄（每100次写入检查一次，避免频繁加锁）
	if atomic.AddInt64(&m.writeCount, 1) % 100 == 0 {
		m.cleanupStaleFileHandles()
	}

	// 先写入内存缓冲区
	m.writeBufferMu.Lock()
	currentBuffer := m.writeBuffer[filename]
	newBuffer := append(currentBuffer, content...)
	shouldFlush := len(newBuffer) >= m.bufferSize
	if shouldFlush {
		m.writeBuffer[filename] = nil // 清空缓冲区
	} else {
		m.writeBuffer[filename] = newBuffer
	}
	m.writeBufferMu.Unlock()

	// 如果缓冲区满了，立即刷新
	if shouldFlush {
		m.flushFile(filename, newBuffer)
	}
}

// flushFile 刷新缓冲到文件
func (m *LogManager) flushFile(filename string, content []byte) {
	if len(content) == 0 {
		return
	}

	filepath := filepath.Join(m.logsDir, filename)

	// 获取或创建文件写入锁
	m.locksMu.Lock()
	writeLock, exists := m.writeLocks[filename]
	if !exists {
		writeLock = &sync.Mutex{}
		m.writeLocks[filename] = writeLock
	}
	m.locksMu.Unlock()

	// 获取文件写入锁
	writeLock.Lock()
	defer writeLock.Unlock()

	// 获取或创建文件
	m.filesMu.Lock()
	file, exists := m.files[filename]
	if !exists {
		// 检查并限制打开的文件数量
		if len(m.files) >= m.maxOpenFiles {
			m.logger.Warnw("打开的文件数量达到上限，批量清理最旧的文件句柄",
				"current", len(m.files),
				"max", m.maxOpenFiles)
			m.closeOldestFileHandles(len(m.files)/4)
		}

		newFile, err := os.OpenFile(filepath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			m.filesMu.Unlock()
			m.logger.Errorw("打开日志文件失败", "filepath", filepath, "error", err)
			return
		}
		m.files[filename] = newFile
		m.fileOpenTimes[filename] = time.Now()
		file = newFile
	}
	m.filesMu.Unlock()

	// 批量写入内容
	if _, err := file.Write(content); err != nil {
		m.logger.Errorw("写入日志失败", "filepath", filepath, "error", err)
	}
}

// flushLoop 定期刷新所有缓冲区
func (m *LogManager) flushLoop() {
	defer m.wg.Done()

	ticker := time.NewTicker(m.flushInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			m.flushAll()
		case <-m.stopChan:
			m.flushAll() // 停止前确保刷新所有数据
			return
		}
	}
}

// flushAll 刷新所有缓冲区
func (m *LogManager) flushAll() {
	m.writeBufferMu.Lock()
	// 获取所有缓冲并清空
	buffers := make(map[string][]byte, len(m.writeBuffer))
	for filename, buf := range m.writeBuffer {
		if len(buf) > 0 {
			buffers[filename] = buf
			m.writeBuffer[filename] = nil
		}
	}
	m.writeBufferMu.Unlock()

	// 逐个刷新
	for filename, buf := range buffers {
		m.flushFile(filename, buf)
	}
}

// cleanupStaleFileHandles 清理超过1天的文件句柄
// 防止长期运行导致文件描述符耗尽
func (m *LogManager) cleanupStaleFileHandles() {
	m.filesMu.Lock()
	defer m.filesMu.Unlock()

	if len(m.files) < m.maxOpenFiles/2 {
		return
	}

	cutoff := time.Now().Add(-24 * time.Hour)
	cleanedCount := 0

	for filename, openTime := range m.fileOpenTimes {
		if openTime.Before(cutoff) {
			if file, exists := m.files[filename]; exists {
				if err := file.Close(); err != nil {
					m.logger.Errorw("关闭过期日志文件句柄失败", "filename", filename, "error", err)
				} else {
					delete(m.files, filename)
					delete(m.fileOpenTimes, filename)
					cleanedCount++
				}
			}
		}
	}

	if cleanedCount > 0 {
		m.logger.Debugw("清理过期日志文件句柄完成", "cleaned_count", cleanedCount, "remaining", len(m.files))
	}

	m.locksMu.Lock()
	for filename := range m.writeLocks {
		_, fileExists := m.files[filename]
		_, timeExists := m.fileOpenTimes[filename]
		if !fileExists && !timeExists {
			delete(m.writeLocks, filename)
		}
	}
	m.locksMu.Unlock()
}

// closeOldestFileHandle 关闭最旧的文件句柄
// 当达到最大打开文件数限制时调用
// closeOldestFileHandles 批量关闭最旧的文件句柄
// count: 要关闭的文件数量（如果<=0则至少关闭1个）
func (m *LogManager) closeOldestFileHandles(count int) {
	if count <= 0 {
		count = 1
	}

	// 确保不会关闭超过当前文件数的50%
	maxClose := len(m.files) / 2
	if count > maxClose {
		count = maxClose
	}
	if count < 1 {
		count = 1
	}

	// 按打开时间排序，找到最旧的count个文件
	type fileTime struct {
		filename string
		openTime time.Time
	}
	fileTimes := make([]fileTime, 0, len(m.fileOpenTimes))
	for filename, openTime := range m.fileOpenTimes {
		fileTimes = append(fileTimes, fileTime{filename, openTime})
	}

	// 按时间升序排序（最旧的在前面）
	sort.Slice(fileTimes, func(i, j int) bool {
		return fileTimes[i].openTime.Before(fileTimes[j].openTime)
	})

	// 关闭最旧的count个文件
	closedCount := 0
	for i := 0; i < count && i < len(fileTimes); i++ {
		ft := fileTimes[i]
		if file, exists := m.files[ft.filename]; exists {
			if err := file.Close(); err != nil {
				m.logger.Errorw("关闭日志文件句柄失败", "filename", ft.filename, "error", err)
			} else {
				delete(m.files, ft.filename)
				delete(m.fileOpenTimes, ft.filename)
				closedCount++
			}
		}
	}

	if closedCount > 0 {
		m.logger.Infow("批量关闭最旧日志文件句柄",
			"closed_count", closedCount,
			"remaining", len(m.files))
	}
}

// GetLogs 获取日志内容（从内存缓存读取，不再读取磁盘文件）
// logType: "ws" 或 "plugin"
// date: 日期格式 "2006-01-02"，为空则使用今天
func (m *LogManager) GetLogs(selfID string, logType string, date string, limit int) ([]string, error) {
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}

	// 如果没有限制，默认取50行
	if limit <= 0 {
		limit = 50
	}

	// 从内存缓存读取
	cacheKey := fmt.Sprintf("%s:%s:%s", logType, selfID, date)
	m.logCacheMu.RLock()
	cache := m.logCache[cacheKey]
	m.logCacheMu.RUnlock()

	// 返回副本，避免外部修改
	result := make([]string, len(cache))
	copy(result, cache)

	// 取最后 limit 行
	if len(result) > limit {
		result = result[len(result)-limit:]
	}

	return result, nil
}

// Close 关闭所有日志文件
func (m *LogManager) Close() {
	// 发送停止信号
	close(m.stopChan)
	// 等待刷新 goroutine 退出
	m.wg.Wait()

	// 关闭所有文件
	m.filesMu.Lock()
	defer m.filesMu.Unlock()

	for filename, file := range m.files {
		if err := file.Close(); err != nil {
			m.logger.Errorw("关闭日志文件失败", "filename", filename, "error", err)
		}
	}
	m.files = make(map[string]*os.File)
	m.fileOpenTimes = make(map[string]time.Time) // ⭐ 清理打开时间记录
}

// CleanupOldLogs 清理旧日志文件
// 保留最近 N 天的日志
func (m *LogManager) CleanupOldLogs() {
	entries, err := os.ReadDir(m.logsDir)
	if err != nil {
		m.logger.Errorw("读取日志目录失败", "error", err)
		return
	}

	cutoff := time.Now().AddDate(0, 0, -m.maxFiles)

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			continue
		}

		// 检查文件修改时间
		if info.ModTime().Before(cutoff) {
			filepath := filepath.Join(m.logsDir, entry.Name())
			if err := os.Remove(filepath); err != nil {
				m.logger.Errorw("删除旧日志文件失败", "filepath", filepath, "error", err)
			} else {
				m.logger.Infow("删除旧日志文件", "filepath", filepath)
			}
		}
	}
}
