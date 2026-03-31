// Database models for OneBot 11 events and message segments
package models

import "encoding/json"

type PostType string

const (
	PostTypeMessage       PostType = "message"
	PostTypeMessageSent   PostType = "message_sent"
	PostTypeNotice        PostType = "notice"
	PostTypeRequest       PostType = "request"
	PostTypeMetaEvent     PostType = "meta_event"
)

type NoticeType string

const (
	NoticeTypeFriendRecall    NoticeType = "friend_recall"
	NoticeTypeFriendAdd       NoticeType = "friend_add"
	NoticeTypeGroupUpload     NoticeType = "group_upload"
	NoticeTypeGroupAdmin      NoticeType = "group_admin"
	NoticeTypeGroupDecrease   NoticeType = "group_decrease"
	NoticeTypeGroupIncrease   NoticeType = "group_increase"
	NoticeTypeGroupBan        NoticeType = "group_ban"
	NoticeTypeGroupRecall     NoticeType = "group_recall"
	NoticeTypeGroupCard       NoticeType = "group_card"
	NoticeTypeEssence         NoticeType = "essence"
	NoticeTypeFlashFile       NoticeType = "flash_file"
	NoticeTypeGroupMsgEmojiLike NoticeType = "group_msg_emoji_like"
	NoticeTypeNotify          NoticeType = "notify"
	NoticeTypeGroupDismiss    NoticeType = "group_dismiss"
)

type MetaEventType string

const (
	MetaEventTypeHeartbeat MetaEventType = "heartbeat"
	MetaEventTypeLifecycle  MetaEventType = "lifecycle"
)

type RequestType string

const (
	RequestTypeFriend RequestType = "friend"
	RequestTypeGroup  RequestType = "group"
)

type MessageType string

const (
	MessageTypePrivate MessageType = "private"
	MessageTypeGroup   MessageType = "group"
)

type SubType string

const (
	SubTypeFriend      SubType = "friend"
	SubTypeGroup       SubType = "group"
	SubTypeNormal      SubType = "normal"
	SubTypeApprove     SubType = "approve"
	SubTypeInvite      SubType = "invite"
	SubTypeAdd         SubType = "add"
	SubTypeSet         SubType = "set"
	SubTypeUnset       SubType = "unset"
	SubTypeLeave       SubType = "leave"
	SubTypeKick        SubType = "kick"
	SubTypeKickMe      SubType = "kick_me"
	SubTypeBan         SubType = "ban"
	SubTypeLiftBan     SubType = "lift_ban"
	SubTypeEnable      SubType = "enable"
	SubTypeDisable     SubType = "disable"
	SubTypeConnect     SubType = "connect"
	SubTypePoke        SubType = "poke"
	SubTypePokeRecall  SubType = "poke_recall"
	SubTypeProfileLike  SubType = "profile_like"
	SubTypeTitle       SubType = "title"
)

type Sex string

const (
	SexMale    Sex = "male"
	SexFemale  Sex = "female"
	SexUnknown Sex = "unknown"
)

type Role string

const (
	RoleOwner  Role = "owner"
	RoleAdmin  Role = "admin"
	RoleMember Role = "member"
)

type SenderRole string

const (
	SenderRoleOwner  SenderRole = "owner"
	SenderRoleAdmin  SenderRole = "admin"
	SenderRoleMember SenderRole = "member"
)

type MusicPlatformType string

const (
	MusicPlatformQQ     MusicPlatformType = "qq"
	MusicPlatform163    MusicPlatformType = "163"
	MusicPlatformXM     MusicPlatformType = "xm"
	MusicPlatformCustom MusicPlatformType = "custom"
)

type ContactType string

const (
	ContactTypeQQ    ContactType = "qq"
	ContactTypeGroup ContactType = "group"
)

type ImageType string

const (
	ImageTypeFlash ImageType = "flash"
	ImageTypeShow  ImageType = "show"
)

type MessageFormat string

const (
	MessageFormatArray  MessageFormat = "array"
	MessageFormatString MessageFormat = "string"
)

type TempSource int

const (
	TempSourceGroupChat TempSource = 0
)

type KeyboardButtonPermission struct {
	Type             int      `json:"type"`
	SpecifyRoleIDs   []string `json:"specify_role_ids"`
	SpecifyUserIDs   []string `json:"specify_user_ids"`
}

type KeyboardButtonRenderData struct {
	Label        string `json:"label"`
	VisitedLabel string `json:"visited_label"`
	Style        int    `json:"style"`
}

type KeyboardButtonAction struct {
	Type            int                            `json:"type"`
	Permission      KeyboardButtonPermission       `json:"permission"`
	UnsupportTips   string                         `json:"unsupport_tips"`
	Data            string                         `json:"data"`
	Reply           bool                           `json:"reply"`
	Enter           bool                           `json:"enter"`
}

type KeyboardButton struct {
	ID         string                   `json:"id"`
	RenderData KeyboardButtonRenderData `json:"render_data"`
	Action     KeyboardButtonAction     `json:"action"`
}

type KeyboardSegmentData struct {
	Rows []struct {
		Buttons []KeyboardButton `json:"buttons"`
	} `json:"rows"`
}

type ShakeSegmentData struct{}

type ContactSegmentData struct {
	Type ContactType `json:"type"`
	ID   string      `json:"id"`
}

type RpsSegmentData struct {
	Result interface{} `json:"result"`
}

type DiceSegmentData struct {
	Result interface{} `json:"result"`
}

type PokeSegmentData struct {
	QQ interface{} `json:"qq,omitempty"`
	ID interface{} `json:"id,omitempty"`
}

type MusicSegmentData struct {
	Type   MusicPlatformType `json:"type,omitempty"`
	ID     string            `json:"id,omitempty"`
	URL    string            `json:"url,omitempty"`
	Audio  string            `json:"audio,omitempty"`
	Title  string            `json:"title,omitempty"`
	Content string           `json:"content,omitempty"`
	Image  string            `json:"image,omitempty"`
}

type ForwardSegmentData struct {
	ID string `json:"id"`
}

type NodeSegmentData struct {
	ID       interface{} `json:"id,omitempty"`
	Content  interface{} `json:"content,omitempty"`
	UserID   int64      `json:"user_id,omitempty"`
	Nickname string      `json:"nickname,omitempty"`
	Name     string      `json:"name,omitempty"`
	Uin      interface{} `json:"uin,omitempty"`
}

type MarkdownSegmentData struct {
	Content string `json:"content"`
}

type MfaceSegmentData struct {
	EmojiPackageID int    `json:"emoji_package_id"`
	EmojiID        string `json:"emoji_id"`
	Key            string `json:"key"`
	Summary         string `json:"summary,omitempty"`
	URL             string `json:"url,omitempty"`
}

type FaceSegmentData struct {
	ID string `json:"id"`
}

type XmlSegmentData struct {
	Data string `json:"data"`
}

type JsonSegmentData struct {
	Data string `json:"data"`
}

type ReplySegmentData struct {
	ID interface{} `json:"id"`
}

type AtSegmentData struct {
	QQ  interface{} `json:"qq"`
	Name string     `json:"name,omitempty"`
}

type FlashFileSegmentData struct {
	Title      string `json:"title"`
	FileSetID  string `json:"file_set_id"`
	SceneType  int    `json:"scene_type"`
}

type FileSegmentData struct {
	File     string `json:"file,omitempty"`
	URL      string `json:"url,omitempty"`
	Path     string `json:"path,omitempty"`
	FileSize string `json:"file_size,omitempty"`
	FileID   string `json:"file_id,omitempty"`
	Thumb    string `json:"thumb,omitempty"`
	Name     string `json:"name,omitempty"`
}

type RecordSegmentData struct {
	File     string `json:"file,omitempty"`
	URL      string `json:"url,omitempty"`
	Path     string `json:"path,omitempty"`
	FileSize string `json:"file_size,omitempty"`
	Thumb    string `json:"thumb,omitempty"`
	Name     string `json:"name,omitempty"`
}

type VideoSegmentData struct {
	File     string `json:"file,omitempty"`
	URL      string `json:"url,omitempty"`
	Path     string `json:"path,omitempty"`
	FileSize string `json:"file_size,omitempty"`
	Thumb    string `json:"thumb,omitempty"`
	Name     string `json:"name,omitempty"`
}

type ImageSegmentData struct {
	File     string    `json:"file,omitempty"`
	URL      string    `json:"url,omitempty"`
	FileSize string    `json:"file_size,omitempty"`
	Summary  string    `json:"summary,omitempty"`
	SubType  int       `json:"subType,omitempty"`
	Type     ImageType `json:"type,omitempty"`
	Thumb    string    `json:"thumb,omitempty"`
	Name     string    `json:"name,omitempty"`
}

type TextSegmentData struct {
	Text string `json:"text"`
}

type MessageSender struct {
	UserID  int64       `json:"user_id"`
	Nickname string      `json:"nickname"`
	Card    string      `json:"card,omitempty"`
	Sex     Sex         `json:"sex,omitempty"`
	Age     int         `json:"age,omitempty"`
	Level   string      `json:"level,omitempty"`
	Role    SenderRole  `json:"role,omitempty"`
	Title   string      `json:"title,omitempty"`
	GroupID int64       `json:"group_id,omitempty"`
}

type GroupUploadFile struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Size int64  `json:"size"`
	BusID int   `json:"busid"`
}

type MsgEmojiLike struct {
	EmojiID string `json:"emoji_id"`
	Count   int    `json:"count"`
}

type FlashFile struct {
	Name string `json:"name"`
	Size int64  `json:"size"`
	Path string `json:"path,omitempty"`
}

type FileEntity struct {
	GroupID       int64  `json:"group_id"`
	FileID        string `json:"file_id"`
	FileName      string `json:"file_name"`
	BusID         int    `json:"busid"`
	FileSize      int64  `json:"file_size"`
	UploadTime    int64  `json:"upload_time"`
	DeadTime     int64  `json:"dead_time"`
	ModifyTime    int64  `json:"modify_time"`
	DownloadTimes int    `json:"download_times"`
	Uploader      int64  `json:"uploader"`
	UploaderName  string `json:"uploader_name"`
}

type FolderEntity struct {
	GroupID        int64  `json:"group_id"`
	FolderID       string `json:"folder_id"`
	FolderName     string `json:"folder_name"`
	CreateTime     int64  `json:"create_time"`
	Creator        int64  `json:"creator"`
	CreatorName    string `json:"creator_name"`
	TotalFileCount int    `json:"total_file_count"`
}

type HeartbeatStatus struct {
	Online *bool `json:"online"`
	Good   *bool `json:"good"`
}

type MessageEvent struct {
	Time          int64           `json:"time"`
	SelfID        int64           `json:"self_id"`
	PostType      PostType        `json:"post_type"`
	MessageID     int64           `json:"message_id"`
	MessageSeq    int64           `json:"message_seq"`
	RealID        int64           `json:"real_id,omitempty"`
	UserID        int64           `json:"user_id"`
	GroupID       int64           `json:"group_id,omitempty"`
	MessageType   MessageType     `json:"message_type"`
	SubType       SubType         `json:"sub_type,omitempty"`
	Sender        MessageSender   `json:"sender"`
	Message       json.RawMessage `json:"message"`
	MessageFormat MessageFormat   `json:"message_format"`
	RawMessage    string          `json:"raw_message"`
	Font          int             `json:"font"`
	TargetID      int64           `json:"target_id,omitempty"`
	TempSource    TempSource      `json:"temp_source,omitempty"`
}

type PokeEvent struct {
	Time      int64      `json:"time"`
	SelfID    int64      `json:"self_id"`
	PostType  PostType   `json:"post_type"`
	NoticeType NoticeType `json:"notice_type"`
	SubType   SubType    `json:"sub_type"`
	UserID    int64      `json:"user_id"`
	TargetID  int64      `json:"target_id"`
	GroupID   int64      `json:"group_id,omitempty"`
	RawInfo   string     `json:"raw_info,omitempty"`
}

type FriendRecallNoticeEvent struct {
	Time       int64      `json:"time"`
	SelfID     int64      `json:"self_id"`
	PostType   PostType   `json:"post_type"`
	NoticeType NoticeType `json:"notice_type"`
	UserID    int64      `json:"user_id"`
	MessageID int64      `json:"message_id"`
}

type FriendRequestEvent struct {
	Time         int64       `json:"time"`
	SelfID       int64       `json:"self_id"`
	PostType     PostType    `json:"post_type"`
	RequestType  RequestType `json:"request_type"`
	UserID       int64       `json:"user_id"`
	Comment      string      `json:"comment"`
	Flag         string      `json:"flag"`
	Via          string      `json:"via"`
}

type FriendAddNoticeEvent struct {
	Time       int64      `json:"time"`
	SelfID     int64      `json:"self_id"`
	PostType   PostType   `json:"post_type"`
	NoticeType NoticeType `json:"notice_type"`
	UserID    int64      `json:"user_id"`
}

type ProfileLikeEvent struct {
	Time         int64      `json:"time"`
	SelfID       int64      `json:"self_id"`
	PostType     PostType   `json:"post_type"`
	NoticeType   NoticeType `json:"notice_type"`
	SubType      SubType    `json:"sub_type"`
	OperatorID   int64      `json:"operator_id"`
	OperatorNick string     `json:"operator_nick"`
	Times        int        `json:"times"`
}

type GroupUploadNoticeEvent struct {
	Time       int64            `json:"time"`
	SelfID     int64            `json:"self_id"`
	PostType   PostType         `json:"post_type"`
	NoticeType NoticeType       `json:"notice_type"`
	GroupID    int64            `json:"group_id"`
	UserID    int64            `json:"user_id"`
	File       GroupUploadFile  `json:"file"`
}

type GroupRequestEvent struct {
	Time           int64       `json:"time"`
	SelfID         int64       `json:"self_id"`
	PostType       PostType    `json:"post_type"`
	RequestType    RequestType `json:"request_type"`
	SubType        SubType     `json:"sub_type"`
	Comment        string      `json:"comment"`
	Flag           string      `json:"flag"`
	GroupID        int64       `json:"group_id"`
	UserID         int64       `json:"user_id"`
	InvitorID      int64       `json:"invitor_id,omitempty"`
	SourceGroupID  int64       `json:"source_group_id,omitempty"`
}

type HeartbeatEvent struct {
	Time           int64             `json:"time"`
	SelfID         int64             `json:"self_id"`
	PostType       PostType          `json:"post_type"`
	MetaEventType  MetaEventType     `json:"meta_event_type"`
	Status         HeartbeatStatus   `json:"status"`
	Interval       int64             `json:"interval"`
}

type LifeCycleEvent struct {
	Time          int64          `json:"time"`
	SelfID        int64          `json:"self_id"`
	PostType      PostType       `json:"post_type"`
	MetaEventType MetaEventType  `json:"meta_event_type"`
	SubType       SubType        `json:"sub_type"`
}

type GroupAdminNoticeEvent struct {
	Time       int64      `json:"time"`
	SelfID     int64      `json:"self_id"`
	PostType   PostType   `json:"post_type"`
	NoticeType NoticeType `json:"notice_type"`
	SubType    SubType    `json:"sub_type"`
	GroupID    int64      `json:"group_id"`
	UserID    int64      `json:"user_id"`
}

type GroupDecreaseEvent struct {
	Time       int64      `json:"time"`
	SelfID     int64      `json:"self_id"`
	PostType   PostType   `json:"post_type"`
	NoticeType NoticeType `json:"notice_type"`
	SubType    SubType    `json:"sub_type"`
	GroupID    int64      `json:"group_id"`
	UserID    int64      `json:"user_id"`
	OperatorID int64      `json:"operator_id"`
}

type GroupIncreaseEvent struct {
	Time       int64      `json:"time"`
	SelfID     int64      `json:"self_id"`
	PostType   PostType   `json:"post_type"`
	NoticeType NoticeType `json:"notice_type"`
	SubType    SubType    `json:"sub_type"`
	GroupID    int64      `json:"group_id"`
	UserID    int64      `json:"user_id"`
	OperatorID int64      `json:"operator_id"`
}

type GroupBanEvent struct {
	Time       int64      `json:"time"`
	SelfID     int64      `json:"self_id"`
	PostType   PostType   `json:"post_type"`
	NoticeType NoticeType `json:"notice_type"`
	SubType    SubType    `json:"sub_type"`
	GroupID    int64      `json:"group_id"`
	UserID    int64      `json:"user_id"`
	OperatorID int64      `json:"operator_id"`
	Duration   int64      `json:"duration"`
}

type GroupRecallNoticeEvent struct {
	Time       int64      `json:"time"`
	SelfID     int64      `json:"self_id"`
	PostType   PostType   `json:"post_type"`
	NoticeType NoticeType `json:"notice_type"`
	GroupID    int64      `json:"group_id"`
	UserID    int64      `json:"user_id"`
	OperatorID int64      `json:"operator_id"`
	MessageID int64      `json:"message_id"`
}

type GroupCardEvent struct {
	Time       int64      `json:"time"`
	SelfID     int64      `json:"self_id"`
	PostType   PostType   `json:"post_type"`
	NoticeType NoticeType `json:"notice_type"`
	GroupID    int64      `json:"group_id"`
	UserID    int64      `json:"user_id"`
	CardNew   string     `json:"card_new"`
	CardOld   string     `json:"card_old"`
}

type GroupTitleEvent struct {
	Time       int64      `json:"time"`
	SelfID     int64      `json:"self_id"`
	PostType   PostType   `json:"post_type"`
	NoticeType NoticeType `json:"notice_type"`
	SubType    SubType    `json:"sub_type"`
	GroupID    int64      `json:"group_id"`
	UserID    int64      `json:"user_id"`
	Title     string     `json:"title"`
}

type EssenceEvent struct {
	Time       int64      `json:"time"`
	SelfID     int64      `json:"self_id"`
	PostType   PostType   `json:"post_type"`
	NoticeType NoticeType `json:"notice_type"`
	SubType    SubType    `json:"sub_type,omitempty"`
	GroupID    int64      `json:"group_id"`
	UserID    int64      `json:"user_id"`
	SenderID  int64      `json:"sender_id"`
	OperatorID int64      `json:"operator_id"`
	MessageID int64      `json:"message_id"`
}

type FlashFileEvent struct {
	Time           int64      `json:"time"`
	SelfID         int64      `json:"self_id"`
	PostType       PostType   `json:"post_type"`
	NoticeType     NoticeType `json:"notice_type"`
	SubType        string     `json:"sub_type"`
	Title          string     `json:"title"`
	ShareLink      string     `json:"share_link"`
	FileSetID      string     `json:"file_set_id"`
	Files          []FlashFile `json:"files"`
	DownloadedSize int64      `json:"downloaded_size,omitempty"`
	UploadedSize   int64      `json:"uploaded_size,omitempty"`
	TotalSize      int64      `json:"total_size,omitempty"`
	Speed          int64      `json:"speed,omitempty"`
	RemainSeconds  int64      `json:"remain_seconds,omitempty"`
}

type GroupMsgEmojiLikeEvent struct {
	Time       int64          `json:"time"`
	SelfID     int64          `json:"self_id"`
	PostType   PostType       `json:"post_type"`
	NoticeType NoticeType     `json:"notice_type"`
	GroupID    int64          `json:"group_id"`
	UserID    int64          `json:"user_id"`
	MessageID int64          `json:"message_id"`
	Likes     []MsgEmojiLike `json:"likes"`
	IsAdd     bool           `json:"is_add"`
}

type PokeRecallEvent struct {
	Time       int64      `json:"time"`
	SelfID     int64      `json:"self_id"`
	PostType   PostType   `json:"post_type"`
	NoticeType NoticeType `json:"notice_type"`
	SubType    SubType    `json:"sub_type"`
	UserID    int64      `json:"user_id"`
	TargetID  int64      `json:"target_id"`
	GroupID   int64      `json:"group_id,omitempty"`
	RawInfo   string     `json:"raw_info,omitempty"`
}

type GroupDismissEvent struct {
	Time       int64      `json:"time"`
	SelfID     int64      `json:"self_id"`
	PostType   PostType   `json:"post_type"`
	NoticeType NoticeType `json:"notice_type"`
	GroupID    int64      `json:"group_id"`
	UserID    int64      `json:"user_id"`
}

type OneBotEvent struct {
	Time          int64           `json:"time"`
	SelfID        int64           `json:"self_id"`
	PostType      PostType        `json:"post_type"`
	NoticeType    NoticeType      `json:"notice_type,omitempty"`
	MetaEventType MetaEventType  `json:"meta_event_type,omitempty"`
	RequestType   RequestType    `json:"request_type,omitempty"`
	SubType       SubType         `json:"sub_type,omitempty"`
	MessageID     int64           `json:"message_id,omitempty"`
	MessageSeq    int64           `json:"message_seq,omitempty"`
	RealID        int64           `json:"real_id,omitempty"`
	UserID        int64           `json:"user_id,omitempty"`
	GroupID       int64           `json:"group_id,omitempty"`
	MessageType   MessageType     `json:"message_type,omitempty"`
	Sender        *MessageSender `json:"sender,omitempty"`
	Message       json.RawMessage `json:"message,omitempty"`
	MessageFormat MessageFormat   `json:"message_format,omitempty"`
	RawMessage    string          `json:"raw_message,omitempty"`
	Font          int             `json:"font,omitempty"`
	TargetID      int64           `json:"target_id,omitempty"`
	TempSource    TempSource      `json:"temp_source,omitempty"`
	Comment       string          `json:"comment,omitempty"`
	Flag          string          `json:"flag,omitempty"`
	Via           string          `json:"via,omitempty"`
	OperatorID    int64           `json:"operator_id,omitempty"`
	OperatorNick  string          `json:"operator_nick,omitempty"`
	Times         int             `json:"times,omitempty"`
	File          *GroupUploadFile `json:"file,omitempty"`
	InvitorID     int64           `json:"invitor_id,omitempty"`
	SourceGroupID int64           `json:"source_group_id,omitempty"`
	Operator      int64           `json:"operator,omitempty"`
	Duration      int64           `json:"duration,omitempty"`
	CardNew       string          `json:"card_new,omitempty"`
	CardOld       string          `json:"card_old,omitempty"`
	Title         string          `json:"title,omitempty"`
	SenderID      int64           `json:"sender_id,omitempty"`
	Likes         []MsgEmojiLike  `json:"likes,omitempty"`
	IsAdd         bool            `json:"is_add,omitempty"`
	RawInfo       string          `json:"raw_info,omitempty"`
	Status        *HeartbeatStatus `json:"status,omitempty"`
	Interval      int64           `json:"interval,omitempty"`
}
