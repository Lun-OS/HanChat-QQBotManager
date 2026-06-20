package api

import (
	"fmt"
	"net/http"

	"HanChat-QQBotManager/internal/services"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

type PluginStoreHandler struct {
	logger  *zap.SugaredLogger
	service *services.PluginStoreService
}

func NewPluginStoreHandler(base *zap.Logger, service *services.PluginStoreService) *PluginStoreHandler {
	return &PluginStoreHandler{
		logger:  base.With(zap.String("module", "api.plugin_store")).Sugar(),
		service: service,
	}
}

func (h *PluginStoreHandler) RegisterRoutes(r *gin.RouterGroup) {
	store := r.Group("/plugin-store")
	{
		store.GET("/config", h.GetConfig)
		store.POST("/install", h.InstallPlugin)
		store.GET("/status", h.GetStatus)
		store.GET("/status/:name", h.GetPluginStatus)
		store.POST("/cache/clean", h.CleanCache)
		store.GET("/cache/info", h.GetCacheInfo)
		store.GET("/installed", h.GetInstalledPlugins)
		store.POST("/uninstall", h.UninstallPlugin)
	}
}

func (h *PluginStoreHandler) GetConfig(c *gin.Context) {
	luaURL, blocklyURL, blocklyConfigURL := h.service.GetIndexURLs()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"index_lua_url":          luaURL,
			"index_blockly_url":      blocklyURL,
			"index_blockly_config_url": blocklyConfigURL,
		},
	})
}

func (h *PluginStoreHandler) InstallPlugin(c *gin.Context) {
	var req struct {
		Type       string `json:"type"`
		Name       string `json:"name"`
		Version    string `json:"version"`
		IndexURL   string `json:"index_url"`
		SHA256Hash string `json:"sha256_hash"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "无效的请求参数",
		})
		return
	}

	if req.Type != "lua" && req.Type != "blockly" && req.Type != "blockly_config" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "无效的插件类型，仅支持 lua、blockly 或 blockly_config",
		})
		return
	}

	if req.Name == "" || req.IndexURL == "" || req.SHA256Hash == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "缺少必要参数(name, index_url, sha256_hash)",
		})
		return
	}

	entry := services.PluginEntry{
		Name:       req.Name,
		Version:    req.Version,
		IndexURL:   req.IndexURL,
		SHA256Hash: req.SHA256Hash,
	}

	go func() {
		if err := h.service.InstallPlugin(req.Type, entry); err != nil {
			h.logger.Errorw("插件安装失败", "type", req.Type, "name", req.Name, "error", err)
		}
	}()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "插件安装已开始",
		"data": gin.H{
			"type": req.Type,
			"name": req.Name,
		},
	})
}

func (h *PluginStoreHandler) GetStatus(c *gin.Context) {
	statuses := h.service.GetAllInstallStatus()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    statuses,
	})
}

func (h *PluginStoreHandler) GetPluginStatus(c *gin.Context) {
	name := c.Param("name")
	status := h.service.GetInstallStatus(name)
	if status == nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": fmt.Sprintf("未找到插件 %s 的安装状态", name),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    status,
	})
}

func (h *PluginStoreHandler) CleanCache(c *gin.Context) {
	if err := h.service.CleanCache(); err != nil {
		h.logger.Errorw("清理缓存失败", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": fmt.Sprintf("清理缓存失败: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "缓存清理完成",
	})
}

func (h *PluginStoreHandler) GetCacheInfo(c *gin.Context) {
	count, size, err := h.service.GetCacheInfo()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": fmt.Sprintf("获取缓存信息失败: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"file_count": count,
			"total_size": size,
			"cache_dir":  "cache/download",
		},
	})
}

func (h *PluginStoreHandler) GetInstalledPlugins(c *gin.Context) {
	plugins, err := h.service.GetInstalledPlugins()
	if err != nil {
		h.logger.Errorw("获取已安装插件列表失败", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": fmt.Sprintf("获取已安装插件列表失败: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    plugins,
	})
}

func (h *PluginStoreHandler) UninstallPlugin(c *gin.Context) {
	var req struct {
		Type string `json:"type"`
		Name string `json:"name"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "无效的请求参数",
		})
		return
	}

	if req.Type == "" || req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "缺少必要参数(type, name)",
		})
		return
	}

	if err := h.service.UninstallPlugin(req.Type, req.Name); err != nil {
		h.logger.Errorw("卸载插件失败", "type", req.Type, "name", req.Name, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": fmt.Sprintf("卸载插件失败: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "插件已卸载",
	})
}
