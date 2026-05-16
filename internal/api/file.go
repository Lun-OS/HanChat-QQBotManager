// 上传文件有严重问题，不写这个了，依旧有效防止黑客攻击
package api

import (
	"net/http"

	"HanChat-QQBotManager/internal/services"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// RegisterFileRoutes 注册文件相关路由
func RegisterFileRoutes(r *gin.RouterGroup, ll *services.LLOneBotService, base *zap.Logger) {
	logger := base.With(zap.String("module", "api.file")).Sugar()

	// 群文件系统信息
	r.GET("/group/:groupId/fs-info", func(c *gin.Context) {
		groupId := c.Param("groupId")
		logger.Infow("获取群文件系统信息", "requestId", c.GetString("requestId"), "groupId", groupId)
		res, err := ll.GetGroupFileSystemInfo(groupId)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 群根目录文件列表
	r.GET("/group/:groupId/files", func(c *gin.Context) {
		groupId := c.Param("groupId")
		logger.Infow("获取群根目录文件列表", "requestId", c.GetString("requestId"), "groupId", groupId)
		res, err := ll.GetGroupRootFiles(groupId)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// ==================== 补充缺失的文件接口 ====================

	// 上传群文件
	r.POST("/group/:groupId/upload", func(c *gin.Context) {
		groupId := c.Param("groupId")
		var body struct {
			File     string `json:"file"`
			Name     string `json:"name"`
			FolderId string `json:"folderId"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.File == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填参数: file"})
			return
		}
		logger.Infow("上传群文件", "requestId", c.GetString("requestId"), "groupId", groupId, "name", body.Name)
		res, err := ll.CallAPI("/upload_group_file", map[string]interface{}{
			"group_id":  groupId,
			"file":      body.File,
			"name":      body.Name,
			"folder_id": body.FolderId,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res["data"], "message": "文件上传成功"})
	})

	// 删除群文件
	r.DELETE("/group/:groupId/file/:fileId", func(c *gin.Context) {
		groupId := c.Param("groupId")
		fileId := c.Param("fileId")
		logger.Infow("删除群文件", "requestId", c.GetString("requestId"), "groupId", groupId, "fileId", fileId)
		res, err := ll.CallAPI("/delete_group_file", map[string]interface{}{
			"group_id": groupId,
			"file_id":  fileId,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res["data"], "message": "文件已删除"})
	})

	// 移动群文件
	r.POST("/group/:groupId/move-file", func(c *gin.Context) {
		groupId := c.Param("groupId")
		var body struct {
			FileId          string `json:"fileId"`
			ParentDirectory string `json:"parentDirectory"`
			TargetDirectory string `json:"targetDirectory"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.FileId == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填参数: fileId, parentDirectory, targetDirectory"})
			return
		}
		logger.Infow("移动群文件", "requestId", c.GetString("requestId"), "groupId", groupId, "fileId", body.FileId)
		res, err := ll.CallAPI("/move_group_file", map[string]interface{}{
			"group_id":         groupId,
			"file_id":          body.FileId,
			"parent_directory": body.ParentDirectory,
			"target_directory": body.TargetDirectory,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res["data"], "message": "文件已移动"})
	})

	// 创建群文件文件夹
	r.POST("/group/:groupId/create-folder", func(c *gin.Context) {
		groupId := c.Param("groupId")
		var body struct {
			Name string `json:"name"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.Name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填参数: name"})
			return
		}
		logger.Infow("创建群文件文件夹", "requestId", c.GetString("requestId"), "groupId", groupId, "name", body.Name)
		res, err := ll.CallAPI("/create_group_file_folder", map[string]interface{}{
			"group_id": groupId,
			"name":     body.Name,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res["data"], "message": "文件夹已创建"})
	})

	// 删除群文件文件夹
	r.DELETE("/group/:groupId/folder/:folderId", func(c *gin.Context) {
		groupId := c.Param("groupId")
		folderId := c.Param("folderId")
		logger.Infow("删除群文件文件夹", "requestId", c.GetString("requestId"), "groupId", groupId, "folderId", folderId)
		res, err := ll.CallAPI("/delete_group_folder", map[string]interface{}{
			"group_id":  groupId,
			"folder_id": folderId,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res["data"], "message": "文件夹已删除"})
	})

	// 重命名群文件文件夹
	r.PUT("/group/:groupId/folder/:folderId/rename", func(c *gin.Context) {
		groupId := c.Param("groupId")
		folderId := c.Param("folderId")
		var body struct {
			NewFolderName string `json:"newFolderName"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.NewFolderName == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填参数: newFolderName"})
			return
		}
		logger.Infow("重命名群文件文件夹", "requestId", c.GetString("requestId"), "groupId", groupId, "folderId", folderId, "newName", body.NewFolderName)
		res, err := ll.CallAPI("/rename_group_file_folder", map[string]interface{}{
			"group_id":        groupId,
			"folder_id":       folderId,
			"new_folder_name": body.NewFolderName,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res["data"], "message": "文件夹已重命名"})
	})

	// 获取群子目录文件列表
	r.GET("/group/:groupId/folder/:folderId/files", func(c *gin.Context) {
		groupId := c.Param("groupId")
		folderId := c.Param("folderId")
		logger.Infow("获取群子目录文件列表", "requestId", c.GetString("requestId"), "groupId", groupId, "folderId", folderId)
		res, err := ll.CallAPI("/get_group_files_by_folder", map[string]interface{}{
			"group_id":  groupId,
			"folder_id": folderId,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 获取群文件资源链接
	r.GET("/group/:groupId/file/:fileId/url", func(c *gin.Context) {
		groupId := c.Param("groupId")
		fileId := c.Param("fileId")
		logger.Infow("获取群文件资源链接", "requestId", c.GetString("requestId"), "groupId", groupId, "fileId", fileId)
		res, err := ll.CallAPI("/get_group_file_url", map[string]interface{}{
			"group_id": groupId,
			"file_id":  fileId,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 设置群文件转永久
	r.POST("/group/:groupId/file/:fileId/forever", func(c *gin.Context) {
		groupId := c.Param("groupId")
		fileId := c.Param("fileId")
		logger.Infow("设置群文件转永久", "requestId", c.GetString("requestId"), "groupId", groupId, "fileId", fileId)
		res, err := ll.CallAPI("/set_group_file_forever", map[string]interface{}{
			"group_id": groupId,
			"file_id":  fileId,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res["data"], "message": "已设为永久"})
	})

	// 获取私聊文件资源链接
	r.POST("/private-file-url", func(c *gin.Context) {
		var body struct {
			FileId string      `json:"fileId"`
			UserId interface{} `json:"userId"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.FileId == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填参数: fileId"})
			return
		}
		logger.Infow("获取私聊文件资源链接", "requestId", c.GetString("requestId"), "fileId", body.FileId)
		res, err := ll.CallAPI("/get_private_file_url", map[string]interface{}{
			"file_id": body.FileId,
			"user_id": body.UserId,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 上传私聊文件
	r.POST("/private-upload", func(c *gin.Context) {
		var body struct {
			UserId interface{} `json:"userId"`
			File   string      `json:"file"`
			Name   string      `json:"name"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.File == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填参数: userId, file"})
			return
		}
		logger.Infow("上传私聊文件", "requestId", c.GetString("requestId"), "userId", body.UserId, "name", body.Name)
		res, err := ll.CallAPI("/upload_private_file", map[string]interface{}{
			"user_id": body.UserId,
			"file":    body.File,
			"name":    body.Name,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res["data"], "message": "文件上传成功"})
	})

	// 上传闪传文件
	r.POST("/flash-upload", func(c *gin.Context) {
		var body struct {
			Title string   `json:"title"`
			Paths []string `json:"paths"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || len(body.Paths) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填参数: paths"})
			return
		}
		logger.Infow("上传闪传文件", "requestId", c.GetString("requestId"), "title", body.Title, "count", len(body.Paths))
		res, err := ll.CallAPI("/upload_flash_file", map[string]interface{}{
			"title": body.Title,
			"paths": body.Paths,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res["data"], "message": "闪传文件上传成功"})
	})

	// 下载闪传文件
	r.POST("/flash-download", func(c *gin.Context) {
		var body struct {
			ShareLink string `json:"shareLink"`
			FileSetId string `json:"fileSetId"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填参数: shareLink 或 fileSetId"})
			return
		}
		logger.Infow("下载闪传文件", "requestId", c.GetString("requestId"), "shareLink", body.ShareLink, "fileSetId", body.FileSetId)
		res, err := ll.CallAPI("/download_flash_file", map[string]interface{}{
			"share_link":  body.ShareLink,
			"file_set_id": body.FileSetId,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res["data"], "message": "闪传文件下载成功"})
	})

	// 获取闪传文件详情
	r.POST("/flash-info", func(c *gin.Context) {
		var body struct {
			ShareLink string `json:"shareLink"`
			FileSetId string `json:"fileSetId"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填参数: shareLink 或 fileSetId"})
			return
		}
		logger.Infow("获取闪传文件详情", "requestId", c.GetString("requestId"), "shareLink", body.ShareLink, "fileSetId", body.FileSetId)
		res, err := ll.CallAPI("/get_flash_file_info", map[string]interface{}{
			"share_link":  body.ShareLink,
			"file_set_id": body.FileSetId,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 下载文件到缓存目录
	r.POST("/download", func(c *gin.Context) {
		var body struct {
			Url     string   `json:"url"`
			Base64  string   `json:"base64"`
			Name    string   `json:"name"`
			Headers []string `json:"headers"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填参数: url 或 base64"})
			return
		}
		logger.Infow("下载文件到缓存目录", "requestId", c.GetString("requestId"), "name", body.Name)
		res, err := ll.CallAPI("/download_file", map[string]interface{}{
			"url":     body.Url,
			"base64":  body.Base64,
			"name":    body.Name,
			"headers": body.Headers,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res["data"], "message": "文件下载成功"})
	})

	// 重新分享闪传文件 - 符合 OneBot 标准 API
	r.POST("/reshare_flash_file", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		shareLink := body["share_link"]
		fileSetId := body["file_set_id"]
		logger.Infow("重新分享闪传文件", "requestId", c.GetString("requestId"), "shareLink", shareLink, "fileSetId", fileSetId)
		res, err := ll.ReshareFlashFile(shareLink, fileSetId)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 重命名群文件 - 符合 OneBot 标准 API
	r.POST("/rename_group_file", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		groupId := body["group_id"]
		fileId := body["file_id"]
		newFileName := body["new_file_name"]
		logger.Infow("重命名群文件", "requestId", c.GetString("requestId"), "groupId", groupId, "fileId", fileId, "newFileName", newFileName)
		res, err := ll.RenameGroupFile(groupId, fileId, newFileName)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})
}
