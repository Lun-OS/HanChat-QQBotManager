package services

// WSResponse WebSocket响应结构
type WSResponse struct {
	Echo   string `json:"echo,omitempty"`
	Status string `json:"status,omitempty"`
	Data   []byte `json:"-"`
}

// WSError WebSocket错误类型
type WSError struct {
	Code    int
	Message string
}

func (e *WSError) Error() string {
	return e.Message
}

// 错误码定义
const (
	WSErrConnectionFailed = iota + 1
	WSErrSendFailed
	WSErrTimeout
	WSErrInvalidResponse
)
