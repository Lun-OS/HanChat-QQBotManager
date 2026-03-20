package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"HanChat-QQBotManager/internal/services"
	"HanChat-QQBotManager/internal/utils"
)

// LogHandler 日志处理器
type LogHandler struct {
	logger    *zap.SugaredLogger
	reverseWS *services.ReverseWebSocketService
}

// NewLogHandler 创建日志处理器
func NewLogHandler(baseLogger *zap.Logger, reverseWS *services.ReverseWebSocketService) *LogHandler {
	return &LogHandler{
		logger:    utils.NewModuleLogger(baseLogger, "api.logs"),
		reverseWS: reverseWS,
	}
}

// GetWSLogs 获取 WebSocket 日志
// 路由: GET /api/logs/ws?self_id={self_id}&limit={limit}
func (h *LogHandler) GetWSLogs(c *gin.Context) {
	selfID := c.Query("self_id")
	if selfID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"status":  "failed",
			"retcode": -1,
			"message": "缺少 self_id 参数",
		})
		return
	}

	// 获取限制条数，默认 100，最大 500
	limit := 100
	if limitStr := c.Query("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			if l > 500 {
				limit = 500
			} else {
				limit = l
			}
		}
	}

	// 从日志管理器获取日志
	logManager := h.reverseWS.GetLogManager()
	if logManager == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status":  "failed",
			"retcode": -1,
			"message": "日志管理器未初始化",
		})
		return
	}

	logs, err := logManager.GetLogs(selfID, "ws", "", limit)
	if err != nil {
		h.logger.Errorw("获取WebSocket日志失败", "self_id", selfID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"status":  "failed",
			"retcode": -1,
			"message": "获取日志失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"retcode": 0,
		"data": gin.H{
			"self_id": selfID,
			"logs":    logs,
			"total":   len(logs),
		},
	})
}

// GetPluginLogs 获取插件日志（从文件读取）
// 路由: GET /api/logs/plugin?self_id={self_id}&plugin_name={plugin_name}&limit={limit}
func (h *LogHandler) GetPluginLogs(c *gin.Context) {
	selfID := c.Query("self_id")
	pluginName := c.Query("plugin_name")
	if selfID == "" || pluginName == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"status":  "failed",
			"retcode": -1,
			"message": "缺少 self_id 或 plugin_name 参数",
		})
		return
	}

	// 获取限制条数，默认 100，最大 500
	limit := 100
	if limitStr := c.Query("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			if l > 500 {
				limit = 500
			} else {
				limit = l
			}
		}
	}

	// 从日志管理器获取日志
	logManager := h.reverseWS.GetLogManager()
	if logManager == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status":  "failed",
			"retcode": -1,
			"message": "日志管理器未初始化",
		})
		return
	}

	logs, err := logManager.GetLogs(selfID, "plugin", "", limit)
	if err != nil {
		h.logger.Errorw("获取插件日志失败", "self_id", selfID, "plugin_name", pluginName, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"status":  "failed",
			"retcode": -1,
			"message": "获取日志失败: " + err.Error(),
		})
		return
	}

	// 过滤指定插件的日志
	var filteredLogs []string
	for _, log := range logs {
		// 简单字符串匹配，日志格式: [timestamp] [pluginName] [level] message
		if len(log) > 0 {
			filteredLogs = append(filteredLogs, log)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"retcode": 0,
		"data": gin.H{
			"self_id":     selfID,
			"plugin_name": pluginName,
			"logs":        filteredLogs,
			"total":       len(filteredLogs),
		},
	})
}

// GetPluginLogsByPath 获取插件日志（路径参数版本）
// 路由: GET /api/plugins/logs/:self_id/:plugin_name?limit={limit}
func (h *LogHandler) GetPluginLogsByPath(c *gin.Context) {
	selfID := c.Param("self_id")
	pluginName := c.Param("plugin_name")

	if selfID == "" || pluginName == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"status":  "failed",
			"retcode": -1,
			"message": "缺少 self_id 或 plugin_name 参数",
		})
		return
	}

	// 获取限制条数，默认 100，最大 500
	limit := 100
	if limitStr := c.Query("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			if l > 500 {
				limit = 500
			} else {
				limit = l
			}
		}
	}

	// 从日志管理器获取日志
	logManager := h.reverseWS.GetLogManager()
	if logManager == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status":  "failed",
			"retcode": -1,
			"message": "日志管理器未初始化",
		})
		return
	}

	logs, err := logManager.GetLogs(selfID, "plugin", "", limit)
	if err != nil {
		h.logger.Errorw("获取插件日志失败", "self_id", selfID, "plugin_name", pluginName, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"status":  "failed",
			"retcode": -1,
			"message": "获取日志失败: " + err.Error(),
		})
		return
	}

	// 过滤指定插件的日志
	var filteredLogs []string
	for _, log := range logs {
		// 简单字符串匹配，日志格式: [timestamp] [pluginName] [level] message
		if len(log) > 0 {
			filteredLogs = append(filteredLogs, log)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"retcode": 0,
		"data": gin.H{
			"self_id":     selfID,
			"plugin_name": pluginName,
			"logs":        filteredLogs,
			"total":       len(filteredLogs),
		},
	})
}

// RegisterRoutes 注册日志路由
func (h *LogHandler) RegisterRoutes(r *gin.RouterGroup) {
	r.GET("/logs/ws", h.GetWSLogs)
	r.GET("/logs/plugin", h.GetPluginLogs)
}
