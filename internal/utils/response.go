package utils

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// ResponseCode 响应状态码
type ResponseCode int

const (
	CodeSuccess      ResponseCode = 0
	CodeError        ResponseCode = -1
	CodeUnauthorized ResponseCode = 401
	CodeForbidden    ResponseCode = 403
	CodeNotFound     ResponseCode = 404
	CodeBadRequest   ResponseCode = 400
	CodeInternal     ResponseCode = 500
)

// APIResponse 统一API响应结构
type APIResponse struct {
	Status    string      `json:"status"`
	RetCode   int         `json:"retcode"`
	Message   string      `json:"message,omitempty"`
	Data      interface{} `json:"data,omitempty"`
	RequestID string      `json:"requestId,omitempty"`
}

// Success 返回成功响应
func Success(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, APIResponse{
		Status:    "ok",
		RetCode:   int(CodeSuccess),
		Data:      data,
		RequestID: c.GetString("requestId"),
	})
}

// SuccessWithMessage 返回带消息的成功响应
func SuccessWithMessage(c *gin.Context, message string, data interface{}) {
	c.JSON(http.StatusOK, APIResponse{
		Status:    "ok",
		RetCode:   int(CodeSuccess),
		Message:   message,
		Data:      data,
		RequestID: c.GetString("requestId"),
	})
}

// Error 返回错误响应
func Error(c *gin.Context, code ResponseCode, message string) {
	status := http.StatusOK
	switch code {
	case CodeBadRequest:
		status = http.StatusBadRequest
	case CodeUnauthorized:
		status = http.StatusUnauthorized
	case CodeForbidden:
		status = http.StatusForbidden
	case CodeNotFound:
		status = http.StatusNotFound
	case CodeInternal:
		status = http.StatusInternalServerError
	}

	c.JSON(status, APIResponse{
		Status:    "failed",
		RetCode:   int(code),
		Message:   message,
		RequestID: c.GetString("requestId"),
	})
}

// ErrorWithStatus 返回指定HTTP状态码的错误响应
func ErrorWithStatus(c *gin.Context, httpStatus int, code ResponseCode, message string) {
	c.JSON(httpStatus, APIResponse{
		Status:    "failed",
		RetCode:   int(code),
		Message:   message,
		RequestID: c.GetString("requestId"),
	})
}

// BadRequest 返回400错误
func BadRequest(c *gin.Context, message string) {
	ErrorWithStatus(c, http.StatusBadRequest, CodeBadRequest, message)
}

// Unauthorized 返回401错误
func Unauthorized(c *gin.Context, message string) {
	ErrorWithStatus(c, http.StatusUnauthorized, CodeUnauthorized, message)
}

// Forbidden 返回403错误
func Forbidden(c *gin.Context, message string) {
	ErrorWithStatus(c, http.StatusForbidden, CodeForbidden, message)
}

// NotFound 返回404错误
func NotFound(c *gin.Context, message string) {
	ErrorWithStatus(c, http.StatusNotFound, CodeNotFound, message)
}

// InternalError 返回500错误
func InternalError(c *gin.Context, message string) {
	ErrorWithStatus(c, http.StatusInternalServerError, CodeInternal, message)
}

// RespondWithData 兼容旧版响应格式（用于Bot API代理）
func RespondWithData(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"data":      data,
		"requestId": c.GetString("requestId"),
	})
}
