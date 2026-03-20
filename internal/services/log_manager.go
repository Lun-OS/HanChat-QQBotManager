package services

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"go.uber.org/zap"
	"HanChat-QQBotManager/internal/utils"
)

// LogManager 日志管理器
// 负责管理 WebSocket 消息日志和插件日志的持久化
type LogManager struct {
	logger     *zap.SugaredLogger
	logsDir    string
	files      map[string]*os.File // selfID -> 日志文件
	filesMu    sync.RWMutex
	writeLocks map[string]*sync.Mutex // 每个文件的写入锁
	locksMu    sync.RWMutex
	maxSize    int64 // 单个文件最大大小（字节），默认 100MB
	maxFiles   int   // 保留的日志文件数量，默认 7 天
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

	return &LogManager{
		logger:     utils.NewModuleLogger(baseLogger, "log_manager"),
		logsDir:    logsDir,
		files:      make(map[string]*os.File),
		writeLocks: make(map[string]*sync.Mutex),
		maxSize:    100 * 1024 * 1024, // 100MB
		maxFiles:   7,
	}
}

// WriteWSLog 写入 WebSocket 日志
// direction: "recv" 或 "send"
// 过滤掉 ping/pong 消息
func (m *LogManager) WriteWSLog(selfID string, direction string, data []byte) {
	// 解析消息，过滤 ping
	var msg map[string]interface{}
	if err := json.Unmarshal(data, &msg); err == nil {
		// 检查是否是 ping 消息
		if metaType, ok := msg["meta_event_type"].(string); ok && metaType == "heartbeat" {
			return // 忽略心跳消息
		}
		if postType, ok := msg["post_type"].(string); ok && postType == "meta_event" {
			if subType, ok := msg["sub_type"].(string); ok && subType == "heartbeat" {
				return // 忽略心跳消息
			}
		}
	}

	// 格式化日志
	timestamp := time.Now().Format("2006-01-02 15:04:05.000")
	logLine := fmt.Sprintf("[%s] [%s] %s\n", timestamp, direction, string(data))

	// 写入文件
	m.writeToFile(selfID, "ws", logLine)
}

// WritePluginLog 写入插件日志
func (m *LogManager) WritePluginLog(selfID string, pluginName string, level string, message string) {
	timestamp := time.Now().Format("2006-01-02 15:04:05.000")
	logLine := fmt.Sprintf("[%s] [%s] [%s] %s\n", timestamp, pluginName, level, message)

	// 写入文件
	m.writeToFile(selfID, "plugin", logLine)
}

// writeToFile 写入日志文件
// logType: "ws" 或 "plugin"
func (m *LogManager) writeToFile(selfID string, logType string, content string) {
	// 构建文件路径
	date := time.Now().Format("2006-01-02")
	filename := fmt.Sprintf("%s_%s_%s.log", selfID, logType, date)
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
		// 检查是否需要创建新文件
		newFile, err := os.OpenFile(filepath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			m.filesMu.Unlock()
			m.logger.Errorw("打开日志文件失败", "filepath", filepath, "error", err)
			return
		}
		m.files[filename] = newFile
		file = newFile
	}
	m.filesMu.Unlock()

	// 写入内容
	if _, err := file.WriteString(content); err != nil {
		m.logger.Errorw("写入日志失败", "filepath", filepath, "error", err)
	}
}

// GetLogs 获取日志内容
// logType: "ws" 或 "plugin"
// date: 日期格式 "2006-01-02"，为空则使用今天
func (m *LogManager) GetLogs(selfID string, logType string, date string, limit int) ([]string, error) {
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}

	filename := fmt.Sprintf("%s_%s_%s.log", selfID, logType, date)
	filepath := filepath.Join(m.logsDir, filename)

	// 读取文件
	data, err := os.ReadFile(filepath)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, err
	}

	// 按行分割
	lines := splitLines(string(data))

	// 限制行数（从后往前取）
	if limit > 0 && len(lines) > limit {
		lines = lines[len(lines)-limit:]
	}

	return lines, nil
}

// splitLines 将字符串按行分割
func splitLines(s string) []string {
	var lines []string
	var start int
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			lines = append(lines, s[start:i])
			start = i + 1
		}
	}
	if start < len(s) {
		lines = append(lines, s[start:])
	}
	return lines
}

// Close 关闭所有日志文件
func (m *LogManager) Close() {
	m.filesMu.Lock()
	defer m.filesMu.Unlock()

	for filename, file := range m.files {
		if err := file.Close(); err != nil {
			m.logger.Errorw("关闭日志文件失败", "filename", filename, "error", err)
		}
	}
	m.files = make(map[string]*os.File)
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
