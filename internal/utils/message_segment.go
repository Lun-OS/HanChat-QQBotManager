package utils

import (
	"encoding/json"
	"fmt"
)

type SegmentType string

const (
	SegmentTypeText       SegmentType = "text"
	SegmentTypeImage      SegmentType = "image"
	SegmentTypeMusic      SegmentType = "music"
	SegmentTypeVideo      SegmentType = "video"
	SegmentTypeRecord     SegmentType = "record"
	SegmentTypeFile       SegmentType = "file"
	SegmentTypeFlashFile  SegmentType = "flash_file"
	SegmentTypeAt         SegmentType = "at"
	SegmentTypeReply      SegmentType = "reply"
	SegmentTypeJson       SegmentType = "json"
	SegmentTypeFace       SegmentType = "face"
	SegmentTypeMface      SegmentType = "mface"
	SegmentTypeMarkdown   SegmentType = "markdown"
	SegmentTypeNode      SegmentType = "node"
	SegmentTypeForward    SegmentType = "forward"
	SegmentTypeXml        SegmentType = "xml"
	SegmentTypePoke       SegmentType = "poke"
	SegmentTypeDice       SegmentType = "dice"
	SegmentTypeRps        SegmentType = "rps"
	SegmentTypeContact    SegmentType = "contact"
	SegmentTypeShake      SegmentType = "shake"
	SegmentTypeKeyboard   SegmentType = "keyboard"
)

type MessageSegment struct {
	Type SegmentType     `json:"type"`
	Data json.RawMessage `json:"data"`
}

type TextData struct {
	Text string `json:"text"`
}

type ImageData struct {
	File     string `json:"file,omitempty"`
	URL      string `json:"url,omitempty"`
	FileSize string `json:"file_size,omitempty"`
	Summary  string `json:"summary,omitempty"`
	SubType  int    `json:"subType,omitempty"`
	Type     string `json:"type,omitempty"`
	Thumb    string `json:"thumb,omitempty"`
	Name     string `json:"name,omitempty"`
}

type VideoData struct {
	File     string `json:"file,omitempty"`
	URL      string `json:"url,omitempty"`
	Path     string `json:"path,omitempty"`
	FileSize string `json:"file_size,omitempty"`
	Thumb    string `json:"thumb,omitempty"`
	Name     string `json:"name,omitempty"`
}

type RecordData struct {
	File     string `json:"file,omitempty"`
	URL      string `json:"url,omitempty"`
	Path     string `json:"path,omitempty"`
	FileSize string `json:"file_size,omitempty"`
	Thumb    string `json:"thumb,omitempty"`
	Name     string `json:"name,omitempty"`
}

type FileData struct {
	File     string `json:"file,omitempty"`
	URL      string `json:"url,omitempty"`
	Path     string `json:"path,omitempty"`
	FileSize string `json:"file_size,omitempty"`
	FileID   string `json:"file_id,omitempty"`
	Thumb    string `json:"thumb,omitempty"`
	Name     string `json:"name,omitempty"`
}

type AtData struct {
	QQ  interface{} `json:"qq"`
	Name string     `json:"name,omitempty"`
}

type ReplyData struct {
	ID interface{} `json:"id"`
}

type FaceData struct {
	ID string `json:"id"`
}

type MfaceData struct {
	EmojiPackageID int    `json:"emoji_package_id"`
	EmojiID        string `json:"emoji_id"`
	Key            string `json:"key"`
	Summary        string `json:"summary,omitempty"`
	URL            string `json:"url,omitempty"`
}

type MusicData struct {
	Type    string `json:"type,omitempty"`
	ID      string `json:"id,omitempty"`
	URL     string `json:"url,omitempty"`
	Audio   string `json:"audio,omitempty"`
	Title   string `json:"title,omitempty"`
	Content string `json:"content,omitempty"`
	Image   string `json:"image,omitempty"`
}

type JsonData struct {
	Data string `json:"data"`
}

type XmlData struct {
	Data string `json:"data"`
}

type MarkdownData struct {
	Content string `json:"content"`
}

type PokeData struct {
	QQ interface{} `json:"qq,omitempty"`
	ID interface{} `json:"id,omitempty"`
}

type DiceData struct {
	Result interface{} `json:"result"`
}

type RpsData struct {
	Result interface{} `json:"result"`
}

type ContactData struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}

type ShakeData struct{}

type ForwardData struct {
	ID string `json:"id"`
}

type NodeData struct {
	ID       interface{} `json:"id,omitempty"`
	Content  interface{} `json:"content,omitempty"`
	UserID   int64       `json:"user_id,omitempty"`
	Nickname string      `json:"nickname,omitempty"`
	Name     string      `json:"name,omitempty"`
	Uin      interface{} `json:"uin,omitempty"`
}

type KeyboardButtonPermission struct {
	Type           int      `json:"type"`
	SpecifyRoleIDs []string `json:"specify_role_ids"`
	SpecifyUserIDs []string `json:"specify_user_ids"`
}

type KeyboardButtonRenderData struct {
	Label        string `json:"label"`
	VisitedLabel string `json:"visited_label"`
	Style        int    `json:"style"`
}

type KeyboardButtonAction struct {
	Type           int                           `json:"type"`
	Permission     KeyboardButtonPermission      `json:"permission"`
	UnsupportTips string                         `json:"unsupport_tips"`
	Data           string                         `json:"data"`
	Reply          bool                           `json:"reply"`
	Enter          bool                           `json:"enter"`
}

type KeyboardButton struct {
	ID         string                    `json:"id"`
	RenderData KeyboardButtonRenderData `json:"render_data"`
	Action     KeyboardButtonAction      `json:"action"`
}

type KeyboardData struct {
	Rows []struct {
		Buttons []KeyboardButton `json:"buttons"`
	} `json:"rows"`
}

type FlashFileData struct {
	Title     string `json:"title"`
	FileSetID string `json:"file_set_id"`
	SceneType int    `json:"scene_type"`
}

func ParseMessageSegments(data json.RawMessage) ([]MessageSegment, error) {
	var segments []MessageSegment
	if err := json.Unmarshal(data, &segments); err != nil {
		return nil, fmt.Errorf("解析消息段失败: %w", err)
	}
	return segments, nil
}

func ParseTextSegment(segment MessageSegment) (*TextData, error) {
	var text TextData
	if err := json.Unmarshal(segment.Data, &text); err != nil {
		return nil, fmt.Errorf("解析文本段失败: %w", err)
	}
	return &text, nil
}

func ParseImageSegment(segment MessageSegment) (*ImageData, error) {
	var image ImageData
	if err := json.Unmarshal(segment.Data, &image); err != nil {
		return nil, fmt.Errorf("解析图片段失败: %w", err)
	}
	return &image, nil
}

func ParseVideoSegment(segment MessageSegment) (*VideoData, error) {
	var video VideoData
	if err := json.Unmarshal(segment.Data, &video); err != nil {
		return nil, fmt.Errorf("解析视频段失败: %w", err)
	}
	return &video, nil
}

func ParseRecordSegment(segment MessageSegment) (*RecordData, error) {
	var record RecordData
	if err := json.Unmarshal(segment.Data, &record); err != nil {
		return nil, fmt.Errorf("解析语音段失败: %w", err)
	}
	return &record, nil
}

func ParseFileSegment(segment MessageSegment) (*FileData, error) {
	var file FileData
	if err := json.Unmarshal(segment.Data, &file); err != nil {
		return nil, fmt.Errorf("解析文件段失败: %w", err)
	}
	return &file, nil
}

func ParseAtSegment(segment MessageSegment) (*AtData, error) {
	var at AtData
	if err := json.Unmarshal(segment.Data, &at); err != nil {
		return nil, fmt.Errorf("解析@段失败: %w", err)
	}
	return &at, nil
}

func ParseReplySegment(segment MessageSegment) (*ReplyData, error) {
	var reply ReplyData
	if err := json.Unmarshal(segment.Data, &reply); err != nil {
		return nil, fmt.Errorf("解析回复段失败: %w", err)
	}
	return &reply, nil
}

func ParseFaceSegment(segment MessageSegment) (*FaceData, error) {
	var face FaceData
	if err := json.Unmarshal(segment.Data, &face); err != nil {
		return nil, fmt.Errorf("解析表情段失败: %w", err)
	}
	return &face, nil
}

func ParseMfaceSegment(segment MessageSegment) (*MfaceData, error) {
	var mface MfaceData
	if err := json.Unmarshal(segment.Data, &mface); err != nil {
		return nil, fmt.Errorf("解析商城表情段失败: %w", err)
	}
	return &mface, nil
}

func ParseMusicSegment(segment MessageSegment) (*MusicData, error) {
	var music MusicData
	if err := json.Unmarshal(segment.Data, &music); err != nil {
		return nil, fmt.Errorf("解析音乐段失败: %w", err)
	}
	return &music, nil
}

func ParseJsonSegment(segment MessageSegment) (*JsonData, error) {
	var jsonData JsonData
	if err := json.Unmarshal(segment.Data, &jsonData); err != nil {
		return nil, fmt.Errorf("解析JSON段失败: %w", err)
	}
	return &jsonData, nil
}

func ParseXmlSegment(segment MessageSegment) (*XmlData, error) {
	var xmlData XmlData
	if err := json.Unmarshal(segment.Data, &xmlData); err != nil {
		return nil, fmt.Errorf("解析XML段失败: %w", err)
	}
	return &xmlData, nil
}

func ParseMarkdownSegment(segment MessageSegment) (*MarkdownData, error) {
	var markdown MarkdownData
	if err := json.Unmarshal(segment.Data, &markdown); err != nil {
		return nil, fmt.Errorf("解析Markdown段失败: %w", err)
	}
	return &markdown, nil
}

func ParsePokeSegment(segment MessageSegment) (*PokeData, error) {
	var poke PokeData
	if err := json.Unmarshal(segment.Data, &poke); err != nil {
		return nil, fmt.Errorf("解析戳一戳段失败: %w", err)
	}
	return &poke, nil
}

func ParseDiceSegment(segment MessageSegment) (*DiceData, error) {
	var dice DiceData
	if err := json.Unmarshal(segment.Data, &dice); err != nil {
		return nil, fmt.Errorf("解析骰子段失败: %w", err)
	}
	return &dice, nil
}

func ParseRpsSegment(segment MessageSegment) (*RpsData, error) {
	var rps RpsData
	if err := json.Unmarshal(segment.Data, &rps); err != nil {
		return nil, fmt.Errorf("解析猜拳段失败: %w", err)
	}
	return &rps, nil
}

func ParseContactSegment(segment MessageSegment) (*ContactData, error) {
	var contact ContactData
	if err := json.Unmarshal(segment.Data, &contact); err != nil {
		return nil, fmt.Errorf("解析联系人段失败: %w", err)
	}
	return &contact, nil
}

func ParseShakeSegment(segment MessageSegment) (*ShakeData, error) {
	var shake ShakeData
	if err := json.Unmarshal(segment.Data, &shake); err != nil {
		return nil, fmt.Errorf("解析窗口抖动段失败: %w", err)
	}
	return &shake, nil
}

func ParseForwardSegment(segment MessageSegment) (*ForwardData, error) {
	var forward ForwardData
	if err := json.Unmarshal(segment.Data, &forward); err != nil {
		return nil, fmt.Errorf("解析转发段失败: %w", err)
	}
	return &forward, nil
}

func ParseNodeSegment(segment MessageSegment) (*NodeData, error) {
	var node NodeData
	if err := json.Unmarshal(segment.Data, &node); err != nil {
		return nil, fmt.Errorf("解析节点段失败: %w", err)
	}
	return &node, nil
}

func ParseKeyboardSegment(segment MessageSegment) (*KeyboardData, error) {
	var keyboard KeyboardData
	if err := json.Unmarshal(segment.Data, &keyboard); err != nil {
		return nil, fmt.Errorf("解析键盘段失败: %w", err)
	}
	return &keyboard, nil
}

func ParseFlashFileSegment(segment MessageSegment) (*FlashFileData, error) {
	var flashFile FlashFileData
	if err := json.Unmarshal(segment.Data, &flashFile); err != nil {
		return nil, fmt.Errorf("解析闪传文件段失败: %w", err)
	}
	return &flashFile, nil
}

func GetSegmentText(segment MessageSegment) (string, bool) {
	if segment.Type != SegmentTypeText {
		return "", false
	}
	var text TextData
	if err := json.Unmarshal(segment.Data, &text); err != nil {
		return "", false
	}
	return text.Text, true
}

func GetSegmentQQFromAt(segment MessageSegment) (string, bool) {
	if segment.Type != SegmentTypeAt {
		return "", false
	}
	var at AtData
	if err := json.Unmarshal(segment.Data, &at); err != nil {
		return "", false
	}
	if qq, ok := at.QQ.(string); ok {
		return qq, true
	}
	return "", false
}

func IsAtAll(segment MessageSegment) bool {
	if segment.Type != SegmentTypeAt {
		return false
	}
	var at AtData
	if err := json.Unmarshal(segment.Data, &at); err != nil {
		return false
	}
	if qq, ok := at.QQ.(string); ok && qq == "all" {
		return true
	}
	return false
}
