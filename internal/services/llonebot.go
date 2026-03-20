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
func (s *LLOneBotService) CallAPI(endpoint string, params interface{}, method string) (map[string]interface{}, error) {
	rawResp, err := s.CallAPIRaw(endpoint, params, method)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(rawResp, &result); err != nil {
		return nil, fmt.Errorf("解析响应失败: %w", err)
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

	s.requestMu.Lock()
	respChan, exists := s.pendingReqs[echo]
	s.requestMu.Unlock()

	if !exists {
		return
	}

	data, _ := json.Marshal(response)
	respChan <- &WSResponse{
		Echo: echo,
		Data: data,
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
