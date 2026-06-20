package api

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"HanChat-QQBotManager/internal/services"
)

const (
	// maxFileWriteSize 单次写入文件的最大内容大小（15MB）
	maxFileWriteSize = 15 * 1024 * 1024
	// maxFileCopySize 单次复制文件的最大大小（100MB）
	maxFileCopySize = 100 * 1024 * 1024
	// maxPathLength 路径最大长度
	maxPathLength = 4096
)

// blockedFileExtensions 禁止上传/创建的文件后缀
var blockedFileExtensions = map[string]bool{
	".exe": true, ".dll": true, ".com": true, ".bat": true, ".cmd": true,
	".sh": true, ".bash": true, ".zsh": true, ".ps1": true,
	".so": true, ".dylib": true,
	".php": true, ".php3": true, ".php4": true, ".php5": true, ".pht": true, ".phtml": true,
	".pl": true, ".pm": true, ".py": true, ".pyc": true, ".pyo": true,
	".rb": true, ".jsp": true, ".asp": true, ".aspx": true, ".cgi": true,
	".wasm": true,
	".app": true, ".msi": true, ".scr": true, ".pif": true, ".vbs": true, ".vbe": true,
	".js": true, ".jse": true, ".wsf": true, ".wsh": true,
}

// hasBlockedExtension 检查文件路径是否包含被禁止的后缀
func hasBlockedExtension(filePath string) bool {
	ext := strings.ToLower(filepath.Ext(filePath))
	return blockedFileExtensions[ext]
}

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
// 安全说明：该路由已受 AuthMiddleware 保护，仅认证用户可访问。
// 如果未来需要进一步限制，可在此处添加用户-账号权限映射。
func (h *PluginManagerHandler) GetAvailableAccounts(c *gin.Context) {
	accounts := []AccountInfo{}
	
	h.logger.Debugw("获取可用账号列表",
		"client_ip", c.ClientIP())
	
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
		// 排除 .config 文件夹（内部配置目录）
		if entry.IsDir() && entry.Name() == ".config" {
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
			ModifiedTime: info.ModTime().UTC().Format("2006-01-02 15:04:05"),
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
	
	// 安全检查：限制内容大小
	if len(req.Content) > maxFileWriteSize {
		h.logger.Warnw("写入内容超过大小限制", "size", len(req.Content), "limit", maxFileWriteSize)
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"success": false, "message": "文件内容超过大小限制"})
		return
	}

	// 安全检查：禁止上传可执行文件
	if hasBlockedExtension(req.Path) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "该文件类型不允许上传"})
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
	
	h.logger.Infow("文件已写入",
		"path", req.Path,
		"client_ip", c.ClientIP(),
		"size", len(req.Content))
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

	// 安全检查：禁止创建可执行文件
	if hasBlockedExtension(req.Name) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "该文件类型不允许创建"})
		return
	}

	realPath := filepath.Join(realParentPath, req.Name)

	// 最终安全检查：确保构建的路径仍在允许的范围内
	if !strings.HasPrefix(realPath, realParentPath) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无效的文件路径"})
		return
	}

	// 创建文件或文件夹（使用原子操作避免 TOCTOU 竞态条件）
	if req.Type == "folder" {
		if err := os.MkdirAll(realPath, 0755); err != nil {
			h.logger.Errorw("创建文件夹失败", "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "创建文件夹失败"})
			return
		}
	} else {
		// 使用 O_CREATE|O_EXCL 原子操作创建文件
		// 如果文件已存在，os.OpenFile 会返回错误，避免 TOCTOU（检查存在性后再创建的时间差）
		file, err := os.OpenFile(realPath, os.O_RDONLY|os.O_CREATE|os.O_EXCL, 0644)
		if err != nil {
			if os.IsExist(err) {
				c.JSON(http.StatusConflict, gin.H{"success": false, "message": "文件或文件夹已存在"})
			} else {
				h.logger.Errorw("创建文件失败", "error", err)
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "创建文件失败"})
			}
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

	h.logger.Infow("删除成功",
		"path", path,
		"client_ip", c.ClientIP())
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

	// 安全检查：禁止复制文件到可执行文件扩展名
	if !sourceInfo.IsDir() && hasBlockedExtension(finalTargetPath) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "目标文件类型不允许"})
		return
	}

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
	
	h.logger.Infow("复制成功",
		"from", req.SourcePath,
		"to", req.TargetPath,
		"overwrite", req.Overwrite,
		"client_ip", c.ClientIP())
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

	// 安全检查：禁止移动到可执行文件扩展名
	if hasBlockedExtension(finalTargetPath) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "目标文件类型不允许"})
		return
	}

	// 执行移动
	if err := os.Rename(realSourcePath, finalTargetPath); err != nil {
		h.logger.Errorw("移动失败", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "移动失败"})
		return
	}
	
	h.logger.Infow("移动成功",
		"from", req.SourcePath,
		"to", req.TargetPath,
		"client_ip", c.ClientIP())
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

	// 安全检查：禁止重命名为可执行文件扩展名
	if hasBlockedExtension(req.NewName) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "该文件类型不允许"})
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
	
	h.logger.Infow("重命名成功",
		"path", req.Path,
		"newName", req.NewName,
		"client_ip", c.ClientIP())
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "重命名成功"})
}

// 辅助函数：检查路径是否允许访问
// 安全增强：防止路径遍历攻击
// 注意：传入的 path 来自 Gin 的 c.Query() 或 JSON Body，Gin 已自动完成 URL 解码，
// 此处不再重复解码，以避免解码不一致引入的绕过风险。
func (h *PluginManagerHandler) isPathAllowed(path string) bool {
	return h.toRealPath(path) != ""
}

// 辅助函数：检查路径是否可写
// 安全增强：限制可写路径，防止越权操作
func (h *PluginManagerHandler) isPathWritable(path string) bool {
	// 首先检查路径是否允许访问
	if !h.isPathAllowed(path) {
		return false
	}

	// 检查是否是根plugins目录（只读）
	if path == "/plugins" || path == "/plugins/" {
		return false
	}

	// 允许在 /plugins/blockly/ 下操作（blockly 编辑）
	if strings.HasPrefix(path, "/plugins/blockly/") || path == "/plugins/blockly" {
		return true
	}

	// 允许在 /plugins/template/ 下操作（模板编辑）
	if strings.HasPrefix(path, "/plugins/template/") || path == "/plugins/template" {
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
// 注意：仅检查底层字符是否非法，不涉及 URL 解码（Gin 已处理）
func (h *PluginManagerHandler) containsIllegalChars(s string) bool {
	// 检查空字符串或仅包含空白字符
	if strings.TrimSpace(s) == "" {
		return true
	}

	// 检查路径长度（最长为 4096 字符）
	if len(s) > 4096 {
		return true
	}

	// 检查非法字符：控制字符、Windows 文件名非法字符
	// 注意：转义序列（如 \x00）在 Go 字符串中与对应的 rune 是等价的，
	// 因此 rune 级别的检查已覆盖，无需重复检查字符串字面量。
	for _, char := range s {
		// C0 控制字符 (0x00-0x1F) 和 DEL (0x7F)
		if char <= 0x1F || char == 0x7F {
			return true
		}
		// C1 控制字符 (U+0080 - U+009F)
		if char >= 0x80 && char <= 0x9F {
			return true
		}
		// Windows 文件名非法字符
		if char == '<' || char == '>' || char == '"' || char == '|' || char == '?' || char == '*' {
			return true
		}
		// 方向覆盖字符（可能用于欺骗文件名显示）
		if char >= 0x202A && char <= 0x202E {
			return true
		}
		// 双向文本控制字符
		if char == 0x200E || char == 0x200F || char == 0x061C {
			return true
		}
	}

	// Windows 下检查文件名末尾点号或空格（Windows 会自动删除，可能导致意外行为）
	if runtime.GOOS == "windows" {
		parts := strings.Split(s, "/")
		for _, part := range parts {
			if part != "" && (part[len(part)-1] == '.' || part[len(part)-1] == ' ') {
				return true
			}
		}
	}

	return false
}

// 辅助函数：将虚拟路径转换为真实路径
// 安全增强：不再重复 URL 解码（Gin/JSON 解析已完成），
// 使用 filepath.Clean + filepath.Rel 进行严格的路径边界检查。
func (h *PluginManagerHandler) toRealPath(virtualPath string) string {
	// 0. 基本输入校验
	if virtualPath == "" {
		return ""
	}

	// 1. 检查是否包含非法控制字符（在路径清理之前）
	if h.containsIllegalChars(virtualPath) {
		return ""
	}

	// 2. Unicode 规范化：处理零宽字符和全角字符绕过
	cleanPath := sanitizeUnicodePath(virtualPath)

	// 3. 统一正斜杠
	cleanPath = strings.ReplaceAll(cleanPath, "\\", "/")

	// 4. 检查NTFS Alternate Data Stream攻击 (Windows)
	if strings.Contains(cleanPath, ":") {
		return ""
	}

	// 5. 使用 filepath.Clean 进行深度清理（解析 . 和 ..）
	//    移除开头的 / 后再 Clean，然后重新添加
	trimmedPath := strings.TrimPrefix(cleanPath, "/")
	cleanedPath := filepath.Clean(trimmedPath)

	// 6. 检查清理后是否仍包含 .. 前缀（filepath.Clean 不会消除开头的 ..）
	if strings.HasPrefix(cleanedPath, "..") {
		return ""
	}

	// 7. 重建虚拟路径（统一正斜杠）
	cleanVirtualPath := "/" + strings.ReplaceAll(cleanedPath, "\\", "/")

	// 8. 必须位于 /plugins/ 下（严格前缀检查，防止 /pluginsXXX 绕过）
	if cleanVirtualPath != "/plugins" && !strings.HasPrefix(cleanVirtualPath, "/plugins/") {
		return ""
	}

	// 9. 检测Windows保留名称
	for _, part := range strings.Split(cleanVirtualPath, "/") {
		if isWindowsReservedName(part) {
			return ""
		}
	}

	// 10. 计算相对路径
	relPath := strings.TrimPrefix(cleanVirtualPath, "/plugins/")
	if relPath == "" || relPath == cleanVirtualPath {
		// 路径就是 /plugins 或 /plugins/（根目录）
		absBasePath, err := filepath.Abs(h.basePath)
		if err != nil {
			return ""
		}
		return filepath.Clean(absBasePath)
	}

	// 11. 路径长度检查
	if len(relPath) > 4096 {
		return ""
	}

	// 12. 构建真实路径用绝对路径验证边界
	realPath := filepath.Join(h.basePath, relPath)
	absRealPath, err := filepath.Abs(realPath)
	if err != nil {
		return ""
	}
	absRealPath = filepath.Clean(absRealPath)

	// 13. 使用 filepath.Rel 验证路径归属（最可靠的边界检查）
	baseAbs, err := filepath.Abs(h.basePath)
	if err != nil {
		return ""
	}
	baseAbs = filepath.Clean(baseAbs)

	rel, err := filepath.Rel(baseAbs, absRealPath)
	if err != nil {
		return ""
	}
	if strings.HasPrefix(rel, "..") {
		return ""
	}

	// 额外检查：确保相对路径确实在 base 目录下
	// 用 filepath.Join 重建验证
	verifiedPath := filepath.Join(baseAbs, rel)
	if verifiedPath != absRealPath &&
		!isPathCaseInsensitiveEqual(absRealPath, verifiedPath) {
		return ""
	}

	return absRealPath
}

// isPathCaseInsensitiveEqual 判断两个路径是否"相等"，
// 在 Windows 上大小写不敏感，在其他系统上大小写敏感。
func isPathCaseInsensitiveEqual(a, b string) bool {
	a = filepath.Clean(a)
	b = filepath.Clean(b)
	if runtime.GOOS == "windows" {
		return strings.EqualFold(a, b)
	}
	return a == b
}

// 辅助函数：复制文件
func (h *PluginManagerHandler) copyFile(src, dst string) error {
	// 检查目标文件扩展名是否被禁止
	if hasBlockedExtension(dst) {
		return fmt.Errorf("目标文件类型不允许: %s", dst)
	}

	// 检查源文件大小，拒绝过大文件
	srcInfo, err := os.Stat(src)
	if err != nil {
		return err
	}
	if srcInfo.Size() > maxFileCopySize {
		return fmt.Errorf("文件过大（%d bytes），超过复制大小限制（%d bytes）", srcInfo.Size(), maxFileCopySize)
	}

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
	
	// 使用 io.CopyN 限制读取大小，防止读取超大文件
	_, err = io.CopyN(destFile, sourceFile, srcInfo.Size())
	if err != nil && err != io.EOF {
		return err
	}
	return nil
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

// sanitizeUnicodePath 规范化路径中的Unicode字符
// 防止使用不同的Unicode表示来绕过路径检查
func sanitizeUnicodePath(path string) string {
	// 简单的Unicode规范化处理
	// 在实际生产环境中，应该使用 golang.org/x/text/unicode/norm 包
	// 这里实现一个基本版本，处理常见的绕过尝试

	// 移除零宽字符（可能用于隐藏特殊字符）
	path = strings.ReplaceAll(path, "\u200b", "") // 零宽空格
	path = strings.ReplaceAll(path, "\u200c", "") // 零宽非连接符
	path = strings.ReplaceAll(path, "\u200d", "") // 零宽连接符
	path = strings.ReplaceAll(path, "\ufeff", "") // BOM

	// 处理全角字符转换为半角（防止使用全角斜杠等）
	path = strings.ReplaceAll(path, "\uff0f", "/")  // 全角斜杠
	path = strings.ReplaceAll(path, "\uff3c", "\\") // 全角反斜杠
	path = strings.ReplaceAll(path, "\uff0e", ".")   // 全角句号

	return path
}

// isWindowsReservedName 检查是否是Windows保留名称
// Windows保留名称：CON, PRN, AUX, NUL, COM1-COM9, LPT1-LPT9
func isWindowsReservedName(name string) bool {
	// 转换为大写进行比较
	upperName := strings.ToUpper(name)

	// 检查基础保留名称
	reservedNames := map[string]bool{
		"CON": true, "PRN": true, "AUX": true, "NUL": true,
	}

	if reservedNames[upperName] {
		return true
	}

	// 检查 COM1-9 和 LPT1-9
	if len(upperName) >= 3 && len(upperName) <= 4 {
		prefix := upperName[:3]
		if prefix == "COM" || prefix == "LPT" {
			if len(upperName) == 3 {
				return true // COM, LPT (虽然不太常见)
			}
			digit := upperName[3]
			if digit >= '1' && digit <= '9' {
				return true
			}
		}
	}

	return false
}
