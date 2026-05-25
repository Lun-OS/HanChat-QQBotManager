package services

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/mholt/archiver/v3"
	"go.uber.org/zap"

	"HanChat-QQBotManager/internal/utils"
)

const (
	maxRetries      = 3
	retryDelay      = 3 * time.Second
	downloadTimeout = 120 * time.Second
	maxZipSize      = 50 * 1024 * 1024
	maxZipEntries   = 500
	maxSingleFile   = 10 * 1024 * 1024
	cacheDirName    = "cache/download"
	templateDirName = "plugins/template"
	blocklyDirName  = "plugins/blockly"
)

type PluginEntry struct {
	Name        string `json:"name"`
	Version     string `json:"version"`
	Description string `json:"description"`
	Author      string `json:"author"`
	IndexURL      string `json:"index_url"`
	SHA256Hash  string `json:"sha256_hash"`
	UpdateTime  string `json:"update_time"`
}

type InstallStatus struct {
	PluginName string `json:"plugin_name"`
	PluginType string `json:"plugin_type"`
	Status     string `json:"status"`
	Message    string `json:"message"`
}

type PluginStoreService struct {
	logger      *zap.SugaredLogger
	cfg         *utils.Config
	cacheDir    string
	templateDir string
	blocklyDir  string
	mu          sync.Mutex
	installing  map[string]bool
	statusMap   map[string]*InstallStatus
	statusMu    sync.RWMutex
}

func NewPluginStoreService(base *zap.Logger, cfg *utils.Config) *PluginStoreService {
	s := &PluginStoreService{
		logger:      base.With(zap.String("module", "plugin_store")).Sugar(),
		cfg:         cfg,
		cacheDir:    cacheDirName,
		templateDir: templateDirName,
		blocklyDir:  blocklyDirName,
		installing:  make(map[string]bool),
		statusMap:   make(map[string]*InstallStatus),
	}

	if err := os.MkdirAll(s.cacheDir, 0755); err != nil {
		s.logger.Errorw("创建缓存目录失败", "dir", s.cacheDir, "error", err)
	}
	if err := os.MkdirAll(s.templateDir, 0755); err != nil {
		s.logger.Errorw("创建模板目录失败", "dir", s.templateDir, "error", err)
	}
	if err := os.MkdirAll(s.blocklyDir, 0755); err != nil {
		s.logger.Errorw("创建blockly目录失败", "dir", s.blocklyDir, "error", err)
	}

	return s
}

func (s *PluginStoreService) GetIndexURLs() (string, string, string) {
	return s.cfg.Plugin.Store.IndexLuaURL, s.cfg.Plugin.Store.IndexBlocklyURL, s.cfg.Plugin.Store.IndexBlocklyConfigURL
}

func (s *PluginStoreService) InstallPlugin(pluginType string, entry PluginEntry) error {
	if len(entry.Name) == 0 || len(entry.Name) > 100 {
		return fmt.Errorf("插件名称长度无效: 必须为1-100个字符")
	}
	if strings.ContainsAny(entry.Name, "/\\:*?\"<>|") {
		return fmt.Errorf("插件名称包含非法字符")
	}

	key := fmt.Sprintf("%s:%s", pluginType, entry.Name)

	s.mu.Lock()
	if s.installing[key] {
		s.mu.Unlock()
		return fmt.Errorf("插件 %s 正在安装中", entry.Name)
	}
	s.installing[key] = true
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.installing, key)
		s.mu.Unlock()
	}()

	cacheFileName := fmt.Sprintf("%s_%s_%s", pluginType, entry.Name, entry.Version)
	if pluginType == "lua" {
		cacheFileName += ".zip"
	} else {
		cacheFileName += ".json"
	}
	cachePath := filepath.Join(s.cacheDir, cacheFileName)

	s.setStatus(entry.Name, pluginType, "downloading", "正在下载插件文件...")

	fileData, err := s.downloadWithRetry(entry.IndexURL, cacheFileName)
	if err != nil {
		s.setStatus(entry.Name, pluginType, "error", fmt.Sprintf("下载失败: %v", err))
		return fmt.Errorf("下载插件 %s 失败: %w", entry.Name, err)
	}

	if err := os.WriteFile(cachePath, fileData, 0644); err != nil {
		s.setStatus(entry.Name, pluginType, "error", fmt.Sprintf("写入缓存失败: %v", err))
		return fmt.Errorf("写入缓存文件失败: %w", err)
	}

	s.setStatus(entry.Name, pluginType, "verifying", "正在验证文件哈希...")

	if err := s.verifyHash(cachePath, entry.SHA256Hash); err != nil {
		os.Remove(cachePath)
		s.setStatus(entry.Name, pluginType, "error", fmt.Sprintf("哈希验证失败: %v", err))
		return fmt.Errorf("插件 %s 哈希验证失败: %w", entry.Name, err)
	}

	switch pluginType {
	case "lua":
		s.setStatus(entry.Name, pluginType, "extracting", "正在解压插件...")
		if err := s.extractLuaPlugin(cachePath, entry.Name); err != nil {
			s.setStatus(entry.Name, pluginType, "error", fmt.Sprintf("解压失败: %v", err))
			return fmt.Errorf("解压Lua插件 %s 失败: %w", entry.Name, err)
		}
	case "blockly":
		s.setStatus(entry.Name, pluginType, "installing", "正在安装Blockly插件...")
		if err := s.installBlocklyPlugin(cachePath, entry.Name); err != nil {
			s.setStatus(entry.Name, pluginType, "error", fmt.Sprintf("安装失败: %v", err))
			return fmt.Errorf("安装Blockly插件 %s 失败: %w", entry.Name, err)
		}
	case "blockly_config":
		s.setStatus(entry.Name, pluginType, "installing", "正在安装积木配置...")
		if err := s.installBlocklyConfig(cachePath, entry.Name); err != nil {
			s.setStatus(entry.Name, pluginType, "error", fmt.Sprintf("安装失败: %v", err))
			return fmt.Errorf("安装积木配置 %s 失败: %w", entry.Name, err)
		}
	}

	os.Remove(cachePath)

	s.setStatus(entry.Name, pluginType, "success", "安装成功")
	s.logger.Infow("插件安装成功", "type", pluginType, "name", entry.Name, "version", entry.Version)
	return nil
}

func (s *PluginStoreService) GetInstallStatus(pluginName string) *InstallStatus {
	s.statusMu.RLock()
	defer s.statusMu.RUnlock()
	if status, ok := s.statusMap[pluginName]; ok {
		return status
	}
	return nil
}

func (s *PluginStoreService) GetAllInstallStatus() map[string]*InstallStatus {
	s.statusMu.RLock()
	defer s.statusMu.RUnlock()
	result := make(map[string]*InstallStatus, len(s.statusMap))
	for k, v := range s.statusMap {
		result[k] = v
	}
	return result
}

func (s *PluginStoreService) CleanCache() error {
	entries, err := os.ReadDir(s.cacheDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("读取缓存目录失败: %w", err)
	}

	removed := 0
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		path := filepath.Join(s.cacheDir, entry.Name())
		if err := os.Remove(path); err != nil {
			s.logger.Warnw("删除缓存文件失败", "file", entry.Name(), "error", err)
		} else {
			removed++
		}
	}

	s.logger.Infow("缓存清理完成", "removed", removed)
	return nil
}

func (s *PluginStoreService) GetCacheInfo() (int, int64, error) {
	entries, err := os.ReadDir(s.cacheDir)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, 0, nil
		}
		return 0, 0, fmt.Errorf("读取缓存目录失败: %w", err)
	}

	count := 0
	var totalSize int64
	for _, entry := range entries {
		if !entry.IsDir() {
			info, err := entry.Info()
			if err == nil {
				count++
				totalSize += info.Size()
			}
		}
	}
	return count, totalSize, nil
}

func (s *PluginStoreService) setStatus(pluginName, pluginType, status, message string) {
	s.statusMu.Lock()
	defer s.statusMu.Unlock()
	s.statusMap[pluginName] = &InstallStatus{
		PluginName: pluginName,
		PluginType: pluginType,
		Status:     status,
		Message:    message,
	}
}

func (s *PluginStoreService) downloadWithRetry(url, cacheTag string) ([]byte, error) {
	var lastErr error
	for attempt := 1; attempt <= maxRetries; attempt++ {
		data, err := s.downloadFile(url)
		if err == nil {
			return data, nil
		}
		lastErr = err
		s.logger.Warnw("下载失败，准备重试",
			"url", url,
			"attempt", attempt,
			"maxRetries", maxRetries,
			"error", err)
		if attempt < maxRetries {
			time.Sleep(retryDelay * time.Duration(attempt))
		}
	}
	return nil, fmt.Errorf("重试%d次后仍然失败: %w", maxRetries, lastErr)
}

func (s *PluginStoreService) downloadFile(url string) ([]byte, error) {
	client := &http.Client{
		Timeout: downloadTimeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return fmt.Errorf("重定向次数过多")
			}
			return nil
		},
	}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("User-Agent", "HanChat-PluginStore/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP状态码: %d", resp.StatusCode)
	}

	limitedReader := io.LimitReader(resp.Body, maxZipSize+1)
	data, err := io.ReadAll(limitedReader)
	if err != nil {
		return nil, fmt.Errorf("读取响应体失败: %w", err)
	}

	if len(data) > maxZipSize {
		return nil, fmt.Errorf("文件大小超过限制(%dMB)", maxZipSize/(1024*1024))
	}

	return data, nil
}

func (s *PluginStoreService) verifyHash(filePath, expectedHash string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("打开文件失败: %w", err)
	}
	defer file.Close()

	hasher := sha256.New()
	if _, err := io.Copy(hasher, file); err != nil {
		return fmt.Errorf("计算哈希失败: %w", err)
	}

	actualHash := hex.EncodeToString(hasher.Sum(nil))
	expectedHash = strings.ToLower(strings.TrimSpace(expectedHash))

	if actualHash != expectedHash {
		return fmt.Errorf("哈希不匹配: 期望 %s, 实际 %s", expectedHash, actualHash)
	}

	s.logger.Infow("哈希验证通过", "file", filePath, "hash", actualHash[:16]+"...")
	return nil
}

func (s *PluginStoreService) extractLuaPlugin(zipPath, pluginName string) error {
	destDir := filepath.Join(s.templateDir, pluginName)
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return fmt.Errorf("创建目标目录失败: %w", err)
	}

	err := s.extractWithGoZip(zipPath, destDir)
	if err != nil {
		s.logger.Warnw("Go标准库解压失败，尝试archiver库回退", "error", err)
		os.RemoveAll(destDir)
		if mkErr := os.MkdirAll(destDir, 0755); mkErr != nil {
			return fmt.Errorf("创建目标目录失败: %w", mkErr)
		}
		if archErr := s.extractWithArchiver(zipPath, destDir); archErr != nil {
			os.RemoveAll(destDir)
			return fmt.Errorf("解压失败(标准库: %v; archiver: %v)", err, archErr)
		}
	}

	s.logger.Infow("Lua插件解压完成", "plugin", pluginName, "dest", destDir)
	return nil
}

func (s *PluginStoreService) extractWithGoZip(zipPath, destDir string) error {
	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		return fmt.Errorf("打开zip文件失败: %w", err)
	}
	defer reader.Close()

	if len(reader.File) > maxZipEntries {
		return fmt.Errorf("zip文件包含过多条目(%d)，上限%d", len(reader.File), maxZipEntries)
	}

	for _, f := range reader.File {
		s.logger.Debugw("zip条目信息", "name", f.Name, "method", f.Method, "compressed_size", f.CompressedSize64, "uncompressed_size", f.UncompressedSize64)
		if err := s.extractZipEntry(f, destDir); err != nil {
			return fmt.Errorf("解压条目 %s 失败(压缩方法:%d): %w", f.Name, f.Method, err)
		}
	}
	return nil
}

func (s *PluginStoreService) extractWithArchiver(zipPath, destDir string) error {
	z := archiver.Zip{
		OverwriteExisting: true,
		MkdirAll:          true,
	}
	if err := z.Unarchive(zipPath, destDir); err != nil {
		return fmt.Errorf("archiver解压失败: %w", err)
	}

	if err := s.validateExtractedPaths(destDir); err != nil {
		return err
	}

	s.logger.Infow("archiver库解压成功", "dest", destDir)
	return nil
}

func (s *PluginStoreService) validateExtractedPaths(destDir string) error {
	return filepath.Walk(destDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(destDir, path)
		if err != nil {
			return err
		}
		if strings.Contains(rel, "..") {
			os.Remove(path)
			return fmt.Errorf("路径遍历检测: %s", rel)
		}
		if !info.IsDir() && info.Size() > maxSingleFile {
			os.Remove(path)
			return fmt.Errorf("文件 %s 超过大小限制(%dMB)", rel, maxSingleFile/(1024*1024))
		}
		return nil
	})
}

func (s *PluginStoreService) extractZipEntry(f *zip.File, destDir string) error {
	entryPath := filepath.Join(destDir, f.Name)

	if strings.Contains(f.Name, "..") {
		return fmt.Errorf("检测到路径遍历攻击: %s", f.Name)
	}

	if f.FileInfo().Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("拒绝解压符号链接条目: %s", f.Name)
	}

	absDestDir, err := filepath.Abs(destDir)
	if err != nil {
		return fmt.Errorf("获取目标目录绝对路径失败: %w", err)
	}

	if f.FileInfo().IsDir() {
		absEntryPath, err := filepath.Abs(entryPath)
		if err != nil {
			return fmt.Errorf("获取路径绝对路径失败: %w", err)
		}
		if !strings.HasPrefix(absEntryPath, absDestDir) {
			return fmt.Errorf("路径遍历检测: %s 超出目标目录", f.Name)
		}
		if err := os.MkdirAll(entryPath, f.Mode()); err != nil {
			return fmt.Errorf("创建目录失败: %w", err)
		}
		return nil
	}

	parentDir := filepath.Dir(entryPath)
	if err := os.MkdirAll(parentDir, 0755); err != nil {
		return fmt.Errorf("创建父目录失败: %w", err)
	}

	absEntryPath, err := filepath.Abs(entryPath)
	if err != nil {
		return fmt.Errorf("获取路径绝对路径失败: %w", err)
	}
	if !strings.HasPrefix(absEntryPath, absDestDir) {
		return fmt.Errorf("路径遍历检测: %s 超出目标目录", f.Name)
	}

	if f.FileInfo().Size() > maxSingleFile {
		return fmt.Errorf("文件 %s 大小超过限制(%dMB)", f.Name, maxSingleFile/(1024*1024))
	}

	src, err := f.Open()
	if err != nil {
		return fmt.Errorf("打开zip条目失败: %w", err)
	}
	defer src.Close()

	dst, err := os.OpenFile(entryPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, f.Mode())
	if err != nil {
		return fmt.Errorf("创建文件失败: %w", err)
	}
	defer dst.Close()

	limitedSrc := io.LimitReader(src, maxSingleFile+1)
	written, err := io.Copy(dst, limitedSrc)
	if err != nil {
		return fmt.Errorf("写入文件失败: %w", err)
	}
	if written > maxSingleFile {
		os.Remove(entryPath)
		return fmt.Errorf("文件 %s 解压后超过大小限制", f.Name)
	}

	return nil
}

func (s *PluginStoreService) installBlocklyPlugin(cachePath, pluginName string) error {
	destPath := filepath.Join(s.blocklyDir, pluginName+".json")

	src, err := os.Open(cachePath)
	if err != nil {
		return fmt.Errorf("打开缓存文件失败: %w", err)
	}
	defer src.Close()

	var jsonData map[string]interface{}
	if err := json.NewDecoder(src).Decode(&jsonData); err != nil {
		return fmt.Errorf("JSON格式无效: %w", err)
	}

	if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
		return fmt.Errorf("创建目标目录失败: %w", err)
	}

	data, err := os.ReadFile(cachePath)
	if err != nil {
		return fmt.Errorf("读取缓存文件失败: %w", err)
	}

	if err := os.WriteFile(destPath, data, 0644); err != nil {
		return fmt.Errorf("写入目标文件失败: %w", err)
	}

	s.logger.Infow("Blockly插件安装完成", "plugin", pluginName, "dest", destPath)
	return nil
}

func (s *PluginStoreService) installBlocklyConfig(cachePath, configName string) error {
	// 积木配置安装到 .config 目录
	configDir := filepath.Join(s.blocklyDir, ".config")
	destPath := filepath.Join(configDir, configName+".json")

	src, err := os.Open(cachePath)
	if err != nil {
		return fmt.Errorf("打开缓存文件失败: %w", err)
	}
	defer src.Close()

	// 验证JSON格式
	var jsonData map[string]interface{}
	if err := json.NewDecoder(src).Decode(&jsonData); err != nil {
		return fmt.Errorf("JSON格式无效: %w", err)
	}

	if err := os.MkdirAll(configDir, 0755); err != nil {
		return fmt.Errorf("创建配置目录失败: %w", err)
	}

	data, err := os.ReadFile(cachePath)
	if err != nil {
		return fmt.Errorf("读取缓存文件失败: %w", err)
	}

	if err := os.WriteFile(destPath, data, 0644); err != nil {
		return fmt.Errorf("写入目标文件失败: %w", err)
	}

	s.logger.Infow("积木配置安装完成", "config", configName, "dest", destPath)
	return nil
}

// InstalledPluginInfo 已安装插件信息
type InstalledPluginInfo struct {
	Name        string `json:"name"`
	Version     string `json:"version"`
	Type        string `json:"type"`
	InstallTime string `json:"install_time"`
}

// GetInstalledPlugins 获取已安装的插件列表
func (s *PluginStoreService) GetInstalledPlugins() ([]InstalledPluginInfo, error) {
	var plugins []InstalledPluginInfo

	// 扫描Lua插件目录
	luaEntries, err := os.ReadDir(s.templateDir)
	if err != nil && !os.IsNotExist(err) {
		s.logger.Warnw("读取Lua插件目录失败", "error", err)
	}
	for _, entry := range luaEntries {
		if entry.IsDir() {
			info, _ := entry.Info()
			plugins = append(plugins, InstalledPluginInfo{
				Name:        entry.Name(),
				Version:     "",
				Type:        "lua",
				InstallTime: info.ModTime().Format("2006-01-02 15:04:05"),
			})
		}
	}

	// 扫描Blockly插件目录
	blocklyEntries, err := os.ReadDir(s.blocklyDir)
	if err != nil && !os.IsNotExist(err) {
		s.logger.Warnw("读取Blockly插件目录失败", "error", err)
	}
	for _, entry := range blocklyEntries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".json") {
			info, _ := entry.Info()
			name := strings.TrimSuffix(entry.Name(), ".json")
			plugins = append(plugins, InstalledPluginInfo{
				Name:        name,
				Version:     "",
				Type:        "blockly",
				InstallTime: info.ModTime().Format("2006-01-02 15:04:05"),
			})
		}
	}

	// 扫描Blockly配置目录
	configDir := filepath.Join(s.blocklyDir, ".config")
	configEntries, err := os.ReadDir(configDir)
	if err != nil && !os.IsNotExist(err) {
		s.logger.Warnw("读取积木配置目录失败", "error", err)
	}
	for _, entry := range configEntries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".json") {
			info, _ := entry.Info()
			name := strings.TrimSuffix(entry.Name(), ".json")
			plugins = append(plugins, InstalledPluginInfo{
				Name:        name,
				Version:     "",
				Type:        "blockly_config",
				InstallTime: info.ModTime().Format("2006-01-02 15:04:05"),
			})
		}
	}

	return plugins, nil
}

// UninstallPlugin 卸载插件
func (s *PluginStoreService) UninstallPlugin(pluginType, pluginName string) error {
	var targetPath string

	switch pluginType {
	case "lua":
		targetPath = filepath.Join(s.templateDir, pluginName)
	case "blockly":
		targetPath = filepath.Join(s.blocklyDir, pluginName+".json")
	case "blockly_config":
		targetPath = filepath.Join(s.blocklyDir, ".config", pluginName+".json")
	default:
		return fmt.Errorf("无效的插件类型: %s", pluginType)
	}

	// 检查文件/目录是否存在
	if _, err := os.Stat(targetPath); os.IsNotExist(err) {
		return fmt.Errorf("插件不存在: %s", pluginName)
	}

	// 删除文件或目录
	if err := os.RemoveAll(targetPath); err != nil {
		return fmt.Errorf("删除插件失败: %w", err)
	}

	s.logger.Infow("插件卸载完成", "type", pluginType, "name", pluginName)
	return nil
}
