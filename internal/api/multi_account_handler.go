package api

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"HanChat-QQBotManager/internal/services"
	"HanChat-QQBotManager/internal/utils"
)

// MultiAccountHandler 多账号API路由处理器
// 处理 /api/{self_id}/{apiName} 格式的请求
type MultiAccountHandler struct {
	logger     *zap.SugaredLogger
	accountMgr *services.BotAccountManager
	reverseWS  *services.ReverseWebSocketService
}

// NewMultiAccountHandler 创建多账号API处理器
func NewMultiAccountHandler(baseLogger *zap.Logger, accountMgr *services.BotAccountManager, reverseWS *services.ReverseWebSocketService) *MultiAccountHandler {
	return &MultiAccountHandler{
		logger:     utils.NewModuleLogger(baseLogger, "api.multi_account"),
		accountMgr: accountMgr,
		reverseWS:  reverseWS,
	}
}

// HandleAPI 处理多账号API请求
// 路由格式: /api/bot/{self_id}/{apiName}
func (h *MultiAccountHandler) HandleAPI(c *gin.Context) {
	selfID := c.Param("self_id")
	apiName := c.Param("apiName")

	if selfID == "" || apiName == "" {
		utils.BadRequest(c, "缺少self_id或apiName参数")
		return
	}

	account, err := h.accountMgr.GetAccount(selfID)
	if err != nil {
		h.logger.Warnw("API请求失败：账号不存在",
			"self_id", selfID,
			"api_name", apiName)
		utils.NotFound(c, fmt.Sprintf("账号不存在: %s", selfID))
		return
	}

	if !account.IsOnline() {
		h.logger.Warnw("API请求失败：账号离线",
			"self_id", selfID,
			"api_name", apiName)
		c.JSON(http.StatusServiceUnavailable, utils.APIResponse{
			Status:    "failed",
			RetCode:   int(utils.CodeError),
			Message:   fmt.Sprintf("账号离线: %s", selfID),
			RequestID: c.GetString("requestId"),
		})
		return
	}

	var params map[string]interface{}
	if err := c.ShouldBindJSON(&params); err != nil {
		params = make(map[string]interface{})
	}

	h.logger.Infow("调用API",
		"self_id", selfID,
		"api_name", apiName,
		"params", params)

	apiName = strings.TrimPrefix(apiName, "/")

	h.logger.Infow("开始调用ReverseWebSocketService.CallBotAPIRaw",
		"self_id", selfID,
		"api_name", apiName)

	rawResp, err := h.reverseWS.CallBotAPIRaw(selfID, apiName, params)
	if err != nil {
		h.logger.Errorw("API调用失败",
			"self_id", selfID,
			"api_name", apiName,
			"error", err)
		utils.InternalError(c, err.Error())
		return
	}

	c.Data(http.StatusOK, "application/json", rawResp)
}

// GetAccountList 获取账号列表（包含插件目录中的离线账号）
func (h *MultiAccountHandler) GetAccountList(c *gin.Context) {
	accounts := h.accountMgr.GetAllAccounts()

	// 使用 map 来跟踪已添加的账号
	addedAccounts := make(map[string]bool)
	result := make([]map[string]interface{}, 0)

	// 1. 首先添加在线/内存中的账号
	for selfID, account := range accounts {
		addedAccounts[selfID] = true
		accountData := map[string]interface{}{
			"self_id":           selfID,
			"custom_name":       account.CustomName,
			"status":            account.Status,
			"created_at":        account.CreatedAt,
			"last_connected_at": account.LastConnectedAt,
			"last_activity_at":  account.LastActivityAt,
			"is_online":         account.IsOnline(),
		}

		// 添加登录信息
		if account.LoginInfo != nil {
			accountData["login_info"] = account.LoginInfo
		}

		// 添加版本信息
		if account.VersionInfo != nil {
			accountData["version_info"] = account.VersionInfo
		}

		// 添加状态信息
		if account.BotStatus != nil {
			accountData["bot_status"] = account.BotStatus
		}

		result = append(result, accountData)
	}

	// 2. 扫描插件目录，添加离线但插件存在的账号
	pluginsPath := "./plugins"
	entries, err := os.ReadDir(pluginsPath)
	if err == nil {
		for _, entry := range entries {
			// 排除非账号目录：template（模板）、blockly（Blockly工程）
			if entry.IsDir() && entry.Name() != "template" && entry.Name() != "blockly" {
				selfID := entry.Name()
				// 如果该账号还未添加（离线状态）
				if !addedAccounts[selfID] {
					// 检查该目录下是否有插件文件
					accountPluginPath := filepath.Join(pluginsPath, selfID)
					hasPlugins := h.checkHasPlugins(accountPluginPath)

					if hasPlugins {
						accountData := map[string]interface{}{
							"self_id":           selfID,
							"custom_name":       "",
							"status":            "offline",
							"created_at":        nil,
							"last_connected_at": nil,
							"is_online":         false,
						}
						result = append(result, accountData)
						addedAccounts[selfID] = true
					}
				}
			}
		}
	}

	utils.Success(c, result)
}

// checkHasPlugins 检查指定目录下是否有插件文件或文件夹
func (h *MultiAccountHandler) checkHasPlugins(path string) bool {
	entries, err := os.ReadDir(path)
	if err != nil {
		return false
	}
	// 只要有任何文件或文件夹，就认为有插件
	return len(entries) > 0
}

// GetAccountStatus 获取指定账号状态
func (h *MultiAccountHandler) GetAccountStatus(c *gin.Context) {
	selfID := c.Param("self_id")

	account, err := h.accountMgr.GetAccount(selfID)
	if err != nil {
		utils.NotFound(c, fmt.Sprintf("账号不存在: %s", selfID))
		return
	}

	utils.Success(c, map[string]interface{}{
		"self_id":           account.SelfID,
		"custom_name":       account.CustomName,
		"status":            account.Status,
		"created_at":        account.CreatedAt,
		"last_connected_at": account.LastConnectedAt,
		"last_activity_at":  account.LastActivityAt,
		"is_online":         account.IsOnline(),
	})
}

// RegisterRoutes 注册多账号API路由
func (h *MultiAccountHandler) RegisterRoutes(r *gin.RouterGroup) {
	// 账号管理路由
	r.GET("/accounts", h.GetAccountList)
	r.GET("/accounts/:self_id/status", h.GetAccountStatus)

	// API调用路由 /api/bot/{self_id}/{apiName}
	// 使用 /bot/ 前缀避免与固定路由冲突
	r.POST("/bot/:self_id/*apiName", h.HandleAPI)
	r.GET("/bot/:self_id/*apiName", h.HandleAPI)

	// 兼容旧版路由格式 /api/{self_id}/{apiName}
	r.POST("/:self_id/*apiName", h.HandleAPI)
	r.GET("/:self_id/*apiName", h.HandleAPI)
}
