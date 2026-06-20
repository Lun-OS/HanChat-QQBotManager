package api

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

const (
	maxConfigFileSize  = 10 * 1024 * 1024
	maxConfigFiles     = 50
	maxBlocksPerFile   = 1000
	requiredBlockField = "type"
)

type BlocklyConfigHandler struct {
	logger    *zap.SugaredLogger
	configDir string
}

func NewBlocklyConfigHandler(base *zap.Logger) *BlocklyConfigHandler {
	return &BlocklyConfigHandler{
		logger:    base.With(zap.String("module", "api.blockly_config")).Sugar(),
		configDir: filepath.Join(".", "plugins", "blockly", ".config"),
	}
}

func (h *BlocklyConfigHandler) RegisterRoutes(r *gin.RouterGroup) {
	r.GET("/blockly/config", h.GetBlockConfig)
}

type blocklyFileConfig struct {
	Blocks     []map[string]interface{} `json:"blocks"`
	Toolbox    map[string]interface{}   `json:"toolbox"`
	ColorHue   map[string]interface{}   `json:"colorHue"`
	InputTypes map[string]interface{}   `json:"inputTypes"`
}

func validateBlock(block map[string]interface{}) bool {
	blockType, ok := block[requiredBlockField]
	if !ok {
		return false
	}
	_, ok = blockType.(string)
	return ok
}

func sanitizeBlock(block map[string]interface{}) map[string]interface{} {
	sanitized := make(map[string]interface{}, len(block))
	for k, v := range block {
		if strings.HasPrefix(k, "__") {
			continue
		}
		sanitized[k] = v
	}
	return sanitized
}

func (h *BlocklyConfigHandler) GetBlockConfig(c *gin.Context) {
	absConfigDir, err := filepath.Abs(h.configDir)
	if err != nil {
		h.logger.Errorw("解析配置目录路径失败", "dir", h.configDir, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "配置目录路径无效"})
		return
	}

	if _, err := os.Stat(absConfigDir); os.IsNotExist(err) {
		h.logger.Warnw("Blockly配置目录不存在", "dir", absConfigDir)
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"blocks":     []interface{}{},
				"toolbox":    gin.H{},
				"colorHue":   gin.H{},
				"inputTypes": gin.H{},
			},
		})
		return
	}

	entries, err := os.ReadDir(absConfigDir)
	if err != nil {
		h.logger.Errorw("读取Blockly配置目录失败", "dir", absConfigDir, "error", err)
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"blocks":     []interface{}{},
				"toolbox":    gin.H{},
				"colorHue":   gin.H{},
				"inputTypes": gin.H{},
			},
		})
		return
	}

	var jsonFiles []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}
		if strings.HasSuffix(strings.ToLower(name), ".json") {
			jsonFiles = append(jsonFiles, name)
			if len(jsonFiles) >= maxConfigFiles {
				h.logger.Warnw("配置文件数量超过限制，截断处理", "limit", maxConfigFiles)
				break
			}
		}
	}

	sort.Slice(jsonFiles, func(i, j int) bool {
		if jsonFiles[i] == "standard_blocks.json" {
			return true
		}
		if jsonFiles[j] == "standard_blocks.json" {
			return false
		}
		return jsonFiles[i] < jsonFiles[j]
	})

	mergedBlocks := make(map[string]map[string]interface{})
	var orderedTypes []string
	mergedToolbox := make(map[string]interface{})
	mergedColorHue := make(map[string]interface{})
	mergedInputTypes := make(map[string]interface{})
	totalBlocks := 0

	for _, filename := range jsonFiles {
		filePath := filepath.Join(absConfigDir, filename)

		absFilePath, err := filepath.Abs(filePath)
		if err != nil || !strings.HasPrefix(absFilePath, absConfigDir) {
			h.logger.Warnw("配置文件路径不合法，跳过", "file", filename)
			continue
		}

		fileInfo, err := os.Stat(filePath)
		if err != nil {
			h.logger.Warnw("获取配置文件信息失败", "file", filename, "error", err)
			continue
		}

		if fileInfo.Size() > int64(maxConfigFileSize) {
			h.logger.Warnw("配置文件过大，跳过", "file", filename, "size", fileInfo.Size(), "limit", maxConfigFileSize)
			continue
		}

		data, err := os.ReadFile(filePath)
		if err != nil {
			h.logger.Warnw("读取Blockly配置文件失败", "file", filename, "error", err)
			continue
		}

		var cfg blocklyFileConfig
		if err := json.Unmarshal(data, &cfg); err != nil {
			h.logger.Warnw("解析Blockly配置文件JSON失败", "file", filename, "error", err)
			continue
		}

		if len(cfg.Blocks) > maxBlocksPerFile {
			h.logger.Warnw("单文件积木数量超过限制，截断处理", "file", filename, "count", len(cfg.Blocks), "limit", maxBlocksPerFile)
			cfg.Blocks = cfg.Blocks[:maxBlocksPerFile]
		}

		validCount := 0
		for _, block := range cfg.Blocks {
			if !validateBlock(block) {
				continue
			}
			block = sanitizeBlock(block)
			blockType := block[requiredBlockField].(string)
			if _, exists := mergedBlocks[blockType]; !exists {
				orderedTypes = append(orderedTypes, blockType)
			}
			mergedBlocks[blockType] = block
			validCount++
		}
		totalBlocks += validCount

		for k, v := range cfg.Toolbox {
			mergedToolbox[k] = v
		}
		for k, v := range cfg.ColorHue {
			mergedColorHue[k] = v
		}
		for k, v := range cfg.InputTypes {
			mergedInputTypes[k] = v
		}
	}

	h.logger.Infow("Blockly配置加载完成", "files", len(jsonFiles), "total_blocks", totalBlocks)

	blocks := make([]map[string]interface{}, 0, len(orderedTypes))
	for _, t := range orderedTypes {
		blocks = append(blocks, mergedBlocks[t])
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"blocks":     blocks,
			"toolbox":    mergedToolbox,
			"colorHue":   mergedColorHue,
			"inputTypes": mergedInputTypes,
		},
	})
}
