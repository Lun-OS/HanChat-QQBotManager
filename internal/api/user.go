// 用户接口
package api

import (
	"encoding/json"
	"io"
	"net/http"

	"HanChat-QQBotManager/internal/services"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// RegisterUserRoutes 注册用户相关路由
func RegisterUserRoutes(r *gin.RouterGroup, ll *services.LLOneBotService, base *zap.Logger) {
	logger := base.With(zap.String("module", "api.user")).Sugar()

	// 获取登录号信息
	r.GET("/login-info", func(c *gin.Context) {
		logger.Infow("获取登录信息", "requestId", c.GetString("requestId"))
		res, err := ll.GetLoginInfo()
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 获取好友列表
	r.GET("/friends", func(c *gin.Context) {
		logger.Infow("获取好友列表", "requestId", c.GetString("requestId"))
		res, err := ll.GetFriendList()
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 获取好友或群友信息（陌生人信息）
	// 请求体: { "user_id": number }
	r.POST("/stranger-info", func(c *gin.Context) {
		var body map[string]interface{}
		raw, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid request body"})
			return
		}
		if err := json.Unmarshal(raw, &body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid json body"})
			return
		}
		userID := body["user_id"]
		logger.Infow("获取陌生人信息", "requestId", c.GetString("requestId"), "userId", userID)
		res, err := ll.GetStrangerInfo(userID)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 删除好友（与上游为 POST /delete_friend 对齐，但本地语义更清晰）
	r.DELETE("/friend/:userId", func(c *gin.Context) {
		userId := c.Param("userId")
		logger.Infow("删除好友", "requestId", c.GetString("requestId"), "userId", userId)
		res, err := ll.DeleteFriend(userId)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 点赞好友
	r.POST("/like", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		userID := body["user_id"]
		times := body["times"]
		if times == nil {
			times = 1
		}
		// 验证times参数范围（1-10）
		timesNum, ok := times.(float64)
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "times参数必须是数字"})
			return
		}
		if timesNum < 1 || timesNum > 10 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "times参数必须在1-10之间"})
			return
		}
		logger.Infow("点赞好友", "requestId", c.GetString("requestId"), "userId", userID, "times", times)
		res, err := ll.CallAPI("/send_like", map[string]interface{}{
			"user_id": userID,
			"times":   times,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 获取好友列表（带分组）
	r.GET("/friends-with-category", func(c *gin.Context) {
		logger.Infow("获取好友列表（带分组）", "requestId", c.GetString("requestId"))
		res, err := ll.CallAPI("/get_friends_with_category", nil, "GET")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 处理好友申请
	r.POST("/friend-add-request", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		flag := body["flag"]
		approve := body["approve"]
		remark := body["remark"]
		logger.Infow("处理好友申请", "requestId", c.GetString("requestId"), "flag", flag, "approve", approve)
		res, err := ll.CallAPI("/set_friend_add_request", map[string]interface{}{
			"flag":    flag,
			"approve": approve,
			"remark":  remark,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 设置好友备注
	r.PUT("/friend/:userId/remark", func(c *gin.Context) {
		userId := c.Param("userId")
		var body struct {
			Remark string `json:"remark"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		logger.Infow("设置好友备注", "requestId", c.GetString("requestId"), "userId", userId, "remark", body.Remark)
		res, err := ll.CallAPI("/set_friend_remark", map[string]interface{}{
			"user_id": userId,
			"remark":  body.Remark,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 好友戳一戳
	r.POST("/poke", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		userID := body["userId"]
		if userID == nil {
			userID = body["user_id"]
		}
		targetID := body["target_id"]
		logger.Infow("好友戳一戳", "requestId", c.GetString("requestId"), "userId", userID, "targetId", targetID)
		res, err := ll.FriendPoke(userID, targetID)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 好友戳一戳 - 符合 OneBot 标准 API
	r.POST("/friend_poke", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		userID := body["user_id"]
		targetID := body["target_id"]
		logger.Infow("好友戳一戳", "requestId", c.GetString("requestId"), "userId", userID, "targetId", targetID)
		res, err := ll.FriendPoke(userID, targetID)
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 我赞过谁列表
	r.POST("/profile-like", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		start := body["start"]
		count := body["count"]
		logger.Infow("获取我赞过谁列表", "requestId", c.GetString("requestId"), "start", start, "count", count)
		res, err := ll.CallAPI("/get_profile_like", map[string]interface{}{
			"start": start,
			"count": count,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 谁赞过我列表
	r.POST("/profile-like-me", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		start := body["start"]
		count := body["count"]
		logger.Infow("获取谁赞过我列表", "requestId", c.GetString("requestId"), "start", start, "count", count)
		res, err := ll.CallAPI("/get_profile_like_me", map[string]interface{}{
			"start": start,
			"count": count,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 设置头像
	r.POST("/avatar", func(c *gin.Context) {
		var body struct {
			File string `json:"file"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.File == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填参数: file"})
			return
		}
		logger.Infow("设置头像", "requestId", c.GetString("requestId"))
		res, err := ll.CallAPI("/set_qq_avatar", map[string]interface{}{
			"file": body.File,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 获取头像
	r.GET("/avatar/:userId", func(c *gin.Context) {
		userId := c.Param("userId")
		format := c.Query("format")
		if format == "" {
			format = "http"
		}
		logger.Infow("获取头像", "requestId", c.GetString("requestId"), "userId", userId, "format", format)
		res, err := ll.CallAPI("/get_qq_avatar", map[string]interface{}{
			"user_id": userId,
			"format":  format,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 获取官方机器人QQ号范围
	r.GET("/robot-uin-range", func(c *gin.Context) {
		logger.Infow("获取官方机器人QQ号范围", "requestId", c.GetString("requestId"))
		res, err := ll.CallAPI("/get_robot_uin_range", nil, "GET")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 移动好友分组
	r.POST("/friend/:userId/category", func(c *gin.Context) {
		userId := c.Param("userId")
		var body struct {
			CategoryId int `json:"categoryId"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		logger.Infow("移动好友分组", "requestId", c.GetString("requestId"), "userId", userId, "categoryId", body.CategoryId)
		res, err := ll.CallAPI("/set_friend_category", map[string]interface{}{
			"user_id":     userId,
			"category_id": body.CategoryId,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 获取被过滤好友请求
	r.POST("/doubt-friends-add-request", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		count := body["count"]
		if count == nil {
			count = 50
		}
		logger.Infow("获取被过滤好友请求", "requestId", c.GetString("requestId"), "count", count)
		res, err := ll.CallAPI("/get_doubt_friends_add_request", map[string]interface{}{
			"count": count,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})

	// 处理被过滤好友请求
	r.POST("/doubt-friends-add-request/handle", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}
		flag := body["flag"]
		logger.Infow("处理被过滤好友请求", "requestId", c.GetString("requestId"), "flag", flag)
		res, err := ll.CallAPI("/set_doubt_friends_add_request", map[string]interface{}{
			"flag": flag,
		}, "POST")
		if err != nil {
			c.Error(err)
			c.Status(http.StatusBadGateway)
			return
		}
		respondWithData(c, res)
	})
}
