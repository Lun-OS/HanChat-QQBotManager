// 数据库查询代码
package models

import (
	"time"

	"gorm.io/gorm"
)

// SystemLog 系统日志
type SystemLog struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	Level     string         `gorm:"column:level;type:varchar(20);not null" json:"level"`
	Message   string         `gorm:"column:message;type:text" json:"message"`
	Context   string         `gorm:"column:context;type:text" json:"context"`
	CreatedAt time.Time      `gorm:"column:created_at" json:"createdAt"`
	UpdatedAt time.Time      `gorm:"column:updated_at" json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// PluginConfig 插件配置
type PluginConfig struct {
	ID         uint           `gorm:"primaryKey" json:"id"`
	Name       string         `gorm:"column:name;type:varchar(100);uniqueIndex;not null" json:"name"`
	Lang       string         `gorm:"column:lang;type:varchar(20);not null" json:"lang"`
	Entry      string         `gorm:"column:entry;type:varchar(500);not null" json:"entry"`
	Enabled    bool           `gorm:"column:enabled;default:false" json:"enabled"`
	ConfigJSON string         `gorm:"column:config_json;type:text" json:"configJson"`
	CreatedAt  time.Time      `gorm:"column:created_at" json:"createdAt"`
	UpdatedAt  time.Time      `gorm:"column:updated_at" json:"updatedAt"`
	DeletedAt  gorm.DeletedAt `gorm:"index" json:"-"`
}

// Admin 管理员
type Admin struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	AdminQQ   string         `gorm:"column:qq;type:varchar(20);uniqueIndex;not null" json:"adminQQ"`
	CreatedAt time.Time      `gorm:"column:created_at" json:"createdAt"`
	UpdatedAt time.Time      `gorm:"column:updated_at" json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// AdminToken 管理员令牌
type AdminToken struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	AdminQQ   string         `gorm:"column:admin_qq;type:varchar(20);not null;index" json:"adminQQ"`
	Token     string         `gorm:"column:token;type:varchar(100);uniqueIndex;not null" json:"token"`
	ExpiresAt time.Time      `gorm:"column:expires_at;not null" json:"expiresAt"`
	CreatedAt time.Time      `gorm:"column:created_at" json:"createdAt"`
	UpdatedAt time.Time      `gorm:"column:updated_at" json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// AdminOperation 管理员操作记录
type AdminOperation struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	AdminQQ   string         `gorm:"column:admin_qq;type:varchar(20);not null;index" json:"adminQQ"`
	Action    string         `gorm:"column:action;type:varchar(100);not null" json:"action"`
	Details   string         `gorm:"column:detail;type:text" json:"details"`
	CreatedAt time.Time      `gorm:"column:created_at" json:"createdAt"`
	UpdatedAt time.Time      `gorm:"column:updated_at" json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// FriendRequest 好友请求数据模型
type FriendRequest struct {
	Time          int64  `json:"time"`
	InitiatorID   int64  `json:"initiator_id"`
	InitiatorUID  string `json:"initiator_uid"`
	TargetUserID  int64  `json:"target_user_id"`
	TargetUserUID string `json:"target_user_uid"`
	State         string `json:"state"`
	Comment       string `json:"comment"`
	Via           string `json:"via"`
	IsFiltered    bool   `json:"is_filtered"`
}

// FriendRequestsResponse 好友请求列表响应
type FriendRequestsResponse struct {
	Status  string `json:"status"`
	Retcode int    `json:"retcode"`
	Data    struct {
		Requests []FriendRequest `json:"requests"`
	} `json:"data"`
	Message string `json:"message,omitempty"`
}

// GroupNotification 群通知数据模型
type GroupNotification struct {
	Type            string `json:"type"`
	GroupID         int64  `json:"group_id"`
	NotificationSeq int64  `json:"notification_seq"`
	IsFiltered      bool   `json:"is_filtered"`
	InitiatorID     int64  `json:"initiator_id"`
	State           string `json:"state"`
	OperatorID      int64  `json:"operator_id"`
	Comment         string `json:"comment"`
}

// GroupNotificationsResponse 群通知列表响应
type GroupNotificationsResponse struct {
	Status  string `json:"status"`
	Retcode int    `json:"retcode"`
	Data    struct {
		Notifications       []GroupNotification `json:"notifications"`
		NextNotificationSeq *int64              `json:"next_notification_seq"`
	} `json:"data"`
	Message string `json:"message,omitempty"`
}

// CommonResponse 通用响应结构
type CommonResponse struct {
	Status  string      `json:"status"`
	Retcode int         `json:"retcode"`
	Data    interface{} `json:"data"`
	Message string      `json:"message,omitempty"`
}

// AcceptFriendRequestRequest 同意好友请求请求
type AcceptFriendRequestRequest struct {
	InitiatorUID string `json:"initiator_uid" binding:"required"`
	IsFiltered   bool   `json:"is_filtered"`
}

// RejectFriendRequestRequest 拒绝好友请求请求
type RejectFriendRequestRequest struct {
	InitiatorUID string `json:"initiator_uid" binding:"required"`
	IsFiltered   bool   `json:"is_filtered"`
	Reason       string `json:"reason"`
}

// AcceptGroupRequestRequest 同意入群请求请求
type AcceptGroupRequestRequest struct {
	NotificationSeq  int64  `json:"notification_seq" binding:"required"`
	NotificationType string `json:"notification_type" binding:"required"`
	GroupID          int64  `json:"group_id" binding:"required"`
	IsFiltered       bool   `json:"is_filtered"`
}

// RejectGroupRequestRequest 拒绝入群请求请求
type RejectGroupRequestRequest struct {
	NotificationSeq  int64  `json:"notification_seq" binding:"required"`
	NotificationType string `json:"notification_type" binding:"required"`
	GroupID          int64  `json:"group_id" binding:"required"`
	IsFiltered       bool   `json:"is_filtered"`
	Reason           string `json:"reason"`
}

// AcceptGroupInvitationRequest 同意群邀请请求
type AcceptGroupInvitationRequest struct {
	GroupID       int64 `json:"group_id" binding:"required"`
	InvitationSeq int64 `json:"invitation_seq" binding:"required"`
}

// RejectGroupInvitationRequest 拒绝群邀请请求
type RejectGroupInvitationRequest struct {
	GroupID       int64 `json:"group_id" binding:"required"`
	InvitationSeq int64 `json:"invitation_seq" binding:"required"`
}
