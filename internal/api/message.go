// webuui的消息功能接口，可继续拓展，但是原有的千万别动！！！
package api

import (
	"net/http"

	"HanChat-QQBotManager/internal/services"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// RegisterMessageRoutes 注册消息相关路由
func RegisterMessageRoutes(r *gin.RouterGroup, ll *services.LLOneBotService, base *zap.Logger) {
	logger := base.With(zap.String("module", "api.message")).Sugar()

	// 发送私聊消息
	r.POST("/private", func(c *gin.Context) {
		var body struct {
			UserId  interface{} `json:"userId"`
			Message interface{} `json:"message"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		logger.Infow("发送私聊消息", "requestId", c.GetString("requestId"), "userId", body.UserId)
		res, err := ll.SendPrivateMsg(body.UserId, body.Message)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res, "message": "消息发送成功"})
	})

	// 发送群消息
	r.POST("/group", func(c *gin.Context) {
		var body struct {
			GroupId interface{} `json:"groupId"`
			Message interface{} `json:"message"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		logger.Infow("发送群消息", "requestId", c.GetString("requestId"), "groupId", body.GroupId)
		res, err := ll.SendGroupMsg(body.GroupId, body.Message)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res, "message": "消息发送成功"})
	})

	// 转发单条好友消息
	r.POST("/forward/friend-single", func(c *gin.Context) {
		var body struct {
			MessageId interface{} `json:"messageId"`
			UserId    interface{} `json:"userId"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		logger.Infow("转发单条好友消息", "requestId", c.GetString("requestId"), "userId", body.UserId, "messageId", body.MessageId)
		res, err := ll.ForwardFriendSingleMsg(body.MessageId, body.UserId)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res})
	})

	// 转发单条群消息
	r.POST("/forward/group-single", func(c *gin.Context) {
		var body struct {
			MessageId interface{} `json:"messageId"`
			GroupId   interface{} `json:"groupId"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		logger.Infow("转发单条群消息", "requestId", c.GetString("requestId"), "groupId", body.GroupId, "messageId", body.MessageId)
		res, err := ll.ForwardGroupSingleMsg(body.MessageId, body.GroupId)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res})
	})

	// 撤回消息 - 符合 OneBot 标准 API
	r.POST("/delete_msg", func(c *gin.Context) {
		var body struct {
			MessageId interface{} `json:"message_id"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		logger.Infow("撤回消息", "requestId", c.GetString("requestId"), "messageId", body.MessageId)
		res, err := ll.DeleteMsg(body.MessageId)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res, "message": "消息撤回成功"})
	})

	// 注意：SSE事件流已移至反向WebSocket处理

	// 获取消息详情 - 符合 OneBot 标准 API
	r.POST("/get_msg", func(c *gin.Context) {
		var body struct {
			MessageId interface{} `json:"message_id"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		logger.Infow("获取消息详情", "requestId", c.GetString("requestId"), "messageId", body.MessageId)
		res, err := ll.GetMsg(body.MessageId)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res})
	})

	// 获取转发消息内容 - 符合 OneBot 标准 API
	r.POST("/get_forward_msg", func(c *gin.Context) {
		var body struct {
			MessageId interface{} `json:"message_id"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		logger.Infow("获取转发消息内容", "requestId", c.GetString("requestId"), "messageId", body.MessageId)
		res, err := ll.GetForwardMsg(body.MessageId)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 获取AI角色列表
	r.GET("/ai-characters", func(c *gin.Context) {
		logger.Infow("获取AI角色列表", "requestId", c.GetString("requestId"))
		res, err := ll.CallAPI("/get_ai_characters", nil, "GET")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 发送群@消息（统一走 send_group_msg，前端已构造 at 段）
	r.POST("/group-at", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		groupID := body["group_id"]
		message := body["message"]
		logger.Infow("发送群@消息", "requestId", c.GetString("requestId"), "groupId", groupID)
		res, err := ll.SendGroupMsg(groupID, message)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res})
	})

	// 发送群音乐（网易云）——统一走 send_group_msg，前端已构造 music 段
	r.POST("/group-music-163", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		groupID := body["group_id"]
		message := body["message"]
		logger.Infow("发送群音乐（网易云）", "requestId", c.GetString("requestId"), "groupId", groupID)
		res, err := ll.SendGroupMsg(groupID, message)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res})
	})

	// 发送群音乐（QQ音乐）——统一走 send_group_msg，前端已构造 music 段
	r.POST("/group-music-qq", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		groupID := body["group_id"]
		message := body["message"]
		logger.Infow("发送群音乐（QQ音乐）", "requestId", c.GetString("requestId"), "groupId", groupID)
		res, err := ll.SendGroupMsg(groupID, message)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res})
	})

	// 发送群音乐（自定义）——统一走 send_group_msg，前端已构造 music 段
	r.POST("/group-music-custom", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		groupID := body["group_id"]
		message := body["message"]
		logger.Infow("发送群音乐（自定义）", "requestId", c.GetString("requestId"), "groupId", groupID)
		res, err := ll.SendGroupMsg(groupID, message)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res})
	})

	// 发送群AI语音
	r.POST("/group-ai-record", func(c *gin.Context) {
		var body struct {
			GroupId   interface{} `json:"group_id"`
			Text      string      `json:"text"`
			Character string      `json:"character"`
			ChatType  int         `json:"chat_type"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			logger.Errorw("发送群AI语音参数错误", "error", err, "requestId", c.GetString("requestId"))
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "参数错误: " + err.Error(),
			})
			return
		}

		// 参数验证
		if body.GroupId == nil || body.GroupId == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "缺少必填参数: group_id",
			})
			return
		}
		if body.Text == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "缺少必填参数: text (语音文本内容)",
			})
			return
		}
		if body.Character == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "缺少必填参数: character (AI角色ID)",
			})
			return
		}

		// 设置默认chat_type
		if body.ChatType == 0 {
			body.ChatType = 1
		}

		// 构建请求参数
		params := map[string]interface{}{
			"group_id":  body.GroupId,
			"text":      body.Text,
			"character": body.Character,
			"chat_type": body.ChatType,
		}

		logger.Infow("发送群AI语音",
			"requestId", c.GetString("requestId"),
			"groupId", body.GroupId,
			"character", body.Character,
			"textLength", len(body.Text),
		)

		res, err := ll.CallAPI("/send_group_ai_record", params, "POST")
		if err != nil {
			logger.Errorw("发送群AI语音失败",
				"error", err,
				"requestId", c.GetString("requestId"),
				"groupId", body.GroupId,
			)
			c.JSON(http.StatusBadGateway, gin.H{
				"success": false,
				"message": "调用机器人API失败: " + err.Error(),
				"error":   err.Error(),
			})
			return
		}

		// 检查机器人返回的状态
		if status, ok := res["status"].(string); ok && status != "ok" {
			retcode := 0
			if rc, ok := res["retcode"].(float64); ok {
				retcode = int(rc)
			}
			message := ""
			if msg, ok := res["message"].(string); ok {
				message = msg
			}
			if wording, ok := res["wording"].(string); ok && wording != "" {
				message = wording
			}

			logger.Errorw("机器人返回错误",
				"status", status,
				"retcode", retcode,
				"message", message,
				"requestId", c.GetString("requestId"),
			)

			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"status":  status,
				"retcode": retcode,
				"message": message,
			})
			return
		}

		// 兼容不同上游返回结构：优先返回 data 字段，否则回传完整响应
		var out interface{}
		if v, ok := res["data"]; ok && v != nil {
			out = v
		} else {
			out = res
		}

		logger.Infow("发送群AI语音成功",
			"requestId", c.GetString("requestId"),
			"groupId", body.GroupId,
		)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    out,
			"message": "AI语音发送成功",
		})
	})

	// 语音转文本
	r.POST("/voice-to-text", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		// 根据文档，API路径应该是 /voice_msg_to_text，参数是 message_id
		messageId := body["message_id"]
		if messageId == nil {
			// 兼容可能的其他参数名
			messageId = body["messageId"]
		}
		if messageId == nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填参数: message_id"})
			return
		}
		logger.Infow("语音转文本", "requestId", c.GetString("requestId"), "messageId", messageId)
		res, err := ll.CallAPI("/voice_msg_to_text", map[string]interface{}{
			"message_id": messageId,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		// 根据文档，返回格式为 { status: "ok", retcode: 0, data: { text: "..." } }
		respondWithData(c, res)
	})

	// 发送群合并转发
	r.POST("/group-forward", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		groupID := body["group_id"]
		messages := body["messages"]
		logger.Infow("发送群合并转发", "requestId", c.GetString("requestId"), "groupId", groupID)
		res, err := ll.CallAPI("/send_group_forward_msg", map[string]interface{}{
			"group_id": groupID,
			"messages": messages,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 发送群JSON卡片
	r.POST("/group-json-card", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		groupID := body["group_id"]
		message := body["message"]
		logger.Infow("发送群JSON卡片", "requestId", c.GetString("requestId"), "groupId", groupID)
		res, err := ll.CallAPI("/send_group_json_card", map[string]interface{}{
			"group_id": groupID,
			"message":  message,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 获取好友历史消息
	r.POST("/friend-history", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		logger.Infow("获取好友历史消息", "requestId", c.GetString("requestId"))
		res, err := ll.CallAPI("/get_friend_history_msg", body, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 获取群历史消息
	r.POST("/group-history", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		logger.Infow("获取群历史消息", "requestId", c.GetString("requestId"))
		res, err := ll.CallAPI("/get_group_history_msg", body, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 设置消息表情赞（支持取消）
	r.POST("/emoji-like", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		logger.Infow("设置消息表情赞", "requestId", c.GetString("requestId"))
		messageId := body["message_id"]
		emojiId := body["emoji_id"]
		set := true
		if s, ok := body["set"].(bool); ok {
			set = s
		}
		res, err := ll.SetMsgEmojiLike(messageId, emojiId, set)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 取消消息表情赞
	r.DELETE("/emoji-like", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		logger.Infow("取消消息表情赞", "requestId", c.GetString("requestId"))
		messageId := body["message_id"]
		emojiId := body["emoji_id"]
		res, err := ll.SetMsgEmojiLike(messageId, emojiId, false)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 发送戳一戳 - 符合 OneBot 标准 API
	r.POST("/send_poke", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		groupId := body["group_id"]
		userId := body["user_id"]
		logger.Infow("发送戳一戳", "requestId", c.GetString("requestId"), "groupId", groupId, "userId", userId)
		res, err := ll.SendPoke(groupId, userId)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 发送私聊合并转发
	r.POST("/private-forward", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		userID := body["userId"]
		if userID == nil {
			userID = body["user_id"]
		}
		messages := body["messages"]
		logger.Infow("发送私聊合并转发", "requestId", c.GetString("requestId"), "userId", userID)
		res, err := ll.CallAPI("/send_private_forward_msg", map[string]interface{}{
			"user_id":  userID,
			"messages": messages,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 获取消息文件详情
	r.POST("/file-info", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		file := body["file"]
		if file == nil || file == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填参数: file"})
			return
		}
		logger.Infow("获取消息文件详情", "requestId", c.GetString("requestId"), "file", file)
		res, err := ll.CallAPI("/get_msg_file", map[string]interface{}{
			"file": file,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 获取消息图片详情
	r.POST("/image-info", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		file := body["file"]
		if file == nil || file == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填参数: file"})
			return
		}
		logger.Infow("获取消息图片详情", "requestId", c.GetString("requestId"), "file", file)
		res, err := ll.CallAPI("/get_msg_image", map[string]interface{}{
			"file": file,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 获取消息语音详情
	r.POST("/record-info", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		file := body["file"]
		if file == nil || file == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填参数: file"})
			return
		}
		outFormat := body["outFormat"]
		if outFormat == nil {
			outFormat = body["out_format"]
		}
		logger.Infow("获取消息语音详情", "requestId", c.GetString("requestId"), "file", file, "outFormat", outFormat)
		res, err := ll.CallAPI("/get_msg_record", map[string]interface{}{
			"file":       file,
			"out_format": outFormat,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 标记消息已读 - 符合 OneBot 标准 API
	r.POST("/mark_msg_as_read", func(c *gin.Context) {
		var body struct {
			MessageId interface{} `json:"message_id"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		logger.Infow("标记消息已读", "requestId", c.GetString("requestId"), "messageId", body.MessageId)
		res, err := ll.MarkMsgAsRead(body.MessageId)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res})
	})

	// 上传群文件
	r.POST("/upload/group-file", func(c *gin.Context) {
		var body struct {
			GroupId interface{} `json:"groupId"`
			File    string      `json:"file"`
			Name    string      `json:"name"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		logger.Infow("上传群文件", "requestId", c.GetString("requestId"), "groupId", body.GroupId, "name", body.Name)
		res, err := ll.UploadGroupFile(body.GroupId, body.File, body.Name)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res, "message": "文件上传成功"})
	})

	// 上传私聊文件
	r.POST("/upload/private-file", func(c *gin.Context) {
		var body struct {
			UserId interface{} `json:"userId"`
			File   string      `json:"file"`
			Name   string      `json:"name"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		logger.Infow("上传私聊文件", "requestId", c.GetString("requestId"), "userId", body.UserId, "name", body.Name)
		res, err := ll.UploadPrivateFile(body.UserId, body.File, body.Name)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res, "message": "文件上传成功"})
	})

	// 获取群文件URL
	r.POST("/group-file-url", func(c *gin.Context) {
		var body struct {
			GroupId interface{} `json:"groupId"`
			FileId  string      `json:"fileId"`
			Busid   string      `json:"busid"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		logger.Infow("获取群文件URL", "requestId", c.GetString("requestId"), "groupId", body.GroupId, "fileId", body.FileId)
		// 注意：Busid参数已废弃
		res, err := ll.GetGroupFileUrl(body.GroupId, body.FileId)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res})
	})
}
