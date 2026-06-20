package api

import (
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"HanChat-QQBotManager/internal/plugins"
	"HanChat-QQBotManager/internal/utils"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// HTTPInterfaceManager HTTP接口管理器
var httpInterfaceManager *plugins.HTTPInterfaceManager

// SetHTTPInterfaceManager 设置HTTP接口管理器
func SetHTTPInterfaceManager(him *plugins.HTTPInterfaceManager) {
	httpInterfaceManager = him
}

// RegisterHTTPInterfaceRoutes 注册HTTP接口路由
func RegisterHTTPInterfaceRoutes(r *gin.Engine, base *zap.Logger) {
	logger := base.With(zap.String("module", "api.http_interface")).Sugar()

	// 全局接口路由 /plugins/:externalName
	// 使用通配符路由来同时支持 /plugins/xxx 和 /plugins/123/xxx
	r.Any("/plugins/*path", func(c *gin.Context) {
		path := c.Param("path")
		selfID, externalName := parsePluginPath(path)
		handleHTTPRequest(c, logger, externalName, selfID)
	})
}

// parsePluginPath 解析插件路径
// 支持格式: /plugins/xxx (全局接口) 或 /plugins/123/xxx (账号隔离接口)
// selfID格式: 纯数字且长度>=5（QQ号通常是5-11位数字）
func parsePluginPath(path string) (selfID string, externalName string) {
	// 移除前导斜杠
	path = strings.TrimPrefix(path, "/")

	// 分割路径
	parts := strings.SplitN(path, "/", 2)

	if len(parts) == 1 {
		// 只有接口名称，全局接口
		return "", parts[0]
	}

	// 检查第一部分是否是有效的selfID（纯数字且长度>=5）
	// QQ号通常是5-11位数字，这样可以避免接口名称以数字开头被误判
	if isValidSelfID(parts[0]) {
		// 是有效的selfID，认为是账号隔离接口 /plugins/{selfID}/{externalName}
		return parts[0], parts[1]
	}

	// 不是有效的selfID，认为是全局接口 /plugins/{externalName}
	// 路径中有斜杠，将第一部分也作为接口名称的一部分
	return "", path
}

// isValidSelfID 检查字符串是否是有效的selfID格式
// QQ号规则：纯数字，长度5-11位
func isValidSelfID(s string) bool {
	if len(s) < 5 || len(s) > 11 {
		return false
	}
	_, err := strconv.ParseUint(s, 10, 64)
	return err == nil
}

// handleHTTPRequest 处理HTTP请求
func handleHTTPRequest(c *gin.Context, logger *zap.SugaredLogger, externalName string, selfID string) {
	if httpInterfaceManager == nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "HTTP接口管理器未初始化",
		})
		return
	}

	handler, exists := httpInterfaceManager.GetHandler(externalName, selfID)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": fmt.Sprintf("接口不存在: %s", externalName),
		})
		return
	}

	method := c.Request.Method
	methodSupported := false
	for _, supportedMethod := range handler.Methods {
		if supportedMethod == method {
			methodSupported = true
			break
		}
	}

	if !methodSupported {
		c.JSON(http.StatusMethodNotAllowed, gin.H{
			"success": false,
			"message": fmt.Sprintf("不支持的请求方法: %s", method),
		})
		return
	}

	query := make(map[string]string)
	for k, v := range c.Request.URL.Query() {
		if len(v) > 0 {
			query[k] = v[0]
		}
	}

	headers := make(map[string]string)
	for k, v := range c.Request.Header {
		if len(v) > 0 {
			headers[k] = v[0]
		}
	}

	body := ""
	if c.Request.Body != nil {
		defer c.Request.Body.Close()
		bodyBytes, err := io.ReadAll(c.Request.Body)
		if err == nil {
			body = string(bodyBytes)
		}
	}

	requestCtx := &utils.HTTPRequestContext{
		Method:     method,
		Path:       externalName,
		Query:      query,
		Headers:    headers,
		Body:       body,
		RemoteAddr: c.ClientIP(),
		SelfID:     selfID,
	}

	response, err := httpInterfaceManager.HandleHTTPRequest(requestCtx)
	if err != nil {
		logger.Errorw("处理HTTP请求失败", "externalName", externalName, "selfID", selfID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	for k, v := range response.Headers {
		c.Header(k, v)
	}

	c.Status(response.StatusCode)
	c.String(response.StatusCode, response.Body)
}
