package api

import (
	"net/http"
	"strings"

	"HanChat-QQBotManager/internal/services"
	"HanChat-QQBotManager/internal/utils"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

type ExpandAPIDef struct {
	Name       string
	Category   string
	Support    string
	Description string
	NapCatDesc string
	LlBotDesc  string
}

var expandAPIRegistry []ExpandAPIDef

func init() {
	napcatOnly := []ExpandAPIDef{
		{Name: ".handle_quick_operation", Category: "其他", Support: "napcat_only", Description: "快捷操作处理", NapCatDesc: "处理快捷操作", LlBotDesc: ""},
		{Name: ".ocr_image", Category: "系统扩展", Support: "napcat_only", Description: "图片OCR识别", NapCatDesc: "图片OCR识别", LlBotDesc: ""},
		{Name: "ArkShareGroup", Category: "Ark/小程序/表情", Support: "napcat_only", Description: "分享群Ark", NapCatDesc: "分享群Ark", LlBotDesc: ""},
		{Name: "ArkSharePeer", Category: "Ark/小程序/表情", Support: "napcat_only", Description: "分享好友Ark", NapCatDesc: "分享好友Ark", LlBotDesc: ""},
		{Name: "_del_group_notice", Category: "群组扩展", Support: "napcat_only", Description: "删除群公告", NapCatDesc: "删除群公告", LlBotDesc: ""},
		{Name: "_get_model_show", Category: "系统扩展", Support: "napcat_only", Description: "获取模型展示", NapCatDesc: "获取模型展示", LlBotDesc: ""},
		{Name: "_mark_all_as_read", Category: "Ark/小程序/表情", Support: "napcat_only", Description: "标记全部已读", NapCatDesc: "标记全部已读", LlBotDesc: ""},
		{Name: "bot_exit", Category: "系统扩展", Support: "napcat_only", Description: "机器人退出", NapCatDesc: "机器人退出", LlBotDesc: ""},
		{Name: "cancel_group_todo", Category: "群组扩展", Support: "napcat_only", Description: "取消群待办", NapCatDesc: "取消群待办", LlBotDesc: ""},
		{Name: "cancel_online_file", Category: "文件扩展", Support: "napcat_only", Description: "取消在线文件", NapCatDesc: "取消在线文件", LlBotDesc: ""},
		{Name: "check_url_safely", Category: "系统扩展", Support: "napcat_only", Description: "检查URL安全性", NapCatDesc: "检查URL安全性", LlBotDesc: ""},
		{Name: "clean_stream_temp_file", Category: "文件扩展", Support: "napcat_only", Description: "清理流临时文件", NapCatDesc: "清理流临时文件", LlBotDesc: ""},
		{Name: "click_inline_keyboard_button", Category: "Ark/小程序/表情", Support: "napcat_only", Description: "点击内联键盘按钮", NapCatDesc: "点击内联键盘按钮", LlBotDesc: ""},
		{Name: "complete_group_todo", Category: "群组扩展", Support: "napcat_only", Description: "完成群待办", NapCatDesc: "完成群待办", LlBotDesc: ""},
		{Name: "create_collection", Category: "Ark/小程序/表情", Support: "napcat_only", Description: "创建收藏", NapCatDesc: "创建收藏", LlBotDesc: ""},
		{Name: "create_flash_task", Category: "消息扩展", Support: "napcat_only", Description: "创建闪传任务", NapCatDesc: "创建闪传任务", LlBotDesc: ""},
		{Name: "del_group_album_media", Category: "群组扩展", Support: "napcat_only", Description: "删除群相册媒体", NapCatDesc: "删除群相册媒体", LlBotDesc: ""},
		{Name: "download_file_image_stream", Category: "文件扩展", Support: "napcat_only", Description: "下载文件图片流", NapCatDesc: "下载文件图片流", LlBotDesc: ""},
		{Name: "download_file_record_stream", Category: "文件扩展", Support: "napcat_only", Description: "下载文件语音流", NapCatDesc: "下载文件语音流", LlBotDesc: ""},
		{Name: "download_file_stream", Category: "文件扩展", Support: "napcat_only", Description: "下载文件流", NapCatDesc: "下载文件流", LlBotDesc: ""},
		{Name: "download_fileset", Category: "文件扩展", Support: "napcat_only", Description: "下载文件集", NapCatDesc: "下载文件集", LlBotDesc: ""},
		{Name: "fetch_emoji_like", Category: "消息扩展", Support: "napcat_only", Description: "获取表情点赞", NapCatDesc: "获取表情点赞", LlBotDesc: ""},
		{Name: "get_ai_record", Category: "消息扩展", Support: "napcat_only", Description: "获取AI语音", NapCatDesc: "获取AI语音", LlBotDesc: ""},
		{Name: "get_clientkey", Category: "系统扩展", Support: "napcat_only", Description: "获取ClientKey", NapCatDesc: "获取ClientKey", LlBotDesc: ""},
		{Name: "get_collection_list", Category: "Ark/小程序/表情", Support: "napcat_only", Description: "获取收藏列表", NapCatDesc: "获取收藏列表", LlBotDesc: ""},
		{Name: "get_emoji_likes", Category: "消息扩展", Support: "napcat_only", Description: "获取表情点赞列表", NapCatDesc: "获取表情点赞列表", LlBotDesc: ""},
		{Name: "get_fileset_id", Category: "文件扩展", Support: "napcat_only", Description: "获取文件集ID", NapCatDesc: "获取文件集ID", LlBotDesc: ""},
		{Name: "get_fileset_info", Category: "文件扩展", Support: "napcat_only", Description: "获取文件集信息", NapCatDesc: "获取文件集信息", LlBotDesc: ""},
		{Name: "get_flash_file_list", Category: "消息扩展", Support: "napcat_only", Description: "获取闪传文件列表", NapCatDesc: "获取闪传文件列表", LlBotDesc: ""},
		{Name: "get_flash_file_url", Category: "消息扩展", Support: "napcat_only", Description: "获取闪传文件URL", NapCatDesc: "获取闪传文件URL", LlBotDesc: ""},
		{Name: "get_group_detail_info", Category: "群组扩展", Support: "napcat_only", Description: "获取群详情信息", NapCatDesc: "获取群详情信息", LlBotDesc: ""},
		{Name: "get_group_ignored_notifies", Category: "群组扩展", Support: "napcat_only", Description: "获取群被忽略通知", NapCatDesc: "获取群被忽略通知", LlBotDesc: ""},
		{Name: "get_group_info_ex", Category: "群组扩展", Support: "napcat_only", Description: "获取群扩展信息", NapCatDesc: "获取群扩展信息", LlBotDesc: ""},
		{Name: "get_guild_list", Category: "群组扩展", Support: "napcat_only", Description: "获取频道列表", NapCatDesc: "获取频道列表", LlBotDesc: ""},
		{Name: "get_guild_service_profile", Category: "文件扩展", Support: "napcat_only", Description: "获取频道服务资料", NapCatDesc: "获取频道服务资料", LlBotDesc: ""},
		{Name: "get_mini_app_ark", Category: "Ark/小程序/表情", Support: "napcat_only", Description: "获取小程序Ark", NapCatDesc: "获取小程序Ark", LlBotDesc: ""},
		{Name: "get_online_clients", Category: "系统扩展", Support: "napcat_only", Description: "获取在线客户端", NapCatDesc: "获取在线客户端", LlBotDesc: ""},
		{Name: "get_online_file_msg", Category: "消息扩展", Support: "napcat_only", Description: "获取在线文件消息", NapCatDesc: "获取在线文件消息", LlBotDesc: ""},
		{Name: "get_qun_album_list", Category: "群组扩展", Support: "napcat_only", Description: "获取群相册列表", NapCatDesc: "获取群相册列表", LlBotDesc: ""},
		{Name: "get_recent_contact", Category: "系统扩展", Support: "napcat_only", Description: "获取最近联系人", NapCatDesc: "获取最近联系人", LlBotDesc: ""},
		{Name: "get_rkey_server", Category: "系统扩展", Support: "napcat_only", Description: "获取RKey服务器", NapCatDesc: "获取RKey服务器", LlBotDesc: ""},
		{Name: "get_share_link", Category: "文件扩展", Support: "napcat_only", Description: "获取分享链接", NapCatDesc: "获取分享链接", LlBotDesc: ""},
		{Name: "get_unidirectional_friend_list", Category: "用户扩展", Support: "napcat_only", Description: "获取单向好友列表", NapCatDesc: "获取单向好友列表", LlBotDesc: ""},
		{Name: "mark_group_msg_as_read", Category: "Ark/小程序/表情", Support: "napcat_only", Description: "标记群消息已读", NapCatDesc: "标记群消息已读", LlBotDesc: ""},
		{Name: "mark_private_msg_as_read", Category: "Ark/小程序/表情", Support: "napcat_only", Description: "标记私聊消息已读", NapCatDesc: "标记私聊消息已读", LlBotDesc: ""},
		{Name: "nc_get_packet_status", Category: "系统扩展", Support: "napcat_only", Description: "获取数据包状态", NapCatDesc: "获取数据包状态", LlBotDesc: ""},
		{Name: "nc_get_rkey", Category: "系统扩展", Support: "napcat_only", Description: "获取RKey", NapCatDesc: "获取RKey", LlBotDesc: ""},
		{Name: "nc_get_user_status", Category: "系统扩展", Support: "napcat_only", Description: "获取用户状态", NapCatDesc: "获取用户状态", LlBotDesc: ""},
		{Name: "receive_online_file", Category: "文件扩展", Support: "napcat_only", Description: "接收在线文件", NapCatDesc: "接收在线文件", LlBotDesc: ""},
		{Name: "refuse_online_file", Category: "文件扩展", Support: "napcat_only", Description: "拒绝在线文件", NapCatDesc: "拒绝在线文件", LlBotDesc: ""},
		{Name: "send_ark_share", Category: "Ark/小程序/表情", Support: "napcat_only", Description: "发送Ark分享", NapCatDesc: "发送Ark分享", LlBotDesc: ""},
		{Name: "send_flash_msg", Category: "消息扩展", Support: "napcat_only", Description: "发送闪照消息", NapCatDesc: "发送闪照消息", LlBotDesc: ""},
		{Name: "send_forward_msg", Category: "消息扩展", Support: "napcat_only", Description: "发送合并转发消息", NapCatDesc: "发送合并转发消息", LlBotDesc: ""},
		{Name: "send_group_ark_share", Category: "Ark/小程序/表情", Support: "napcat_only", Description: "发送群Ark分享", NapCatDesc: "发送群Ark分享", LlBotDesc: ""},
		{Name: "send_online_file", Category: "文件扩展", Support: "napcat_only", Description: "发送在线文件", NapCatDesc: "发送在线文件", LlBotDesc: ""},
		{Name: "send_online_folder", Category: "文件扩展", Support: "napcat_only", Description: "发送在线文件夹", NapCatDesc: "发送在线文件夹", LlBotDesc: ""},
		{Name: "send_packet", Category: "系统扩展", Support: "napcat_only", Description: "发送数据包", NapCatDesc: "发送数据包", LlBotDesc: ""},
		{Name: "set_diy_online_status", Category: "系统扩展", Support: "napcat_only", Description: "设置自定义在线状态", NapCatDesc: "设置自定义在线状态", LlBotDesc: ""},
		{Name: "set_group_add_option", Category: "群组扩展", Support: "napcat_only", Description: "设置群加群选项", NapCatDesc: "设置群加群选项", LlBotDesc: ""},
		{Name: "set_group_album_media_like", Category: "群组扩展", Support: "napcat_only", Description: "设置群相册媒体点赞", NapCatDesc: "设置群相册媒体点赞", LlBotDesc: ""},
		{Name: "set_group_kick_members", Category: "群组扩展", Support: "napcat_only", Description: "批量踢出群成员", NapCatDesc: "批量踢出群成员", LlBotDesc: ""},
		{Name: "set_group_portrait", Category: "群组扩展", Support: "napcat_only", Description: "设置群头像", NapCatDesc: "设置群头像", LlBotDesc: ""},
		{Name: "set_group_robot_add_option", Category: "群组扩展", Support: "napcat_only", Description: "设置群机器人加群选项", NapCatDesc: "设置群机器人加群选项", LlBotDesc: ""},
		{Name: "set_group_search", Category: "群组扩展", Support: "napcat_only", Description: "设置群搜索", NapCatDesc: "设置群搜索", LlBotDesc: ""},
		{Name: "set_group_sign", Category: "群组扩展", Support: "napcat_only", Description: "设置群签到", NapCatDesc: "设置群签到", LlBotDesc: ""},
		{Name: "set_group_todo", Category: "群组扩展", Support: "napcat_only", Description: "设置群待办", NapCatDesc: "设置群待办", LlBotDesc: ""},
		{Name: "set_input_status", Category: "系统扩展", Support: "napcat_only", Description: "设置输入状态", NapCatDesc: "设置输入状态", LlBotDesc: ""},
		{Name: "set_self_longnick", Category: "其他", Support: "napcat_only", Description: "设置自身长昵称", NapCatDesc: "设置自身长昵称", LlBotDesc: ""},
		{Name: "test_download_stream", Category: "文件扩展", Support: "napcat_only", Description: "测试下载流", NapCatDesc: "测试下载流", LlBotDesc: ""},
		{Name: "trans_group_file", Category: "文件扩展", Support: "napcat_only", Description: "转发群文件", NapCatDesc: "转发群文件", LlBotDesc: ""},
		{Name: "translate_en2zh", Category: "系统扩展", Support: "napcat_only", Description: "英译中翻译", NapCatDesc: "英译中翻译", LlBotDesc: ""},
		{Name: "upload_file_stream", Category: "文件扩展", Support: "napcat_only", Description: "上传文件流", NapCatDesc: "上传文件流", LlBotDesc: ""},
		{Name: "upload_image_to_qun_album", Category: "文件扩展", Support: "napcat_only", Description: "上传图片到群相册", NapCatDesc: "上传图片到群相册", LlBotDesc: ""},
	}

	llbotOnly := []ExpandAPIDef{
		{Name: "_delete_group_notice", Category: "群组扩展", Support: "llbot_only", Description: "群组:删除群公告", NapCatDesc: "", LlBotDesc: "删除群公告"},
		{Name: "batch_delete_group_member", Category: "群组扩展", Support: "llbot_only", Description: "群组:批量踢出群成员", NapCatDesc: "", LlBotDesc: "批量踢出群成员"},
		{Name: "create_group_album", Category: "群组扩展", Support: "llbot_only", Description: "群组:创建群相册", NapCatDesc: "", LlBotDesc: "创建群相册"},
		{Name: "delete_group_album", Category: "群组扩展", Support: "llbot_only", Description: "群组:删除群相册", NapCatDesc: "", LlBotDesc: "删除群相册"},
		{Name: "get_flash_file_info", Category: "消息扩展", Support: "llbot_only", Description: "文件:获取闪传文件详情", NapCatDesc: "", LlBotDesc: "获取闪传文件详情"},
		{Name: "get_group_album_list", Category: "群组扩展", Support: "llbot_only", Description: "群组:获取群相册列表", NapCatDesc: "", LlBotDesc: "获取群相册列表"},
		{Name: "get_profile_like_me", Category: "文件扩展", Support: "llbot_only", Description: "用户:获取谁赞过我列表", NapCatDesc: "", LlBotDesc: "获取谁赞过我列表"},
		{Name: "get_qq_avatar", Category: "用户扩展", Support: "llbot_only", Description: "用户:获取QQ或QQ群头像", NapCatDesc: "", LlBotDesc: "获取QQ或QQ群头像"},
		{Name: "get_recommend_face", Category: "Ark/小程序/表情", Support: "llbot_only", Description: "其他:获取推荐表情", NapCatDesc: "", LlBotDesc: "获取推荐表情"},
		{Name: "rename_group_file_folder", Category: "文件扩展", Support: "llbot_only", Description: "文件:重命名群文件文件夹名", NapCatDesc: "", LlBotDesc: "重命名群文件文件夹名"},
		{Name: "reshare_flash_file", Category: "消息扩展", Support: "llbot_only", Description: "文件:重新分享闪传文件", NapCatDesc: "", LlBotDesc: "重新分享闪传文件"},
		{Name: "scan_qrcode", Category: "系统扩展", Support: "llbot_only", Description: "系统:扫描二维码", NapCatDesc: "", LlBotDesc: "扫描二维码"},
		{Name: "send_pb", Category: "其他", Support: "llbot_only", Description: "其他:发送Protobuf数据包", NapCatDesc: "", LlBotDesc: "发送Protobuf数据包"},
		{Name: "set_friend_category", Category: "用户扩展", Support: "llbot_only", Description: "用户:移动好友分组", NapCatDesc: "", LlBotDesc: "移动好友分组"},
		{Name: "set_group_file_forever", Category: "文件扩展", Support: "llbot_only", Description: "文件:群文件转永久", NapCatDesc: "", LlBotDesc: "群文件转永久"},
		{Name: "set_group_msg_mask", Category: "消息扩展", Support: "llbot_only", Description: "群组:设置群消息接收方式", NapCatDesc: "", LlBotDesc: "设置群消息接收方式"},
		{Name: "unset_msg_emoji_like", Category: "消息扩展", Support: "llbot_only", Description: "消息:取消消息表情回应", NapCatDesc: "", LlBotDesc: "取消消息表情回应"},
		{Name: "upload_group_album", Category: "文件扩展", Support: "llbot_only", Description: "群组:上传群相册", NapCatDesc: "", LlBotDesc: "上传群相册"},
		{Name: "voice_msg_to_text", Category: "消息扩展", Support: "llbot_only", Description: "消息:语音消息转文字", NapCatDesc: "", LlBotDesc: "语音消息转文字"},
	}

	shared := []ExpandAPIDef{
		{Name: "_get_group_notice", Category: "群组扩展", Support: "shared", Description: "获取群公告", NapCatDesc: "获取群公告", LlBotDesc: "获取群公告"},
		{Name: "_send_group_notice", Category: "群组扩展", Support: "shared", Description: "发送群公告", NapCatDesc: "发送群公告", LlBotDesc: "发送群公告"},
		{Name: "create_group_file_folder", Category: "文件扩展", Support: "shared", Description: "创建群文件目录", NapCatDesc: "创建群文件目录", LlBotDesc: "创建群文件目录"},
		{Name: "delete_essence_msg", Category: "消息扩展", Support: "shared", Description: "移出精华消息", NapCatDesc: "移出精华消息", LlBotDesc: "移出精华消息"},
		{Name: "delete_friend", Category: "用户扩展", Support: "shared", Description: "删除好友", NapCatDesc: "删除好友", LlBotDesc: "删除好友"},
		{Name: "delete_group_file", Category: "文件扩展", Support: "shared", Description: "删除群文件", NapCatDesc: "删除群文件", LlBotDesc: "删除群文件"},
		{Name: "delete_group_folder", Category: "文件扩展", Support: "shared", Description: "删除群文件目录", NapCatDesc: "删除群文件目录", LlBotDesc: "删除群文件目录"},
		{Name: "download_file", Category: "文件扩展", Support: "shared", Description: "下载文件", NapCatDesc: "下载文件", LlBotDesc: "下载文件"},
		{Name: "fetch_custom_face", Category: "Ark/小程序/表情", Support: "shared", Description: "获取自定义表情", NapCatDesc: "获取自定义表情", LlBotDesc: "获取自定义表情"},
		{Name: "forward_friend_single_msg", Category: "消息扩展", Support: "shared", Description: "转发单条消息", NapCatDesc: "转发单条消息", LlBotDesc: "转发单条消息"},
		{Name: "forward_group_single_msg", Category: "消息扩展", Support: "shared", Description: "转发单条消息", NapCatDesc: "转发单条消息", LlBotDesc: "转发单条消息"},
		{Name: "friend_poke", Category: "消息扩展", Support: "shared", Description: "发送戳一戳", NapCatDesc: "发送戳一戳", LlBotDesc: "发送戳一戳"},
		{Name: "get_ai_characters", Category: "消息扩展", Support: "shared", Description: "获取AI角色列表", NapCatDesc: "获取AI角色列表", LlBotDesc: "获取AI角色列表"},
		{Name: "get_doubt_friends_add_request", Category: "用户扩展", Support: "shared", Description: "获取可疑好友申请", NapCatDesc: "获取可疑好友申请", LlBotDesc: "获取可疑好友申请"},
		{Name: "get_essence_msg_list", Category: "消息扩展", Support: "shared", Description: "获取群精华消息", NapCatDesc: "获取群精华消息", LlBotDesc: "获取群精华消息"},
		{Name: "get_file", Category: "文件扩展", Support: "shared", Description: "获取文件", NapCatDesc: "获取文件", LlBotDesc: "获取文件"},
		{Name: "get_friend_msg_history", Category: "消息扩展", Support: "shared", Description: "获取好友历史消息", NapCatDesc: "获取好友历史消息", LlBotDesc: "获取好友历史消息"},
		{Name: "get_friends_with_category", Category: "用户扩展", Support: "shared", Description: "获取带分组的好友列表", NapCatDesc: "获取带分组的好友列表", LlBotDesc: "获取带分组的好友列表"},
		{Name: "get_group_at_all_remain", Category: "群组扩展", Support: "shared", Description: "获取群艾特全体剩余次数", NapCatDesc: "获取群艾特全体剩余次数", LlBotDesc: "获取群艾特全体剩余次数"},
		{Name: "get_group_file_system_info", Category: "文件扩展", Support: "shared", Description: "获取群文件系统信息", NapCatDesc: "获取群文件系统信息", LlBotDesc: "获取群文件系统信息"},
		{Name: "get_group_file_url", Category: "文件扩展", Support: "shared", Description: "获取群文件URL", NapCatDesc: "获取群文件URL", LlBotDesc: "获取群文件URL"},
		{Name: "get_group_files_by_folder", Category: "文件扩展", Support: "shared", Description: "获取群文件夹文件列表", NapCatDesc: "获取群文件夹文件列表", LlBotDesc: "获取群文件夹文件列表"},
		{Name: "get_group_ignore_add_request", Category: "群组扩展", Support: "shared", Description: "获取群被忽略的加群请求", NapCatDesc: "获取群被忽略的加群请求", LlBotDesc: "获取群被忽略的加群请求"},
		{Name: "get_group_msg_history", Category: "消息扩展", Support: "shared", Description: "获取群历史消息", NapCatDesc: "获取群历史消息", LlBotDesc: "获取群历史消息"},
		{Name: "get_group_root_files", Category: "文件扩展", Support: "shared", Description: "获取群根目录文件列表", NapCatDesc: "获取群根目录文件列表", LlBotDesc: "获取群根目录文件列表"},
		{Name: "get_group_shut_list", Category: "群组扩展", Support: "shared", Description: "获取群禁言列表", NapCatDesc: "获取群禁言列表", LlBotDesc: "获取群禁言列表"},
		{Name: "get_group_system_msg", Category: "消息扩展", Support: "shared", Description: "获取群系统消息", NapCatDesc: "获取群系统消息", LlBotDesc: "获取群系统消息"},
		{Name: "get_private_file_url", Category: "文件扩展", Support: "shared", Description: "获取私聊文件URL", NapCatDesc: "获取私聊文件URL", LlBotDesc: "获取私聊文件URL"},
		{Name: "get_profile_like", Category: "文件扩展", Support: "shared", Description: "获取资料点赞", NapCatDesc: "获取资料点赞", LlBotDesc: "获取资料点赞"},
		{Name: "get_rkey", Category: "系统扩展", Support: "shared", Description: "获取扩展RKey", NapCatDesc: "获取扩展RKey", LlBotDesc: "获取扩展RKey"},
		{Name: "get_robot_uin_range", Category: "用户扩展", Support: "shared", Description: "获取机器人UIN范围", NapCatDesc: "获取机器人UIN范围", LlBotDesc: "获取机器人UIN范围"},
		{Name: "group_poke", Category: "消息扩展", Support: "shared", Description: "发送戳一戳", NapCatDesc: "发送戳一戳", LlBotDesc: "发送戳一戳"},
		{Name: "mark_msg_as_read", Category: "Ark/小程序/表情", Support: "shared", Description: "标记消息已读", NapCatDesc: "标记消息已读", LlBotDesc: "标记消息已读"},
		{Name: "move_group_file", Category: "文件扩展", Support: "shared", Description: "移动群文件", NapCatDesc: "移动群文件", LlBotDesc: "移动群文件"},
		{Name: "ocr_image", Category: "系统扩展", Support: "shared", Description: "图片OCR识别", NapCatDesc: "图片OCR识别", LlBotDesc: "图片OCR识别"},
		{Name: "rename_group_file", Category: "文件扩展", Support: "shared", Description: "重命名群文件", NapCatDesc: "重命名群文件", LlBotDesc: "重命名群文件"},
		{Name: "send_group_ai_record", Category: "消息扩展", Support: "shared", Description: "发送群AI语音", NapCatDesc: "发送群AI语音", LlBotDesc: "发送群AI语音"},
		{Name: "send_group_forward_msg", Category: "消息扩展", Support: "shared", Description: "发送群合并转发消息", NapCatDesc: "发送群合并转发消息", LlBotDesc: "发送群合并转发消息"},
		{Name: "send_group_sign", Category: "群组扩展", Support: "shared", Description: "群打卡", NapCatDesc: "群打卡", LlBotDesc: "群打卡"},
		{Name: "send_poke", Category: "消息扩展", Support: "shared", Description: "发送戳一戳", NapCatDesc: "发送戳一戳", LlBotDesc: "发送戳一戳"},
		{Name: "send_private_forward_msg", Category: "消息扩展", Support: "shared", Description: "发送私聊合并转发消息", NapCatDesc: "发送私聊合并转发消息", LlBotDesc: "发送私聊合并转发消息"},
		{Name: "set_doubt_friends_add_request", Category: "用户扩展", Support: "shared", Description: "处理可疑好友申请", NapCatDesc: "处理可疑好友申请", LlBotDesc: "处理可疑好友申请"},
		{Name: "set_essence_msg", Category: "消息扩展", Support: "shared", Description: "设置精华消息", NapCatDesc: "设置精华消息", LlBotDesc: "设置精华消息"},
		{Name: "set_friend_remark", Category: "Ark/小程序/表情", Support: "shared", Description: "设置好友备注", NapCatDesc: "设置好友备注", LlBotDesc: "设置好友备注"},
		{Name: "set_group_remark", Category: "Ark/小程序/表情", Support: "shared", Description: "设置群备注", NapCatDesc: "设置群备注", LlBotDesc: "设置群备注"},
		{Name: "set_msg_emoji_like", Category: "消息扩展", Support: "shared", Description: "设置消息表情点赞", NapCatDesc: "设置消息表情点赞", LlBotDesc: "设置消息表情点赞"},
		{Name: "set_online_status", Category: "系统扩展", Support: "shared", Description: "设置在线状态", NapCatDesc: "设置在线状态", LlBotDesc: "设置在线状态"},
		{Name: "set_qq_avatar", Category: "用户扩展", Support: "shared", Description: "设置QQ头像", NapCatDesc: "设置QQ头像", LlBotDesc: "设置QQ头像"},
		{Name: "set_qq_profile", Category: "文件扩展", Support: "shared", Description: "设置QQ资料", NapCatDesc: "设置QQ资料", LlBotDesc: "设置QQ资料"},
		{Name: "upload_group_file", Category: "文件扩展", Support: "shared", Description: "上传群文件", NapCatDesc: "上传群文件", LlBotDesc: "上传群文件"},
		{Name: "upload_private_file", Category: "文件扩展", Support: "shared", Description: "上传私聊文件", NapCatDesc: "上传私聊文件", LlBotDesc: "上传私聊文件"},
	}

	expandAPIRegistry = make([]ExpandAPIDef, 0, len(napcatOnly)+len(llbotOnly)+len(shared))
	expandAPIRegistry = append(expandAPIRegistry, napcatOnly...)
	expandAPIRegistry = append(expandAPIRegistry, llbotOnly...)
	expandAPIRegistry = append(expandAPIRegistry, shared...)
}

func RegisterExpandAPIRoutes(r *gin.RouterGroup, reverseWS *services.ReverseWebSocketService, base *zap.Logger) {
	logger := base.With(zap.String("module", "api.expand")).Sugar()

	for i := range expandAPIRegistry {
		apiDef := expandAPIRegistry[i]
		routePath := "/" + apiDef.Name
		r.Any(routePath, func(c *gin.Context) {
			selfID := c.Query("self_id")
			if selfID == "" {
				selfID = c.Param("self_id")
			}

			var body map[string]interface{}
			if c.Request.Method == "GET" {
				body = make(map[string]interface{})
				queryParams := c.Request.URL.Query()
				for k, v := range queryParams {
					if k == "self_id" {
						continue
					}
					if len(v) > 0 {
						body[k] = v[0]
					}
				}
			} else {
				if err := c.ShouldBindJSON(&body); err != nil {
					body = make(map[string]interface{})
				}
			}

			logger.Infow("调用拓展API", "requestId", c.GetString("requestId"), "api", apiDef.Name, "support", apiDef.Support, "self_id", selfID)

			if selfID != "" {
				accountMgr := reverseWS.GetAccountManager()
				_, err := accountMgr.GetAccount(selfID)
				if err != nil {
					c.JSON(http.StatusServiceUnavailable, gin.H{
						"success": false,
						"message": "账号不存在或离线: " + selfID,
					})
					return
				}
				rawResp, err := reverseWS.CallBotAPIRaw(selfID, apiDef.Name, body)
				if err != nil {
					utils.BadGateway(c, "调用拓展 API 失败（账号: "+selfID+"）: "+err.Error())
					return
				}
				c.Data(http.StatusOK, "application/json", rawResp)
				return
			}

			accounts := reverseWS.GetAccountManager().GetAllAccounts()
			var targetSelfID string
			for sid, account := range accounts {
				if account.IsOnline() {
					targetSelfID = sid
					break
				}
			}
			if targetSelfID == "" {
				c.JSON(http.StatusServiceUnavailable, gin.H{
					"success": false,
					"message": "没有在线的账号",
				})
				return
			}
			rawResp, err := reverseWS.CallBotAPIRaw(targetSelfID, apiDef.Name, body)
			if err != nil {
				utils.BadGateway(c, "调用拓展 API 失败（账号: "+targetSelfID+"）: "+err.Error())
				return
			}
			c.Data(http.StatusOK, "application/json", rawResp)
		})
	}

	r.GET("/registry", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    expandAPIRegistry,
		})
	})

	r.GET("/registry/category/:category", func(c *gin.Context) {
		category := c.Param("category")
		apiList := GetExpandAPIsByCategory(category)
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    apiList,
		})
	})

	r.GET("/registry/support/:support", func(c *gin.Context) {
		support := c.Param("support")
		apiList := GetExpandAPIsBySupport(support)
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    apiList,
		})
	})

	_ = logger
}

func GetExpandAPIRegistry() []ExpandAPIDef {
	result := make([]ExpandAPIDef, len(expandAPIRegistry))
	copy(result, expandAPIRegistry)
	return result
}

func GetExpandAPIsByCategory(category string) []ExpandAPIDef {
	var result []ExpandAPIDef
	for _, api := range expandAPIRegistry {
		if strings.EqualFold(api.Category, category) {
			result = append(result, api)
		}
	}
	return result
}

func GetExpandAPIsBySupport(support string) []ExpandAPIDef {
	var result []ExpandAPIDef
	for _, api := range expandAPIRegistry {
		if api.Support == support {
			result = append(result, api)
		}
	}
	return result
}
