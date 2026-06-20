package api

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"HanChat-QQBotManager/internal/models"
	"HanChat-QQBotManager/internal/services/proxy"
	"HanChat-QQBotManager/internal/utils"
)

// AdminAuthMiddleware 管理员认证中间件
func AdminAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.GetHeader("Authorization")
		if token == "" {
			token = c.Query("token")
		}

		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"message": "缺少管理员认证token",
			})
			c.Abort()
			return
		}

		if len(token) < 10 {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"message": "无效的认证token",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// ProxyAdminHandler 代理管理API处理器
type ProxyAdminHandler struct {
	manager *proxy.ProxyManager
	logger  *zap.SugaredLogger
}

// NewProxyAdminHandler 创建代理管理API处理器
func NewProxyAdminHandler(manager *proxy.ProxyManager, logger *zap.Logger) *ProxyAdminHandler {
	return &ProxyAdminHandler{
		manager: manager,
		logger:  logger.Sugar().Named("proxy_admin"),
	}
}

// RegisterRoutes 注册路由
func (h *ProxyAdminHandler) RegisterRoutes(r *gin.RouterGroup) {
	admin := r.Group("/admin/proxy")
	admin.Use(AdminAuthMiddleware())
	{
		admin.GET("/config", h.GetConfig)
		admin.PUT("/config", h.UpdateConfig)
		admin.POST("/reload", h.ReloadAll)

		admin.GET("/adapters", h.GetAllAdapters)
		admin.GET("/adapters/:name", h.GetAdapter)
		admin.POST("/adapters", h.AddAdapter)
		admin.PUT("/adapters/:name", h.UpdateAdapter)
		admin.DELETE("/adapters/:name", h.RemoveAdapter)
	admin.POST("/adapters/:name/enable", h.EnableAdapter)
	admin.POST("/adapters/:name/disable", h.DisableAdapter)
}
}

// GetConfig 获取配置
func (h *ProxyAdminHandler) GetConfig(c *gin.Context) {
	config, err := h.manager.LoadConfig()
	if err != nil {
		h.logger.Errorw("获取配置失败", "error", err)
		utils.InternalError(c, "获取配置失败: "+err.Error())
		return
	}
	if config == nil {
		config = &models.ProxyConfig{}
	}
	c.JSON(http.StatusOK, utils.APIResponse{
		Status:    "ok",
		RetCode:   int(utils.CodeSuccess),
		Data:      config,
		RequestID: c.GetString("requestId"),
	})
}

// UpdateConfig 更新配置
func (h *ProxyAdminHandler) UpdateConfig(c *gin.Context) {
	var config models.ProxyConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		utils.BadRequest(c, "无效的配置格式: "+err.Error())
		return
	}

	// 实际保存配置
	if err := h.manager.SaveConfig(); err != nil {
		h.logger.Errorw("保存配置失败", "error", err)
		utils.InternalError(c, "保存配置失败: "+err.Error())
		return
	}

	c.JSON(http.StatusOK, utils.APIResponse{
		Status:    "ok",
		RetCode:   int(utils.CodeSuccess),
		Message:   "配置已更新（请使用 /admin/proxy/reload 接口重载以应用更改）",
		RequestID: c.GetString("requestId"),
	})
}

// ReloadAll 重载所有适配器
func (h *ProxyAdminHandler) ReloadAll(c *gin.Context) {
	if err := h.manager.ReloadAll(); err != nil {
		h.logger.Errorw("重载失败", "error", err)
		utils.InternalError(c, "重载适配器失败: "+err.Error())
		return
	}

	c.JSON(http.StatusOK, utils.APIResponse{
		Status:    "ok",
		RetCode:   int(utils.CodeSuccess),
		Message:   "所有适配器已重载",
		RequestID: c.GetString("requestId"),
	})
}

// GetAllAdapters 获取所有适配器
func (h *ProxyAdminHandler) GetAllAdapters(c *gin.Context) {
	statuses := h.manager.GetAllStatuses()

	c.JSON(http.StatusOK, utils.APIResponse{
		Status:    "ok",
		RetCode:   int(utils.CodeSuccess),
		Data:      statuses,
		RequestID: c.GetString("requestId"),
	})
}

// GetAdapter 获取单个适配器
func (h *ProxyAdminHandler) GetAdapter(c *gin.Context) {
	name := c.Param("name")

	adapter, err := h.manager.GetAdapter(name)
	if err != nil {
		utils.NotFound(c, "适配器不存在: "+name)
		return
	}

	c.JSON(http.StatusOK, utils.APIResponse{
		Status:    "ok",
		RetCode:   int(utils.CodeSuccess),
		Data:      adapter.Status(),
		RequestID: c.GetString("requestId"),
	})
}

// AddAdapter 新增适配器
func (h *ProxyAdminHandler) AddAdapter(c *gin.Context) {
	var req models.AddAdapterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "无效的请求格式: "+err.Error())
		return
	}

	adapterType := models.AdapterType(req.Type)
	switch adapterType {
	case models.AdapterTypeWSClient:
		configData, _ := json.Marshal(req.Config)
		var config models.WSClientConfig
		json.Unmarshal(configData, &config)
		if err := h.manager.AddAdapter(adapterType, config); err != nil {
			utils.BadRequest(c, "添加 WS 客户端适配器失败: "+err.Error())
			return
		}
	case models.AdapterTypeWSServer:
		configData, _ := json.Marshal(req.Config)
		var config models.WSServerConfig
		json.Unmarshal(configData, &config)
		if err := h.manager.AddAdapter(adapterType, config); err != nil {
			utils.BadRequest(c, "添加 WS 服务端适配器失败: "+err.Error())
			return
		}
	case models.AdapterTypeHTTPServer:
		configData, _ := json.Marshal(req.Config)
		var config models.HTTPServerConfig
		json.Unmarshal(configData, &config)
		if err := h.manager.AddAdapter(adapterType, config); err != nil {
			utils.BadRequest(c, "添加 HTTP 服务端适配器失败: "+err.Error())
			return
		}
	case models.AdapterTypeHTTPClient:
		configData, _ := json.Marshal(req.Config)
		var config models.HTTPClientConfig
		json.Unmarshal(configData, &config)
		if err := h.manager.AddAdapter(adapterType, config); err != nil {
			utils.BadRequest(c, "添加 HTTP 客户端适配器失败: "+err.Error())
			return
		}
	default:
		utils.BadRequest(c, "不支持的适配器类型: "+req.Type)
		return
	}

	c.JSON(http.StatusCreated, utils.APIResponse{
		Status:    "ok",
		RetCode:   int(utils.CodeSuccess),
		Message:   "适配器已创建并启动",
		RequestID: c.GetString("requestId"),
	})
}

// UpdateAdapter 更新适配器
func (h *ProxyAdminHandler) UpdateAdapter(c *gin.Context) {
	name := c.Param("name")

	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		utils.BadRequest(c, "无效的请求格式: "+err.Error())
		return
	}

	adapter, err := h.manager.GetAdapter(name)
	if err != nil {
		utils.NotFound(c, "适配器不存在: "+name)
		return
	}

	configData, _ := json.Marshal(body)

	switch adapter.Type() {
	case models.AdapterTypeWSClient:
		var config models.WSClientConfig
		json.Unmarshal(configData, &config)
		config.Name = name
		if err := h.manager.UpdateAdapter(name, config); err != nil {
			utils.BadRequest(c, "更新 WS 客户端适配器失败: "+err.Error())
			return
		}
	case models.AdapterTypeWSServer:
		var config models.WSServerConfig
		json.Unmarshal(configData, &config)
		config.Name = name
		if err := h.manager.UpdateAdapter(name, config); err != nil {
			utils.BadRequest(c, "更新 WS 服务端适配器失败: "+err.Error())
			return
		}
	case models.AdapterTypeHTTPServer:
		var config models.HTTPServerConfig
		json.Unmarshal(configData, &config)
		config.Name = name
		if err := h.manager.UpdateAdapter(name, config); err != nil {
			utils.BadRequest(c, "更新 HTTP 服务端适配器失败: "+err.Error())
			return
		}
	case models.AdapterTypeHTTPClient:
		var config models.HTTPClientConfig
		json.Unmarshal(configData, &config)
		config.Name = name
		if err := h.manager.UpdateAdapter(name, config); err != nil {
			utils.BadRequest(c, "更新 HTTP 客户端适配器失败: "+err.Error())
			return
		}
	default:
		utils.BadRequest(c, "不支持的适配器类型")
		return
	}

	c.JSON(http.StatusOK, utils.APIResponse{
		Status:    "ok",
		RetCode:   int(utils.CodeSuccess),
		Message:   "适配器配置已更新",
		RequestID: c.GetString("requestId"),
	})
}

// RemoveAdapter 删除适配器
func (h *ProxyAdminHandler) RemoveAdapter(c *gin.Context) {
	name := c.Param("name")

	if err := h.manager.RemoveAdapter(name); err != nil {
		utils.BadRequest(c, "删除适配器失败: "+err.Error())
		return
	}

	c.JSON(http.StatusOK, utils.APIResponse{
		Status:    "ok",
		RetCode:   int(utils.CodeSuccess),
		Message:   "适配器已删除",
		RequestID: c.GetString("requestId"),
	})
}

// EnableAdapter 启用适配器
func (h *ProxyAdminHandler) EnableAdapter(c *gin.Context) {
	name := c.Param("name")

	if err := h.manager.EnableAdapter(name); err != nil {
		utils.BadRequest(c, "启用适配器失败: "+err.Error())
		return
	}

	c.JSON(http.StatusOK, utils.APIResponse{
		Status:    "ok",
		RetCode:   int(utils.CodeSuccess),
		Message:   "适配器已启用",
		RequestID: c.GetString("requestId"),
	})
}

// DisableAdapter 禁用适配器
func (h *ProxyAdminHandler) DisableAdapter(c *gin.Context) {
	name := c.Param("name")

	if err := h.manager.DisableAdapter(name); err != nil {
		utils.BadRequest(c, "禁用适配器失败: "+err.Error())
		return
	}

	c.JSON(http.StatusOK, utils.APIResponse{
		Status:    "ok",
		RetCode:   int(utils.CodeSuccess),
		Message:   "适配器已禁用",
		RequestID: c.GetString("requestId"),
	})
}
