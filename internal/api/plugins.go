package api

import (
	"net/http"
	"strconv"

	"HanChat-QQBotManager/internal/plugins"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// RegisterPluginManageRoutes 注册插件管理API路由（需要认证）
func RegisterPluginManageRoutes(r *gin.RouterGroup, pm *plugins.Manager, base *zap.Logger) {
	logger := base.With(zap.String("module", "api.plugins")).Sugar()

	// 插件列表（从文件系统扫描）
	// 支持查询参数 self_id，如果提供则只返回该账号的插件
	r.GET("/list", func(c *gin.Context) {
		selfID := c.Query("self_id")
		plugins, err := pm.GetAllPlugins(selfID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "data": plugins})
	})

	// 加载插件
	r.POST("/load", func(c *gin.Context) {
		var body struct {
			SelfID string `json:"self_id"`
			Name   string `json:"name"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.Name == "" || body.SelfID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少 self_id 或 name"})
			return
		}

		logger.Infow("加载插件", "self_id", body.SelfID, "name", body.Name)
		if err := pm.Load(body.SelfID, body.Name); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
			return
		}

		// 手动加载插件时，添加到自启动配置
		if err := pm.AddPluginToAutoStart(body.SelfID, body.Name); err != nil {
			logger.Warnw("添加插件到自启动配置失败", "self_id", body.SelfID, "plugin", body.Name, "error", err)
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "message": "插件已加载"})
	})

	// 卸载插件
	r.POST("/unload", func(c *gin.Context) {
		var body struct {
			SelfID string `json:"self_id"`
			Name   string `json:"name"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.Name == "" || body.SelfID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少 self_id 或 name"})
			return
		}

		logger.Infow("卸载插件", "self_id", body.SelfID, "name", body.Name)
		if err := pm.Unload(body.SelfID, body.Name); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
			return
		}

		// 手动卸载插件时，从自启动配置移除
		if err := pm.RemovePluginFromAutoStart(body.SelfID, body.Name); err != nil {
			logger.Warnw("从自启动配置移除插件失败", "self_id", body.SelfID, "plugin", body.Name, "error", err)
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "message": "插件已卸载"})
	})

	// 获取插件运行状态
	r.GET("/status/:self_id/:name", func(c *gin.Context) {
		selfID := c.Param("self_id")
		name := c.Param("name")
		if selfID == "" || name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少 self_id 或 name"})
			return
		}

		status, err := pm.GetStatus(selfID, name)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": status})
	})

	// 获取所有运行中的插件
	r.GET("/running", func(c *gin.Context) {
		selfID := c.Query("self_id")
		if selfID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少 self_id 参数"})
			return
		}
		running := pm.GetRunningPlugins(selfID)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": running})
	})

	// 获取插件日志
	r.GET("/logs/:self_id/:name", func(c *gin.Context) {
		selfID := c.Param("self_id")
		name := c.Param("name")
		if selfID == "" || name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少 self_id 或 name"})
			return
		}

		limit := 0
		if limitStr := c.Query("limit"); limitStr != "" {
			if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
				limit = l
			}
		}

		logs, err := pm.GetLuaPluginLogs(selfID, name, limit)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "data": logs})
	})

	// 获取插件配置文件
	r.GET("/config/:self_id/:name", func(c *gin.Context) {
		selfID := c.Param("self_id")
		name := c.Param("name")
		if selfID == "" || name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少 self_id 或 name"})
			return
		}

		config, err := pm.GetPluginConfig(selfID, name)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "data": config})
	})

	// 保存插件配置文件
	r.POST("/config/:self_id/:name", func(c *gin.Context) {
		selfID := c.Param("self_id")
		name := c.Param("name")
		if selfID == "" || name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少 self_id 或 name"})
			return
		}

		var body struct {
			Config map[string]interface{} `json:"config"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "无效的请求体"})
			return
		}

		logger.Infow("保存插件配置", "self_id", selfID, "name", name)
		if err := pm.SavePluginConfig(selfID, name, body.Config); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "message": "配置已保存"})
	})

	// 删除插件配置文件
	r.DELETE("/config/:self_id/:name", func(c *gin.Context) {
		selfID := c.Param("self_id")
		name := c.Param("name")
		if selfID == "" || name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少 self_id 或 name"})
			return
		}

		logger.Infow("删除插件配置", "self_id", selfID, "name", name)
		if err := pm.DeletePluginConfig(selfID, name); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "message": "配置已删除"})
	})

	// 获取所有账号容器信息
	r.GET("/containers", func(c *gin.Context) {
		containers := pm.GetAccountContainers()
		c.JSON(http.StatusOK, gin.H{"success": true, "data": containers})
	})

	// 手动检查插件文件是否存在（刷新）
	r.POST("/check-files", func(c *gin.Context) {
		removedCount := pm.CheckPluginFilesExist()
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "插件文件检查完成",
			"data": gin.H{
				"removed_count": removedCount,
			},
		})
	})
}
