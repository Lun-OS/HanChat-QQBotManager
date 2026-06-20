package services

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"
	"HanChat-QQBotManager/internal/config"
	"HanChat-QQBotManager/internal/utils"
)

// LogCleanupService 日志自动清理服务
type LogCleanupService struct {
	logger        *zap.SugaredLogger
	accountConfig *config.AccountConfig
	logsDir       string
	stopChan      chan struct{}
	wg            sync.WaitGroup
	running       bool
	mu            sync.Mutex
}

// NewLogCleanupService 创建日志自动清理服务
func NewLogCleanupService(baseLogger *zap.Logger, accountConfig *config.AccountConfig, logsDir string) *LogCleanupService {
	if logsDir == "" {
		logsDir = "./logs"
	}
	return &LogCleanupService{
		logger:        utils.NewModuleLogger(baseLogger, "log_cleanup"),
		accountConfig: accountConfig,
		logsDir:       logsDir,
		stopChan:      make(chan struct{}),
	}
}

// Start 启动日志自动清理服务
func (s *LogCleanupService) Start() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.running {
		return
	}

	s.running = true
	s.wg.Add(1)
	go s.loop()
	s.logger.Info("日志自动清理服务已启动")
}

// Stop 停止日志自动清理服务
func (s *LogCleanupService) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running {
		return
	}

	close(s.stopChan)
	s.wg.Wait()
	s.running = false
	s.logger.Info("日志自动清理服务已停止")
}

// loop 主循环，根据配置间隔执行清理
func (s *LogCleanupService) loop() {
	defer s.wg.Done()

	// 立即执行一次清理
	s.runCleanup()

	for {
		interval := s.getInterval()
		timer := time.NewTimer(interval)
		select {
		case <-timer.C:
			s.runCleanup()
		case <-s.stopChan:
			timer.Stop()
			return
		}
	}
}

// getInterval 从配置中获取清理间隔
func (s *LogCleanupService) getInterval() time.Duration {
	if s.accountConfig == nil {
		return 24 * time.Hour
	}

	cfg, err := s.accountConfig.LoadConfig()
	if err != nil {
		s.logger.Warnw("加载配置失败，使用默认间隔", "error", err)
		return 24 * time.Hour
	}

	if !cfg.LogCleanup.Enabled {
		// 如果禁用，使用较长的检查间隔避免频繁读取配置
		return 1 * time.Hour
	}

	hours := cfg.LogCleanup.Interval
	if hours < 1 {
		hours = 24
	}
	if hours > 168 {
		hours = 168
	}

	return time.Duration(hours) * time.Hour
}

// runCleanup 执行日志清理
func (s *LogCleanupService) runCleanup() {
	if s.accountConfig == nil {
		return
	}

	cfg, err := s.accountConfig.LoadConfig()
	if err != nil {
		s.logger.Errorw("加载配置失败，跳过本次清理", "error", err)
		return
	}

	if !cfg.LogCleanup.Enabled {
		s.logger.Debug("日志自动清理已禁用，跳过")
		return
	}

	retention := cfg.LogCleanup.Retention
	if retention < 1 {
		retention = 7
	}
	if retention > 365 {
		retention = 365
	}

	scope := cfg.LogCleanup.Scope
	cutoff := time.Now().AddDate(0, 0, -retention)

	s.logger.Infow("开始执行日志自动清理",
		"retention_days", retention,
		"cutoff", cutoff.Format("2006-01-02"),
	)

	entries, err := os.ReadDir(s.logsDir)
	if err != nil {
		s.logger.Errorw("读取日志目录失败", "error", err)
		return
	}

	var deletedCount int
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		filename := entry.Name()
		if !s.shouldCleanupFile(filename, scope) {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			continue
		}

		if info.ModTime().Before(cutoff) {
			filepath := filepath.Join(s.logsDir, filename)
			if err := os.Remove(filepath); err != nil {
				s.logger.Errorw("删除旧日志文件失败", "filepath", filepath, "error", err)
			} else {
				s.logger.Infow("删除旧日志文件", "filepath", filepath, "mod_time", info.ModTime().Format("2006-01-02"))
				deletedCount++
			}
		}
	}

	if deletedCount > 0 {
		s.logger.Infow("日志自动清理完成", "deleted_count", deletedCount)
	} else {
		s.logger.Debug("本次没有需要清理的日志文件")
	}
}

// shouldCleanupFile 根据文件名和清理范围判断是否应该清理该文件
func (s *LogCleanupService) shouldCleanupFile(filename string, scope config.LogCleanupScope) bool {
	// 只处理 .log 文件
	if !strings.HasSuffix(filename, ".log") {
		return false
	}

	// 获取文件名前缀（不含日期和扩展名）
	// 日志文件名格式: {selfID}_{type}_{date}.log
	// 例如: 123456_ws_2024-01-15.log, 123456_plugin_2024-01-15.log
	base := strings.TrimSuffix(filename, ".log")
	parts := strings.Split(base, "_")
	if len(parts) < 2 {
		return false
	}

	// 检查文件类型
	// 文件名格式通常为: {selfID}_{logType}_{date}.log
	// 我们需要匹配 logType 部分
	for i := 1; i < len(parts); i++ {
		typePart := parts[i]

		// 机器人连接日志 (ws)
		if typePart == "ws" && scope.BotConnLog {
			return true
		}
		// 插件日志 (plugin)
		if typePart == "plugin" && scope.PluginLog {
			return true
		}
		// 代理日志 (proxy)
		if typePart == "proxy" && scope.ProxyLog {
			return true
		}
	}

	// 登录日志 (startup.log 或包含 login 的文件)
	if strings.Contains(filename, "startup") && scope.LoginLog {
		return true
	}
	if strings.Contains(filename, "login") && scope.LoginLog {
		return true
	}

	// 文件操作日志 (file_op 或 fileop)
	if (strings.Contains(filename, "file_op") || strings.Contains(filename, "fileop")) && scope.FileOpLog {
		return true
	}

	// 插件操作日志 (plugin_op 或 pluginop)
	if (strings.Contains(filename, "plugin_op") || strings.Contains(filename, "pluginop")) && scope.PluginOpLog {
		return true
	}

	return false
}
