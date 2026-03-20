package api

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"HanChat-QQBotManager/internal/services"
)

// FileNode 文件节点结构
type FileNode struct {
	Name         string     `json:"name"`
	Path         string     `json:"path"`
	IsDirectory  bool       `json:"isDirectory"`
	Size         int64      `json:"size,omitempty"`
	ModifiedTime string     `json:"modifiedTime,omitempty"`
	Children     []FileNode `json:"children,omitempty"`
}

// AccountInfo 账号信息
type AccountInfo struct {
	SelfID   string `json:"self_id"`
	Nickname string `json:"nickname"`
	Online   bool   `json:"online"`
}

// PluginManagerHandler 插件管理处理器
type PluginManagerHandler struct {
	logger       *zap.SugaredLogger
	basePath     string
	accountMgr   *services.BotAccountManager
}

// NewPluginManagerHandler 创建插件管理处理器
func NewPluginManagerHandler(base *zap.Logger, accountMgr *services.BotAccountManager) *PluginManagerHandler {
	return &PluginManagerHandler{
		logger:     base.With(zap.String("module", "api.plugin_manager")).Sugar(),
		basePath:   "./plugins",
		accountMgr: accountMgr,
	}
}

// RegisterRoutes 注册插件管理路由
func (h *PluginManagerHandler) RegisterRoutes(r *gin.RouterGroup) {
	// 获取可用账号列表
	r.GET("/plugin-manager/accounts", h.GetAvailableAccounts)

	// 获取模板文件列表
	r.GET("/plugin-manager/template-files", h.GetTemplateFiles)

	// 获取指定账号的插件文件列表
	r.GET("/plugin-manager/plugin-files/:selfId", h.GetPluginFiles)

	// 读取文件内容
	r.GET("/plugin-manager/file", h.ReadFile)

	// 写入文件内容
	r.POST("/plugin-manager/file", h.WriteFile)

	// 创建文件或文件夹
	r.POST("/plugin-manager/create", h.CreateFile)

	// 删除文件或文件夹
	r.DELETE("/plugin-manager/file", h.DeleteFile)

	// 复制文件或文件夹
	r.POST("/plugin-manager/copy", h.CopyFile)

	// 移动文件或文件夹
	r.POST("/plugin-manager/move", h.MoveFile)

	// 重命名文件或文件夹
	r.POST("/plugin-manager/rename", h.RenameFile)

	// Blockly 状态接口
	r.GET("/blockly/get_status", h.GetBlocklyStatus)
}

// GetAvailableAccounts 获取可用账号列表（包含昵称和在线状态）
func (h *PluginManagerHandler) GetAvailableAccounts(c *gin.Context) {
	accounts := []AccountInfo{}
	
	// 读取plugins目录下的所有子目录（排除template）
	entries, err := os.ReadDir(h.basePath)
	if err != nil {
		// 如果目录不存在，返回空列表
		c.JSON(http.StatusOK, gin.H{"success": true, "data": accounts})
		return
	}
	
	for _, entry := range entries {
		// 排除 template 和 blockly 目录
		if entry.IsDir() && entry.Name() != "template" && entry.Name() != "blockly" {
			selfID := entry.Name()
			info := AccountInfo{
				SelfID:   selfID,
				Nickname: "",
				Online:   false,
			}
			
			// 如果账号管理器存在，获取账号信息
			if h.accountMgr != nil {
				if account, err := h.accountMgr.GetAccount(selfID); err == nil {
					info.Online = account.IsOnline()
					if account.LoginInfo != nil {
						info.Nickname = account.LoginInfo.Nickname
					}
				}
			}
			
			accounts = append(accounts, info)
		}
	}
	
	c.JSON(http.StatusOK, gin.H{"success": true, "data": accounts})
}

// GetTemplateFiles 获取模板文件列表
func (h *PluginManagerHandler) GetTemplateFiles(c *gin.Context) {
	templatePath := filepath.Join(h.basePath, "template")
	
	nodes, err := h.scanDirectory(templatePath, "/plugins/template")
	if err != nil {
		h.logger.Errorw("扫描模板目录失败", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "扫描模板目录失败"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"success": true, "data": nodes})
}

// GetPluginFiles 获取指定账号的插件文件列表
func (h *PluginManagerHandler) GetPluginFiles(c *gin.Context) {
	selfId := c.Param("selfId")
	if selfId == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少账号ID"})
		return
	}
	
	pluginPath := filepath.Join(h.basePath, selfId)
	
	// 如果目录不存在，创建它
	if _, err := os.Stat(pluginPath); os.IsNotExist(err) {
		if err := os.MkdirAll(pluginPath, 0755); err != nil {
			h.logger.Errorw("创建插件目录失败", "error", err, "selfId", selfId)
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "创建插件目录失败"})
			return
		}
	}
	
	nodes, err := h.scanDirectory(pluginPath, fmt.Sprintf("/plugins/%s", selfId))
	if err != nil {
		h.logger.Errorw("扫描插件目录失败", "error", err, "selfId", selfId)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "扫描插件目录失败"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"success": true, "data": nodes})
}

// scanDirectory 递归扫描目录
func (h *PluginManagerHandler) scanDirectory(dirPath string, virtualPath string) ([]FileNode, error) {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return nil, err
	}
	
	nodes := []FileNode{}
	
	for _, entry := range entries {
		// 排除blockly文件夹
		if entry.Name() == "blockly" && entry.IsDir() {
			continue
		}
		
		info, err := entry.Info()
		if err != nil {
			continue
		}
		
		node := FileNode{
			Name:         entry.Name(),
			Path:         filepath.Join(virtualPath, entry.Name()),
			IsDirectory:  entry.IsDir(),
			Size:         info.Size(),
			ModifiedTime: info.ModTime().Format("2006-01-02 15:04:05"),
		}
		
		// 统一使用正斜杠
		node.Path = strings.ReplaceAll(node.Path, "\\", "/")
		
		if entry.IsDir() {
			children, err := h.scanDirectory(filepath.Join(dirPath, entry.Name()), node.Path)
			if err == nil {
				node.Children = children
			}
		}
		
		nodes = append(nodes, node)
	}
	
	return nodes, nil
}

// ReadFile 读取文件内容
func (h *PluginManagerHandler) ReadFile(c *gin.Context) {
	path := c.Query("path")
	if path == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少文件路径"})
		return
	}
	
	// 安全检查：确保路径在允许的范围内
	if !h.isPathAllowed(path) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无权访问该路径"})
		return
	}
	
	realPath := h.toRealPath(path)
	if realPath == "" {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无效的文件路径"})
		return
	}

	// 检查是否是文件
	info, err := os.Stat(realPath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "文件不存在"})
		return
	}
	
	if info.IsDir() {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "无法读取目录内容"})
		return
	}
	
	// 读取文件内容
	content, err := os.ReadFile(realPath)
	if err != nil {
		h.logger.Errorw("读取文件失败", "error", err, "path", path)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "读取文件失败"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"content": string(content),
		},
	})
}

// WriteFile 写入文件内容
func (h *PluginManagerHandler) WriteFile(c *gin.Context) {
	var req struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	}
	
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "无效的请求参数"})
		return
	}
	
	// 安全检查：确保路径可写
	if !h.isPathWritable(req.Path) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "该路径为只读，无法写入"})
		return
	}
	
	realPath := h.toRealPath(req.Path)
	if realPath == "" {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无效的文件路径"})
		return
	}

	// 确保父目录存在
	parentDir := filepath.Dir(realPath)
	if err := os.MkdirAll(parentDir, 0755); err != nil {
		h.logger.Errorw("创建父目录失败", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "创建目录失败"})
		return
	}
	
	// 写入文件
	if err := os.WriteFile(realPath, []byte(req.Content), 0644); err != nil {
		h.logger.Errorw("写入文件失败", "error", err, "path", req.Path)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "写入文件失败"})
		return
	}
	
	h.logger.Infow("文件已写入", "path", req.Path)
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "文件保存成功"})
}

// CreateFile 创建文件或文件夹
func (h *PluginManagerHandler) CreateFile(c *gin.Context) {
	var req struct {
		ParentPath string `json:"parentPath"`
		Name       string `json:"name"`
		Type       string `json:"type"` // "file" 或 "folder"
	}
	
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "无效的请求参数"})
		return
	}
	
	// 安全检查 - 使用 canCreateInPath 允许在 /plugins 下创建 blockly 目录
	if !h.canCreateInPath(req.ParentPath, req.Name) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "该路径为只读，无法创建"})
		return
	}
	
	realParentPath := h.toRealPath(req.ParentPath)
	if realParentPath == "" {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无效的父目录路径"})
		return
	}

	// 验证文件名，防止路径遍历
	if strings.Contains(req.Name, "..") || strings.Contains(req.Name, "/") || strings.Contains(req.Name, "\\") {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "文件名包含非法字符"})
		return
	}

	realPath := filepath.Join(realParentPath, req.Name)

	// 最终安全检查：确保构建的路径仍在允许的范围内
	if !strings.HasPrefix(realPath, realParentPath) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无效的文件路径"})
		return
	}

	// 检查是否已存在
	if _, err := os.Stat(realPath); err == nil {
		c.JSON(http.StatusConflict, gin.H{"success": false, "message": "文件或文件夹已存在"})
		return
	}
	
	if req.Type == "folder" {
		if err := os.MkdirAll(realPath, 0755); err != nil {
			h.logger.Errorw("创建文件夹失败", "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "创建文件夹失败"})
			return
		}
	} else {
		// 创建空文件
		file, err := os.Create(realPath)
		if err != nil {
			h.logger.Errorw("创建文件失败", "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "创建文件失败"})
			return
		}
		file.Close()
	}
	
	h.logger.Infow("创建成功", "type", req.Type, "path", realPath)
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "创建成功"})
}

// DeleteFile 删除文件或文件夹
func (h *PluginManagerHandler) DeleteFile(c *gin.Context) {
	path := c.Query("path")
	if path == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少文件路径"})
		return
	}
	
	// 安全检查
	if !h.isPathWritable(path) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "该路径为只读，无法删除"})
		return
	}
	
	realPath := h.toRealPath(path)
	if realPath == "" {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无效的文件路径"})
		return
	}

	// 检查是否存在
	if _, err := os.Stat(realPath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "文件或文件夹不存在"})
		return
	}

	// 删除
	if err := os.RemoveAll(realPath); err != nil {
		h.logger.Errorw("删除失败", "error", err, "path", path)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "删除失败"})
		return
	}

	h.logger.Infow("删除成功", "path", path)
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "删除成功"})
}

// CopyFile 复制文件或文件夹
func (h *PluginManagerHandler) CopyFile(c *gin.Context) {
	var req struct {
		SourcePath      string `json:"sourcePath"`
		TargetPath      string `json:"targetPath"`
		Overwrite       bool   `json:"overwrite,omitempty"`
	}
	
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "无效的请求参数"})
		return
	}
	
	// 安全检查：目标路径必须可写
	if !h.isPathWritable(req.TargetPath) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "目标路径为只读，无法复制"})
		return
	}
	
	realSourcePath := h.toRealPath(req.SourcePath)
	realTargetPath := h.toRealPath(req.TargetPath)

	// 检查路径是否有效
	if realSourcePath == "" || realTargetPath == "" {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无效的文件路径"})
		return
	}

	// 获取源文件/文件夹信息
	sourceInfo, err := os.Stat(realSourcePath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "源文件不存在"})
		return
	}
	
	// 构建最终目标路径
	finalTargetPath := filepath.Join(realTargetPath, filepath.Base(realSourcePath))
	
	// 检查目标是否已存在
	if _, err := os.Stat(finalTargetPath); err == nil {
		// 目标已存在
		if !req.Overwrite {
			// 未指定覆盖，返回冲突错误
			c.JSON(http.StatusConflict, gin.H{
				"success": false,
				"code":    "TARGET_EXISTS",
				"message": "目标位置已存在同名文件或文件夹",
				"data": map[string]string{
					"targetName": filepath.Base(finalTargetPath),
				},
			})
			return
		}
		// 指定了覆盖，先删除目标
		if err := os.RemoveAll(finalTargetPath); err != nil {
			h.logger.Errorw("删除已存在的目标失败", "error", err, "path", finalTargetPath)
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "无法覆盖目标文件"})
			return
		}
	}
	
	// 执行复制
	if sourceInfo.IsDir() {
		err = h.copyDir(realSourcePath, finalTargetPath)
	} else {
		err = h.copyFile(realSourcePath, finalTargetPath)
	}
	
	if err != nil {
		h.logger.Errorw("复制失败", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "复制失败"})
		return
	}
	
	h.logger.Infow("复制成功", "from", req.SourcePath, "to", req.TargetPath, "overwrite", req.Overwrite)
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "复制成功"})
}

// MoveFile 移动文件或文件夹
func (h *PluginManagerHandler) MoveFile(c *gin.Context) {
	var req struct {
		SourcePath string `json:"sourcePath"`
		TargetPath string `json:"targetPath"`
	}
	
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "无效的请求参数"})
		return
	}
	
	// 安全检查：源和目标都必须可写
	if !h.isPathWritable(req.SourcePath) || !h.isPathWritable(req.TargetPath) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "路径为只读，无法移动"})
		return
	}
	
	realSourcePath := h.toRealPath(req.SourcePath)
	realTargetPath := h.toRealPath(req.TargetPath)

	// 检查路径是否有效
	if realSourcePath == "" || realTargetPath == "" {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无效的文件路径"})
		return
	}

	// 构建最终目标路径
	finalTargetPath := filepath.Join(realTargetPath, filepath.Base(realSourcePath))

	// 执行移动
	if err := os.Rename(realSourcePath, finalTargetPath); err != nil {
		h.logger.Errorw("移动失败", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "移动失败"})
		return
	}
	
	h.logger.Infow("移动成功", "from", req.SourcePath, "to", req.TargetPath)
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "移动成功"})
}

// RenameFile 重命名文件或文件夹
func (h *PluginManagerHandler) RenameFile(c *gin.Context) {
	var req struct {
		Path    string `json:"path"`
		NewName string `json:"newName"`
	}
	
	if err := c.ShouldBindJSON(&req); err != nil || req.Path == "" || req.NewName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "无效的请求参数"})
		return
	}
	
	// 安全检查：路径必须可写
	if !h.isPathWritable(req.Path) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "路径为只读，无法重命名"})
		return
	}
	
	realPath := h.toRealPath(req.Path)
	if realPath == "" {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无效的文件路径"})
		return
	}

	// 验证新文件名，防止路径遍历
	if strings.Contains(req.NewName, "..") || strings.Contains(req.NewName, "/") || strings.Contains(req.NewName, "\\") {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "文件名包含非法字符"})
		return
	}

	parentDir := filepath.Dir(realPath)
	newRealPath := filepath.Join(parentDir, req.NewName)

	// 最终安全检查：确保新路径仍在父目录内
	if !strings.HasPrefix(newRealPath, parentDir) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无效的文件路径"})
		return
	}

	// 检查新名称是否已存在
	if _, err := os.Stat(newRealPath); err == nil {
		c.JSON(http.StatusConflict, gin.H{"success": false, "message": "该名称已存在"})
		return
	}
	
	// 执行重命名
	if err := os.Rename(realPath, newRealPath); err != nil {
		h.logger.Errorw("重命名失败", "error", err, "path", req.Path, "newName", req.NewName)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "重命名失败"})
		return
	}
	
	h.logger.Infow("重命名成功", "path", req.Path, "newName", req.NewName)
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "重命名成功"})
}

// 辅助函数：检查路径是否允许访问
// 安全增强：防止路径遍历攻击
func (h *PluginManagerHandler) isPathAllowed(path string) bool {
	// 安全增强：解码URL编码，防止通过编码绕过路径检查
	// 使用url.QueryUnescape解码所有URL编码字符（包括中文字符）
	decodedPath, err := url.QueryUnescape(path)
	if err != nil {
		// 如果解码失败，使用原始路径继续处理
		decodedPath = path
	}

	// 额外处理斜杠的URL编码（QueryUnescape可能不会解码这些）
	decodedPath = strings.ReplaceAll(decodedPath, "%2f", "/")
	decodedPath = strings.ReplaceAll(decodedPath, "%2F", "/")
	decodedPath = strings.ReplaceAll(decodedPath, "%5c", "\\")
	decodedPath = strings.ReplaceAll(decodedPath, "%5C", "\\")

	// 清理路径，统一使用正斜杠
	cleanPath := strings.ReplaceAll(decodedPath, "\\", "/")

	// 检查是否包含路径遍历字符
	if strings.Contains(cleanPath, "..") || strings.Contains(cleanPath, "~") {
		return false
	}

	// 安全增强：使用filepath.Clean进行深度清理
	// 移除开头的斜杠以便filepath.Clean正确处理
	trimmedPath := strings.TrimPrefix(cleanPath, "/")
	cleanedPath := filepath.Clean(trimmedPath)

	// 清理后再次检查路径遍历
	if strings.Contains(cleanedPath, "..") {
		return false
	}

	// 重建路径，确保以 / 开头
	// 注意：在Windows上filepath.Clean会使用反斜杠，需要转换回正斜杠
	cleanPath = "/" + strings.ReplaceAll(cleanedPath, "\\", "/")

	// 只允许访问 /plugins/ 下的路径
	// 使用严格的前缀检查，防止 /pluginsXXX 这样的绕过
	if !strings.HasPrefix(cleanPath, "/plugins/") && cleanPath != "/plugins" && cleanPath != "/plugins/" {
		return false
	}

	return true
}

// 辅助函数：检查路径是否可写
// 安全增强：限制可写路径，防止越权操作
func (h *PluginManagerHandler) isPathWritable(path string) bool {
	// 首先检查路径是否允许访问
	if !h.isPathAllowed(path) {
		return false
	}
	
	// 检查是否是模板目录或其子目录（只读）
	if strings.HasPrefix(path, "/plugins/template") {
		return false
	}
	
	// 检查是否是根plugins目录（只读）
	if path == "/plugins" || path == "/plugins/" {
		return false
	}
	
	// 允许 blockly 目录及其子目录
	if strings.HasPrefix(path, "/plugins/blockly/") || path == "/plugins/blockly" {
		return true
	}
	
	// 允许在 /plugins/{accountId}/ 下操作（插件目录）
	// 路径格式应该是 /plugins/{accountId}/...
	parts := strings.Split(strings.TrimPrefix(path, "/plugins/"), "/")
	if len(parts) >= 1 && parts[0] != "" && parts[0] != "blockly" && parts[0] != "template" {
		return true
	}
	
	return false
}

// 辅助函数：检查是否允许在指定父目录下创建指定名称的文件夹
// 安全增强：严格限制目录创建，防止滥用
func (h *PluginManagerHandler) canCreateInPath(parentPath string, name string) bool {
	// 清理路径
	cleanParentPath := strings.ReplaceAll(parentPath, "\\", "/")
	cleanName := strings.ReplaceAll(name, "\\", "/")

	// 检查名称是否合法
	if cleanName == "" || strings.Contains(cleanName, "/") || strings.Contains(cleanName, "..") {
		return false
	}

	// 安全限制：禁止在 /plugins 根目录下创建任何目录
	if cleanParentPath == "/plugins" || cleanParentPath == "/plugins/" {
		// blockly 目录由后端自动创建，前端不应该直接创建
		return false
	}

	// 安全限制：禁止创建名为 "blockly" 的目录（保留名称）
	if strings.EqualFold(cleanName, "blockly") {
		return false
	}

	// 检查父目录是否可写
	if !h.isPathWritable(cleanParentPath) {
		return false
	}

	// 构建完整路径并检查
	fullPath := cleanParentPath
	if !strings.HasSuffix(fullPath, "/") {
		fullPath += "/"
	}
	fullPath += cleanName

	// 最终安全检查
	return h.isPathWritable(fullPath)
}

// 辅助函数：检查字符串是否包含非法控制字符
func (h *PluginManagerHandler) containsIllegalChars(s string) bool {
	// 检查空字符串或仅包含空白字符
	if strings.TrimSpace(s) == "" {
		return true
	}

	// 检查非法字符：控制字符、转义序列、特殊符号
	illegalChars := []rune{
		0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09,
		0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10, 0x11, 0x12, 0x13,
		0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x1D,
		0x1E, 0x1F, // C0 控制字符
		0x7F,       // DEL 字符
		'<', '>', '"', '|', '?', '*', // Windows 文件名非法字符
	}

	for _, char := range s {
		for _, illegal := range illegalChars {
			if char == illegal {
				return true
			}
		}
	}

	// 检查转义序列（如 \x00, \u0000, \n, \r, \t 等）
	escapeSequences := []string{
		"\x00", "\x01", "\x02", "\x03", "\x04", "\x05", "\x06", "\x07",
		"\x08", "\x09", "\x0A", "\x0B", "\x0C", "\x0D", "\x0E", "\x0F",
		"\x10", "\x11", "\x12", "\x13", "\x14", "\x15", "\x16", "\x17",
		"\x18", "\x19", "\x1A", "\x1B", "\x1C", "\x1D", "\x1E", "\x1F",
		"\x7F",
	}
	for _, esc := range escapeSequences {
		if strings.Contains(s, esc) {
			return true
		}
	}

	// 检查 Unicode 控制字符和格式化字符
	for _, r := range s {
		// C1 控制字符 (U+0080 - U+009F)
		if r >= 0x80 && r <= 0x9F {
			return true
		}
		// 方向覆盖字符 (可能用于欺骗文件名显示)
		if r >= 0x202A && r <= 0x202E {
			return true
		}
		// 双向文本控制字符
		if r == 0x200E || r == 0x200F || r == 0x061C {
			return true
		}
	}

	return false
}

// 辅助函数：将虚拟路径转换为真实路径
// 安全增强：使用filepath.Clean进行深度清理，防止路径遍历攻击
func (h *PluginManagerHandler) toRealPath(virtualPath string) string {
	// 检查是否包含非法控制字符
	if h.containsIllegalChars(virtualPath) {
		return ""
	}

	// 安全增强：解码URL编码，防止通过编码绕过路径检查
	// 使用url.QueryUnescape解码所有URL编码字符（包括中文字符）
	decodedPath, err := url.QueryUnescape(virtualPath)
	if err != nil {
		// 如果解码失败，使用原始路径继续处理
		decodedPath = virtualPath
	}

	// 额外处理斜杠的URL编码（QueryUnescape可能不会解码这些）
	decodedPath = strings.ReplaceAll(decodedPath, "%2f", "/")
	decodedPath = strings.ReplaceAll(decodedPath, "%2F", "/")
	decodedPath = strings.ReplaceAll(decodedPath, "%5c", "\\")
	decodedPath = strings.ReplaceAll(decodedPath, "%5C", "\\")

	// 统一使用正斜杠处理虚拟路径
	decodedPath = strings.ReplaceAll(decodedPath, "\\", "/")

	// 确保路径以 /plugins 开头（允许 /plugins 或 /plugins/）
	if !strings.HasPrefix(decodedPath, "/plugins") {
		return ""
	}

	// 将 /plugins 转换为 /plugins/ 以便统一处理
	if decodedPath == "/plugins" {
		decodedPath = "/plugins/"
	} else if !strings.HasPrefix(decodedPath, "/plugins/") {
		// 防止 /pluginsXXX 这样的路径
		return ""
	}

	// 安全增强：使用filepath.Clean进行深度路径清理
	// 这比手动分割更安全，能处理更多边界情况
	// 先移除开头的 /plugins/ 前缀，清理后再重新组合
	relPath := strings.TrimPrefix(decodedPath, "/plugins/")
	if relPath == decodedPath {
		relPath = strings.TrimPrefix(decodedPath, "/plugins")
	}

	// 使用filepath.Clean清理相对路径
	// 这会规范化路径，解析 .. 和 . 并移除多余的斜杠
	cleanRelPath := filepath.Clean(relPath)

	// 清理后再次检查是否包含路径遍历
	// filepath.Clean 会将 ".." 保留，但会规范化 "a/../b" 为 "b"
	// 我们需要确保清理后的路径不以 ".." 开头
	if strings.HasPrefix(cleanRelPath, "..") || strings.Contains(cleanRelPath, "../") || strings.Contains(cleanRelPath, "..") {
		return ""
	}

	// 构建真实路径
	realPath := filepath.Join(h.basePath, cleanRelPath)

	// 最终安全检查：确保解析后的路径仍在 basePath 内
	// 使用绝对路径进行比较
	absBasePath, err := filepath.Abs(h.basePath)
	if err != nil {
		return ""
	}
	absRealPath, err := filepath.Abs(realPath)
	if err != nil {
		return ""
	}

	// 再次使用filepath.Clean确保路径完全规范化
	absBasePath = filepath.Clean(absBasePath)
	absRealPath = filepath.Clean(absRealPath)

	// 确保路径以基础路径开头（防止路径遍历）
	// Windows 路径比较不区分大小写
	if !strings.EqualFold(absRealPath, absBasePath) &&
		!strings.HasPrefix(strings.ToLower(absRealPath), strings.ToLower(absBasePath)+string(filepath.Separator)) {
		return ""
	}

	return absRealPath
}

// 辅助函数：复制文件
func (h *PluginManagerHandler) copyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()
	
	// 确保目标目录存在
	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return err
	}
	
	destFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destFile.Close()
	
	_, err = io.Copy(destFile, sourceFile)
	return err
}

// 辅助函数：复制目录
func (h *PluginManagerHandler) copyDir(src, dst string) error {
	// 获取源目录信息
	srcInfo, err := os.Stat(src)
	if err != nil {
		return err
	}
	
	// 创建目标目录
	if err := os.MkdirAll(dst, srcInfo.Mode()); err != nil {
		return err
	}
	
	// 读取源目录内容
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	
	for _, entry := range entries {
		// 排除 blockly 文件夹
		if entry.Name() == "blockly" && entry.IsDir() {
			continue
		}
		
		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())
		
		if entry.IsDir() {
			if err := h.copyDir(srcPath, dstPath); err != nil {
				return err
			}
		} else {
			if err := h.copyFile(srcPath, dstPath); err != nil {
				return err
			}
		}
	}

	return nil
}

// GetBlocklyStatus 获取Blockly状态
// 返回Blockly目录是否存在以及项目数量
func (h *PluginManagerHandler) GetBlocklyStatus(c *gin.Context) {
	blocklyPath := filepath.Join(h.basePath, "blockly")

	// 检查Blockly目录是否存在
	info, err := os.Stat(blocklyPath)
	exists := err == nil && info.IsDir()

	projectCount := 0
	if exists {
		// 统计项目数量（子目录数量）
		entries, err := os.ReadDir(blocklyPath)
		if err == nil {
			for _, entry := range entries {
				if entry.IsDir() {
					projectCount++
				}
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"exists":        exists,
			"project_count": projectCount,
			"path":          "/plugins/blockly",
		},
	})
}
