// webuui的群功能接口，可继续拓展，但是原有的千万别动！！！
package api

import (
	"net/http"
	"strconv"

	"HanChat-QQBotManager/internal/services"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// RegisterGroupRoutes 注册群组相关路由
func RegisterGroupRoutes(r *gin.RouterGroup, ll *services.LLOneBotService, base *zap.Logger) {
	logger := base.With(zap.String("module", "api.group")).Sugar()

	// 获取群列表
	r.GET("/list", func(c *gin.Context) {
		logger.Infow("获取群列表", "requestId", c.GetString("requestId"))
		res, err := ll.GetGroupList()
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 获取群信息
	r.GET("/:groupId", func(c *gin.Context) {
		groupId := c.Param("groupId")
		logger.Infow("获取群信息", "requestId", c.GetString("requestId"), "groupId", groupId)
		res, err := ll.GetGroupInfo(groupId)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 获取群成员信息
	r.GET("/:groupId/member/:userId", func(c *gin.Context) {
		groupId := c.Param("groupId")
		userId := c.Param("userId")
		noCache := c.Query("noCache") == "true"
		logger.Infow("获取群成员信息", "requestId", c.GetString("requestId"), "groupId", groupId, "userId", userId, "noCache", noCache)
		res, err := ll.GetGroupMemberInfo(groupId, userId, noCache)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 获取群成员列表
	r.GET("/:groupId/members", func(c *gin.Context) {
		groupId := c.Param("groupId")
		logger.Infow("获取群成员列表", "requestId", c.GetString("requestId"), "groupId", groupId)
		res, err := ll.GetGroupMemberList(groupId)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 设置群名片
	r.PUT("/:groupId/member/:userId/card", func(c *gin.Context) {
		groupId := c.Param("groupId")
		userId := c.Param("userId")
		var body struct {
			Card string `json:"card"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.Card == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填参数: card"})
			return
		}
		logger.Infow("设置群名片", "requestId", c.GetString("requestId"), "groupId", groupId, "userId", userId, "card", body.Card)
		res, err := ll.SetGroupCard(groupId, userId, body.Card)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res["data"], "message": "群名片设置成功"})
	})

	// 群禁言
	r.POST("/:groupId/ban", func(c *gin.Context) {
		groupId := c.Param("groupId")
		var body struct {
			UserId   interface{} `json:"userId"`
			Duration int         `json:"duration"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.UserId == nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填参数: userId"})
			return
		}
		if body.Duration == 0 {
			body.Duration = 600
		}
		logger.Infow("设置群禁言", "requestId", c.GetString("requestId"), "groupId", groupId, "userId", body.UserId, "duration", body.Duration)
		res, err := ll.SetGroupBan(groupId, body.UserId, body.Duration)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		msg := "已禁言 " + strconv.Itoa(body.Duration) + " 秒"
		if body.Duration == 0 {
			msg = "已解除禁言"
		}
		respondWithDataAndMessage(c, res, msg)
	})

	// 踢出群成员
	r.DELETE("/:groupId/member/:userId", func(c *gin.Context) {
		groupId := c.Param("groupId")
		userId := c.Param("userId")
		reject := c.Query("rejectAddRequest") == "true"
		logger.Infow("踢出群成员", "requestId", c.GetString("requestId"), "groupId", groupId, "userId", userId, "rejectAddRequest", reject)
		res, err := ll.SetGroupKick(groupId, userId, reject)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res["data"], "message": "群成员已踢出"})
	})

	// 退出群（管理员可选择解散）
	r.POST("/:groupId/leave", func(c *gin.Context) {
		groupId := c.Param("groupId")
		var body struct {
			Dismiss bool `json:"dismiss"`
		}
		_ = c.ShouldBindJSON(&body)
		logger.Infow("退出群", "requestId", c.GetString("requestId"), "groupId", groupId, "dismiss", body.Dismiss)
		res, err := ll.SetGroupLeave(groupId, body.Dismiss)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		msg := "已退出群"
		if body.Dismiss {
			msg = "已解散群"
		}
		respondWithDataAndMessage(c, res, msg)
	})

	// 设置/取消管理员
	r.POST("/:groupId/admin", func(c *gin.Context) {
		groupId := c.Param("groupId")
		var body struct {
			UserId interface{} `json:"userId"`
			Enable bool        `json:"enable"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.UserId == nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填参数: userId"})
			return
		}
		logger.Infow("设置管理员", "requestId", c.GetString("requestId"), "groupId", groupId, "userId", body.UserId, "enable", body.Enable)
		res, err := ll.SetGroupAdmin(groupId, body.UserId, body.Enable)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 设置群员头衔
	r.PUT("/:groupId/member/:userId/special-title", func(c *gin.Context) {
		groupId := c.Param("groupId")
		userId := c.Param("userId")
		var body struct {
			SpecialTitle string `json:"specialTitle"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填参数: specialTitle"})
			return
		}
		logger.Infow("设置群员头衔", "requestId", c.GetString("requestId"), "groupId", groupId, "userId", userId, "title", body.SpecialTitle)
		// 使用默认值duration=0
		res, err := ll.SetGroupSpecialTitle(groupId, userId, body.SpecialTitle, 0)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res["data"], "message": "设置成功"})
	})

	// 全员禁言开关
	r.POST("/:groupId/whole-ban", func(c *gin.Context) {
		groupId := c.Param("groupId")
		var body struct {
			Enable bool `json:"enable"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		logger.Infow("设置全员禁言", "requestId", c.GetString("requestId"), "groupId", groupId, "enable", body.Enable)
		res, err := ll.CallAPI("/set_group_whole_ban", map[string]interface{}{
			"group_id": groupId,
			"enable":   body.Enable,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 修改群名称
	r.PUT("/:groupId/name", func(c *gin.Context) {
		groupId := c.Param("groupId")
		var body struct {
			GroupName string `json:"groupName"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.GroupName == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填参数: groupName"})
			return
		}
		logger.Infow("修改群名称", "requestId", c.GetString("requestId"), "groupId", groupId, "groupName", body.GroupName)
		res, err := ll.CallAPI("/set_group_name", map[string]interface{}{
			"group_id":   groupId,
			"group_name": body.GroupName,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 处理加群请求
	r.POST("/add-request", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		flag := body["flag"]
		approve := body["approve"]
		reason := body["reason"]
		logger.Infow("处理加群请求", "requestId", c.GetString("requestId"), "flag", flag, "approve", approve)
		res, err := ll.CallAPI("/set_group_add_request", map[string]interface{}{
			"flag":    flag,
			"approve": approve,
			"reason":  reason,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 群戳一戳
	r.POST("/:groupId/poke", func(c *gin.Context) {
		groupId := c.Param("groupId")
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		userID := body["userId"]
		if userID == nil {
			userID = body["user_id"]
		}
		logger.Infow("群戳一戳", "requestId", c.GetString("requestId"), "groupId", groupId, "userId", userID)
		res, err := ll.CallAPI("/group_poke", map[string]interface{}{
			"group_id": groupId,
			"user_id":  userID,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 发布群公告
	r.POST("/:groupId/notice", func(c *gin.Context) {
		groupId := c.Param("groupId")
		var body struct {
			Content string `json:"content"`
			Image   string `json:"image"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		logger.Infow("发布群公告", "requestId", c.GetString("requestId"), "groupId", groupId)
		res, err := ll.CallAPI("/_send_group_notice", map[string]interface{}{
			"group_id": groupId,
			"content":  body.Content,
			"image":    body.Image,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 获取群公告
	r.GET("/:groupId/notices", func(c *gin.Context) {
		groupId := c.Param("groupId")
		logger.Infow("获取群公告", "requestId", c.GetString("requestId"), "groupId", groupId)
		res, err := ll.CallAPI("/_get_group_notice", map[string]interface{}{
			"group_id": groupId,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 获取群系统消息
	r.GET("/system-msg", func(c *gin.Context) {
		logger.Infow("获取群系统消息", "requestId", c.GetString("requestId"))
		res, err := ll.CallAPI("/get_group_system_msg", nil, "GET")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 获取被禁言群员列表
	r.GET("/:groupId/shut-list", func(c *gin.Context) {
		groupId := c.Param("groupId")
		logger.Infow("获取被禁言群员列表", "requestId", c.GetString("requestId"), "groupId", groupId)
		res, err := ll.CallAPI("/get_group_shut_list", map[string]interface{}{
			"group_id": groupId,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 批量踢出群成员
	r.POST("/:groupId/batch-delete-members", func(c *gin.Context) {
		groupId := c.Param("groupId")
		var body struct {
			UserIds []interface{} `json:"userIds"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || len(body.UserIds) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填参数: userIds"})
			return
		}
		logger.Infow("批量踢出群成员", "requestId", c.GetString("requestId"), "groupId", groupId, "count", len(body.UserIds))
		res, err := ll.CallAPI("/batch_delete_group_member", map[string]interface{}{
			"group_id": groupId,
			"user_ids": body.UserIds,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 获取群荣誉信息
	r.GET("/:groupId/honor-info", func(c *gin.Context) {
		groupId := c.Param("groupId")
		typ := c.Query("type")
		if typ == "" {
			typ = "all"
		}
		logger.Infow("获取群荣誉信息", "requestId", c.GetString("requestId"), "groupId", groupId, "type", typ)
		res, err := ll.CallAPI("/get_group_honor_info", map[string]interface{}{
			"group_id": groupId,
			"type":     typ,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 获取群精华消息列表
	r.GET("/:groupId/essence-list", func(c *gin.Context) {
		groupId := c.Param("groupId")
		logger.Infow("获取群精华消息列表", "requestId", c.GetString("requestId"), "groupId", groupId)
		res, err := ll.CallAPI("/get_essence_msg_list", map[string]interface{}{
			"group_id": groupId,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 设置群精华消息 - 符合 OneBot 标准 API
	r.POST("/set_essence_msg", func(c *gin.Context) {
		var body struct {
			MessageId interface{} `json:"message_id"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		logger.Infow("设置群精华消息", "requestId", c.GetString("requestId"), "messageId", body.MessageId)
		res, err := ll.SetEssenceMsg(body.MessageId)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 移出群精华消息 - 符合 OneBot 标准 API
	r.POST("/delete_essence_msg", func(c *gin.Context) {
		var body struct {
			MessageId interface{} `json:"message_id"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		logger.Infow("移出群精华消息", "requestId", c.GetString("requestId"), "messageId", body.MessageId)
		// 将MessageId转换为int64
		var msgId int64
		switch v := body.MessageId.(type) {
		case float64:
			msgId = int64(v)
		case int64:
			msgId = v
		case int:
			msgId = int64(v)
		default:
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "message_id类型错误"})
			return
		}
		res, err := ll.DeleteEssenceMsg(msgId)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 获取@全员剩余次数
	r.GET("/:groupId/at-all-remain", func(c *gin.Context) {
		groupId := c.Param("groupId")
		logger.Infow("获取@全员剩余次数", "requestId", c.GetString("requestId"), "groupId", groupId)
		res, err := ll.CallAPI("/get_group_at_all_remain", map[string]interface{}{
			"group_id": groupId,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 群打卡
	r.POST("/:groupId/sign", func(c *gin.Context) {
		groupId := c.Param("groupId")
		logger.Infow("群打卡", "requestId", c.GetString("requestId"), "groupId", groupId)
		res, err := ll.CallAPI("/send_group_sign", map[string]interface{}{
			"group_id": groupId,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 设置群消息接收方式
	r.POST("/:groupId/msg-mask", func(c *gin.Context) {
		groupId := c.Param("groupId")
		var body struct {
			Mask int `json:"mask"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		logger.Infow("设置群消息接收方式", "requestId", c.GetString("requestId"), "groupId", groupId, "mask", body.Mask)
		res, err := ll.CallAPI("/set_group_msg_mask", map[string]interface{}{
			"group_id": groupId,
			"mask":     body.Mask,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 设置群备注
	r.PUT("/:groupId/remark", func(c *gin.Context) {
		groupId := c.Param("groupId")
		var body struct {
			Remark string `json:"remark"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.Remark == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填参数: remark"})
			return
		}
		logger.Infow("设置群备注", "requestId", c.GetString("requestId"), "groupId", groupId, "remark", body.Remark)
		res, err := ll.CallAPI("/set_group_remark", map[string]interface{}{
			"group_id": groupId,
			"remark":   body.Remark,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 获取已过滤的加群通知
	r.GET("/:groupId/ignore-add-request", func(c *gin.Context) {
		groupId := c.Param("groupId")
		logger.Infow("获取已过滤的加群通知", "requestId", c.GetString("requestId"), "groupId", groupId)
		res, err := ll.CallAPI("/get_group_ignore_add_request", map[string]interface{}{
			"group_id": groupId,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 发送群JSON卡片
	r.POST("/:groupId/json-card", func(c *gin.Context) {
		groupId := c.Param("groupId")
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		logger.Infow("发送群JSON卡片", "requestId", c.GetString("requestId"), "groupId", groupId)
		res, err := ll.CallAPI("/send_group_json_card", map[string]interface{}{
			"group_id": groupId,
			"card":     body,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})
}
