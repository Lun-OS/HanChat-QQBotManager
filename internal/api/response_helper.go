package api

import (
	"github.com/gin-gonic/gin"
	"HanChat-QQBotManager/internal/utils"
)

// extractData 安全地从API响应中提取data字段
// 如果data字段存在则返回，否则返回整个res
func extractData(res map[string]interface{}) interface{} {
	if data, exists := res["data"]; exists {
		return data
	}
	return res
}

// respondWithData 统一的响应处理函数
// 自动提取data字段并返回
func respondWithData(c *gin.Context, res map[string]interface{}) {
	utils.RespondWithData(c, extractData(res))
}

// respondWithDataAndMessage 统一的响应处理函数（带消息）
func respondWithDataAndMessage(c *gin.Context, res map[string]interface{}, message string) {
	utils.SuccessWithMessage(c, message, extractData(res))
}
