package plugins

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	lua "github.com/yuin/gopher-lua"
	"go.uber.org/zap"
	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/transform"
)

type ScriptInfo struct {
	Hash        string
	Content     []byte
	CompileTime time.Time
	ModTime     time.Time // 文件修改时间
}

type LuaScriptCache struct {
	scripts        map[string]*ScriptInfo
	cacheMu        sync.RWMutex
	logger         *zap.SugaredLogger
	cacheDir       string
	enabled        bool
	maxAge         time.Duration
	maxEntries     int
	ctx            context.Context
	cancel         context.CancelFunc
	cleanupWg      sync.WaitGroup
}

func readFileUTF8(path string) ([]byte, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if !utf8.Valid(content) {
		utf8Content, _, err := transform.Bytes(simplifiedchinese.GBK.NewDecoder(), content)
		if err != nil {
			return content, err
		}
		return utf8Content, nil
	}
	return content, nil
}

// NewLuaScriptCache 创建Lua脚本缓存管理器
func NewLuaScriptCache(logger *zap.SugaredLogger, cacheDir string) *LuaScriptCache {
	if cacheDir == "" {
		cacheDir = "cache/lua_scripts"
	}

	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		logger.Warnw("创建Lua脚本缓存目录失败", "dir", cacheDir, "error", err)
		cacheDir = ""
	}

	ctx, cancel := context.WithCancel(context.Background())

	cache := &LuaScriptCache{
		scripts:    make(map[string]*ScriptInfo),
		logger:     logger,
		cacheDir:   cacheDir,
		enabled:    true,
		maxAge:     24 * time.Hour,
		maxEntries: 100,
		ctx:        ctx,
		cancel:     cancel,
	}

	cache.cleanupWg.Add(1)
	go cache.periodicCleanup()

	return cache
}

// GetScriptHash 获取脚本内容的哈希值
func (c *LuaScriptCache) GetScriptHash(content []byte) string {
	hash := md5.Sum(content)
	return hex.EncodeToString(hash[:])
}

// GetCachedScript 从缓存获取脚本信息（会检查文件是否被修改）
func (c *LuaScriptCache) GetCachedScript(scriptPath string) ([]byte, bool) {
	if !c.enabled {
		return nil, false
	}

	c.cacheMu.RLock()
	info, exists := c.scripts[scriptPath]
	c.cacheMu.RUnlock()

	if !exists {
		return nil, false
	}

	// 检查缓存是否过期
	if time.Since(info.CompileTime) >= c.maxAge {
		// ⭐ 关键修复：惰性删除过期缓存条目，防止 map 无限增长
		c.cacheMu.Lock()
		delete(c.scripts, scriptPath)
		c.cacheMu.Unlock()
		return nil, false
	}

	// 检查文件是否被修改
	fileInfo, err := os.Stat(scriptPath)
	if err != nil {
		// 文件不存在或无法访问，删除缓存
		c.cacheMu.Lock()
		delete(c.scripts, scriptPath)
		c.cacheMu.Unlock()
		return nil, false
	}

	// 如果文件修改时间比缓存时间新，说明文件已被修改
	if fileInfo.ModTime().After(info.ModTime) {
		// ⭐ 删除过时的缓存条目
		c.cacheMu.Lock()
		delete(c.scripts, scriptPath)
		c.cacheMu.Unlock()
		return nil, false
	}

	return info.Content, true
}

// CacheScript 缓存脚本信息
func (c *LuaScriptCache) CacheScript(scriptPath string, content []byte) {
	if !c.enabled {
		return
	}

	// 获取文件修改时间
	var modTime time.Time
	if fileInfo, err := os.Stat(scriptPath); err == nil {
		modTime = fileInfo.ModTime()
	}

	c.cacheMu.Lock()
	defer c.cacheMu.Unlock()

	if _, exists := c.scripts[scriptPath]; !exists && len(c.scripts) >= c.maxEntries {
		c.evictOldestEntriesLocked()
	}

	c.scripts[scriptPath] = &ScriptInfo{
		Hash:        c.GetScriptHash(content),
		Content:     content,
		CompileTime: time.Now(),
		ModTime:     modTime,
	}
}

func (c *LuaScriptCache) evictOldestEntriesLocked() {
	var oldestPath string
	var oldestTime time.Time

	for path, info := range c.scripts {
		if oldestTime.IsZero() || info.CompileTime.Before(oldestTime) {
			oldestPath = path
			oldestTime = info.CompileTime
		}
	}

	if oldestPath != "" {
		delete(c.scripts, oldestPath)
	}
}

func (c *LuaScriptCache) periodicCleanup() {
	defer c.cleanupWg.Done()
	ticker := time.NewTicker(30 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			c.cleanupExpired()
		case <-c.ctx.Done():
			return
		}
	}
}

func (c *LuaScriptCache) cleanupExpired() {
	c.cacheMu.Lock()
	defer c.cacheMu.Unlock()

	now := time.Now()
	for path, info := range c.scripts {
		if now.Sub(info.CompileTime) > c.maxAge {
			delete(c.scripts, path)
		}
	}
}

// Close 关闭缓存清理
func (c *LuaScriptCache) Close() {
	c.cancel()
	c.cleanupWg.Wait()
}

// LoadAndCompileScript 加载并编译Lua脚本（带缓存）
func (c *LuaScriptCache) LoadAndCompileScript(L *lua.LState, scriptPath string) (*lua.LFunction, error) {
	var content []byte

	if cachedContent, exists := c.GetCachedScript(scriptPath); exists {
		content = cachedContent
	} else {
		var err error
		content, err = readFileUTF8(scriptPath)
		if err != nil {
			return nil, fmt.Errorf("读取Lua脚本失败: %w", err)
		}
		c.CacheScript(scriptPath, content)
	}

	fn, err := L.LoadString(string(content))
	if err != nil {
		return nil, fmt.Errorf("编译Lua脚本失败: %w", err)
	}

	return fn, nil
}

// ClearCache 清空缓存
func (c *LuaScriptCache) ClearCache() {
	c.cacheMu.Lock()
	defer c.cacheMu.Unlock()

	c.scripts = make(map[string]*ScriptInfo)
}

// GetCacheStats 获取缓存统计信息
func (c *LuaScriptCache) GetCacheStats() map[string]interface{} {
	c.cacheMu.RLock()
	defer c.cacheMu.RUnlock()

	return map[string]interface{}{
		"enabled":    c.enabled,
		"cache_size": len(c.scripts),
		"cache_dir":  c.cacheDir,
		"max_age":    c.maxAge.String(),
	}
}

// PrecompileScripts 预编译指定目录下的所有Lua脚本
func (c *LuaScriptCache) PrecompileScripts(scriptsDir string) error {
	if !c.enabled {
		return nil
	}

	err := filepath.Walk(scriptsDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if !strings.HasSuffix(path, ".lua") {
			return nil
		}

		content, err := readFileUTF8(path)
		if err != nil {
			c.logger.Warnw("读取Lua脚本失败", "path", path, "error", err)
			return nil
		}

		c.CacheScript(path, content)
		return nil
	})

	if err != nil {
		return fmt.Errorf("遍历脚本目录失败: %w", err)
	}

	return nil
}