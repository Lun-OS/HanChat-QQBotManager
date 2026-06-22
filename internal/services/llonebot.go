package services

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"
	"HanChat-QQBotManager/internal/utils"
)

// LLOneBotService 多账号LLOneBot服务
// 每个账号对应一个LLOneBotService实例，通过反向WebSocket与机器人通信
type LLOneBotService struct {
	selfID        string
	logger        *zap.SugaredLogger
	reverseWS     *ReverseWebSocketService
	retryTimes    int
	retryDelay    time.Duration
	requestMu     sync.Mutex
	pendingReqs   map[string]chan *WSResponse // echo -> response channel
}

// NewLLOneBotService 创建LLOneBotService实例
// selfID: 机器人QQ号
// reverseWS: 反向WebSocket服务
func NewLLOneBotService(selfID string, base *zap.Logger, reverseWS *ReverseWebSocketService) *LLOneBotService {
	logger := utils.NewModuleLogger(base, "service.llonebot")

	svc := &LLOneBotService{
		selfID:      selfID,
		logger:      logger.With("self_id", selfID),
		reverseWS:   reverseWS,
		retryTimes:  3,
		retryDelay:  1 * time.Second,
		pendingReqs: make(map[string]chan *WSResponse),
	}

	return svc
}

// CallAPI 调用 LLOneBot 通用接口，返回解析后的map
// 修复问题20：添加安全的类型断言和响应验证
func (s *LLOneBotService) CallAPI(endpoint string, params interface{}, method string) (map[string]interface{}, error) {
	rawResp, err := s.CallAPIRaw(endpoint, params, method)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(rawResp, &result); err != nil {
		return nil, fmt.Errorf("解析响应失败: %w", err)
	}

	// 验证响应结构
	if result == nil {
		return nil, fmt.Errorf("响应为空")
	}

	// 安全获取status字段
	status, ok := result["status"].(string)
	if !ok {
		status = "unknown"
	}

	// 安全获取retcode字段
	retcode := -1.0
	if rc, ok := result["retcode"].(float64); ok {
		retcode = rc
	} else if rcInt, ok := result["retcode"].(int); ok {
		retcode = float64(rcInt)
	}

	// 如果响应状态不是ok，返回错误
	if status != "ok" && retcode != 0 {
		return result, fmt.Errorf("API返回错误: status=%s, retcode=%v", status, retcode)
	}

	return result, nil
}

// CallAPIRaw 调用 LLOneBot 通用接口，返回原始JSON字节
// 通过反向WebSocket发送请求，并等待响应
func (s *LLOneBotService) CallAPIRaw(endpoint string, params interface{}, method string) ([]byte, error) {
	if endpoint == "" {
		return nil, fmt.Errorf("endpoint不能为空")
	}

	action := strings.TrimPrefix(endpoint, "/")
	s.logger.Debugw("开始调用API", "endpoint", endpoint, "action", action, "params", params)

	// 生成echo标识
	echo := fmt.Sprintf("%s_%d", s.selfID, time.Now().UnixNano())

	// 构建请求
	request := map[string]interface{}{
		"action": action,
		"params": params,
		"echo":   echo,
	}

	// 创建响应通道
	respChan := make(chan *WSResponse, 1)

	s.requestMu.Lock()
	s.pendingReqs[echo] = respChan
	s.requestMu.Unlock()

	defer func() {
		s.requestMu.Lock()
		delete(s.pendingReqs, echo)
		s.requestMu.Unlock()
	}()

	// 发送请求
	if err := s.reverseWS.SendMessageToAccount(s.selfID, request); err != nil {
		return nil, fmt.Errorf("发送请求失败: %w", err)
	}

	// 等待响应（带超时）
	select {
	case resp := <-respChan:
		if resp == nil {
			return nil, fmt.Errorf("响应通道关闭")
		}
		return resp.Data, nil
	case <-time.After(30 * time.Second):
		return nil, fmt.Errorf("请求超时")
	}
}

// HandleResponse 处理API响应
// 由ReverseWebSocketService调用
func (s *LLOneBotService) HandleResponse(response map[string]interface{}) {
	echo, ok := response["echo"].(string)
	if !ok {
		return
	}

	// 关键修复: 取出即删，避免重复响应时 channel 已满导致发送者永久阻塞。
	// 同时使用非阻塞发送，channel 关闭时不 panic、已满时丢弃（CallAPIRaw 已 defer 清理）。
	s.requestMu.Lock()
	respChan, exists := s.pendingReqs[echo]
	if exists {
		delete(s.pendingReqs, echo)
	}
	s.requestMu.Unlock()

	if !exists {
		return
	}

	data, _ := json.Marshal(response)
	resp := &WSResponse{
		Echo: echo,
		Data: data,
	}

	// 非阻塞发送：channel 已满（CallAPIRaw 已读取且 defer 关闭）则安全丢弃。
	select {
	case respChan <- resp:
	default:
		s.logger.Warnw("API响应通道已满/已关闭，丢弃响应",
			"echo", echo,
			"self_id", s.selfID)
	}
}

// GetSelfID 获取self_id
func (s *LLOneBotService) GetSelfID() string {
	return s.selfID
}

// ========== 用户相关 ==========

// GetLoginInfo 获取登录信息
func (s *LLOneBotService) GetLoginInfo() (map[string]interface{}, error) {
	return s.CallAPI("/get_login_info", nil, "POST")
}

// GetFriendList 获取好友列表
func (s *LLOneBotService) GetFriendList() (map[string]interface{}, error) {
	return s.CallAPI("/get_friend_list", nil, "POST")
}

// GetStrangerInfo 获取陌生人信息
func (s *LLOneBotService) GetStrangerInfo(userId interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/get_stranger_info", map[string]interface{}{"user_id": userId}, "POST")
}

// DeleteFriend 删除好友
func (s *LLOneBotService) DeleteFriend(userId interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/delete_friend", map[string]interface{}{"user_id": userId}, "POST")
}

// ========== 群组相关 ==========

// GetGroupList 获取群列表
func (s *LLOneBotService) GetGroupList() (map[string]interface{}, error) {
	return s.CallAPI("/get_group_list", nil, "POST")
}

// GetGroupInfo 获取群信息
func (s *LLOneBotService) GetGroupInfo(groupId interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/get_group_info", map[string]interface{}{"group_id": groupId}, "POST")
}

// GetGroupMemberList 获取群成员列表
func (s *LLOneBotService) GetGroupMemberList(groupId interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/get_group_member_list", map[string]interface{}{"group_id": groupId}, "POST")
}

// GetGroupMemberInfo 获取群成员信息
func (s *LLOneBotService) GetGroupMemberInfo(groupId, userId interface{}, noCache bool) (map[string]interface{}, error) {
	return s.CallAPI("/get_group_member_info", map[string]interface{}{
		"group_id": groupId,
		"user_id":  userId,
		"no_cache": noCache,
	}, "POST")
}

// SetGroupCard 设置群名片
func (s *LLOneBotService) SetGroupCard(groupId, userId interface{}, card string) (map[string]interface{}, error) {
	return s.CallAPI("/set_group_card", map[string]interface{}{
		"group_id": groupId,
		"user_id":  userId,
		"card":     card,
	}, "POST")
}

// SetGroupLeave 退出群组
func (s *LLOneBotService) SetGroupLeave(groupId interface{}, isDismiss bool) (map[string]interface{}, error) {
	return s.CallAPI("/set_group_leave", map[string]interface{}{
		"group_id":   groupId,
		"is_dismiss": isDismiss,
	}, "POST")
}

// SetGroupName 设置群名
func (s *LLOneBotService) SetGroupName(groupId interface{}, groupName string) (map[string]interface{}, error) {
	return s.CallAPI("/set_group_name", map[string]interface{}{
		"group_id":   groupId,
		"group_name": groupName,
	}, "POST")
}

// ========== 消息相关 ==========

// SendPrivateMsg 发送私聊消息
func (s *LLOneBotService) SendPrivateMsg(userId interface{}, message interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/send_private_msg", map[string]interface{}{
		"user_id": userId,
		"message": message,
	}, "POST")
}

// SendGroupMsg 发送群消息
func (s *LLOneBotService) SendGroupMsg(groupId interface{}, message interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/send_group_msg", map[string]interface{}{
		"group_id": groupId,
		"message":  message,
	}, "POST")
}

// GetMsg 获取消息
func (s *LLOneBotService) GetMsg(messageId interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/get_msg", map[string]interface{}{"message_id": messageId}, "POST")
}

// DeleteMsg 撤回消息
func (s *LLOneBotService) DeleteMsg(messageId interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/delete_msg", map[string]interface{}{"message_id": messageId}, "POST")
}

// ========== 群管理相关 ==========

// SetGroupBan 群组禁言
func (s *LLOneBotService) SetGroupBan(groupId, userId interface{}, duration interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/set_group_ban", map[string]interface{}{
		"group_id": groupId,
		"user_id":  userId,
		"duration": duration,
	}, "POST")
}

// SetGroupWholeBan 群组全员禁言
func (s *LLOneBotService) SetGroupWholeBan(groupId interface{}, enable bool) (map[string]interface{}, error) {
	return s.CallAPI("/set_group_whole_ban", map[string]interface{}{
		"group_id": groupId,
		"enable":   enable,
	}, "POST")
}

// SetGroupAdmin 设置群管理员
func (s *LLOneBotService) SetGroupAdmin(groupId, userId interface{}, enable bool) (map[string]interface{}, error) {
	return s.CallAPI("/set_group_admin", map[string]interface{}{
		"group_id": groupId,
		"user_id":  userId,
		"enable":   enable,
	}, "POST")
}

// SetGroupKick 群组踢人
func (s *LLOneBotService) SetGroupKick(groupId interface{}, userId interface{}, rejectAddRequest bool) (map[string]interface{}, error) {
	return s.CallAPI("/set_group_kick", map[string]interface{}{
		"group_id":           groupId,
		"user_id":            userId,
		"reject_add_request": rejectAddRequest,
	}, "POST")
}

// ========== 请求处理相关 ==========

// SetFriendAddRequest 处理好友添加请求
func (s *LLOneBotService) SetFriendAddRequest(flag interface{}, approve bool, remark string) (map[string]interface{}, error) {
	params := map[string]interface{}{
		"flag":    flag,
		"approve": approve,
	}
	if remark != "" {
		params["remark"] = remark
	}
	return s.CallAPI("/set_friend_add_request", params, "POST")
}

// SetGroupAddRequest 处理群添加请求
func (s *LLOneBotService) SetGroupAddRequest(flag interface{}, subType string, approve bool, reason string) (map[string]interface{}, error) {
	params := map[string]interface{}{
		"flag":     flag,
		"sub_type": subType,
		"approve":  approve,
	}
	if reason != "" {
		params["reason"] = reason
	}
	return s.CallAPI("/set_group_add_request", params, "POST")
}

// ========== 其他功能 ==========

// GetStatus 获取机器人状态
func (s *LLOneBotService) GetStatus() (map[string]interface{}, error) {
	return s.CallAPI("/get_status", nil, "POST")
}

// GetVersionInfo 获取版本信息
func (s *LLOneBotService) GetVersionInfo() (map[string]interface{}, error) {
	return s.CallAPI("/get_version_info", nil, "POST")
}

// SendLike 发送好友赞
func (s *LLOneBotService) SendLike(userId interface{}, times int) (map[string]interface{}, error) {
	return s.CallAPI("/send_like", map[string]interface{}{
		"user_id": userId,
		"times":   times,
	}, "POST")
}

// GetImage 获取图片
func (s *LLOneBotService) GetImage(file string) (map[string]interface{}, error) {
	return s.CallAPI("/get_image", map[string]interface{}{"file": file}, "POST")
}

// GetRecord 获取语音
func (s *LLOneBotService) GetRecord(file string, outFormat string) (map[string]interface{}, error) {
	return s.CallAPI("/get_record", map[string]interface{}{
		"file":       file,
		"out_format": outFormat,
	}, "POST")
}

// UploadGroupFile 上传群文件
func (s *LLOneBotService) UploadGroupFile(groupId interface{}, file, name string) (map[string]interface{}, error) {
	return s.CallAPI("/upload_group_file", map[string]interface{}{
		"group_id": groupId,
		"file":     file,
		"name":     name,
	}, "POST")
}

// UploadPrivateFile 上传私聊文件
func (s *LLOneBotService) UploadPrivateFile(userId interface{}, file, name string) (map[string]interface{}, error) {
	return s.CallAPI("/upload_private_file", map[string]interface{}{
		"user_id": userId,
		"file":    file,
		"name":    name,
	}, "POST")
}

// GetFile 获取文件
func (s *LLOneBotService) GetFile(fileId string) (map[string]interface{}, error) {
	return s.CallAPI("/get_file", map[string]interface{}{"file_id": fileId}, "POST")
}

// GetMsgFile 获取消息文件（新增API）
func (s *LLOneBotService) GetMsgFile(fileId string, download bool) (map[string]interface{}, error) {
	return s.CallAPI("/get_file", map[string]interface{}{
		"file_id":  fileId,
		"download": download,
	}, "POST")
}

// ScanQRCode 扫码接口（新增API）
func (s *LLOneBotService) ScanQRCode(params map[string]interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/scan_qrcode", params, "POST")
}

// SendPoke 发送戳一戳
func (s *LLOneBotService) SendPoke(groupId, userId interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/send_poke", map[string]interface{}{
		"group_id": groupId,
		"user_id":  userId,
	}, "POST")
}

// FriendPoke 好友戳一戳（支持 target_id）
func (s *LLOneBotService) FriendPoke(userId, targetId interface{}) (map[string]interface{}, error) {
	params := map[string]interface{}{"user_id": userId}
	if targetId != nil {
		params["target_id"] = targetId
	}
	return s.CallAPI("/friend_poke", params, "POST")
}

// SetMsgEmojiLike 设置消息表情赞（支持取消）
func (s *LLOneBotService) SetMsgEmojiLike(messageId, emojiId interface{}, set bool) (map[string]interface{}, error) {
	return s.CallAPI("/set_msg_emoji_like", map[string]interface{}{
		"message_id": messageId,
		"emoji_id":   emojiId,
		"set":        set,
	}, "POST")
}

// ReshareFlashFile 重新分享闪传文件
func (s *LLOneBotService) ReshareFlashFile(shareLink, fileSetId interface{}) (map[string]interface{}, error) {
	params := map[string]interface{}{}
	if shareLink != nil {
		params["share_link"] = shareLink
	}
	if fileSetId != nil {
		params["file_set_id"] = fileSetId
	}
	return s.CallAPI("/reshare_flash_file", params, "POST")
}

// RenameGroupFile 重命名群文件
func (s *LLOneBotService) RenameGroupFile(groupId, fileId, newFileName interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/rename_group_file", map[string]interface{}{
		"group_id":       groupId,
		"file_id":        fileId,
		"new_file_name": newFileName,
	}, "POST")
}

// ========== 插件需要的额外方法 ==========

// VoiceMsgToText 语音转文字
func (s *LLOneBotService) VoiceMsgToText(messageId int64) (map[string]interface{}, error) {
	return s.CallAPI("/voice_msg_to_text", map[string]interface{}{
		"message_id": messageId,
	}, "POST")
}

// CreateGroupFileFolder 创建群文件文件夹
func (s *LLOneBotService) CreateGroupFileFolder(groupId int64, name, parentId string) (map[string]interface{}, error) {
	params := map[string]interface{}{
		"group_id": groupId,
		"name":     name,
	}
	if parentId != "" {
		params["parent_id"] = parentId
	}
	return s.CallAPI("/create_group_file_folder", params, "POST")
}

// DeleteGroupFolder 删除群文件夹
func (s *LLOneBotService) DeleteGroupFolder(groupId int64, folderId string) (map[string]interface{}, error) {
	return s.CallAPI("/delete_group_folder", map[string]interface{}{
		"group_id":  groupId,
		"folder_id": folderId,
	}, "POST")
}

// DeleteEssenceMsg 删除精华消息
func (s *LLOneBotService) DeleteEssenceMsg(messageId int64) (map[string]interface{}, error) {
	return s.CallAPI("/delete_essence_msg", map[string]interface{}{
		"message_id": messageId,
	}, "POST")
}

// GetModelShow 获取模型展示
func (s *LLOneBotService) GetModelShow(model string) (map[string]interface{}, error) {
	return s.CallAPI("/get_model_show", map[string]interface{}{
		"model": model,
	}, "POST")
}

// SetModelShow 设置模型展示
func (s *LLOneBotService) SetModelShow(model, modelShow string) (map[string]interface{}, error) {
	return s.CallAPI("/set_model_show", map[string]interface{}{
		"model":      model,
		"model_show": modelShow,
	}, "POST")
}

// SetQQProfile 设置QQ资料
func (s *LLOneBotService) SetQQProfile(nickname, company, email, college, personalNote string) (map[string]interface{}, error) {
	params := map[string]interface{}{}
	if nickname != "" {
		params["nickname"] = nickname
	}
	if company != "" {
		params["company"] = company
	}
	if email != "" {
		params["email"] = email
	}
	if college != "" {
		params["college"] = college
	}
	if personalNote != "" {
		params["personal_note"] = personalNote
	}
	return s.CallAPI("/set_qq_profile", params, "POST")
}

// GetOnlineClients 获取在线客户端
func (s *LLOneBotService) GetOnlineClients(noCache bool) (map[string]interface{}, error) {
	return s.CallAPI("/get_online_clients", map[string]interface{}{
		"no_cache": noCache,
	}, "POST")
}

// MarkMsgAsRead 标记消息为已读
func (s *LLOneBotService) MarkMsgAsRead(userId interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/mark_msg_as_read", map[string]interface{}{
		"user_id": userId,
	}, "POST")
}

// ForwardFriendSingleMsg 转发好友单条消息
func (s *LLOneBotService) ForwardFriendSingleMsg(messageId interface{}, userId interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/forward_friend_single_msg", map[string]interface{}{
		"message_id": messageId,
		"user_id":    userId,
	}, "POST")
}

// ForwardGroupSingleMsg 转发群组单条消息
func (s *LLOneBotService) ForwardGroupSingleMsg(messageId interface{}, groupId interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/forward_group_single_msg", map[string]interface{}{
		"message_id": messageId,
		"group_id":   groupId,
	}, "POST")
}

// GetMsgRecord 获取消息记录
func (s *LLOneBotService) GetMsgRecord(messageId interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/get_msg_record", map[string]interface{}{
		"message_id": messageId,
	}, "POST")
}

// GetBotStatus 获取机器人状态
func (s *LLOneBotService) GetBotStatus() (map[string]interface{}, error) {
	return s.CallAPI("/get_status", nil, "POST")
}

// GetForwardMsg 获取合并转发消息
func (s *LLOneBotService) GetForwardMsg(messageId interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/get_forward_msg", map[string]interface{}{
		"message_id": messageId,
	}, "POST")
}

// GetMsgImage 获取消息图片
func (s *LLOneBotService) GetMsgImage(fileId string) (map[string]interface{}, error) {
	return s.CallAPI("/get_image", map[string]interface{}{
		"file": fileId,
	}, "POST")
}

// GetFriendInfo 获取好友信息
func (s *LLOneBotService) GetFriendInfo(userId interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/get_stranger_info", map[string]interface{}{
		"user_id": userId,
	}, "POST")
}

// SetGroupSpecialTitle 设置群专属头衔
func (s *LLOneBotService) SetGroupSpecialTitle(groupId, userId interface{}, specialTitle string, duration int) (map[string]interface{}, error) {
	params := map[string]interface{}{
		"group_id":      groupId,
		"user_id":       userId,
		"special_title": specialTitle,
	}
	if duration > 0 {
		params["duration"] = duration
	}
	return s.CallAPI("/set_group_special_title", params, "POST")
}

// GetGroupFileUrl 获取群文件URL
func (s *LLOneBotService) GetGroupFileUrl(groupId interface{}, fileId string) (map[string]interface{}, error) {
	return s.CallAPI("/get_group_file_url", map[string]interface{}{
		"group_id": groupId,
		"file_id":  fileId,
	}, "POST")
}

// SendGroupForwardMsg 发送群合并转发消息
func (s *LLOneBotService) SendGroupForwardMsg(groupId interface{}, messages interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/send_group_forward_msg", map[string]interface{}{
		"group_id": groupId,
		"messages": messages,
	}, "POST")
}

// SendPrivateForwardMsg 发送私聊合并转发消息
func (s *LLOneBotService) SendPrivateForwardMsg(userId interface{}, messages interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/send_private_forward_msg", map[string]interface{}{
		"user_id":  userId,
		"messages": messages,
	}, "POST")
}

// GetVideo 获取视频
func (s *LLOneBotService) GetVideo(fileId string) (map[string]interface{}, error) {
	return s.CallAPI("/get_video", map[string]interface{}{
		"file": fileId,
	}, "POST")
}

// DeleteGroupFile 删除群文件
func (s *LLOneBotService) DeleteGroupFile(groupId interface{}, fileId string, busid int) (map[string]interface{}, error) {
	return s.CallAPI("/delete_group_file", map[string]interface{}{
		"group_id": groupId,
		"file_id":  fileId,
		"busid":    busid,
	}, "POST")
}

// GetGroupFileSystemInfo 获取群文件系统信息
func (s *LLOneBotService) GetGroupFileSystemInfo(groupId interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/get_group_file_system_info", map[string]interface{}{
		"group_id": groupId,
	}, "POST")
}

// GetGroupRootFiles 获取群根目录文件列表
func (s *LLOneBotService) GetGroupRootFiles(groupId interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/get_group_root_files", map[string]interface{}{
		"group_id": groupId,
	}, "POST")
}

// GetGroupFilesByFolder 获取群文件夹中的文件列表
func (s *LLOneBotService) GetGroupFilesByFolder(groupId interface{}, folderId string) (map[string]interface{}, error) {
	return s.CallAPI("/get_group_files_by_folder", map[string]interface{}{
		"group_id":  groupId,
		"folder_id": folderId,
	}, "POST")
}

// SetEssenceMsg 设置精华消息
func (s *LLOneBotService) SetEssenceMsg(messageId interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/set_essence_msg", map[string]interface{}{
		"message_id": messageId,
	}, "POST")
}

// GetEssenceMsgList 获取精华消息列表
func (s *LLOneBotService) GetEssenceMsgList(groupId interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/get_essence_msg_list", map[string]interface{}{
		"group_id": groupId,
	}, "POST")
}

// CheckUrlSafely 检查URL安全性
func (s *LLOneBotService) CheckUrlSafely(url string) (map[string]interface{}, error) {
	return s.CallAPI("/check_url_safely", map[string]interface{}{
		"url": url,
	}, "POST")
}

// ========== 拓展API - NapCat独有 ==========

func (s *LLOneBotService) HandleQuickOperation(ctx interface{}, operation interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/.handle_quick_operation", map[string]interface{}{"context": ctx, "operation": operation}, "POST")
}

func (s *LLOneBotService) ArkShareGroup(groupID interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/ArkShareGroup", map[string]interface{}{"group_id": groupID}, "POST")
}

func (s *LLOneBotService) ArkSharePeer(userID interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/ArkSharePeer", map[string]interface{}{"user_id": userID}, "POST")
}

func (s *LLOneBotService) DelGroupNotice(groupID interface{}, noticeID string) (map[string]interface{}, error) {
	return s.CallAPI("/_del_group_notice", map[string]interface{}{"group_id": groupID, "notice_id": noticeID}, "POST")
}

func (s *LLOneBotService) MarkAllAsRead() (map[string]interface{}, error) {
	return s.CallAPI("/_mark_all_as_read", nil, "POST")
}

func (s *LLOneBotService) BotExit() (map[string]interface{}, error) {
	return s.CallAPI("/bot_exit", nil, "POST")
}

func (s *LLOneBotService) CancelGroupTodo(groupID interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/cancel_group_todo", map[string]interface{}{"group_id": groupID}, "POST")
}

func (s *LLOneBotService) CancelOnlineFile(fileID string) (map[string]interface{}, error) {
	return s.CallAPI("/cancel_online_file", map[string]interface{}{"file_id": fileID}, "POST")
}

func (s *LLOneBotService) CleanStreamTempFile() (map[string]interface{}, error) {
	return s.CallAPI("/clean_stream_temp_file", nil, "POST")
}

func (s *LLOneBotService) ClickInlineKeyboardButton(groupID interface{}, botID interface{}, seq interface{}, buttonID interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/click_inline_keyboard_button", map[string]interface{}{"group_id": groupID, "bot_id": botID, "seq": seq, "button_id": buttonID}, "POST")
}

func (s *LLOneBotService) CompleteGroupTodo(groupID interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/complete_group_todo", map[string]interface{}{"group_id": groupID}, "POST")
}

func (s *LLOneBotService) CreateCollection(params map[string]interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/create_collection", params, "POST")
}

func (s *LLOneBotService) CreateFlashTask(params map[string]interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/create_flash_task", params, "POST")
}

func (s *LLOneBotService) DelGroupAlbumMedia(groupID interface{}, albumID string, mediaID string) (map[string]interface{}, error) {
	return s.CallAPI("/del_group_album_media", map[string]interface{}{"group_id": groupID, "album_id": albumID, "media_id": mediaID}, "POST")
}

func (s *LLOneBotService) DownloadFileImageStream(file string, threadCnt int) (map[string]interface{}, error) {
	return s.CallAPI("/download_file_image_stream", map[string]interface{}{"file": file, "thread_cnt": threadCnt}, "POST")
}

func (s *LLOneBotService) DownloadFileRecordStream(file string, outFormat string, threadCnt int) (map[string]interface{}, error) {
	return s.CallAPI("/download_file_record_stream", map[string]interface{}{"file": file, "out_format": outFormat, "thread_cnt": threadCnt}, "POST")
}

func (s *LLOneBotService) DownloadFileStream(url string, threadCnt int, headers []string) (map[string]interface{}, error) {
	return s.CallAPI("/download_file_stream", map[string]interface{}{"url": url, "thread_cnt": threadCnt, "headers": headers}, "POST")
}

func (s *LLOneBotService) DownloadFileset(fileSetID string) (map[string]interface{}, error) {
	return s.CallAPI("/download_fileset", map[string]interface{}{"file_set_id": fileSetID}, "POST")
}

func (s *LLOneBotService) FetchEmojiLike(messageID interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/fetch_emoji_like", map[string]interface{}{"message_id": messageID}, "POST")
}

func (s *LLOneBotService) GetAIRecord(character string, text string, chatType int) (map[string]interface{}, error) {
	return s.CallAPI("/get_ai_record", map[string]interface{}{"character": character, "text": text, "chat_type": chatType}, "POST")
}

func (s *LLOneBotService) GetClientKey() (map[string]interface{}, error) {
	return s.CallAPI("/get_clientkey", nil, "POST")
}

func (s *LLOneBotService) GetCollectionList(category interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/get_collection_list", map[string]interface{}{"category": category}, "POST")
}

func (s *LLOneBotService) GetEmojiLikes(messageID interface{}, emojiID string) (map[string]interface{}, error) {
	return s.CallAPI("/get_emoji_likes", map[string]interface{}{"message_id": messageID, "emoji_id": emojiID}, "POST")
}

func (s *LLOneBotService) GetFilesetID(fileSetID string) (map[string]interface{}, error) {
	return s.CallAPI("/get_fileset_id", map[string]interface{}{"file_set_id": fileSetID}, "POST")
}

func (s *LLOneBotService) GetFilesetInfo(fileSetID string) (map[string]interface{}, error) {
	return s.CallAPI("/get_fileset_info", map[string]interface{}{"file_set_id": fileSetID}, "POST")
}

func (s *LLOneBotService) GetFlashFileList(groupID interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/get_flash_file_list", map[string]interface{}{"group_id": groupID}, "POST")
}

func (s *LLOneBotService) GetFlashFileURL(fileID string) (map[string]interface{}, error) {
	return s.CallAPI("/get_flash_file_url", map[string]interface{}{"file_id": fileID}, "POST")
}

func (s *LLOneBotService) GetGroupDetailInfo(groupID interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/get_group_detail_info", map[string]interface{}{"group_id": groupID}, "POST")
}

func (s *LLOneBotService) GetGroupIgnoredNotifies(groupID interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/get_group_ignored_notifies", map[string]interface{}{"group_id": groupID}, "POST")
}

func (s *LLOneBotService) GetGroupInfoEx(groupID interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/get_group_info_ex", map[string]interface{}{"group_id": groupID}, "POST")
}

func (s *LLOneBotService) GetGuildList() (map[string]interface{}, error) {
	return s.CallAPI("/get_guild_list", nil, "POST")
}

func (s *LLOneBotService) GetGuildServiceProfile() (map[string]interface{}, error) {
	return s.CallAPI("/get_guild_service_profile", nil, "POST")
}

func (s *LLOneBotService) GetMiniAppArk(params map[string]interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/get_mini_app_ark", params, "POST")
}

func (s *LLOneBotService) GetOnlineFileMsg(fileID string) (map[string]interface{}, error) {
	return s.CallAPI("/get_online_file_msg", map[string]interface{}{"file_id": fileID}, "POST")
}

func (s *LLOneBotService) GetQunAlbumList(groupID interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/get_qun_album_list", map[string]interface{}{"group_id": groupID}, "POST")
}

func (s *LLOneBotService) GetRecentContact(count int) (map[string]interface{}, error) {
	return s.CallAPI("/get_recent_contact", map[string]interface{}{"count": count}, "POST")
}

func (s *LLOneBotService) GetRkeyServer() (map[string]interface{}, error) {
	return s.CallAPI("/get_rkey_server", nil, "POST")
}

func (s *LLOneBotService) GetShareLink(fileID string) (map[string]interface{}, error) {
	return s.CallAPI("/get_share_link", map[string]interface{}{"file_id": fileID}, "POST")
}

func (s *LLOneBotService) GetUnidirectionalFriendList() (map[string]interface{}, error) {
	return s.CallAPI("/get_unidirectional_friend_list", nil, "POST")
}

func (s *LLOneBotService) MarkGroupMsgAsRead(groupID interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/mark_group_msg_as_read", map[string]interface{}{"group_id": groupID}, "POST")
}

func (s *LLOneBotService) MarkPrivateMsgAsRead(userID interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/mark_private_msg_as_read", map[string]interface{}{"user_id": userID}, "POST")
}

func (s *LLOneBotService) NcGetPacketStatus() (map[string]interface{}, error) {
	return s.CallAPI("/nc_get_packet_status", nil, "POST")
}

func (s *LLOneBotService) NcGetRkey() (map[string]interface{}, error) {
	return s.CallAPI("/nc_get_rkey", nil, "POST")
}

func (s *LLOneBotService) NcGetUserStatus(userID interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/nc_get_user_status", map[string]interface{}{"user_id": userID}, "POST")
}

func (s *LLOneBotService) ReceiveOnlineFile(fileID string) (map[string]interface{}, error) {
	return s.CallAPI("/receive_online_file", map[string]interface{}{"file_id": fileID}, "POST")
}

func (s *LLOneBotService) RefuseOnlineFile(fileID string) (map[string]interface{}, error) {
	return s.CallAPI("/refuse_online_file", map[string]interface{}{"file_id": fileID}, "POST")
}

func (s *LLOneBotService) SendArkShare(params map[string]interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/send_ark_share", params, "POST")
}

func (s *LLOneBotService) SendFlashMsg(userID interface{}, message interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/send_flash_msg", map[string]interface{}{"user_id": userID, "message": message}, "POST")
}

func (s *LLOneBotService) SendForwardMsg(messages interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/send_forward_msg", map[string]interface{}{"messages": messages}, "POST")
}

func (s *LLOneBotService) SendGroupArkShare(groupID interface{}, params map[string]interface{}) (map[string]interface{}, error) {
	p := map[string]interface{}{"group_id": groupID}
	for k, v := range params {
		p[k] = v
	}
	return s.CallAPI("/send_group_ark_share", p, "POST")
}

func (s *LLOneBotService) SendOnlineFile(params map[string]interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/send_online_file", params, "POST")
}

func (s *LLOneBotService) SendOnlineFolder(params map[string]interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/send_online_folder", params, "POST")
}

func (s *LLOneBotService) SendPacket(cmd string, data interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/send_packet", map[string]interface{}{"cmd": cmd, "data": data}, "POST")
}

func (s *LLOneBotService) SetDiyOnlineStatus(params map[string]interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/set_diy_online_status", params, "POST")
}

func (s *LLOneBotService) SetGroupAddOption(groupID interface{}, option string) (map[string]interface{}, error) {
	return s.CallAPI("/set_group_add_option", map[string]interface{}{"group_id": groupID, "option": option}, "POST")
}

func (s *LLOneBotService) SetGroupAlbumMediaLike(groupID interface{}, albumID string, mediaID string) (map[string]interface{}, error) {
	return s.CallAPI("/set_group_album_media_like", map[string]interface{}{"group_id": groupID, "album_id": albumID, "media_id": mediaID}, "POST")
}

func (s *LLOneBotService) SetGroupKickMembers(groupID interface{}, userIDs []interface{}, rejectAddRequest bool) (map[string]interface{}, error) {
	return s.CallAPI("/set_group_kick_members", map[string]interface{}{"group_id": groupID, "user_ids": userIDs, "reject_add_request": rejectAddRequest}, "POST")
}

func (s *LLOneBotService) SetGroupPortrait(groupID interface{}, file string) (map[string]interface{}, error) {
	return s.CallAPI("/set_group_portrait", map[string]interface{}{"group_id": groupID, "file": file}, "POST")
}

func (s *LLOneBotService) SetGroupRobotAddOption(groupID interface{}, option string) (map[string]interface{}, error) {
	return s.CallAPI("/set_group_robot_add_option", map[string]interface{}{"group_id": groupID, "option": option}, "POST")
}

func (s *LLOneBotService) SetGroupSearch(groupID interface{}, option string) (map[string]interface{}, error) {
	return s.CallAPI("/set_group_search", map[string]interface{}{"group_id": groupID, "option": option}, "POST")
}

func (s *LLOneBotService) SetGroupSign(groupID interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/set_group_sign", map[string]interface{}{"group_id": groupID}, "POST")
}

func (s *LLOneBotService) SetGroupTodo(groupID interface{}, todo string) (map[string]interface{}, error) {
	return s.CallAPI("/set_group_todo", map[string]interface{}{"group_id": groupID, "todo": todo}, "POST")
}

func (s *LLOneBotService) SetInputStatus(userID interface{}, status int) (map[string]interface{}, error) {
	return s.CallAPI("/set_input_status", map[string]interface{}{"user_id": userID, "status": status}, "POST")
}

func (s *LLOneBotService) SetSelfLongnick(nickname string) (map[string]interface{}, error) {
	return s.CallAPI("/set_self_longnick", map[string]interface{}{"nickname": nickname}, "POST")
}

func (s *LLOneBotService) TestDownloadStream(url string, threadCnt int) (map[string]interface{}, error) {
	return s.CallAPI("/test_download_stream", map[string]interface{}{"url": url, "thread_cnt": threadCnt}, "POST")
}

func (s *LLOneBotService) TransGroupFile(groupID interface{}, fileID string, targetGroupID interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/trans_group_file", map[string]interface{}{"group_id": groupID, "file_id": fileID, "target_group_id": targetGroupID}, "POST")
}

func (s *LLOneBotService) TranslateEn2zh(words string) (map[string]interface{}, error) {
	return s.CallAPI("/translate_en2zh", map[string]interface{}{"words": words}, "POST")
}

func (s *LLOneBotService) UploadFileStream(params map[string]interface{}) (map[string]interface{}, error) {
	return s.CallAPI("/upload_file_stream", params, "POST")
}

func (s *LLOneBotService) UploadImageToQunAlbum(groupID interface{}, file string, albumID string) (map[string]interface{}, error) {
	return s.CallAPI("/upload_image_to_qun_album", map[string]interface{}{"group_id": groupID, "file": file, "album_id": albumID}, "POST")
}
