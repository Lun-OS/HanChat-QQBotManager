// lua插件可调用api，包括日志、配置、消息发送、用户信息、群组信息、存储、文件操作、网络请求等功能
package plugins

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"math"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	lua "github.com/yuin/gopher-lua"
	"HanChat-QQBotManager/internal/utils"
)

// ========== 预编译正则表达式（性能优化）==========
var (
	// CQ码相关正则表达式
	cqAtPattern     = regexp.MustCompile(`\[CQ:at,qq=(\d+)[^\]]*\]`)
	cqReplyPattern  = regexp.MustCompile(`\[CQ:reply,id=([^,\]]+)`)
	cqReplyPattern2 = regexp.MustCompile(`\[CQ:reply,[^\]]*id=([^,\]]+)`)
	cqCodePattern   = regexp.MustCompile(`\[CQ:[^\]]+\]`)
	cqExtractPattern= regexp.MustCompile(`\[CQ:([^\]]+)\]`)

	// URL提取正则表达式
	urlExtractPattern = regexp.MustCompile(`(https?://[\w\-+&@#/%?=~_|!:,.;]*[\w\-+&@#/%=~_|])`)

	// 存储API文件锁（保护并发访问）
	storageLocks      = make(map[string]*sync.RWMutex)
	storageLocksMutex sync.Mutex
)

// getStorageLock 获取指定存储文件的锁
// 注意：锁对象会在插件卸载时自动清理（通过DeleteStorageLock）
func getStorageLock(dataFile string) *sync.RWMutex {
	storageLocksMutex.Lock()
	defer storageLocksMutex.Unlock()

	if lock, exists := storageLocks[dataFile]; exists {
		return lock
	}

	lock := &sync.RWMutex{}
	storageLocks[dataFile] = lock
	return lock
}

// deleteStorageLock 删除指定存储文件的锁（插件卸载时调用）
func deleteStorageLock(dataFile string) {
	storageLocksMutex.Lock()
	defer storageLocksMutex.Unlock()

	delete(storageLocks, dataFile)
}

// cleanupStorageLocks 清理所有存储文件锁（用于测试或重置）
func cleanupStorageLocks() {
	storageLocksMutex.Lock()
	defer storageLocksMutex.Unlock()

	storageLocks = make(map[string]*sync.RWMutex)
}

// ========== 日志API ==========

// formatLogValue 格式化日志值，支持自动类型转换
// - 表(table)类型自动转换为JSON格式
// - 二进制数据自动转换为Base64编码
func (m *Manager) formatLogValue(L *lua.LState, idx int) string {
	val := L.Get(idx)
	
	switch val.Type() {
	case lua.LTTable:
		// 将Lua表转换为Go的interface{}
		table := val.(*lua.LTable)
		goVal := luaTableToInterface(L, table)
		
		// 检查是否为二进制数据（包含字节数组特征）
		if isBinaryData(goVal) {
			// 转换为Base64
			base64Str := convertToBase64(goVal)
			return "[Base64] " + base64Str
		}
		
		// 转换为JSON
		jsonBytes, err := json.Marshal(goVal)
		if err != nil {
			return fmt.Sprintf("[表转换错误: %v]", err)
		}
		return string(jsonBytes)
		
	case lua.LTString:
		return string(val.(lua.LString))
		
	case lua.LTNumber:
		return fmt.Sprintf("%v", val.(lua.LNumber))
		
	case lua.LTBool:
		// 返回JSON格式的布尔值（不带引号）
		if val.(lua.LBool) {
			return "true"
		}
		return "false"
		
	case lua.LTNil:
		return "nil"
		
	default:
		return val.String()
	}
}

// isBinaryData 检查数据是否为二进制数据
func isBinaryData(v interface{}) bool {
	switch data := v.(type) {
	case []byte:
		return true
	case []interface{}:
		// 检查是否为字节数组（所有元素都是0-255的数字）
		if len(data) > 0 && len(data) <= 1024*1024 { // 最大1MB
			for _, item := range data {
				switch num := item.(type) {
				case float64:
					if num < 0 || num > 255 || num != float64(int64(num)) {
						return false
					}
				case int:
					if num < 0 || num > 255 {
						return false
					}
				default:
					return false
				}
			}
			return true
		}
	}
	return false
}

// convertToBase64 将数据转换为Base64编码
func convertToBase64(v interface{}) string {
	switch data := v.(type) {
	case []byte:
		return base64.StdEncoding.EncodeToString(data)
	case []interface{}:
		bytes := make([]byte, len(data))
		for i, item := range data {
			switch num := item.(type) {
			case float64:
				bytes[i] = byte(num)
			case int:
				bytes[i] = byte(num)
			}
		}
		return base64.StdEncoding.EncodeToString(bytes)
	default:
		return base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("%v", v)))
	}
}

func (m *Manager) luaLogInfo(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		msg := m.formatLogValue(L, 1)
		m.logger.Infow("插件日志", "plugin", pluginName, "level", "info", "message", msg)
		m.addPluginLog(selfID, pluginName, "INFO", msg)
		return 0
	}
}

func (m *Manager) luaLogWarn(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		msg := m.formatLogValue(L, 1)
		m.logger.Warnw("插件日志", "plugin", pluginName, "level", "warn", "message", msg)
		m.addPluginLog(selfID, pluginName, "WARN", msg)
		return 0
	}
}

func (m *Manager) luaLogError(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		msg := m.formatLogValue(L, 1)
		m.logger.Errorw("插件日志", "plugin", pluginName, "level", "error", "message", msg)
		m.addPluginLog(selfID, pluginName, "ERROR", msg)
		return 0
	}
}

func (m *Manager) luaLogDebug(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		msg := m.formatLogValue(L, 1)
		m.logger.Debugw("插件日志", "plugin", pluginName, "level", "debug", "message", msg)
		m.addPluginLog(selfID, pluginName, "DEBUG", msg)
		return 0
	}
}

// ========== 配置API ==========

func (m *Manager) luaConfigGet(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		key := L.ToString(1)
		defaultVal := L.OptString(2, "")

		if val, exists := instance.Config[key]; exists {
			L.Push(m.convertToLuaValue(L, val))
			return 1
		}

		L.Push(lua.LString(defaultVal))
		return 1
	}
}

func (m *Manager) luaConfigAll(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		table := m.convertToLuaTable(L, instance.Config)
		L.Push(table)
		return 1
	}
}

// ========== 消息API ==========

func (m *Manager) luaSendGroupMessage(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIBoolError(L, err, "发送群消息失败")
		}

		// 验证参数
		groupId, err := validateNumberParam(L, 1, "group_id", true)
		if err != nil {
			return luaAPIBoolError(L, err, "参数验证失败")
		}

		// 第二个参数可以是字符串或表（支持CQ码和消息段数组）
		var message interface{}
		if L.Get(2).Type() == lua.LTTable {
			// 如果是表，转换为Go的slice或map
			message = luaTableToInterface(L, L.ToTable(2))
		} else {
			// 如果是字符串，直接使用
			messageStr, err := validateStringParam(L, 2, "message", true)
			if err != nil {
				return luaAPIBoolError(L, err, "参数验证失败")
			}
			message = messageStr
		}

		// 调用服务
		groupIDInt := int64(groupId)
		params := map[string]interface{}{
			"group_id": groupIDInt,
			"message":  message,
		}
		result, err := callBotAPI(instance, "send_group_msg", params)
		if err != nil {
			return luaAPIBoolError(L, err, fmt.Sprintf("发送群消息失败 [group_id=%d]", groupIDInt))
		}

		return luaAPIBoolSuccess(L, m, result)
	}
}

// 撤回消息
func (m *Manager) luaDeleteMsg(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIBoolError(L, err, "撤回消息失败")
		}

		// 获取原始参数（支持字符串或数字类型）
		var messageId interface{}
		val := L.Get(1)
		switch val.Type() {
		case lua.LTNumber:
			messageId = int64(val.(lua.LNumber))
		case lua.LTString:
			messageId = string(val.(lua.LString))
		default:
			return luaAPIBoolError(L, fmt.Errorf("参数message_id必须是数字或字符串类型"), "参数验证失败")
		}

		// 调用服务
		params := map[string]interface{}{
			"message_id": messageId,
		}
		result, err := callBotAPI(instance, "delete_msg", params)
		if err != nil {
			return luaAPIBoolError(L, err, fmt.Sprintf("撤回消息失败 [message_id=%v]", messageId))
		}

		return luaAPIBoolSuccess(L, m, result)
	}
}

func (m *Manager) luaSendPrivateMessage(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIBoolError(L, err, "发送私聊消息失败")
		}

		// 验证参数
		userId, err := validateNumberParam(L, 1, "user_id", true)
		if err != nil {
			return luaAPIBoolError(L, err, "参数验证失败")
		}

		// 第二个参数可以是字符串或表（支持CQ码和消息段数组）
		var message interface{}
		if L.Get(2).Type() == lua.LTTable {
			// 如果是表，转换为Go的slice或map
			message = luaTableToInterface(L, L.ToTable(2))
		} else {
			// 如果是字符串，直接使用
			messageStr, err := validateStringParam(L, 2, "message", true)
			if err != nil {
				return luaAPIBoolError(L, err, "参数验证失败")
			}
			message = messageStr
		}

		// 调用服务
		userIDInt := int64(userId)
		params := map[string]interface{}{
			"user_id": userIDInt,
			"message": message,
		}
		result, err := callBotAPI(instance, "send_private_msg", params)
		if err != nil {
			return luaAPIBoolError(L, err, fmt.Sprintf("发送私聊消息失败 [user_id=%d]", userIDInt))
		}

		return luaAPIBoolSuccess(L, m, result)
	}
}

// 回复私聊消息
func (m *Manager) luaReplyPrivateMessage(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIBoolError(L, err, "回复私聊消息失败")
		}

		// 获取用户ID
		userId, err := validateNumberParam(L, 1, "user_id", true)
		if err != nil {
			return luaAPIBoolError(L, err, "参数验证失败")
		}

		// 获取消息ID（用于引用回复）
		var messageId interface{}
		val := L.Get(2)
		switch val.Type() {
		case lua.LTNumber:
			messageId = int64(val.(lua.LNumber))
		case lua.LTString:
			messageId = string(val.(lua.LString))
		default:
			messageId = ""
		}

		// 第四个参数可以是字符串或表（支持CQ码和消息段数组）
		var message interface{}
		if L.Get(3).Type() == lua.LTTable {
			message = luaTableToInterface(L, L.ToTable(3))
		} else {
			messageStr, err := validateStringParam(L, 3, "message", true)
			if err != nil {
				return luaAPIBoolError(L, err, "参数验证失败")
			}
			message = messageStr
		}

		// 构建参数
		params := map[string]interface{}{
			"user_id": int64(userId),
		}
		
		// 如果有消息ID，添加回复引用
		if messageId != "" {
			params["message"] = fmt.Sprintf("[CQ:reply,id=%v]%v", messageId, message)
		} else {
			params["message"] = message
		}
		
		result, err := callBotAPI(instance, "send_private_msg", params)
		if err != nil {
			return luaAPIBoolError(L, err, fmt.Sprintf("回复私聊消息失败 [user_id=%d]", int64(userId)))
		}
		return luaAPIBoolSuccess(L, m, result)
	}
}

// 回复群消息
func (m *Manager) luaReplyGroupMessage(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIBoolError(L, err, "回复群消息失败")
		}

		// 获取群ID
		groupId, err := validateNumberParam(L, 1, "group_id", true)
		if err != nil {
			return luaAPIBoolError(L, err, "参数验证失败")
		}

		// 获取消息ID（用于引用回复）
		var messageId interface{}
		val := L.Get(2)
		switch val.Type() {
		case lua.LTNumber:
			messageId = int64(val.(lua.LNumber))
		case lua.LTString:
			messageId = string(val.(lua.LString))
		default:
			messageId = ""
		}

		// 第四个参数可以是字符串或表（支持CQ码和消息段数组）
		var message interface{}
		if L.Get(3).Type() == lua.LTTable {
			message = luaTableToInterface(L, L.ToTable(3))
		} else {
			messageStr, err := validateStringParam(L, 3, "message", true)
			if err != nil {
				return luaAPIBoolError(L, err, "参数验证失败")
			}
			message = messageStr
		}

		// 构建参数
		params := map[string]interface{}{
			"group_id": int64(groupId),
		}
		
		// 如果有消息ID，添加回复引用
		if messageId != "" {
			params["message"] = fmt.Sprintf("[CQ:reply,id=%v]%v", messageId, message)
		} else {
			params["message"] = message
		}
		
		result, err := callBotAPI(instance, "send_group_msg", params)
		if err != nil {
			return luaAPIBoolError(L, err, fmt.Sprintf("回复群消息失败 [group_id=%d]", int64(groupId)))
		}
		return luaAPIBoolSuccess(L, m, result)
	}
}

// 发送私聊图片
func (m *Manager) luaSendPrivateImage(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIBoolError(L, err, "发送私聊图片失败")
		}

		// 验证参数
		userId, err := validateNumberParam(L, 1, "user_id", true)
		if err != nil {
			return luaAPIBoolError(L, err, "参数验证失败")
		}

		imageData, err := validateStringParam(L, 2, "image_data", true)
		if err != nil {
			return luaAPIBoolError(L, err, "参数验证失败")
		}

		// 构建图片CQ码消息
		imageMessage := "[CQ:image,file=base64://" + imageData + "]"

		// 调用服务
		userIDInt := int64(userId)
		params := map[string]interface{}{
			"user_id": userIDInt,
			"message": imageMessage,
		}
		result, err := callBotAPI(instance, "send_private_msg", params)
		if err != nil {
			return luaAPIBoolError(L, err, fmt.Sprintf("发送私聊图片失败 [user_id=%d]", userIDInt))
		}

		return luaAPIBoolSuccess(L, m, result)
	}
}

// 发送群聊图片
func (m *Manager) luaSendGroupImage(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIBoolError(L, err, "发送群聊图片失败")
		}

		// 验证参数
		groupId, err := validateNumberParam(L, 1, "group_id", true)
		if err != nil {
			return luaAPIBoolError(L, err, "参数验证失败")
		}

		imageData, err := validateStringParam(L, 2, "image_data", true)
		if err != nil {
			return luaAPIBoolError(L, err, "参数验证失败")
		}

		// 构建图片CQ码消息
		imageMessage := "[CQ:image,file=base64://" + imageData + "]"

		// 调用服务
		groupIDInt := int64(groupId)
		params := map[string]interface{}{
			"group_id": groupIDInt,
			"message":  imageMessage,
		}
		result, err := callBotAPI(instance, "send_group_msg", params)
		if err != nil {
			return luaAPIBoolError(L, err, fmt.Sprintf("发送群聊图片失败 [group_id=%d]", groupIDInt))
		}

		return luaAPIBoolSuccess(L, m, result)
	}
}

// 语音转文字
func (m *Manager) luaVoiceMsgToText(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "语音转文字失败")
		}

		// 验证参数
		messageId, err := validateNumberParam(L, 1, "message_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		messageIDInt := int64(messageId)
		result, err := callBotAPI(instance, "voice_msg_to_text", map[string]interface{}{"message_id": messageIDInt})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("语音转文字失败 [message_id=%d]", messageIDInt))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 创建群文件文件夹
func (m *Manager) luaCreateGroupFileFolder(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "创建群文件文件夹失败")
		}

		// 验证参数
		groupId, err := validateNumberParam(L, 1, "group_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		name, err := validateStringParam(L, 2, "name", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 可选参数：parentId
		parentId := ""
		if L.GetTop() >= 3 {
			parentId = L.ToString(3)
		}

		// 调用服务
		groupIDInt := int64(groupId)
		result, err := callBotAPI(instance, "create_group_file_folder", map[string]interface{}{"group_id": groupIDInt, "name": name, "parent_id": parentId})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("创建群文件文件夹失败 [group_id=%d, name=%s]", groupIDInt, name))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 删除群文件夹
func (m *Manager) luaDeleteGroupFolder(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "删除群文件夹失败")
		}

		// 验证参数
		groupId, err := validateNumberParam(L, 1, "group_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		folderId, err := validateStringParam(L, 2, "folder_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		groupIDInt := int64(groupId)
		result, err := callBotAPI(instance, "delete_group_folder", map[string]interface{}{"group_id": groupIDInt, "folder_id": folderId})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("删除群文件夹失败 [group_id=%d, folder_id=%s]", groupIDInt, folderId))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 移动群文件
func (m *Manager) luaMoveGroupFile(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "移动群文件失败")
		}

		// 验证参数
		groupId, err := validateNumberParam(L, 1, "group_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		fileId, err := validateStringParam(L, 2, "file_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 可选参数：parent_directory
		parentDirectory := ""
		if L.GetTop() >= 3 {
			parentDirectory = L.ToString(3)
		}

		// 可选参数：target_directory
		targetDirectory := ""
		if L.GetTop() >= 4 {
			targetDirectory = L.ToString(4)
		}

		// 调用服务
		groupIDInt := int64(groupId)
		params := map[string]interface{}{
			"group_id": groupIDInt,
			"file_id":  fileId,
		}
		if parentDirectory != "" {
			params["parent_directory"] = parentDirectory
		}
		if targetDirectory != "" {
			params["target_directory"] = targetDirectory
		}

		result, err := callBotAPI(instance, "move_group_file", params)
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("移动群文件失败 [group_id=%d, file_id=%s]", groupIDInt, fileId))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 下载文件到缓存目录
func (m *Manager) luaDownloadFile(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "下载文件失败")
		}

		// 可选参数：url
		url := ""
		if L.GetTop() >= 1 {
			url = L.ToString(1)
		}

		// 可选参数：base64
		base64Data := ""
		if L.GetTop() >= 2 {
			base64Data = L.ToString(2)
		}

		// 可选参数：name
		name := ""
		if L.GetTop() >= 3 {
			name = L.ToString(3)
		}

		// 可选参数：headers
		var headers interface{}
		if L.GetTop() >= 4 && L.Get(4).Type() == lua.LTTable {
			headers = luaTableToInterface(L, L.ToTable(4))
		}

		// 构建参数
		params := make(map[string]interface{})
		if url != "" {
			params["url"] = url
		}
		if base64Data != "" {
			params["base64"] = base64Data
		}
		if name != "" {
			params["name"] = name
		}
		if headers != nil {
			params["headers"] = headers
		}

		// 调用服务
		result, err := callBotAPI(instance, "download_file", params)
		if err != nil {
			return luaAPIError(L, err, "下载文件失败")
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 删除精华消息
func (m *Manager) luaDeleteEssenceMsg(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "删除精华消息失败")
		}

		// 验证参数
		messageId, err := validateNumberParam(L, 1, "message_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		messageIDInt := int64(messageId)
		result, err := callBotAPI(instance, "delete_essence_msg", map[string]interface{}{"message_id": messageIDInt})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("删除精华消息失败 [message_id=%d]", messageIDInt))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 获取模型展示
func (m *Manager) luaGetModelShow(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取模型展示失败")
		}

		// 验证参数
		model, err := validateStringParam(L, 1, "model", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		result, err := callBotAPI(instance, "_get_model_show", map[string]interface{}{"model": model})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("获取模型展示失败 [model=%s]", model))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 设置模型展示
func (m *Manager) luaSetModelShow(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "设置模型展示失败")
		}

		// 验证参数
		model, err := validateStringParam(L, 1, "model", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		modelShow, err := validateStringParam(L, 2, "model_show", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		result, err := callBotAPI(instance, "_set_model_show", map[string]interface{}{"model": model, "model_show": modelShow})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("设置模型展示失败 [model=%s, model_show=%s]", model, modelShow))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 设置QQ资料
func (m *Manager) luaSetQQProfile(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "设置QQ资料失败")
		}

		// 验证参数
		nickname, err := validateStringParam(L, 1, "nickname", false)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		company, err := validateStringParam(L, 2, "company", false)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		email, err := validateStringParam(L, 3, "email", false)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		college, err := validateStringParam(L, 4, "college", false)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		personalNote, err := validateStringParam(L, 5, "personal_note", false)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		result, err := callBotAPI(instance, "set_qq_profile", map[string]interface{}{"nickname": nickname, "company": company, "email": email, "college": college, "personal_note": personalNote})
		if err != nil {
			return luaAPIError(L, err, "设置QQ资料失败")
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 获取在线客户端
func (m *Manager) luaGetOnlineClients(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取在线客户端失败")
		}

		// 可选参数：noCache
		noCache := false
		if L.GetTop() >= 1 {
			noCache = L.ToBool(1)
		}

		// 调用服务
		result, err := callBotAPI(instance, "get_online_clients", map[string]interface{}{"no_cache": noCache})
		if err != nil {
			return luaAPIError(L, err, "获取在线客户端失败")
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 标记消息已读
func (m *Manager) luaMarkMsgAsRead(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "标记消息已读失败")
		}

		// 验证参数
		messageId, err := validateNumberParam(L, 1, "message_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		messageIDInt := int64(messageId)
		result, err := callBotAPI(instance, "mark_msg_as_read", map[string]interface{}{"message_id": messageIDInt})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("标记消息已读失败 [message_id=%d]", messageIDInt))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 获取陌生人信息
func (m *Manager) luaGetStrangerInfo(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取陌生人信息失败")
		}

		// 验证参数
		userId, err := validateNumberParam(L, 1, "user_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 可选参数：noCache
		noCache := false
		if L.GetTop() >= 2 {
			noCache = L.ToBool(2)
		}

		// 调用服务
		userIDInt := int64(userId)
		result, err := callBotAPI(instance, "get_stranger_info", map[string]interface{}{"user_id": userIDInt})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("获取陌生人信息失败 [user_id=%d, no_cache=%v]", userIDInt, noCache))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 转发单条好友消息
func (m *Manager) luaForwardFriendSingleMsg(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "转发单条好友消息失败")
		}

		// 验证参数
		messageId, err := validateNumberParam(L, 1, "message_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		userId, err := validateNumberParam(L, 2, "user_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		messageIDInt := int64(messageId)
		userIDInt := int64(userId)
		result, err := callBotAPI(instance, "forward_friend_single_msg", map[string]interface{}{"message_id": messageIDInt, "user_id": userIDInt})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("转发单条好友消息失败 [message_id=%d, user_id=%d]", messageIDInt, userIDInt))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 转发单条群消息
func (m *Manager) luaForwardGroupSingleMsg(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "转发单条群消息失败")
		}

		// 验证参数
		messageId, err := validateNumberParam(L, 1, "message_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		groupId, err := validateNumberParam(L, 2, "group_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		messageIDInt := int64(messageId)
		groupIDInt := int64(groupId)
		result, err := callBotAPI(instance, "forward_group_single_msg", map[string]interface{}{"message_id": messageIDInt, "group_id": groupIDInt})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("转发单条群消息失败 [message_id=%d, group_id=%d]", messageIDInt, groupIDInt))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 上传群文件
func (m *Manager) luaUploadGroupFile(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "上传群文件失败")
		}

		// 验证参数
		groupId, err := validateNumberParam(L, 1, "group_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		file, err := validateStringParam(L, 2, "file", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		name, err := validateStringParam(L, 3, "name", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		groupIDInt := int64(groupId)
		result, err := callBotAPI(instance, "upload_group_file", map[string]interface{}{"group_id": groupIDInt, "file": file, "name": name})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("上传群文件失败 [group_id=%d, file=%s, name=%s]", groupIDInt, file, name))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 上传私聊文件
func (m *Manager) luaUploadPrivateFile(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "上传私聊文件失败")
		}

		// 验证参数
		userId, err := validateNumberParam(L, 1, "user_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		file, err := validateStringParam(L, 2, "file", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		name, err := validateStringParam(L, 3, "name", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		userIDInt := int64(userId)
		result, err := callBotAPI(instance, "upload_private_file", map[string]interface{}{"user_id": userIDInt, "file": file, "name": name})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("上传私聊文件失败 [user_id=%d, file=%s, name=%s]", userIDInt, file, name))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 获取文件信息
func (m *Manager) luaGetFile(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取文件信息失败")
		}

		// 验证参数
		fileId, err := validateStringParam(L, 1, "file_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		result, err := callBotAPI(instance, "get_file", map[string]interface{}{"file": fileId})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("获取文件信息失败 [file_id=%s]", fileId))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 获取消息语音详情
func (m *Manager) luaGetMsgRecord(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取语音详情失败")
		}

		// 验证参数
		file, err := validateStringParam(L, 1, "file", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		result, err := callBotAPI(instance, "get_msg_record", map[string]interface{}{"file": file})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("获取语音详情失败 [file=%s]", file))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// ========== 系统/时间API ==========

// 获取当前时间戳（秒）
func (m *Manager) luaGetTimestampSeconds() func(*lua.LState) int {
	return func(L *lua.LState) int {
		timestamp := time.Now().Unix()
		L.Push(lua.LNumber(timestamp))
		return 1
	}
}

// 获取当前时间戳（毫秒）
func (m *Manager) luaGetTimestampMilliseconds() func(*lua.LState) int {
	return func(L *lua.LState) int {
		timestamp := time.Now().UnixNano() / int64(time.Millisecond)
		L.Push(lua.LNumber(timestamp))
		return 1
	}
}

// 获取当前时间（用于Lua插件稳定获取日期/时间）
// 返回一个表：{ unix, date, datetime, iso, zone, offset }
func (m *Manager) luaSystemNow() func(*lua.LState) int {
	return func(L *lua.LState) int {
		now := time.Now()
		zoneName, offset := now.Zone()

		result := L.NewTable()
		L.SetField(result, "unix", lua.LNumber(now.Unix()))
		L.SetField(result, "date", lua.LString(now.Format("2006-01-02")))
		L.SetField(result, "datetime", lua.LString(now.Format("2006-01-02 15:04:05")))
		L.SetField(result, "iso", lua.LString(now.Format(time.RFC3339)))
		L.SetField(result, "zone", lua.LString(zoneName))
		L.SetField(result, "offset", lua.LNumber(offset))

		L.Push(result)
		return 1
	}
}

// ========== 工具/编码API ==========

// URL编码
// 参数：str (string) - 需要编码的字符串
// 返回：编码后的字符串
func (m *Manager) luaURLEncode() func(*lua.LState) int {
	return func(L *lua.LState) int {
		str := L.ToString(1)
		encoded := url.QueryEscape(str)
		L.Push(lua.LString(encoded))
		return 1
	}
}

// URL解码
// 参数：str (string) - 需要解码的字符串
// 返回：解码后的字符串
func (m *Manager) luaURLDecode() func(*lua.LState) int {
	return func(L *lua.LState) int {
		str := L.ToString(1)
		decoded, err := url.QueryUnescape(str)
		if err != nil {
			L.Push(lua.LString(str)) // 解码失败时返回原字符串
			return 1
		}
		L.Push(lua.LString(decoded))
		return 1
	}
}

// Unicode转义字符解码
// 参数：str (string) - 包含\uXXXX格式转义字符的字符串
// 返回：解码后的字符串
func (m *Manager) luaUnicodeEscape() func(*lua.LState) int {
	return func(L *lua.LState) int {
		str := L.ToString(1)

		// 使用UTF-8编码转换算法解码\uXXXX格式的Unicode转义字符
		decoded := decodeUnicodeEscape(str)

		L.Push(lua.LString(decoded))
		return 1
	}
}

// Base64编码
// 参数：str (string) - 需要编码的字符串
// 返回：Base64编码后的字符串
func (m *Manager) luaBase64Encode() func(*lua.LState) int {
	return func(L *lua.LState) int {
		str := L.ToString(1)
		encoded := base64.StdEncoding.EncodeToString([]byte(str))
		L.Push(lua.LString(encoded))
		return 1
	}
}

// Base64解码
// 参数：str (string) - Base64编码的字符串
// 返回：解码后的字符串
func (m *Manager) luaBase64Decode() func(*lua.LState) int {
	return func(L *lua.LState) int {
		str := L.ToString(1)
		decoded, err := base64.StdEncoding.DecodeString(str)
		if err != nil {
			L.Push(lua.LString("")) // 解码失败时返回空字符串
			return 1
		}
		L.Push(lua.LString(string(decoded)))
		return 1
	}
}

// HTML实体转义
// 参数：str (string) - 需要转义的字符串
// 返回：转义后的字符串
func (m *Manager) luaHTMLEscape() func(*lua.LState) int {
	return func(L *lua.LState) int {
		str := L.ToString(1)
		escaped := html.EscapeString(str)
		L.Push(lua.LString(escaped))
		return 1
	}
}

// HTML实体反转义
// 参数：str (string) - 需要反转义的字符串
// 返回：反转义后的字符串
func (m *Manager) luaHTMLUnescape() func(*lua.LState) int {
	return func(L *lua.LState) int {
		str := L.ToString(1)
		unescaped := html.UnescapeString(str)
		L.Push(lua.LString(unescaped))
		return 1
	}
}

// 系统/机器人状态
//
//	返回一个表：{
//	  server = { host, port, env },
//	  bot = { status = {...}, version = {...} },
//	  plugins = { running = [...], total = number },
//	  now = system.now() 同结构
//	}
func (m *Manager) luaSystemStatus(selfID string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 当前时间
		now := time.Now()
		zoneName, offset := now.Zone()
		nowTbl := L.NewTable()
		L.SetField(nowTbl, "unix", lua.LNumber(now.Unix()))
		L.SetField(nowTbl, "date", lua.LString(now.Format("2006-01-02")))
		L.SetField(nowTbl, "datetime", lua.LString(now.Format("2006-01-02 15:04:05")))
		L.SetField(nowTbl, "iso", lua.LString(now.Format(time.RFC3339)))
		L.SetField(nowTbl, "zone", lua.LString(zoneName))
		L.SetField(nowTbl, "offset", lua.LNumber(offset))

		// 服务器配置
		serverTbl := L.NewTable()
		L.SetField(serverTbl, "host", lua.LString(m.cfg.Server.Host))
		L.SetField(serverTbl, "port", lua.LNumber(m.cfg.Server.Port))
		L.SetField(serverTbl, "env", lua.LString(m.cfg.Env))

		// 机器人状态与版本
		botTbl := L.NewTable()
		if m.reverseWS != nil && selfID != "" {
			if status, err := m.reverseWS.CallBotAPI(selfID, "get_status", nil); err == nil && status != nil {
				L.SetField(botTbl, "status", m.convertToLuaTable(L, status))
			} else if err != nil {
				// 返回错误信息以便插件判断
				errTbl := L.NewTable()
				L.SetField(errTbl, "error", lua.LString(err.Error()))
				L.SetField(botTbl, "status", errTbl)
			}

			if ver, err := m.reverseWS.CallBotAPI(selfID, "get_version_info", nil); err == nil && ver != nil {
				L.SetField(botTbl, "version", m.convertToLuaTable(L, ver))
			} else if err != nil {
				errTbl := L.NewTable()
				L.SetField(errTbl, "error", lua.LString(err.Error()))
				L.SetField(botTbl, "version", errTbl)
			}
		}

		// 插件信息
		running := m.GetRunningLuaPlugins(selfID)
		pluginsTbl := L.NewTable()
		listTbl := L.NewTable()
		for i, name := range running {
			L.RawSetInt(listTbl, i+1, lua.LString(name))
		}
		L.SetField(pluginsTbl, "running", listTbl)
		L.SetField(pluginsTbl, "total", lua.LNumber(len(running)))

		// 汇总
		result := L.NewTable()
		L.SetField(result, "server", serverTbl)
		L.SetField(result, "bot", botTbl)
		L.SetField(result, "plugins", pluginsTbl)
		L.SetField(result, "now", nowTbl)

		L.Push(result)
		return 1
	}
}

func (m *Manager) luaSystemCallAPI(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "调用API失败")
		}

		// 验证参数
		endpoint, err := validateStringParam(L, 1, "endpoint", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}
		endpoint = strings.TrimSpace(endpoint)

		// 解析参数表
		var params map[string]interface{}
		if L.GetTop() >= 2 {
			tbl := L.OptTable(2, nil)
			if tbl != nil {
				params = luaTableToMap(L, tbl)
			}
		}

		method := strings.ToUpper(L.OptString(3, "POST"))

		// 调用API
		result, err := callBotAPI(instance, endpoint, params)
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("调用API失败 [endpoint=%s, method=%s]", endpoint, method))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 系统/获取Cookies
// 参数：domain (string)
// 返回：table（与 LLOneBot /get_cookies 返回结构一致），错误时返回 nil, error
func (m *Manager) luaSystemCookies() func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLServiceManager(L, m); err != nil {
			return luaAPIError(L, err, "获取Cookies失败")
		}

		// 验证参数
		domain, err := validateStringParam(L, 1, "domain", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}
		domain = strings.TrimSpace(domain)

		// 调用 LLOneBot 获取 cookies
		var result map[string]interface{}
		if m.reverseWS != nil {
			// 使用第一个可用的账号
			for selfID := range m.containers {
				result, err = m.reverseWS.CallBotAPI(selfID, "/get_cookies", map[string]interface{}{
					"domain": domain,
				})
				break
			}
		} else if m.llService != nil {
			result, err = m.llService.CallAPI("/get_cookies", map[string]interface{}{
				"domain": domain,
			}, "POST")
		} else {
			err = fmt.Errorf("服务未初始化")
		}
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("获取Cookies失败 [domain=%s]", domain))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 获取消息详情
func (m *Manager) luaGetMsg(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取消息详情失败")
		}

		// 获取原始参数（支持字符串或数字类型）
		var messageId interface{}
		val := L.Get(1)
		switch val.Type() {
		case lua.LTNumber:
			messageId = int64(val.(lua.LNumber))
		case lua.LTString:
			// 尝试将字符串转换为整数
			if numValue, err := strconv.ParseInt(string(val.(lua.LString)), 10, 64); err == nil {
				messageId = numValue
			} else {
				// 如果转换失败，仍然使用原始字符串（某些LLOneBot实现可能接受字符串ID）
				messageId = string(val.(lua.LString))
			}
		default:
			return luaAPIError(L, fmt.Errorf("参数message_id必须是数字或字符串类型"), "参数验证失败")
		}

		// 调用API获取消息详情
		params := map[string]interface{}{
			"message_id": messageId,
		}
		result, err := callBotAPI(instance, "get_msg", params)
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("获取消息详情失败 [message_id=%v]", messageId))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 获取转发消息详情
func (m *Manager) luaGetForwardMsg(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取转发消息详情失败")
		}

		// 验证参数
		messageId, err := validateNumberParam(L, 1, "message_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用API获取转发消息详情
		result, err := callBotAPI(instance, "get_forward_msg", map[string]interface{}{"message_id": int64(messageId)})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("获取转发消息详情失败 [message_id=%d]", int64(messageId)))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 获取消息图片详情
func (m *Manager) luaGetMsgImage(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		file := L.CheckString(1)

		result, err := callBotAPI(instance, "get_msg_image", map[string]interface{}{"file": file})
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		resultTable := m.convertToLuaTable(L, result)
		L.Push(resultTable)
		return 1
	}
}

// 基础图像处理API - 创建图像处理器
func (m *Manager) luaCreateImageProcessor(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 验证参数：Base64编码的图片数据
		imageDataBase64 := L.CheckString(1)

		// 解码Base64图片数据
		imageData, err := base64.StdEncoding.DecodeString(imageDataBase64)
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(fmt.Sprintf("Base64图片数据解码失败: %v", err)))
			return 2
		}

		// 创建图像处理器
		processor, err := utils.NewImageProcessor(imageData)
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(fmt.Sprintf("创建图像处理器失败: %v", err)))
			return 2
		}

		// 检查处理器是否为nil
		if processor == nil {
			L.Push(lua.LNil)
			L.Push(lua.LString("图像处理器创建失败：返回nil"))
			return 2
		}

		// 创建处理器对象表
		processorTable := L.NewTable()
		if processorTable == nil {
			L.Push(lua.LNil)
			L.Push(lua.LString("创建处理器表失败"))
			return 2
		}

		// 使用安全句柄机制存储处理器
		instance.imageProcessorMu.Lock()
		processorID := instance.nextProcessorID
		instance.imageProcessors[processorID] = processor
		instance.nextProcessorID++
		instance.imageProcessorMu.Unlock()

		// 设置处理器ID（而非原始指针）
		L.SetField(processorTable, "_processor_id", lua.LNumber(processorID))

		// 添加方法
		L.SetField(processorTable, "draw_rectangle", L.NewFunction(m.luaDrawRectangle(instance)))
		L.SetField(processorTable, "draw_filled_rect", L.NewFunction(m.luaDrawFilledRect(instance)))
		L.SetField(processorTable, "draw_text", L.NewFunction(m.luaDrawText(instance)))
		L.SetField(processorTable, "get_image_data", L.NewFunction(m.luaGetImageData(instance)))

		// 检查处理器表是否正确设置
		if L.GetField(processorTable, "_processor_id") == lua.LNil {
			L.Push(lua.LNil)
			L.Push(lua.LString("设置处理器ID失败"))
			return 2
		}

		L.Push(processorTable)
		return 1
	}
}

// 绘制矩形框
func (m *Manager) luaDrawRectangle(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 验证参数：处理器对象、坐标、颜色、线宽
		processorTable := L.CheckTable(1)
		x1 := L.CheckInt(2)
		y1 := L.CheckInt(3)
		x2 := L.CheckInt(4)
		y2 := L.CheckInt(5)
		r := L.CheckInt(6)
		g := L.CheckInt(7)
		b := L.CheckInt(8)
		a := L.OptInt(9, 255)
		thickness := L.OptInt(10, 2)

		// 获取处理器ID
		processorValue := L.GetField(processorTable, "_processor_id")
		if processorValue == lua.LNil {
			L.Push(lua.LBool(false))
			L.Push(lua.LString("无效的图像处理器"))
			return 2
		}

		processorID := int(processorValue.(lua.LNumber))

		// 从安全映射表中获取处理器
		instance.imageProcessorMu.RLock()
		processor, exists := instance.imageProcessors[processorID]
		instance.imageProcessorMu.RUnlock()

		if !exists {
			L.Push(lua.LBool(false))
			L.Push(lua.LString("图像处理器不存在或已释放"))
			return 2
		}

		// 绘制矩形框
		processor.DrawRectangle(x1, y1, x2, y2, uint8(r), uint8(g), uint8(b), uint8(a), thickness)

		L.Push(lua.LBool(true))
		return 1
	}
}

// 绘制填充矩形
func (m *Manager) luaDrawFilledRect(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 验证参数：处理器对象、坐标、颜色
		processorTable := L.CheckTable(1)
		x1 := L.CheckInt(2)
		y1 := L.CheckInt(3)
		x2 := L.CheckInt(4)
		y2 := L.CheckInt(5)
		r := L.CheckInt(6)
		g := L.CheckInt(7)
		b := L.CheckInt(8)
		a := L.OptInt(9, 255)

		// 获取处理器ID
		processorValue := L.GetField(processorTable, "_processor_id")
		if processorValue == lua.LNil {
			L.Push(lua.LBool(false))
			L.Push(lua.LString("无效的图像处理器"))
			return 2
		}

		processorID := int(processorValue.(lua.LNumber))

		// 从安全映射表中获取处理器
		instance.imageProcessorMu.RLock()
		processor, exists := instance.imageProcessors[processorID]
		instance.imageProcessorMu.RUnlock()

		if !exists {
			L.Push(lua.LBool(false))
			L.Push(lua.LString("图像处理器不存在或已释放"))
			return 2
		}

		// 绘制填充矩形
		processor.DrawFilledRect(x1, y1, x2, y2, uint8(r), uint8(g), uint8(b), uint8(a))

		L.Push(lua.LBool(true))
		return 1
	}
}

// 绘制文本
func (m *Manager) luaDrawText(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 验证参数：处理器对象、坐标、文本、颜色、字体大小
		processorTable := L.CheckTable(1)
		x := L.CheckInt(2)
		y := L.CheckInt(3)
		text := L.CheckString(4)
		r := L.CheckInt(5)
		g := L.CheckInt(6)
		b := L.CheckInt(7)
		a := L.OptInt(8, 255)
		fontSize := L.OptInt(9, 12)

		// 获取处理器ID
		processorValue := L.GetField(processorTable, "_processor_id")
		if processorValue == lua.LNil {
			L.Push(lua.LBool(false))
			L.Push(lua.LString("无效的图像处理器"))
			return 2
		}

		processorID := int(processorValue.(lua.LNumber))

		// 从安全映射表中获取处理器
		instance.imageProcessorMu.RLock()
		processor, exists := instance.imageProcessors[processorID]
		instance.imageProcessorMu.RUnlock()

		if !exists {
			L.Push(lua.LBool(false))
			L.Push(lua.LString("图像处理器不存在或已释放"))
			return 2
		}

		// 绘制文本
		processor.DrawText(x, y, text, uint8(r), uint8(g), uint8(b), uint8(a), fontSize)

		L.Push(lua.LBool(true))
		return 1
	}
}

// 获取处理后的图像数据
func (m *Manager) luaGetImageData(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 验证参数：处理器对象
		processorTable := L.CheckTable(1)

		// 获取处理器ID
		processorValue := L.GetField(processorTable, "_processor_id")
		if processorValue == lua.LNil {
			L.Push(lua.LNil)
			L.Push(lua.LString("无效的图像处理器"))
			return 2
		}

		processorID := int(processorValue.(lua.LNumber))

		// 从安全映射表中获取处理器
		instance.imageProcessorMu.RLock()
		processor, exists := instance.imageProcessors[processorID]
		instance.imageProcessorMu.RUnlock()

		if !exists {
			L.Push(lua.LNil)
			L.Push(lua.LString("图像处理器不存在或已释放"))
			return 2
		}

		// 获取图像数据
		imageData, err := processor.GetImageData()
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(fmt.Sprintf("获取图像数据失败: %v", err)))
			return 2
		}

		// 编码为Base64
		imageDataBase64 := base64.StdEncoding.EncodeToString(imageData)

		L.Push(lua.LString(imageDataBase64))
		return 1
	}
}

// 获取消息文件详情
func (m *Manager) luaGetMsgFile(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		file := L.CheckString(1)
		download := L.OptBool(2, false)

		result, err := callBotAPI(instance, "get_msg_file", map[string]interface{}{"file": file, "download": download})
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		resultTable := m.convertToLuaTable(L, result)
		L.Push(resultTable)
		return 1
	}
}

// 图片OCR转文字
func (m *Manager) luaOcrImage(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		image := L.CheckString(1)

		// 调用LLOneBot的OCR接口
		result, err := callBotAPI(instance, "/ocr_image", map[string]interface{}{
			"image": image,
		})
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		resultTable := m.convertToLuaTable(L, result)
		L.Push(resultTable)
		return 1
	}
}

// ========== 用户API ==========

func (m *Manager) luaGetUserInfo(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取用户信息失败")
		}

		// 验证参数
		userId, err := validateNumberParam(L, 1, "user_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		userIDInt := int64(userId)
		result, err := callBotAPI(instance, "get_stranger_info", map[string]interface{}{"user_id": userIDInt})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("获取用户信息失败 [user_id=%d]", userIDInt))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 获取好友信息
func (m *Manager) luaGetFriendInfo(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取好友信息失败")
		}

		// 验证参数
		userId, err := validateNumberParam(L, 1, "user_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		userIDInt := int64(userId)
		result, err := callBotAPI(instance, "get_friend_info", map[string]interface{}{"user_id": userIDInt})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("获取好友信息失败 [user_id=%d]", userIDInt))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 删除好友
func (m *Manager) luaDeleteFriend(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "删除好友失败")
		}

		// 验证参数
		userId, err := validateNumberParam(L, 1, "user_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		userIDInt := int64(userId)
		result, err := callBotAPI(instance, "delete_friend", map[string]interface{}{"user_id": userIDInt})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("删除好友失败 [user_id=%d]", userIDInt))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

func (m *Manager) luaGetFriends(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取好友列表失败")
		}

		// 调用服务
		result, err := callBotAPI(instance, "get_friend_list", nil)
		if err != nil {
			return luaAPIError(L, err, "获取好友列表失败")
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

func (m *Manager) luaSetFriendRemark(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		userId := L.CheckNumber(1)
		remark := L.CheckString(2)
		params := map[string]interface{}{
			"user_id": int64(userId),
			"remark":  remark,
		}
		result, err := callBotAPI(instance, "/set_friend_remark", params)
		if err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}
		L.Push(lua.LTrue)
		L.Push(m.convertToLuaTable(L, result))
		return 2
	}
}

func (m *Manager) luaFriendPoke(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		userId := L.CheckNumber(1)
		params := map[string]interface{}{
			"user_id": int64(userId),
		}
		result, err := callBotAPI(instance, "/friend_poke", params)
		if err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}
		L.Push(lua.LTrue)
		L.Push(m.convertToLuaTable(L, result))
		return 2
	}
}

// ========== 群组API ==========

func (m *Manager) luaGetGroupList(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取群列表失败")
		}

		// 调用服务
		result, err := callBotAPI(instance, "get_group_list", nil)
		if err != nil {
			return luaAPIError(L, err, "获取群列表失败")
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 获取群信息
func (m *Manager) luaGetGroupInfo(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取群信息失败")
		}

		// 验证参数
		groupId, err := validateNumberParam(L, 1, "group_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		groupIDInt := int64(groupId)
		result, err := callBotAPI(instance, "get_group_info", map[string]interface{}{"group_id": groupIDInt})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("获取群信息失败 [group_id=%d]", groupIDInt))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 获取群成员信息
func (m *Manager) luaGetGroupMemberInfo(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取群成员信息失败")
		}

		// 验证参数
		groupId, err := validateNumberParam(L, 1, "group_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		userId, err := validateNumberParam(L, 2, "user_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 可选参数：noCache
		noCache := false
		if L.GetTop() >= 3 {
			noCache = L.ToBool(3)
		}

		// 调用服务
		groupIDInt := int64(groupId)
		userIDInt := int64(userId)
		result, err := callBotAPI(instance, "get_group_member_info", map[string]interface{}{"group_id": groupIDInt, "user_id": userIDInt, "no_cache": noCache})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("获取群成员信息失败 [group_id=%d, user_id=%d]", groupIDInt, userIDInt))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 设置群特殊头衔
func (m *Manager) luaSetGroupSpecialTitle(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "设置群特殊头衔失败")
		}

		// 验证参数
		groupId, err := validateNumberParam(L, 1, "group_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		userId, err := validateNumberParam(L, 2, "user_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		title, err := validateStringParam(L, 3, "title", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		groupIDInt := int64(groupId)
		userIDInt := int64(userId)
		duration := 0
		result, err := callBotAPI(instance, "set_group_special_title", map[string]interface{}{"group_id": groupIDInt, "user_id": userIDInt, "special_title": title, "duration": duration})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("设置群特殊头衔失败 [group_id=%d, user_id=%d, title=%s]", groupIDInt, userIDInt, title))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 退出群
func (m *Manager) luaSetGroupLeave(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "退出群失败")
		}

		// 验证参数
		groupId, err := validateNumberParam(L, 1, "group_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 可选参数：dismiss
		dismiss := false
		if L.GetTop() >= 2 {
			dismiss = L.ToBool(2)
		}

		// 调用服务
		groupIDInt := int64(groupId)
		result, err := callBotAPI(instance, "set_group_leave", map[string]interface{}{"group_id": groupIDInt, "is_dismiss": dismiss})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("退出群失败 [group_id=%d, dismiss=%t]", groupIDInt, dismiss))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 获取群文件URL
func (m *Manager) luaGetGroupFileUrl(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取群文件URL失败")
		}

		// 验证参数
		groupId, err := validateNumberParam(L, 1, "group_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		fileId, err := validateStringParam(L, 2, "file_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		groupIDInt := int64(groupId)
		result, err := callBotAPI(instance, "get_group_file_url", map[string]interface{}{"group_id": groupIDInt, "file_id": fileId})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("获取群文件URL失败 [group_id=%d, file_id=%s]", groupIDInt, fileId))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

func (m *Manager) luaGetGroupMembers(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取群成员列表失败")
		}

		// 验证参数
		groupId, err := validateNumberParam(L, 1, "group_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		groupIDInt := int64(groupId)
		result, err := callBotAPI(instance, "get_group_member_list", map[string]interface{}{"group_id": groupIDInt})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("获取群成员列表失败 [group_id=%d]", groupIDInt))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

func (m *Manager) luaApproveFriendAddRequest(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		flag := L.CheckString(1)
		approve := L.OptBool(2, true)
		remark := L.OptString(3, "")
		params := map[string]interface{}{
			"flag":    flag,
			"approve": approve,
			"remark":  remark,
		}
		result, err := callBotAPI(instance, "/set_friend_add_request", params)
		if err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}
		L.Push(lua.LTrue)
		L.Push(m.convertToLuaTable(L, result))
		return 2
	}
}

func (m *Manager) luaApproveGroupAddRequest(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		flag := L.CheckString(1)
		approve := L.OptBool(2, true)
		reason := L.OptString(3, "")
		params := map[string]interface{}{
			"flag":    flag,
			"approve": approve,
			"reason":  reason,
		}
		result, err := callBotAPI(instance, "/set_group_add_request", params)
		if err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}
		L.Push(lua.LTrue)
		L.Push(m.convertToLuaTable(L, result))
		return 2
	}
}

func (m *Manager) luaGetDoubtFriendsAddRequest(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		count := L.OptInt(1, 50)
		result, err := callBotAPI(instance, "/get_doubt_friends_add_request", map[string]interface{}{
			"count": count,
		})
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}
		L.Push(m.convertToLuaTable(L, result))
		return 1
	}
}

func (m *Manager) luaHandleDoubtFriendsAddRequest(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		flag := L.CheckString(1)
		result, err := callBotAPI(instance, "/set_doubt_friends_add_request", map[string]interface{}{
			"flag": flag,
		})
		if err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}
		L.Push(lua.LTrue)
		L.Push(m.convertToLuaTable(L, result))
		return 2
	}
}

// 群禁言（秒）
func (m *Manager) luaSetGroupBan(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {

		groupId := L.CheckNumber(1)
		userId := L.CheckNumber(2)
		duration := L.CheckInt(3)

		result, err := callBotAPI(instance, "set_group_ban", map[string]interface{}{"group_id": int64(groupId), "user_id": int64(userId), "duration": duration})
		if err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		L.Push(lua.LTrue)
		L.Push(m.convertToLuaTable(L, result))
		return 2
	}
}

func (m *Manager) luaGroupPoke(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		groupId := L.CheckNumber(1)
		userId := L.CheckNumber(2)
		params := map[string]interface{}{
			"group_id": int64(groupId),
			"user_id":  int64(userId),
		}
		result, err := callBotAPI(instance, "/group_poke", params)
		if err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}
		L.Push(lua.LTrue)
		L.Push(m.convertToLuaTable(L, result))
		return 2
	}
}

func (m *Manager) luaSetGroupName(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		groupId := L.CheckNumber(1)
		name := L.CheckString(2)
		params := map[string]interface{}{
			"group_id":   int64(groupId),
			"group_name": name,
		}
		result, err := callBotAPI(instance, "/set_group_name", params)
		if err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}
		L.Push(lua.LTrue)
		L.Push(m.convertToLuaTable(L, result))
		return 2
	}
}

// ========== LLMilkyBot API ==========
// 注意：这些API未在manager.go中注册，是死代码，暂时注释掉
/*
func (m *Manager) luaGetFriendRequests(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		return 0
	}
}
*/
func (m *Manager) luaGetFriendRequests(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		L.Push(lua.LNil)
		return 1
	}
}

// 同意好友请求
func (m *Manager) luaAcceptFriendRequest(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		L.Push(lua.LBool(false))
		return 1
	}
}

// 拒绝好友请求
func (m *Manager) luaRejectFriendRequest(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		L.Push(lua.LBool(false))
		return 1
	}
}

// 获取群通知列表
func (m *Manager) luaGetGroupNotifications(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		L.Push(L.NewTable())
		return 1
	}
}

// 同意入群/邀请他人入群请求
func (m *Manager) luaAcceptGroupRequest(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		L.Push(lua.LBool(false))
		return 1
	}
}

// 拒绝入群/邀请他人入群请求
func (m *Manager) luaRejectGroupRequest(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		L.Push(lua.LBool(false))
		return 1
	}
}

// 同意他人邀请自身入群
func (m *Manager) luaAcceptGroupInvitation(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		L.Push(lua.LBool(false))
		return 1
	}
}

// 拒绝他人邀请自身入群
func (m *Manager) luaRejectGroupInvitation(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		L.Push(lua.LBool(false))
		return 1
	}
}

// ========== 存储API ==========

func (m *Manager) luaStorageSet(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		key, err := validateStringParam(L, 1, "key", true)
		if err != nil {
			return luaAPIBoolError(L, err, "存储数据失败")
		}

		var value interface{}
		if L.GetTop() >= 2 {
			val := L.Get(2)
			value = luaValueToGo(L, val)
		}

		pluginDir := filepath.Join("plugins", selfID, pluginName)
		dataFile := filepath.Join(pluginDir, "data.json")

		if err := os.MkdirAll(pluginDir, 0755); err != nil {
			return luaAPIBoolError(L, err, fmt.Sprintf("创建插件目录失败 [key=%s]", key))
		}

		// 获取文件锁，保护并发访问
		lock := getStorageLock(dataFile)
		lock.Lock()
		defer lock.Unlock()

		data := make(map[string]interface{})
		if content, err := os.ReadFile(dataFile); err == nil {
			if err := json.Unmarshal(content, &data); err != nil {
				m.logger.Warnw("解析存储文件失败，将创建新文件",
					"self_id", selfID,
					"plugin", pluginName,
					"error", err)
			}
		}

		data[key] = value

		content, err := json.MarshalIndent(data, "", "  ")
		if err != nil {
			return luaAPIBoolError(L, err, fmt.Sprintf("序列化数据失败 [key=%s]", key))
		}

		if err := os.WriteFile(dataFile, content, 0644); err != nil {
			return luaAPIBoolError(L, err, fmt.Sprintf("写入存储文件失败 [key=%s]", key))
		}

		L.Push(lua.LTrue)
		return 1
	}
}

func (m *Manager) luaStorageGet(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		key := L.CheckString(1)
		var defaultVal interface{}
		if L.GetTop() >= 2 {
			defaultVal = luaValueToGo(L, L.Get(2))
		}

		pluginDir := filepath.Join("plugins", selfID, pluginName)
		dataFile := filepath.Join(pluginDir, "data.json")

		// 获取文件锁，保护并发访问（读锁）
		lock := getStorageLock(dataFile)
		lock.RLock()
		defer lock.RUnlock()

		data := make(map[string]interface{})
		if content, err := os.ReadFile(dataFile); err == nil {
			_ = json.Unmarshal(content, &data)
		}

		if val, exists := data[key]; exists {
			L.Push(m.convertToLuaValue(L, val))
			return 1
		}

		if defaultVal != nil {
			L.Push(m.convertToLuaValue(L, defaultVal))
			return 1
		}

		L.Push(lua.LNil)
		return 1
	}
}

func (m *Manager) luaStorageDelete(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		key := L.CheckString(1)

		// 从账号隔离的插件目录下的data.json文件读取
		// 路径: plugins/{selfID}/{pluginName}/data.json
		pluginDir := filepath.Join("plugins", selfID, pluginName)
		dataFile := filepath.Join(pluginDir, "data.json")

		// 获取文件锁，保护并发访问
		lock := getStorageLock(dataFile)
		lock.Lock()
		defer lock.Unlock()

		data := make(map[string]interface{})
		if content, err := os.ReadFile(dataFile); err == nil {
			_ = json.Unmarshal(content, &data)
		}

		// 删除键
		delete(data, key)

		// 写入文件
		content, err := json.MarshalIndent(data, "", "  ")
		if err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		if err := os.WriteFile(dataFile, content, 0644); err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		L.Push(lua.LTrue)
		return 1
	}
}

// ========== 文件操作API ==========

// validatePluginPath 验证路径是否在插件目录内（多账号隔离）
// 安全增强：防止路径遍历攻击
func (m *Manager) validatePluginPath(selfID string, pluginName string, filePath string) (string, error) {
	// 参数验证
	if selfID == "" || pluginName == "" {
		return "", fmt.Errorf("无效的账号ID或插件名称")
	}

	// 验证selfID和pluginName不包含路径遍历字符
	if strings.Contains(selfID, "..") || strings.Contains(selfID, "/") || strings.Contains(selfID, "\\") {
		return "", fmt.Errorf("账号ID包含非法字符")
	}
	if strings.Contains(pluginName, "..") || strings.Contains(pluginName, "/") || strings.Contains(pluginName, "\\") {
		return "", fmt.Errorf("插件名称包含非法字符")
	}

	// 账号隔离的插件目录: plugins/{selfID}/{pluginName}
	pluginDir := filepath.Join("plugins", selfID, pluginName)
	absPluginDir, err := filepath.Abs(pluginDir)
	if err != nil {
		return "", fmt.Errorf("获取插件目录绝对路径失败: %w", err)
	}

	// 安全清理：统一使用正斜杠进行初步清理
	// 防止通过编码绕过，如 ..%2f 或 ..\x2f
	decodedPath := filePath
	// 解码URL编码
	decodedPath = strings.ReplaceAll(decodedPath, "%2f", "/")
	decodedPath = strings.ReplaceAll(decodedPath, "%2F", "/")
	decodedPath = strings.ReplaceAll(decodedPath, "%5c", "\\")
	decodedPath = strings.ReplaceAll(decodedPath, "%5C", "\\")

	// 清理路径，移除 .. 等
	cleanPath := filepath.Clean(decodedPath)

	// 再次检查清理后的路径是否包含路径遍历
	if strings.Contains(cleanPath, "..") {
		return "", fmt.Errorf("路径包含非法字符")
	}

	// 如果路径是绝对路径，检查是否在允许的目录内
	if filepath.IsAbs(cleanPath) {
		// 不允许使用绝对路径访问其他目录
		return "", fmt.Errorf("不允许使用绝对路径")
	}

	// 构建完整路径
	fullPath := filepath.Join(pluginDir, cleanPath)

	// 获取绝对路径
	absPath, err := filepath.Abs(fullPath)
	if err != nil {
		return "", fmt.Errorf("获取文件绝对路径失败: %w", err)
	}

	// 最终安全检查：确保解析后的路径仍在插件目录内
	// 使用filepath.Clean再次清理，防止通过符号链接等方式绕过
	finalPath := filepath.Clean(absPath)
	finalPluginDir := filepath.Clean(absPluginDir)

	// 确保路径以基础路径开头（防止路径遍历）
	// Windows 路径比较不区分大小写
	if !strings.EqualFold(finalPath, finalPluginDir) &&
		!strings.HasPrefix(strings.ToLower(finalPath), strings.ToLower(finalPluginDir)+string(filepath.Separator)) {
		return "", fmt.Errorf("访问路径超出插件目录范围")
	}

	return finalPath, nil
}

// 读取文件
func (m *Manager) luaFileRead(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		filePath := L.CheckString(1)

		validPath, err := m.validatePluginPath(selfID, pluginName, filePath)
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		content, err := os.ReadFile(validPath)
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		L.Push(lua.LString(string(content)))
		return 1
	}
}

// 读取二进制文件并返回Base64
func (m *Manager) luaFileReadBase64(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		filePath := L.CheckString(1)

		validPath, err := m.validatePluginPath(selfID, pluginName, filePath)
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		content, err := os.ReadFile(validPath)
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		// 转为Base64
		base64Str := base64.StdEncoding.EncodeToString(content)
		L.Push(lua.LString(base64Str))
		return 1
	}
}

// 写入Base64文件
func (m *Manager) luaFileWriteBase64(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		filePath := L.CheckString(1)
		base64Content := L.CheckString(2)

		validPath, err := m.validatePluginPath(selfID, pluginName, filePath)
		if err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		// 解码Base64
		content, err := base64.StdEncoding.DecodeString(base64Content)
		if err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString("Base64解码失败: " + err.Error()))
			return 2
		}

		// 确保目录存在
		dir := filepath.Dir(validPath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		if err := os.WriteFile(validPath, content, 0644); err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		L.Push(lua.LTrue)
		return 1
	}
}

// 写入文件
func (m *Manager) luaFileWrite(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		filePath := L.CheckString(1)
		content := L.CheckString(2)

		validPath, err := m.validatePluginPath(selfID, pluginName, filePath)
		if err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		// 确保目录存在
		dir := filepath.Dir(validPath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		if err := os.WriteFile(validPath, []byte(content), 0644); err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		L.Push(lua.LTrue)
		return 1
	}
}

// 删除文件
func (m *Manager) luaFileDelete(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		filePath := L.CheckString(1)

		validPath, err := m.validatePluginPath(selfID, pluginName, filePath)
		if err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		if err := os.Remove(validPath); err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		L.Push(lua.LTrue)
		return 1
	}
}

// 列出目录文件
func (m *Manager) luaFileList(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		dirPath := L.OptString(1, ".")

		validPath, err := m.validatePluginPath(selfID, pluginName, dirPath)
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		entries, err := os.ReadDir(validPath)
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		result := L.NewTable()
		for i, entry := range entries {
			entryTable := L.NewTable()
			L.SetField(entryTable, "name", lua.LString(entry.Name()))
			L.SetField(entryTable, "is_dir", lua.LBool(entry.IsDir()))

			if !entry.IsDir() {
				if info, err := entry.Info(); err == nil {
					L.SetField(entryTable, "size", lua.LNumber(info.Size()))
					L.SetField(entryTable, "mod_time", lua.LString(info.ModTime().Format(time.RFC3339)))
				}
			}

			L.RawSetInt(result, i+1, entryTable)
		}

		L.Push(result)
		return 1
	}
}

// 检查文件是否存在
func (m *Manager) luaFileExists(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		filePath := L.CheckString(1)

		validPath, err := m.validatePluginPath(selfID, pluginName, filePath)
		if err != nil {
			L.Push(lua.LFalse)
			return 1
		}

		_, err = os.Stat(validPath)
		L.Push(lua.LBool(!os.IsNotExist(err)))
		return 1
	}
}

// 创建目录
func (m *Manager) luaFileMkdir(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		dirPath := L.CheckString(1)

		validPath, err := m.validatePluginPath(selfID, pluginName, dirPath)
		if err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		if err := os.MkdirAll(validPath, 0755); err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		L.Push(lua.LTrue)
		return 1
	}
}

// ========== 网络请求API ==========

// isPrivateIP 检查IP是否为私有地址（防止SSRF攻击）
func isPrivateIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return true
	}
	// 检查私有地址段
	privateRanges := []string{
		"10.0.0.0/8",
		"172.16.0.0/12",
		"192.168.0.0/16",
		"127.0.0.0/8",
		"169.254.0.0/16",
		"0.0.0.0/8",
		"::1/128",
		"fc00::/7",
		"fe80::/10",
	}
	for _, cidr := range privateRanges {
		_, ipNet, err := net.ParseCIDR(cidr)
		if err != nil {
			continue
		}
		if ipNet.Contains(ip) {
			return true
		}
	}
	return false
}

// validateHTTPURL 验证URL是否安全（防止SSRF攻击）
func validateHTTPURL(urlStr string) error {
	// 解析URL
	parsedURL, err := url.Parse(urlStr)
	if err != nil {
		return fmt.Errorf("无效的URL: %w", err)
	}

	// 只允许http和https协议
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return fmt.Errorf("只允许http和https协议")
	}

	// 获取主机名
	hostname := parsedURL.Hostname()
	if hostname == "" {
		return fmt.Errorf("URL缺少主机名")
	}

	// 解析IP地址
	ips, err := net.LookupIP(hostname)
	if err != nil {
		// 如果无法解析，可能是域名，继续检查
		// 但禁止直接使用IP地址访问内网
		ip := net.ParseIP(hostname)
		if ip != nil && isPrivateIP(ip) {
			return fmt.Errorf("禁止访问内网地址")
		}
		return nil // 域名暂时允许，实际请求时会再次检查
	}

	// 检查所有解析到的IP地址
	for _, ip := range ips {
		if isPrivateIP(ip) {
			return fmt.Errorf("禁止访问内网地址")
		}
	}

	return nil
}

// HTTP 请求
// 安全增强：添加SSRF防护
func (m *Manager) luaHttpRequest(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 验证参数
		method, err := validateStringParam(L, 1, "method", true)
		if err != nil {
			return luaAPIError(L, err, "HTTP请求失败")
		}
		method = strings.ToUpper(method)

		urlStr, err := validateStringParam(L, 2, "url", true)
		if err != nil {
			return luaAPIError(L, err, "HTTP请求失败")
		}

		// 安全增强：验证URL，防止SSRF攻击
		if err := validateHTTPURL(urlStr); err != nil {
			return luaAPIError(L, err, "HTTP请求失败: 不安全的URL")
		}

		headersTable := L.OptTable(3, nil)
		body := L.OptString(4, "")

		// 创建 HTTP 请求
		var reqBody io.Reader
		if body != "" {
			reqBody = bytes.NewBufferString(body)
		}

		req, err := http.NewRequest(method, urlStr, reqBody)
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("创建HTTP请求失败 [method=%s, url=%s]", method, urlStr))
		}

		// 设置请求头
		if headersTable != nil {
			headersTable.ForEach(func(key lua.LValue, value lua.LValue) {
				req.Header.Set(key.String(), value.String())
			})
		}

		// 发送请求（带超时）
		client := &http.Client{
			Timeout: 2 * time.Second,
		}
		resp, err := client.Do(req)
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("HTTP请求失败 [method=%s, url=%s]", method, urlStr))
		}
		defer resp.Body.Close() // 确保关闭响应体

		// 读取响应（限制大小）
		respBody, err := io.ReadAll(io.LimitReader(resp.Body, 15*1024*1024)) // 限制15MB
		if err != nil {
			return luaAPIError(L, err, "读取HTTP响应失败")
		}

		// 构建返回表
		result := L.NewTable()
		L.SetField(result, "status", lua.LNumber(resp.StatusCode))
		L.SetField(result, "status_text", lua.LString(resp.Status))
		L.SetField(result, "body", lua.LString(string(respBody)))

		headersResult := L.NewTable()
		for key, values := range resp.Header {
			if len(values) > 0 {
				L.SetField(headersResult, key, lua.LString(values[0]))
			}
		}
		L.SetField(result, "headers", headersResult)

		L.Push(result)
		return 1
	}
}

// HTTP GET 请求
// 安全增强：添加SSRF防护
func (m *Manager) luaHttpGet(pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 验证参数
		urlStr, err := validateStringParam(L, 1, "url", true)
		if err != nil {
			return luaAPIError(L, err, "HTTP GET请求失败")
		}

		// 安全增强：验证URL，防止SSRF攻击
		if err := validateHTTPURL(urlStr); err != nil {
			return luaAPIError(L, err, "HTTP GET请求失败: 不安全的URL")
		}

		headersTable := L.OptTable(2, nil)

		// 创建 HTTP 请求
		req, err := http.NewRequest("GET", urlStr, nil)
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("创建HTTP GET请求失败 [url=%s]", urlStr))
		}

		// 设置请求头
		if headersTable != nil {
			headersTable.ForEach(func(key lua.LValue, value lua.LValue) {
				req.Header.Set(key.String(), value.String())
			})
		}

		// 发送请求（带超时）
		client := &http.Client{
			Timeout: 2 * time.Second,
		}
		resp, err := client.Do(req)
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("HTTP GET请求失败 [url=%s]", urlStr))
		}
		defer resp.Body.Close() // 确保关闭响应体

		// 读取响应（限制大小）
		respBody, err := io.ReadAll(io.LimitReader(resp.Body, 15*1024*1024)) // 限制15MB
		if err != nil {
			return luaAPIError(L, err, "读取HTTP响应失败")
		}

		// 构建返回表
		result := L.NewTable()
		L.SetField(result, "status", lua.LNumber(resp.StatusCode))
		L.SetField(result, "status_text", lua.LString(resp.Status))
		L.SetField(result, "body", lua.LString(string(respBody)))

		headersResult := L.NewTable()
		for key, values := range resp.Header {
			if len(values) > 0 {
				L.SetField(headersResult, key, lua.LString(values[0]))
			}
		}
		L.SetField(result, "headers", headersResult)

		L.Push(result)
		return 1
	}
}

// HTTP POST 请求
// 安全增强：添加SSRF防护
func (m *Manager) luaHttpPost(pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 验证参数
		urlStr, err := validateStringParam(L, 1, "url", true)
		if err != nil {
			return luaAPIError(L, err, "HTTP POST请求失败")
		}

		// 安全增强：验证URL，防止SSRF攻击
		if err := validateHTTPURL(urlStr); err != nil {
			return luaAPIError(L, err, "HTTP POST请求失败: 不安全的URL")
		}

		body := L.OptString(2, "")
		headersTable := L.OptTable(3, nil)

		// 创建 HTTP 请求
		var reqBody io.Reader
		if body != "" {
			reqBody = bytes.NewBufferString(body)
		}

		req, err := http.NewRequest("POST", urlStr, reqBody)
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("创建HTTP POST请求失败 [url=%s]", urlStr))
		}

		// 设置请求头
		if headersTable != nil {
			headersTable.ForEach(func(key lua.LValue, value lua.LValue) {
				req.Header.Set(key.String(), value.String())
			})
		}

		// 设置默认Content-Type（只有在没有设置Content-Type时才设置）
		if req.Header.Get("Content-Type") == "" && body != "" {
			req.Header.Set("Content-Type", "application/json")
		}

		// 发送请求（带超时）
		client := &http.Client{
			Timeout: 2 * time.Second,
		}
		resp, err := client.Do(req)
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("HTTP POST请求失败 [url=%s]", urlStr))
		}
		defer resp.Body.Close() // 确保关闭响应体

		// 读取响应（限制大小）
		respBody, err := io.ReadAll(io.LimitReader(resp.Body, 15*1024*1024)) // 限制15MB
		if err != nil {
			return luaAPIError(L, err, "读取HTTP响应失败")
		}

		// 构建返回表
		result := L.NewTable()
		L.SetField(result, "status", lua.LNumber(resp.StatusCode))
		L.SetField(result, "status_text", lua.LString(resp.Status))
		L.SetField(result, "body", lua.LString(string(respBody)))

		headersResult := L.NewTable()
		for key, values := range resp.Header {
			if len(values) > 0 {
				L.SetField(headersResult, key, lua.LString(values[0]))
			}
		}
		L.SetField(result, "headers", headersResult)

		L.Push(result)
		return 1
	}
}

// HTTP 下载文件并转为 Base64
// 安全增强：添加SSRF防护
func (m *Manager) luaHttpDownloadBase64(pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 验证参数
		urlStr, err := validateStringParam(L, 1, "url", true)
		if err != nil {
			L.Push(lua.LNil)
			return 1
		}

		// 安全增强：验证URL，防止SSRF攻击
		if err := validateHTTPURL(urlStr); err != nil {
			m.logger.Warnw("下载文件失败: 不安全的URL", "plugin", pluginName, "error", err)
			L.Push(lua.LNil)
			return 1
		}

		// 发送 GET 请求下载文件
		client := &http.Client{
			Timeout: 30 * time.Second,
		}
		resp, err := client.Get(urlStr)
		if err != nil {
			m.logger.Warnw("下载文件失败", "plugin", pluginName, "url", urlStr, "error", err)
			L.Push(lua.LNil)
			return 1
		}
		defer resp.Body.Close()

		// 读取响应体（限制大小为 10MB）
		data, err := io.ReadAll(io.LimitReader(resp.Body, 10*1024*1024))
		if err != nil {
			m.logger.Warnw("读取下载内容失败", "plugin", pluginName, "url", urlStr, "error", err)
			L.Push(lua.LNil)
			return 1
		}

		// 转为 Base64
		base64Str := base64.StdEncoding.EncodeToString(data)
		L.Push(lua.LString(base64Str))
		return 1
	}
}

// ========== 插件管理/配置API ==========

// 列出所有插件（含运行状态与基础信息）
func (m *Manager) luaPluginsList(selfID string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		plugins, err := m.GetAllPlugins(selfID)
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		// 转为数组表
		arr := L.NewTable()
		for i, p := range plugins {
			L.RawSetInt(arr, i+1, m.convertToLuaTable(L, p))
		}
		L.Push(arr)
		return 1
	}
}

// 获取指定插件运行状态
func (m *Manager) luaPluginsStatus(selfID string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		name := L.CheckString(1)
		status, err := m.GetLuaPluginStatus(selfID, name)
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}
		L.Push(m.convertToLuaTable(L, status))
		return 1
	}
}

// 读取其他插件的配置（config.json）
func (m *Manager) luaPluginsGetConfig(selfID string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		name := L.CheckString(1)
		cfg, err := m.GetPluginConfig(selfID, name)
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}
		L.Push(m.convertToLuaTable(L, cfg))
		return 1
	}
}

// 保存（新增/更新）其他插件的配置（config.json）
// 安全增强：只允许修改当前插件的配置
func (m *Manager) luaPluginsSaveConfig(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		name := L.CheckString(1)
		cfgTbl := L.CheckTable(2)

		// 安全增强：只允许修改当前插件的配置
		// 防止恶意插件修改其他插件配置导致权限提升
		if name != pluginName {
			L.Push(lua.LFalse)
			L.Push(lua.LString("无权修改其他插件的配置"))
			return 2
		}

		cfg := luaTableToMap(L, cfgTbl)
		if err := m.SavePluginConfig(selfID, name, cfg); err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}
		L.Push(lua.LTrue)
		return 1
	}
}

// 删除其他插件的配置（删除其 config.json 文件）
// 安全增强：只允许删除当前插件的配置
func (m *Manager) luaPluginsDeleteConfig(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		name := L.CheckString(1)

		// 安全增强：只允许删除当前插件的配置
		// 防止恶意插件删除其他插件配置
		if name != pluginName {
			L.Push(lua.LFalse)
			L.Push(lua.LString("无权删除其他插件的配置"))
			return 2
		}

		if err := m.DeletePluginConfig(selfID, name); err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}
		L.Push(lua.LTrue)
		return 1
	}
}

// 辅助：验证其他插件目录内的 JSON 文件路径
// 安全增强：防止路径遍历和跨插件访问
func (m *Manager) validateOtherPluginJsonPath(selfID string, currentPluginName string, targetPluginName string, filePath string) (string, error) {
	// 安全增强：只允许访问当前插件的JSON文件
	// 防止恶意插件读取/修改其他插件的敏感配置
	if targetPluginName != currentPluginName {
		return "", fmt.Errorf("无权访问其他插件的文件")
	}

	// 重新扫描确保信息最新
	if _, err := m.ScanPlugins(selfID); err != nil {
		return "", fmt.Errorf("扫描插件失败: %w", err)
	}
	info, exists := m.pluginInfos[targetPluginName]
	if !exists {
		return "", fmt.Errorf("插件不存在: %s", targetPluginName)
	}

	// 必须是 .json 文件
	if !strings.HasSuffix(strings.ToLower(filePath), ".json") {
		return "", fmt.Errorf("仅允许访问 .json 文件")
	}

	// 安全增强：验证文件名不包含路径遍历字符
	if strings.Contains(filePath, "..") || strings.Contains(filePath, "/") || strings.Contains(filePath, "\\") {
		return "", fmt.Errorf("文件名包含非法字符")
	}

	// 安全增强：解码URL编码，防止绕过
	decodedPath := filePath
	decodedPath = strings.ReplaceAll(decodedPath, "%2f", "/")
	decodedPath = strings.ReplaceAll(decodedPath, "%2F", "/")
	decodedPath = strings.ReplaceAll(decodedPath, "%5c", "\\")
	decodedPath = strings.ReplaceAll(decodedPath, "%5C", "\\")

	if strings.Contains(decodedPath, "..") {
		return "", fmt.Errorf("文件名包含非法字符")
	}

	pluginDir := info.Path
	absPluginDir, err := filepath.Abs(pluginDir)
	if err != nil {
		return "", fmt.Errorf("获取插件目录绝对路径失败: %w", err)
	}

	// 构建完整路径（只使用文件名，不使用用户提供的完整路径）
	cleanFileName := filepath.Base(decodedPath)
	fullPath := filepath.Join(pluginDir, cleanFileName)

	absPath, err := filepath.Abs(fullPath)
	if err != nil {
		return "", fmt.Errorf("获取文件绝对路径失败: %w", err)
	}

	// 最终安全检查
	finalPath := filepath.Clean(absPath)
	finalPluginDir := filepath.Clean(absPluginDir)

	if !strings.EqualFold(finalPath, finalPluginDir) &&
		!strings.HasPrefix(strings.ToLower(finalPath), strings.ToLower(finalPluginDir)+string(filepath.Separator)) {
		return "", fmt.Errorf("访问路径超出插件目录范围")
	}

	return finalPath, nil
}

// 读取其他插件目录下的任意 JSON 文件
// 安全增强：只允许读取当前插件的JSON文件
func (m *Manager) luaPluginsReadJson(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		name := L.CheckString(1)
		rel := L.CheckString(2)

		validPath, err := m.validateOtherPluginJsonPath(selfID, pluginName, name, rel)
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		content, err := os.ReadFile(validPath)
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		var data map[string]interface{}
		if err := json.Unmarshal(content, &data); err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(fmt.Errorf("解析JSON失败: %w", err).Error()))
			return 2
		}
		L.Push(m.convertToLuaTable(L, data))
		return 1
	}
}

// 保存（新增/更新）其他插件目录下的任意 JSON 文件
// 安全增强：只允许保存当前插件的JSON文件
func (m *Manager) luaPluginsSaveJson(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		name := L.CheckString(1)
		rel := L.CheckString(2)
		tbl := L.CheckTable(3)
		data := luaTableToMap(L, tbl)

		validPath, err := m.validateOtherPluginJsonPath(selfID, pluginName, name, rel)
		if err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		// 确保目录存在
		if err := os.MkdirAll(filepath.Dir(validPath), 0755); err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		content, err := json.MarshalIndent(data, "", "  ")
		if err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		if err := os.WriteFile(validPath, content, 0644); err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}
		L.Push(lua.LTrue)
		return 1
	}
}

// 删除其他插件目录下的任意 JSON 文件
// 安全增强：只允许删除当前插件的JSON文件
func (m *Manager) luaPluginsDeleteJson(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		name := L.CheckString(1)
		rel := L.CheckString(2)

		validPath, err := m.validateOtherPluginJsonPath(selfID, pluginName, name, rel)
		if err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		if err := os.Remove(validPath); err != nil {
			if !os.IsNotExist(err) {
				L.Push(lua.LFalse)
				L.Push(lua.LString(err.Error()))
				return 2
			}
		}
		L.Push(lua.LTrue)
		return 1
	}
}

// UDP 发送
func (m *Manager) luaUdpSend(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		address := L.CheckString(1)
		message := L.CheckString(2)

		// 解析地址
		addr, err := net.ResolveUDPAddr("udp", address)
		if err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		// 创建 UDP 连接
		conn, err := net.DialUDP("udp", nil, addr)
		if err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}
		defer conn.Close()

		// 发送数据
		_, err = conn.Write([]byte(message))
		if err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		L.Push(lua.LTrue)
		return 1
	}
}

// TCP 连接和发送
func (m *Manager) luaTcpConnect(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		address := L.CheckString(1)
		message := L.CheckString(2)
		timeout := L.OptNumber(3, 10) // 默认10秒超时

		// 创建 TCP 连接
		conn, err := net.DialTimeout("tcp", address, time.Duration(timeout)*time.Second)
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}
		defer conn.Close()

		// 发送数据
		if message != "" {
			_, err = conn.Write([]byte(message))
			if err != nil {
				L.Push(lua.LNil)
				L.Push(lua.LString(err.Error()))
				return 2
			}
		}

		// 读取响应（如果有）
		conn.SetReadDeadline(time.Now().Add(5 * time.Second))
		buffer := make([]byte, 4096)
		n, err := conn.Read(buffer)
		if err != nil && err != io.EOF {
			// 读取失败，但可能只是没有响应
			L.Push(lua.LString(""))
			return 1
		}

		response := ""
		if n > 0 {
			response = string(buffer[:n])
		}

		L.Push(lua.LString(response))
		return 1
	}
}

// ========== 事件注册API ==========

func (m *Manager) luaOnMessage(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		fn := L.CheckFunction(1)
		instance.EventHandlers["message"] = fn
		m.logger.Infow("注册消息事件处理器", "plugin", instance.Name)
		return 0
	}
}

func (m *Manager) luaOnNotice(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		fn := L.CheckFunction(1)
		instance.EventHandlers["notice"] = fn
		m.logger.Infow("注册通知事件处理器", "plugin", instance.Name)
		return 0
	}
}

func (m *Manager) luaOnRequest(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		fn := L.CheckFunction(1)
		instance.EventHandlers["request"] = fn
		m.logger.Infow("注册请求事件处理器", "plugin", instance.Name)
		return 0
	}
}

func (m *Manager) luaOnMessageSent(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		fn := L.CheckFunction(1)
		instance.EventHandlers["message_sent"] = fn
		m.logger.Infow("注册自己消息发送事件处理器", "plugin", instance.Name)
		return 0
	}
}

// ========== HTTP接口API ==========

func (m *Manager) luaRegisterHTTPInterface(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		if m.httpInterfaceManager == nil {
			L.Push(lua.LBool(false))
			L.Push(lua.LString("HTTP接口管理器未初始化"))
			return 2
		}

		externalName := L.CheckString(1)
		
		// 参数2可以是selfID（字符串）或handler（函数）
		var selfID string
		var handler *lua.LFunction
		var methods []string
		
		arg2 := L.Get(2)
		if arg2.Type() == lua.LTString {
			// 新格式: register(name, selfID, handler, methods)
			selfID = arg2.String()
			handler = L.CheckFunction(3)
			methodsTable := L.OptTable(4, nil)
			methods = []string{"GET", "POST"}
			if methodsTable != nil {
				methods = []string{}
				methodsTable.ForEach(func(key lua.LValue, value lua.LValue) {
					if value.Type() == lua.LTString {
						methods = append(methods, strings.ToUpper(value.String()))
					}
				})
			}
		} else if arg2.Type() == lua.LTFunction {
			// 旧格式: register(name, handler, methods, isGlobal)
			handler = arg2.(*lua.LFunction)
			methodsTable := L.OptTable(3, nil)
			methods = []string{"GET", "POST"}
			if methodsTable != nil {
				methods = []string{}
				methodsTable.ForEach(func(key lua.LValue, value lua.LValue) {
					if value.Type() == lua.LTString {
						methods = append(methods, strings.ToUpper(value.String()))
					}
				})
			}
			// 可选参数：isGlobal，如果为true则注册为全局接口（所有账号共享）
			isGlobal := L.OptBool(4, false)
			selfID = instance.SelfID
			if isGlobal {
				selfID = "" // 全局接口selfID为空
			}
		} else {
			L.Push(lua.LBool(false))
			L.Push(lua.LString("第二个参数必须是selfID（字符串）或handler（函数）"))
			return 2
		}

		if err := m.httpInterfaceManager.RegisterHTTPHandler(instance.Name, selfID, externalName, handler, methods); err != nil {
			L.Push(lua.LBool(false))
			L.Push(lua.LString(err.Error()))
			return 2
		}

		L.Push(lua.LBool(true))
		return 1
	}
}

func (m *Manager) luaUnregisterHTTPInterface(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		if m.httpInterfaceManager == nil {
			L.Push(lua.LBool(false))
			L.Push(lua.LString("HTTP接口管理器未初始化"))
			return 2
		}

		externalName := L.CheckString(1)
		// 可选参数：selfID，如果不传则使用当前插件的selfID
		selfID := L.OptString(2, instance.SelfID)

		if err := m.httpInterfaceManager.UnregisterHTTPHandler(externalName, selfID); err != nil {
			L.Push(lua.LBool(false))
			L.Push(lua.LString(err.Error()))
			return 2
		}

		L.Push(lua.LBool(true))
		return 1
	}
}

// ========== 辅助函数 ==========

// convertToLuaTable 将Go map转换为Lua表（已移动到manager.go，这里保留以便lua_api.go使用）
func (m *Manager) convertToLuaTable(L *lua.LState, data map[string]interface{}) *lua.LTable {
	table := L.NewTable()
	for k, v := range data {
		L.SetField(table, k, m.convertToLuaValue(L, v))
	}
	return table
}

// convertToLuaValue 将Go值转换为Lua值（已移动到manager.go，这里保留以便lua_api.go使用）
// 支持的类型包括：
//   - 基本类型: nil, bool, int, int64, uint, uint64, float32, float64, string
//   - 时间类型: time.Time (转换为Unix时间戳数字)
//   - JSON类型: json.RawMessage (解析后转换)
//   - 数组类型: []interface{}, []map[string]interface{}, []string, []int, []int64, []float64
//   - 映射类型: map[string]interface{}, map[string]string, map[interface{}]interface{}
func (m *Manager) convertToLuaValue(L *lua.LState, v interface{}) lua.LValue {
	switch val := v.(type) {
	case nil:
		return lua.LNil
	case bool:
		return lua.LBool(val)
	case int:
		return lua.LNumber(val)
	case int64:
		return lua.LNumber(val)
	case int32:
		return lua.LNumber(val)
	case uint:
		return lua.LNumber(val)
	case uint64:
		return lua.LNumber(val)
	case uint32:
		return lua.LNumber(val)
	case float32:
		return lua.LNumber(val)
	case float64:
		return lua.LNumber(val)
	case string:
		return lua.LString(val)
	case time.Time:
		return lua.LNumber(val.Unix())
	case json.RawMessage:
		var parsed interface{}
		if err := json.Unmarshal(val, &parsed); err == nil {
			return m.convertToLuaValue(L, parsed)
		}
		return lua.LString(string(val))
	case []interface{}:
		arr := L.NewTable()
		for i, item := range val {
			L.RawSetInt(arr, i+1, m.convertToLuaValue(L, item))
		}
		return arr
	case []map[string]interface{}:
		arr := L.NewTable()
		for i, item := range val {
			if item == nil {
				L.RawSetInt(arr, i+1, lua.LNil)
			} else {
				L.RawSetInt(arr, i+1, m.convertToLuaTable(L, item))
			}
		}
		return arr
	case []string:
		arr := L.NewTable()
		for i, item := range val {
			L.RawSetInt(arr, i+1, lua.LString(item))
		}
		return arr
	case []int:
		arr := L.NewTable()
		for i, item := range val {
			L.RawSetInt(arr, i+1, lua.LNumber(item))
		}
		return arr
	case []int64:
		arr := L.NewTable()
		for i, item := range val {
			L.RawSetInt(arr, i+1, lua.LNumber(item))
		}
		return arr
	case []float64:
		arr := L.NewTable()
		for i, item := range val {
			L.RawSetInt(arr, i+1, lua.LNumber(item))
		}
		return arr
	case map[string]interface{}:
		return m.convertToLuaTable(L, val)
	case map[string]string:
		newMap := make(map[string]interface{})
		for k, v := range val {
			newMap[k] = v
		}
		return m.convertToLuaTable(L, newMap)
	case map[interface{}]interface{}:
		newMap := make(map[string]interface{})
		for k, v := range val {
			if keyStr, ok := k.(string); ok {
				newMap[keyStr] = v
			}
		}
		return m.convertToLuaTable(L, newMap)
	default:
		if arr, ok := val.([]map[string]interface{}); ok {
			tbl := L.NewTable()
			for i, item := range arr {
				L.RawSetInt(tbl, i+1, m.convertToLuaTable(L, item))
			}
			return tbl
		}
		// 处理可能的布尔值指针或其他类型
		switch reflect.TypeOf(val).Kind() {
		case reflect.Bool:
			if reflect.ValueOf(val).Bool() {
				return lua.LTrue
			}
			return lua.LFalse
		case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
			return lua.LNumber(reflect.ValueOf(val).Int())
		case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
			return lua.LNumber(reflect.ValueOf(val).Uint())
		case reflect.Float32, reflect.Float64:
			return lua.LNumber(reflect.ValueOf(val).Float())
		case reflect.String:
			return lua.LString(reflect.ValueOf(val).String())
		default:
			return lua.LString(fmt.Sprintf("%v", val))
		}
	}
}

// 辅助函数：从Lua表中提取数字
func luaTableToNumber(L *lua.LState, table *lua.LTable, key string) (float64, bool) {
	val := L.GetField(table, key)
	if val == lua.LNil {
		return 0, false
	}
	if num, ok := val.(lua.LNumber); ok {
		return float64(num), true
	}
	return 0, false
}

// 辅助函数：从Lua表中提取字符串
func luaTableToString(L *lua.LState, table *lua.LTable, key string) (string, bool) {
	val := L.GetField(table, key)
	if val == lua.LNil {
		return "", false
	}
	if str, ok := val.(lua.LString); ok {
		return string(str), true
	}
	return "", false
}

// 辅助函数：将Lua表转换为Go map（保留混合表结构）
func luaTableToMap(L *lua.LState, table *lua.LTable) map[string]interface{} {
	result := make(map[string]interface{})

	// 首先检查是否有数组部分，如果有，将其作为"_array"键保存
	arrayLen := table.Len()
	if arrayLen > 0 {
		arr := make([]interface{}, arrayLen)
		hasArrayData := false
		for i := 1; i <= arrayLen; i++ {
			val := L.RawGetInt(table, i)
			if val != lua.LNil {
				hasArrayData = true
			}
			arr[i-1] = luaValueToGo(L, val)
		}
		if hasArrayData {
			result["_array"] = arr
		}
	}

	// 使用 ForEach 遍历表，处理非数组键
	table.ForEach(func(key lua.LValue, value lua.LValue) {
		// 跳过数组索引（数字键在1到arrayLen范围内）
		if key.Type() == lua.LTNumber {
			numKey := int(key.(lua.LNumber))
			if numKey >= 1 && numKey <= arrayLen {
				return // 跳过已处理的数组索引
			}
			// 超出数组范围的数字键，转换为字符串键
			keyStr := strconv.FormatInt(int64(numKey), 10)
			result[keyStr] = luaValueToGo(L, value)
			return
		}
		keyStr := key.String()
		result[keyStr] = luaValueToGo(L, value)
	})

	return result
}

// 辅助函数：将Lua值转换为Go值
func luaValueToGo(L *lua.LState, val lua.LValue) interface{} {
	switch v := val.(type) {
	case *lua.LNilType:
		return nil
	case lua.LBool:
		return bool(v)
	case lua.LString:
		return string(v)
	case lua.LNumber:
		return float64(v)
	case *lua.LTable:
		// 检查表的结构：纯数组、纯map或混合表
		arrayLen := v.Len()
		hasArrayPart := arrayLen > 0
		hasMapPart := false

		// 检查是否有非数组键
		v.ForEach(func(key lua.LValue, value lua.LValue) {
			if key.Type() != lua.LTNumber {
				hasMapPart = true
			} else {
				numKey := int(key.(lua.LNumber))
				if numKey < 1 || numKey > arrayLen {
					hasMapPart = true
				}
			}
		})

		// 纯数组：只有数组部分，没有map部分
		if hasArrayPart && !hasMapPart {
			arr := make([]interface{}, arrayLen)
			for i := 1; i <= arrayLen; i++ {
				arr[i-1] = luaValueToGo(L, L.RawGetInt(v, i))
			}
			return arr
		}

		// 纯map：没有数组部分，只有map部分
		if !hasArrayPart && hasMapPart {
			return luaTableToMap(L, v)
		}

		// 混合表：同时有数组和map部分，使用luaTableToMap处理（它会保留数组数据到_array键）
		return luaTableToMap(L, v)
	default:
		return v.String()
	}
}

// 辅助函数：将Lua表转换为interface{}（自动判断是数组还是map）
func luaTableToInterface(L *lua.LState, table *lua.LTable) interface{} {
	return luaValueToGo(L, table)
}

// ========== 转发消息API ==========

// 发送群转发消息
func (m *Manager) luaSendGroupForwardMessage(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIBoolError(L, err, "发送群转发消息失败")
		}

		// 验证参数
		groupId, err := validateNumberParam(L, 1, "group_id", true)
		if err != nil {
			return luaAPIBoolError(L, err, "参数验证失败")
		}

		// 验证消息数组
		if L.Get(2).Type() != lua.LTTable {
			return luaAPIBoolError(L, fmt.Errorf("messages参数必须是数组"), "参数验证失败")
		}

		messages := luaTableToInterface(L, L.ToTable(2))

		// 调用服务
		groupIDInt := int64(groupId)
		result, err := callBotAPI(instance, "send_group_forward_msg", map[string]interface{}{"group_id": groupIDInt, "messages": messages})
		if err != nil {
			return luaAPIBoolError(L, err, fmt.Sprintf("发送群转发消息失败 [group_id=%d]", groupIDInt))
		}

		return luaAPIBoolSuccess(L, m, result)
	}
}

// 发送私聊转发消息
func (m *Manager) luaSendPrivateForwardMessage(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIBoolError(L, err, "发送私聊转发消息失败")
		}

		// 验证参数
		userId, err := validateNumberParam(L, 1, "user_id", true)
		if err != nil {
			return luaAPIBoolError(L, err, "参数验证失败")
		}

		// 验证消息数组
		if L.Get(2).Type() != lua.LTTable {
			return luaAPIBoolError(L, fmt.Errorf("messages参数必须是数组"), "参数验证失败")
		}

		messages := luaTableToInterface(L, L.ToTable(2))

		// 调用服务
		userIDInt := int64(userId)
		result, err := callBotAPI(instance, "send_private_forward_msg", map[string]interface{}{"user_id": userIDInt, "messages": messages})
		if err != nil {
			return luaAPIBoolError(L, err, fmt.Sprintf("发送私聊转发消息失败 [user_id=%d]", userIDInt))
		}

		return luaAPIBoolSuccess(L, m, result)
	}
}

// ========== 语音和视频API ==========

// 获取视频文件
func (m *Manager) luaGetVideo(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取视频文件失败")
		}

		// 验证参数
		file, err := validateStringParam(L, 1, "file", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		result, err := callBotAPI(instance, "get_video", map[string]interface{}{"file": file})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("获取视频文件失败 [file=%s]", file))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// ========== 群文件API ==========

// 删除群文件
func (m *Manager) luaDeleteGroupFile(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIBoolError(L, err, "删除群文件失败")
		}

		// 验证参数
		groupId, err := validateNumberParam(L, 1, "group_id", true)
		if err != nil {
			return luaAPIBoolError(L, err, "参数验证失败")
		}

		fileId, err := validateStringParam(L, 2, "file_id", true)
		if err != nil {
			return luaAPIBoolError(L, err, "参数验证失败")
		}

		busid, err := validateIntParam(L, 3, "busid", true, 0, 999999)
		if err != nil {
			return luaAPIBoolError(L, err, "参数验证失败")
		}

		// 调用服务
		groupIDInt := int64(groupId)
		result, err := callBotAPI(instance, "delete_group_file", map[string]interface{}{"group_id": groupIDInt, "file_id": fileId, "busid": busid})
		if err != nil {
			return luaAPIBoolError(L, err, fmt.Sprintf("删除群文件失败 [group_id=%d]", groupIDInt))
		}

		return luaAPIBoolSuccess(L, m, result)
	}
}

// 获取群文件系统信息
func (m *Manager) luaGetGroupFileSystemInfo(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取群文件系统信息失败")
		}

		// 验证参数
		groupId, err := validateNumberParam(L, 1, "group_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		groupIDInt := int64(groupId)
		result, err := callBotAPI(instance, "get_group_file_system_info", map[string]interface{}{"group_id": groupIDInt})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("获取群文件系统信息失败 [group_id=%d]", groupIDInt))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 获取群根目录文件列表
func (m *Manager) luaGetGroupRootFiles(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取群根目录文件列表失败")
		}

		// 验证参数
		groupId, err := validateNumberParam(L, 1, "group_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		groupIDInt := int64(groupId)
		result, err := callBotAPI(instance, "get_group_root_files", map[string]interface{}{"group_id": groupIDInt})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("获取群根目录文件列表失败 [group_id=%d]", groupIDInt))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 获取群子目录文件列表
func (m *Manager) luaGetGroupFilesByFolder(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取群子目录文件列表失败")
		}

		// 验证参数
		groupId, err := validateNumberParam(L, 1, "group_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		folderId, err := validateStringParam(L, 2, "folder_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		groupIDInt := int64(groupId)
		result, err := callBotAPI(instance, "get_group_files_by_folder", map[string]interface{}{"group_id": groupIDInt, "folder_id": folderId})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("获取群子目录文件列表失败 [group_id=%d]", groupIDInt))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// ========== 群管理API ==========

// 群组全员禁言
func (m *Manager) luaSetGroupWholeBan(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIBoolError(L, err, "群组全员禁言失败")
		}

		// 验证参数
		groupId, err := validateNumberParam(L, 1, "group_id", true)
		if err != nil {
			return luaAPIBoolError(L, err, "参数验证失败")
		}

		enable := L.OptBool(2, true)

		// 调用服务
		groupIDInt := int64(groupId)
		result, err := callBotAPI(instance, "set_group_whole_ban", map[string]interface{}{"group_id": groupIDInt, "enable": enable})
		if err != nil {
			return luaAPIBoolError(L, err, fmt.Sprintf("群组全员禁言失败 [group_id=%d]", groupIDInt))
		}

		return luaAPIBoolSuccess(L, m, result)
	}
}

// 群组设置管理员
func (m *Manager) luaSetGroupAdmin(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIBoolError(L, err, "群组设置管理员失败")
		}

		// 验证参数
		groupId, err := validateNumberParam(L, 1, "group_id", true)
		if err != nil {
			return luaAPIBoolError(L, err, "参数验证失败")
		}

		userId, err := validateNumberParam(L, 2, "user_id", true)
		if err != nil {
			return luaAPIBoolError(L, err, "参数验证失败")
		}

		enable := L.OptBool(3, true)

		// 调用服务
		groupIDInt := int64(groupId)
		userIDInt := int64(userId)
		result, err := callBotAPI(instance, "set_group_admin", map[string]interface{}{"group_id": groupIDInt, "user_id": userIDInt, "enable": enable})
		if err != nil {
			return luaAPIBoolError(L, err, fmt.Sprintf("群组设置管理员失败 [group_id=%d, user_id=%d]", groupIDInt, userIDInt))
		}

		return luaAPIBoolSuccess(L, m, result)
	}
}

// 设置群名片
func (m *Manager) luaSetGroupCard(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIBoolError(L, err, "设置群名片失败")
		}

		// 验证参数
		groupId, err := validateNumberParam(L, 1, "group_id", true)
		if err != nil {
			return luaAPIBoolError(L, err, "参数验证失败")
		}

		userId, err := validateNumberParam(L, 2, "user_id", true)
		if err != nil {
			return luaAPIBoolError(L, err, "参数验证失败")
		}

		card, err := validateStringParam(L, 3, "card", false)
		if err != nil {
			return luaAPIBoolError(L, err, "参数验证失败")
		}

		// 调用服务
		groupIDInt := int64(groupId)
		userIDInt := int64(userId)
		result, err := callBotAPI(instance, "set_group_card", map[string]interface{}{"group_id": groupIDInt, "user_id": userIDInt, "card": card})
		if err != nil {
			return luaAPIBoolError(L, err, fmt.Sprintf("设置群名片失败 [group_id=%d, user_id=%d]", groupIDInt, userIDInt))
		}

		return luaAPIBoolSuccess(L, m, result)
	}
}

// 群组踢人
func (m *Manager) luaSetGroupKick(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIBoolError(L, err, "群组踢人失败")
		}

		// 验证参数
		groupId, err := validateNumberParam(L, 1, "group_id", true)
		if err != nil {
			return luaAPIBoolError(L, err, "参数验证失败")
		}

		userId, err := validateNumberParam(L, 2, "user_id", true)
		if err != nil {
			return luaAPIBoolError(L, err, "参数验证失败")
		}

		rejectAddRequest := L.OptBool(3, false)

		// 调用服务
		groupIDInt := int64(groupId)
		userIDInt := int64(userId)
		result, err := callBotAPI(instance, "set_group_kick", map[string]interface{}{"group_id": groupIDInt, "user_id": userIDInt, "reject_add_request": rejectAddRequest})
		if err != nil {
			return luaAPIBoolError(L, err, fmt.Sprintf("群组踢人失败 [group_id=%d, user_id=%d]", groupIDInt, userIDInt))
		}

		return luaAPIBoolSuccess(L, m, result)
	}
}

// ========== 好友管理API ==========

// 处理加好友请求
func (m *Manager) luaSetFriendAddRequest(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIBoolError(L, err, "处理加好友请求失败")
		}

		// 验证参数
		flag, err := validateStringParam(L, 1, "flag", true)
		if err != nil {
			return luaAPIBoolError(L, err, "参数验证失败")
		}

		approve := L.OptBool(2, true)
		remark := L.OptString(3, "")

		// 调用服务
		result, err := callBotAPI(instance, "set_friend_add_request", map[string]interface{}{"flag": flag, "approve": approve, "remark": remark})
		if err != nil {
			return luaAPIBoolError(L, err, fmt.Sprintf("处理加好友请求失败 [flag=%s]", flag))
		}

		return luaAPIBoolSuccess(L, m, result)
	}
}

// 处理加群请求
func (m *Manager) luaSetGroupAddRequest(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIBoolError(L, err, "处理加群请求失败")
		}

		// 验证参数
		flag, err := validateStringParam(L, 1, "flag", true)
		if err != nil {
			return luaAPIBoolError(L, err, "参数验证失败")
		}

		subType, err := validateStringParam(L, 2, "sub_type", true)
		if err != nil {
			return luaAPIBoolError(L, err, "参数验证失败")
		}

		approve := L.OptBool(3, true)
		reason := L.OptString(4, "")

		// 调用服务
		result, err := callBotAPI(instance, "set_group_add_request", map[string]interface{}{"flag": flag, "sub_type": subType, "approve": approve, "reason": reason})
		if err != nil {
			return luaAPIBoolError(L, err, fmt.Sprintf("处理加群请求失败 [flag=%s]", flag))
		}

		return luaAPIBoolSuccess(L, m, result)
	}
}

// ========== 其他API ==========

// 发送好友赞
func (m *Manager) luaSendLike(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIBoolError(L, err, "发送好友赞失败")
		}

		// 验证参数
		userId, err := validateNumberParam(L, 1, "user_id", true)
		if err != nil {
			return luaAPIBoolError(L, err, "参数验证失败")
		}

		times, err := validateIntParam(L, 2, "times", false, 1, 10)
		if err != nil {
			times = 1 // 默认1次
		}

			// 调用服务
		userIDInt := int64(userId)
		params := map[string]interface{}{
			"user_id": userIDInt,
			"times":   times,
		}
		result, err := callBotAPI(instance, "send_like", params)
		if err != nil {
			return luaAPIBoolError(L, err, fmt.Sprintf("发送好友赞失败 [user_id=%d]", userIDInt))
		}

		return luaAPIBoolSuccess(L, m, result)
	}
}

// 设置精华消息
func (m *Manager) luaSetEssenceMsg(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIBoolError(L, err, "设置精华消息失败")
		}

		// 验证参数
		messageId, err := validateNumberParam(L, 1, "message_id", true)
		if err != nil {
			return luaAPIBoolError(L, err, "参数验证失败")
		}

		// 调用服务
		messageIDInt := int64(messageId)
		result, err := callBotAPI(instance, "set_essence_msg", map[string]interface{}{"message_id": messageIDInt})
		if err != nil {
			return luaAPIBoolError(L, err, fmt.Sprintf("设置精华消息失败 [message_id=%d]", messageIDInt))
		}

		return luaAPIBoolSuccess(L, m, result)
	}
}

// 获取精华消息列表
func (m *Manager) luaGetEssenceMsgList(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取精华消息列表失败")
		}

		// 验证参数
		groupId, err := validateNumberParam(L, 1, "group_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		groupIDInt := int64(groupId)
		result, err := callBotAPI(instance, "get_essence_msg_list", map[string]interface{}{"group_id": groupIDInt})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("获取精华消息列表失败 [group_id=%d]", groupIDInt))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 检查链接安全性
func (m *Manager) luaCheckUrlSafely(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "检查链接安全性失败")
		}

		// 验证参数
		url, err := validateStringParam(L, 1, "url", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		result, err := callBotAPI(instance, "check_url_safely", map[string]interface{}{"url": url})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("检查链接安全性失败 [url=%s]", url))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 获取登录信息
func (m *Manager) luaGetLoginInfo(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取登录信息失败")
		}

		// 调用API获取登录信息
		result, err := callBotAPI(instance, "get_login_info", nil)
		if err != nil {
			return luaAPIError(L, err, "获取登录信息失败")
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 获取版本信息
func (m *Manager) luaGetVersionInfo(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取版本信息失败")
		}

		// 调用API获取版本信息
		result, err := callBotAPI(instance, "get_version_info", nil)
		if err != nil {
			return luaAPIError(L, err, "获取版本信息失败")
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 获取机器人状态
func (m *Manager) luaGetBotStatus(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取机器人状态失败")
		}

		// 调用API获取机器人状态
		result, err := callBotAPI(instance, "get_status", nil)
		if err != nil {
			return luaAPIError(L, err, "获取机器人状态失败")
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 获取图片
func (m *Manager) luaGetImage(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取图片失败")
		}

		// 验证参数
		file, err := validateStringParam(L, 1, "file", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		result, err := callBotAPI(instance, "get_image", map[string]interface{}{"file": file})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("获取图片失败 [file=%s]", file))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 获取语音
func (m *Manager) luaGetRecord(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取语音失败")
		}

		// 验证参数
		file, err := validateStringParam(L, 1, "file", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 可选参数：out_format
		outFormat := L.OptString(2, "mp3")

		// 调用服务
		result, err := callBotAPI(instance, "get_record", map[string]interface{}{
			"file":       file,
			"out_format": outFormat,
		})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("获取语音失败 [file=%s]", file))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 扫码
func (m *Manager) luaScanQRCode(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "扫码失败")
		}

		// 解析参数表
		params := make(map[string]interface{})
		if L.GetTop() >= 1 {
			tbl := L.OptTable(1, nil)
			if tbl != nil {
				params = luaTableToMap(L, tbl)
			}
		}

		// 调用服务
		result, err := callBotAPI(instance, "scan_qrcode", params)
		if err != nil {
			return luaAPIError(L, err, "扫码失败")
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// ========== 管理员验证API ==========

// luaIsGroupAdmin 检查指定用户是否为群管理员
func (m *Manager) luaIsGroupAdmin(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			L.Push(lua.LBool(false))
			return 1
		}

		// 验证参数
		groupId, err := validateNumberParam(L, 1, "group_id", true)
		if err != nil {
			L.Push(lua.LBool(false))
			return 1
		}

		userId, err := validateNumberParam(L, 2, "user_id", true)
		if err != nil {
			L.Push(lua.LBool(false))
			return 1
		}

		// 调用服务获取群成员信息
		groupIDInt := int64(groupId)
		userIDInt := int64(userId)
		result, err := callBotAPI(instance, "get_group_member_info", map[string]interface{}{
			"group_id": groupIDInt,
			"user_id":  userIDInt,
			"no_cache": true,
		})
		if err != nil {
			L.Push(lua.LBool(false))
			return 1
		}

		// 检查是否为管理员（role字段：owner表示群主，admin表示管理员）
		if result == nil {
			L.Push(lua.LBool(false))
			return 1
		}

		// 转换结果为Lua表进行字段检查
		resultTable := m.convertToLuaValue(L, result)
		if resultTable.Type() == lua.LTTable {
			role := L.GetField(resultTable, "role")
			if role.Type() == lua.LTString {
				roleStr := role.String()
				if roleStr == "owner" || roleStr == "admin" {
					L.Push(lua.LBool(true))
					return 1
				}
			}
		}

		L.Push(lua.LBool(false))
		return 1
	}
}

// ========== URL检测与提取API ==========

// luaMsgHasURL 检查消息是否包含URL
func (m *Manager) luaMsgHasURL() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LBool(false))
			return 1
		}

		// 获取纯文本消息
		plainText := ""
		messageField := L.GetField(event, "message")
		if messageField.Type() == lua.LTTable {
			messageTable := messageField.(*lua.LTable)
			var textBuilder strings.Builder
			messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
				if segment.Type() != lua.LTTable {
					return
				}
				segmentTable := segment.(*lua.LTable)
				segType := L.GetField(segmentTable, "type")
				if segType.Type() == lua.LTString && segType.String() == "text" {
					segData := L.GetField(segmentTable, "data")
					if segData.Type() == lua.LTTable {
						segDataTable := segData.(*lua.LTable)
						textContent := L.GetField(segDataTable, "text")
						if textContent.Type() == lua.LTString {
							textBuilder.WriteString(textContent.String())
						}
					}
				}
			})
			plainText = textBuilder.String()
		} else if messageField.Type() == lua.LTString {
			plainText = messageField.String()
		}

		// 使用预编译的正则表达式检测URL
		hasURL := urlExtractPattern.MatchString(plainText)
		L.Push(lua.LBool(hasURL))
		return 1
	}
}

// luaMsgCountURLs 统计消息中URL的数量
func (m *Manager) luaMsgCountURLs() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LNumber(0))
			return 1
		}

		// 获取纯文本消息
		plainText := ""
		messageField := L.GetField(event, "message")
		if messageField.Type() == lua.LTTable {
			messageTable := messageField.(*lua.LTable)
			var textBuilder strings.Builder
			messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
				if segment.Type() != lua.LTTable {
					return
				}
				segmentTable := segment.(*lua.LTable)
				segType := L.GetField(segmentTable, "type")
				if segType.Type() == lua.LTString && segType.String() == "text" {
					segData := L.GetField(segmentTable, "data")
					if segData.Type() == lua.LTTable {
						segDataTable := segData.(*lua.LTable)
						textContent := L.GetField(segDataTable, "text")
						if textContent.Type() == lua.LTString {
							textBuilder.WriteString(textContent.String())
						}
					}
				}
			})
			plainText = textBuilder.String()
		} else if messageField.Type() == lua.LTString {
			plainText = messageField.String()
		}

		// 使用预编译的正则表达式提取URL并计数
		links := urlExtractPattern.FindAllString(plainText, -1)
		L.Push(lua.LNumber(len(links)))
		return 1
	}
}

// luaMsgGetURLs 获取消息中的所有URL（支持可选的索引参数）
func (m *Manager) luaMsgGetURLs() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(L.NewTable())
			return 1
		}

		// 可选的索引参数（从1开始）
		index := 0
		if L.GetTop() >= 2 {
			index = int(L.ToNumber(2))
		}

		// 获取纯文本消息
		plainText := ""
		messageField := L.GetField(event, "message")
		if messageField.Type() == lua.LTTable {
			messageTable := messageField.(*lua.LTable)
			var textBuilder strings.Builder
			messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
				if segment.Type() != lua.LTTable {
					return
				}
				segmentTable := segment.(*lua.LTable)
				segType := L.GetField(segmentTable, "type")
				if segType.Type() == lua.LTString && segType.String() == "text" {
					segData := L.GetField(segmentTable, "data")
					if segData.Type() == lua.LTTable {
						segDataTable := segData.(*lua.LTable)
						textContent := L.GetField(segDataTable, "text")
						if textContent.Type() == lua.LTString {
							textBuilder.WriteString(textContent.String())
						}
					}
				}
			})
			plainText = textBuilder.String()
		} else if messageField.Type() == lua.LTString {
			plainText = messageField.String()
		}

		// 使用预编译的正则表达式提取URL
		links := urlExtractPattern.FindAllString(plainText, -1)

		// 如果指定了索引，返回指定位置的URL（索引从1开始）
		if index > 0 && index <= len(links) {
			L.Push(lua.LString(links[index-1]))
			return 1
		}

		// 如果没有指定索引或索引无效，返回所有URL组成的表
		resultTable := L.NewTable()
		for i, link := range links {
			L.SetField(resultTable, strconv.Itoa(i+1), lua.LString(link))
		}
		L.Push(resultTable)
		return 1
	}
}

// ========== 二维码检测与解析API ==========

// luaImageHasQRCode 检查图片是否包含二维码
func (m *Manager) luaImageHasQRCode(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			L.Push(lua.LBool(false))
			return 1
		}

		// 验证参数
		image, err := validateStringParam(L, 1, "image", true)
		if err != nil {
			L.Push(lua.LBool(false))
			return 1
		}

		// 调用扫码API检测二维码
		result, err := callBotAPI(instance, "scan_qrcode", map[string]interface{}{
			"image": image,
		})
		if err != nil || result == nil {
			L.Push(lua.LBool(false))
			return 1
		}

		// 检查结果中是否有二维码数据
		if resultArray, ok := result["data"].([]interface{}); ok && len(resultArray) > 0 {
			L.Push(lua.LBool(true))
			return 1
		}

		L.Push(lua.LBool(false))
		return 1
	}
}

// luaImageCountQRCodes 统计图片中二维码的数量
func (m *Manager) luaImageCountQRCodes(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			L.Push(lua.LNumber(0))
			return 1
		}

		// 验证参数
		image, err := validateStringParam(L, 1, "image", true)
		if err != nil {
			L.Push(lua.LNumber(0))
			return 1
		}

		// 调用扫码API
		result, err := callBotAPI(instance, "scan_qrcode", map[string]interface{}{
			"image": image,
		})
		if err != nil || result == nil {
			L.Push(lua.LNumber(0))
			return 1
		}

		// 检查结果中二维码的数量
		if resultArray, ok := result["data"].([]interface{}); ok {
			L.Push(lua.LNumber(len(resultArray)))
			return 1
		}

		L.Push(lua.LNumber(0))
		return 1
	}
}

// luaImageGetQRCodes 获取图片中二维码的内容（支持可选的索引参数）
func (m *Manager) luaImageGetQRCodes(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			L.Push(L.NewTable())
			return 1
		}

		// 验证参数
		image, err := validateStringParam(L, 1, "image", true)
		if err != nil {
			L.Push(L.NewTable())
			return 1
		}

		// 可选的索引参数（从1开始）
		index := 0
		if L.GetTop() >= 2 {
			index = int(L.ToNumber(2))
		}

		// 调用扫码API
		result, err := callBotAPI(instance, "scan_qrcode", map[string]interface{}{
			"image": image,
		})
		if err != nil || result == nil {
			L.Push(L.NewTable())
			return 1
		}

		// 解析结果
		resultArray, ok := result["data"].([]interface{})
		if !ok || len(resultArray) == 0 {
			L.Push(L.NewTable())
			return 1
		}

		// 如果指定了索引，返回指定位置的二维码内容
		if index > 0 && index <= len(resultArray) {
			item := resultArray[index-1]
			if itemMap, ok := item.(map[string]interface{}); ok {
				if rawURL, ok := itemMap["raw_url"].(string); ok {
					L.Push(lua.LString(rawURL))
					return 1
				}
			}
			// 如果不是map，尝试直接转为字符串
			L.Push(m.convertToLuaValue(L, item))
			return 1
		}

		// 如果没有指定索引或索引无效，返回所有二维码内容组成的表
		resultTable := L.NewTable()
		for i, item := range resultArray {
			if itemMap, ok := item.(map[string]interface{}); ok {
				if rawURL, ok := itemMap["raw_url"].(string); ok {
					L.SetField(resultTable, strconv.Itoa(i+1), lua.LString(rawURL))
				} else {
					L.SetField(resultTable, strconv.Itoa(i+1), m.convertToLuaValue(L, item))
				}
			} else {
				L.SetField(resultTable, strconv.Itoa(i+1), m.convertToLuaValue(L, item))
			}
		}
		L.Push(resultTable)
		return 1
	}
}

// ========== 消息解析API ==========

// getEventTable 辅助函数：从Lua栈获取事件数据，支持表或JSON字符串
func (m *Manager) getEventTable(L *lua.LState, idx int) *lua.LTable {
	val := L.Get(idx)
	switch val.Type() {
	case lua.LTTable:
		return val.(*lua.LTable)
	case lua.LTString:
		// 如果是JSON字符串，解码为表
		jsonStr := val.String()
		if jsonStr == "" {
			return nil
		}
		
		// 尝试使用json.decode解码（如果可用）
		L.GetGlobal("json")
		if L.GetTop() > 0 && L.Get(-1).Type() == lua.LTTable {
			jsonTable := L.Get(-1).(*lua.LTable)
			decodeVal := L.GetField(jsonTable, "decode")
			if decodeVal.Type() == lua.LTFunction {
				L.Push(decodeVal)
				L.Push(lua.LString(jsonStr))
				if err := L.PCall(1, 1, nil); err == nil {
					result := L.Get(-1)
					L.Remove(-2) // 移除json表
					if result.Type() == lua.LTTable {
						return result.(*lua.LTable)
					}
					L.Pop(1)
					return nil
				}
				L.Pop(1) // 弹出错误
			}
			L.Pop(1) // 弹出json.decode或nil
		}
		L.Pop(1) // 弹出json表或nil
		
		// 如果json.decode不可用，尝试使用blockly_json.decode
		L.GetGlobal("blockly_json")
		if L.GetTop() > 0 && L.Get(-1).Type() == lua.LTTable {
			blocklyJsonTable := L.Get(-1).(*lua.LTable)
			decodeVal := L.GetField(blocklyJsonTable, "decode")
			if decodeVal.Type() == lua.LTFunction {
				L.Push(decodeVal)
				L.Push(lua.LString(jsonStr))
				if err := L.PCall(1, 1, nil); err == nil {
					result := L.Get(-1)
					L.Remove(-2) // 移除blockly_json表
					if result.Type() == lua.LTTable {
						return result.(*lua.LTable)
					}
					L.Pop(1)
					return nil
				}
				L.Pop(1) // 弹出错误
			}
			L.Pop(1) // 弹出blockly_json.decode或nil
		}
		L.Pop(1) // 弹出blockly_json表或nil
		
		return nil
	default:
		return nil
	}
}

// 检查消息是否@了机器人
func (m *Manager) luaMsgIsAtBot() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LBool(false))
			return 1
		}
		botIdStr := ""
		
		// 支持数字和字符串类型的botId
		botIdVal := L.Get(2)
		switch botIdVal.Type() {
		case lua.LTNumber:
			botIdStr = strconv.FormatInt(int64(botIdVal.(lua.LNumber)), 10)
		case lua.LTString:
			botIdStr = botIdVal.String()
		default:
			L.Push(lua.LBool(false))
			return 1
		}
		
		// 先检查raw_message字段，使用正则表达式匹配CQ码中的at信息
		rawMessageField := L.GetField(event, "raw_message")
		if rawMessageField.Type() == lua.LTString {
			rawMessage := rawMessageField.String()
			// 使用预编译的正则表达式匹配 [CQ:at,qq=123456] 或 [CQ:at,qq=123456,name=昵称]
			matches := cqAtPattern.FindAllStringSubmatch(rawMessage, -1)
			for _, match := range matches {
				if len(match) > 1 && match[1] == botIdStr {
					L.Push(lua.LBool(true))
					return 1
				}
			}
		}
		
		// 从message字段获取消息段
		messageField := L.GetField(event, "message")
		if messageField.Type() == lua.LTTable {
			messageTable := messageField.(*lua.LTable)
			messageTable.ForEach(func(index lua.LValue, segment lua.LValue) {
				if segment.Type() != lua.LTTable {
					return
				}
				
				segmentTable := segment.(*lua.LTable)
				segType := L.GetField(segmentTable, "type")
				if segType.Type() == lua.LTString && segType.String() == "at" {
					segData := L.GetField(segmentTable, "data")
					if segData.Type() == lua.LTTable {
						segDataTable := segData.(*lua.LTable)
						atQQ := L.GetField(segDataTable, "qq")
						if atQQ.Type() == lua.LTString && atQQ.String() == botIdStr {
							L.Push(lua.LBool(true))
							L.SetTop(1) // 只保留返回值
						} else if atQQ.Type() == lua.LTNumber {
							atQQStr := strconv.FormatInt(int64(atQQ.(lua.LNumber)), 10)
							if atQQStr == botIdStr {
								L.Push(lua.LBool(true))
								L.SetTop(1) // 只保留返回值
							}
						}
					}
				}
			})
		}
		
		// 如果没有找到@机器人，返回false
		if L.GetTop() == 0 {
			L.Push(lua.LBool(false))
		}
		
		return 1
	}
}

// 获取回复消息ID
func (m *Manager) luaMsgGetReplyId() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LNil)
			return 1
		}
		
		// 从message字段获取消息段
		messageField := L.GetField(event, "message")
		var replyId lua.LValue = lua.LNil
		
		// 优先从结构化的message数组中解析reply信息
		if messageField.Type() == lua.LTTable {
			messageTable := messageField.(*lua.LTable)
			
			// 遍历消息段数组，查找reply类型的消息段
			messageTable.ForEach(func(index lua.LValue, segment lua.LValue) {
				if replyId != lua.LNil {
					return // 已经找到回复消息段，跳过其他
				}
				
				if segment.Type() != lua.LTTable {
					return
				}
				
				segmentTable := segment.(*lua.LTable)
				segType := L.GetField(segmentTable, "type")
				if segType.Type() != lua.LTString || segType.String() != "reply" {
					return
				}
				
				// 找到reply类型的消息段，获取其中的id
				segData := L.GetField(segmentTable, "data")
				if segData.Type() != lua.LTTable {
					return
				}
				
				segDataTable := segData.(*lua.LTable)
				idValue := L.GetField(segDataTable, "id")
				if idValue != lua.LNil {
					replyId = idValue
				}
			})
		}
		
		// 如果在结构化消息中没有找到reply信息，再尝试从raw_message解析（作为后备方案）
		if replyId == lua.LNil {
			rawMessageField := L.GetField(event, "raw_message")
			if rawMessageField.Type() == lua.LTString {
				rawMessage := rawMessageField.String()
				// 尝试从raw_message中解析[CQ:reply,id=xxx]格式的CQ码
				replyId = parseReplyFromRawMessage(L, rawMessage)
			}
		}
		
		// 如果获取到的是字符串类型的数字，尝试转换为数字类型
		if replyId.Type() == lua.LTString {
			idStr := replyId.String()
			if numValue, err := strconv.ParseInt(idStr, 10, 64); err == nil {
				replyId = lua.LNumber(numValue)
			}
		}
		
		L.Push(replyId)
		return 1
	}
}

// 从raw_message中解析reply信息
func parseReplyFromRawMessage(L *lua.LState, rawMessage string) lua.LValue {
	// 使用预编译的正则表达式匹配[CQ:reply,id=xxx]格式的CQ码
	matches := cqReplyPattern.FindStringSubmatch(rawMessage)
	if len(matches) > 1 {
		return lua.LString(matches[1])
	}

	// 如果上面的正则没匹配到，尝试更通用的匹配方式
	matches2 := cqReplyPattern2.FindStringSubmatch(rawMessage)
	if len(matches2) > 1 {
		return lua.LString(matches2[1])
	}

	return lua.LNil
}

// 检查消息是否包含关键字
func (m *Manager) luaMsgContainsKeyword() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LBool(false))
			return 1
		}
		keyword := L.CheckString(2)
		
		// 直接从raw_message字段获取纯文本进行检查，移除CQ码后再匹配关键词
		rawMessageField := L.GetField(event, "raw_message")
		if rawMessageField.Type() == lua.LTString {
			rawMessage := rawMessageField.String()
			// 使用预编译的正则表达式移除所有CQ码，只保留纯文本
			cleanMessage := cqCodePattern.ReplaceAllString(rawMessage, "")
			// 去除可能的多余空格
			cleanMessage = strings.TrimSpace(cleanMessage)
			if strings.Contains(cleanMessage, keyword) {
				L.Push(lua.LBool(true))
				return 1
			}
		}
		
		// 作为备选方案，也可以从message字段中提取纯文本
		// 但按照要求，主要依赖raw_message解析
		messageField := L.GetField(event, "message")
		if messageField.Type() == lua.LTTable {
			var cleanMessage strings.Builder
			messageTable := messageField.(*lua.LTable)
			
			messageTable.ForEach(func(index lua.LValue, segment lua.LValue) {
				if segment.Type() != lua.LTTable {
					return
				}
				
				segmentTable := segment.(*lua.LTable)
				segType := L.GetField(segmentTable, "type")
				if segType.Type() == lua.LTString && segType.String() == "text" {
					// 只获取文本类型的消息段
					segData := L.GetField(segmentTable, "data")
					if segData.Type() == lua.LTTable {
						segDataTable := segData.(*lua.LTable)
						textContent := L.GetField(segDataTable, "text")
						if textContent.Type() == lua.LTString {
							if cleanMessage.Len() > 0 {
								cleanMessage.WriteString(" ")
							}
							cleanMessage.WriteString(textContent.String())
						}
					}
				}
			})
			
			finalText := strings.TrimSpace(cleanMessage.String())
			if strings.Contains(finalText, keyword) {
				L.Push(lua.LBool(true))
				return 1
			}
		}
		
		L.Push(lua.LBool(false))
		return 1
	}
}

// 从消息中提取纯文本内容
func (m *Manager) luaMsgGetPlainText() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		m.logger.Debugw("[Lua Debug] msg.get_plain_text called", "event_is_nil", event == nil)
		if event == nil {
			L.Push(lua.LString(""))
			return 1
		}
		
		// 先尝试从raw_message字段获取完整文本
		rawMessageField := L.GetField(event, "raw_message")
		m.logger.Debugw("[Lua Debug] raw_message field", "type", rawMessageField.Type().String())
		if rawMessageField.Type() == lua.LTString {
			m.logger.Debugw("[Lua Debug] returning raw_message", "value", rawMessageField.String())
			L.Push(rawMessageField)
			return 1
		}
		
		// 如果raw_message不存在或不是字符串，再尝试从message字段获取消息段
		messageField := L.GetField(event, "message")
		if messageField.Type() != lua.LTTable {
			L.Push(lua.LString(""))
			return 1
		}
		
		messageTable := messageField.(*lua.LTable)
		var plainText strings.Builder
		
		messageTable.ForEach(func(index lua.LValue, segment lua.LValue) {
			if segment.Type() != lua.LTTable {
				return
			}
			
			segmentTable := segment.(*lua.LTable)
			segType := L.GetField(segmentTable, "type")
			if segType.Type() != lua.LTString || segType.String() != "text" {
				return
			}
			
			segData := L.GetField(segmentTable, "data")
			if segData.Type() != lua.LTTable {
				return
			}
			
			segDataTable := segData.(*lua.LTable)
			textContent := L.GetField(segDataTable, "text")
			if textContent.Type() == lua.LTString {
				plainText.WriteString(textContent.String())
			}
		})
		
		L.Push(lua.LString(plainText.String()))
		return 1
	}
}

// 获取特定类型的消息段
func (m *Manager) luaMsgGetSegmentsByType() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(L.NewTable())
			return 1
		}
		segType := L.CheckString(2)
		
		// 从message字段获取消息段
		messageField := L.GetField(event, "message")
		if messageField.Type() != lua.LTTable {
			L.Push(L.NewTable())
			return 1
		}
		
		messageTable := messageField.(*lua.LTable)
		resultTable := L.NewTable()
		index := 1
		
		messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
			if segment.Type() != lua.LTTable {
				return
			}
			
			segmentTable := segment.(*lua.LTable)
			currentType := L.GetField(segmentTable, "type")
			if currentType.Type() == lua.LTString && currentType.String() == segType {
				L.SetField(resultTable, strconv.Itoa(index), segment)
				index++
			}
		})
		
		L.Push(resultTable)
		return 1
	}
}

// 获取所有@的QQ号
func (m *Manager) luaMsgGetAtQQs() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(L.NewTable())
			return 1
		}
		
		// 从message字段获取消息段
		messageField := L.GetField(event, "message")
		if messageField.Type() != lua.LTTable {
			L.Push(L.NewTable())
			return 1
		}
		
		messageTable := messageField.(*lua.LTable)
		resultTable := L.NewTable()
		index := 1
		
		messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
			if segment.Type() != lua.LTTable {
				return
			}
			
			segmentTable := segment.(*lua.LTable)
			segType := L.GetField(segmentTable, "type")
			if segType.Type() != lua.LTString || segType.String() != "at" {
				return
			}
			
			segData := L.GetField(segmentTable, "data")
			if segData.Type() != lua.LTTable {
				return
			}
			
			segDataTable := segData.(*lua.LTable)
			atQQ := L.GetField(segDataTable, "qq")
			if atQQ.Type() == lua.LTString || atQQ.Type() == lua.LTNumber {
				L.SetField(resultTable, strconv.Itoa(index), atQQ)
				index++
			}
		})
		
		L.Push(resultTable)
		return 1
	}
}

// 获取消息元数据
func (m *Manager) luaMsgGetMetadata() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LNil)
			return 1
		}
		
		// 创建元数据表
		metaTable := L.NewTable()
		
		// 提取基本元数据
		fields := []string{"message_id", "user_id", "group_id", "time", "self_id", "message_type", "sub_type"}
		for _, field := range fields {
			value := L.GetField(event, field)
			if value != lua.LNil {
				L.SetField(metaTable, field, value)
			}
		}
		
		// 提取发送者信息
		sender := L.GetField(event, "sender")
		if sender.Type() == lua.LTTable {
			senderTable := L.NewTable()
			senderFields := []string{"user_id", "nickname", "card", "role", "title"}
			for _, field := range senderFields {
				value := L.GetField(sender.(*lua.LTable), field)
				if value != lua.LNil {
					L.SetField(senderTable, field, value)
				}
			}
			L.SetField(metaTable, "sender", senderTable)
		}
		
		L.Push(metaTable)
		return 1
	}
}

// 获取群消息历史
func (m *Manager) luaGetGroupMsgHistory(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取群消息历史失败")
		}

		// 验证参数
		groupID, err := validateIntParam(L, 1, "group_id", true, 0, 0)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 可选参数：message_seq
		messageSeq := L.OptString(2, "")

		// 可选参数：count
		count := L.OptInt(3, 20)

		// 可选参数：reverseOrder
		reverseOrder := L.OptBool(4, false)

		params := map[string]interface{}{
			"group_id": groupID,
			"count":    count,
		}
		if messageSeq != "" {
			params["message_seq"] = messageSeq
		}
		params["reverseOrder"] = reverseOrder

		// 调用服务
		result, err := callBotAPI(instance, "get_group_msg_history", params)
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("获取群消息历史失败 [group_id=%d]", groupID))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 获取好友消息历史
func (m *Manager) luaGetFriendMsgHistory(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取好友消息历史失败")
		}

		// 验证参数
		userID, err := validateIntParam(L, 1, "user_id", true, 0, 0)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 可选参数：message_seq
		messageSeq := L.OptString(2, "")

		// 可选参数：count
		count := L.OptInt(3, 20)

		// 可选参数：reverseOrder
		reverseOrder := L.OptBool(4, false)

		params := map[string]interface{}{
			"user_id": userID,
			"count":   count,
		}
		if messageSeq != "" {
			params["message_seq"] = messageSeq
		}
		params["reverseOrder"] = reverseOrder

		// 调用服务
		result, err := callBotAPI(instance, "get_friend_msg_history", params)
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("获取好友消息历史失败 [user_id=%d]", userID))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 设置消息表情点赞
func (m *Manager) luaSetMsgEmojiLike(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "设置消息表情点赞失败")
		}

		// 验证参数
		messageID, err := validateIntParam(L, 1, "message_id", true, 0, 0)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		emojiID, err := validateStringParam(L, 2, "emoji_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		result, err := callBotAPI(instance, "set_msg_emoji_like", map[string]interface{}{
			"message_id": messageID,
			"emoji_id":   emojiID,
		})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("设置消息表情点赞失败 [message_id=%d]", messageID))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 取消消息表情点赞
func (m *Manager) luaUnsetMsgEmojiLike(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "取消消息表情点赞失败")
		}

		// 验证参数
		messageID, err := validateIntParam(L, 1, "message_id", true, 0, 0)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		emojiID, err := validateStringParam(L, 2, "emoji_id", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		result, err := callBotAPI(instance, "unset_msg_emoji_like", map[string]interface{}{
			"message_id": messageID,
			"emoji_id":   emojiID,
		})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("取消消息表情点赞失败 [message_id=%d]", messageID))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 发送群AI语音
func (m *Manager) luaSendGroupAIRecord(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "发送群AI语音失败")
		}

		// 验证参数 - group_id必须大于0
		groupID, err := validateIntParam(L, 1, "group_id", true, 1, math.MaxInt32)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		text, err := validateStringParam(L, 2, "text", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		character, err := validateStringParam(L, 3, "character", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 可选参数：chat_type
		chatType := L.OptInt(4, 1)

		// 调用服务
		result, err := callBotAPI(instance, "send_group_ai_record", map[string]interface{}{
			"group_id":  groupID,
			"text":      text,
			"character": character,
			"chat_type": chatType,
		})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("发送群AI语音失败 [group_id=%d]", groupID))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 获取AI角色列表
func (m *Manager) luaGetAICharacters(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取AI角色列表失败")
		}

		// 可选参数：group_id
		var groupID int64
		if L.GetTop() >= 1 {
			groupID = L.OptInt64(1, 0)
		}

		// 可选参数：chat_type
		chatType := L.OptInt(2, 1)

		params := make(map[string]interface{})
		if groupID != 0 {
			params["group_id"] = groupID
		}
		params["chat_type"] = chatType

		// 调用服务
		result, err := callBotAPI(instance, "get_ai_characters", params)
		if err != nil {
			return luaAPIError(L, err, "获取AI角色列表失败")
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 获取群荣誉信息
func (m *Manager) luaGetGroupHonorInfo(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		// 检查服务
		if err := checkLLService(L, instance); err != nil {
			return luaAPIError(L, err, "获取群荣誉信息失败")
		}

		// 验证参数
		groupID, err := validateIntParam(L, 1, "group_id", true, 0, 0)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		type_, err := validateStringParam(L, 2, "type", true)
		if err != nil {
			return luaAPIError(L, err, "参数验证失败")
		}

		// 调用服务
		result, err := callBotAPI(instance, "get_group_honor_info", map[string]interface{}{
			"group_id": groupID,
			"type":     type_,
		})
		if err != nil {
			return luaAPIError(L, err, fmt.Sprintf("获取群荣誉信息失败 [group_id=%d]", groupID))
		}

		return luaAPISuccessWithTable(L, m, result)
	}
}

// 获取图片URL列表
func (m *Manager) luaMsgGetImageUrls() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(L.NewTable())
			return 1
		}
		
		// 从message字段获取消息段
		messageField := L.GetField(event, "message")
		if messageField.Type() != lua.LTTable {
			L.Push(L.NewTable())
			return 1
		}
		
		messageTable := messageField.(*lua.LTable)
		resultTable := L.NewTable()
		index := 1
		
		messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
			if segment.Type() != lua.LTTable {
				return
			}
			
			segmentTable := segment.(*lua.LTable)
			segType := L.GetField(segmentTable, "type")
			if segType.Type() != lua.LTString || segType.String() != "image" {
				return
			}
			
			segData := L.GetField(segmentTable, "data")
			if segData.Type() != lua.LTTable {
				return
			}
			
			segDataTable := segData.(*lua.LTable)
			imageUrl := L.GetField(segDataTable, "url")
			if imageUrl.Type() == lua.LTString {
				L.SetField(resultTable, strconv.Itoa(index), imageUrl)
				index++
			}
		})
		
		L.Push(resultTable)
		return 1
	}
}

// 获取消息中的所有图片（支持可选的索引参数）
func (m *Manager) luaMsgGetImages() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(L.NewTable())
			return 1
		}

		// 可选的索引参数（从1开始）
		index := 0
		if L.GetTop() >= 2 {
			index = int(L.ToNumber(2))
		}

		// 从message字段获取消息段
		messageField := L.GetField(event, "message")
		if messageField.Type() != lua.LTTable {
			if index > 0 {
				L.Push(lua.LNil)
				return 1
			}
			L.Push(L.NewTable())
			return 1
		}

		messageTable := messageField.(*lua.LTable)
		result := L.NewTable()
		idx := 1

		messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
			if segment.Type() != lua.LTTable {
				return
			}

			segmentTable := segment.(*lua.LTable)
			segType := L.GetField(segmentTable, "type")
			if segType.Type() != lua.LTString || segType.String() != "image" {
				return
			}

			// 获取图片URL
			segData := L.GetField(segmentTable, "data")
			if segData.Type() != lua.LTTable {
				return
			}

			segDataTable := segData.(*lua.LTable)
			urlContent := L.GetField(segDataTable, "url")
			if urlContent.Type() == lua.LTString {
				// 如果指定了索引，检查是否匹配
				if index > 0 && idx == index {
					L.Push(urlContent)
					return
				}
				L.RawSetInt(result, idx, urlContent)
				idx++
			}
		})

		// 如果指定了索引但没找到，返回nil；否则返回表
		if index > 0 && idx <= index {
			L.Push(lua.LNil)
			return 1
		}

		if index > 0 {
			return 1
		}
		L.Push(result)
		return 1
	}
}

// 获取消息中@的用户列表（支持可选的索引参数）
func (m *Manager) luaMsgGetAtUsers() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(L.NewTable())
			return 1
		}

		// 可选的索引参数（从1开始）
		index := 0
		if L.GetTop() >= 2 {
			index = int(L.ToNumber(2))
		}

		// 从message字段获取消息段
		messageField := L.GetField(event, "message")
		if messageField.Type() != lua.LTTable {
			if index > 0 {
				L.Push(lua.LNil)
				return 1
			}
			L.Push(L.NewTable())
			return 1
		}

		messageTable := messageField.(*lua.LTable)
		result := L.NewTable()
		idx := 1

		messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
			if segment.Type() != lua.LTTable {
				return
			}

			segmentTable := segment.(*lua.LTable)
			segType := L.GetField(segmentTable, "type")
			if segType.Type() != lua.LTString || segType.String() != "at" {
				return
			}

			// 获取@的用户ID
			segData := L.GetField(segmentTable, "data")
			if segData.Type() != lua.LTTable {
				return
			}

			segDataTable := segData.(*lua.LTable)
			qqContent := L.GetField(segDataTable, "qq")
			if qqContent.Type() == lua.LTString || qqContent.Type() == lua.LTNumber {
				// 如果指定了索引，检查是否匹配
				if index > 0 && idx == index {
					L.Push(qqContent)
					return
				}
				L.RawSetInt(result, idx, qqContent)
				idx++
			}
		})

		// 如果指定了索引但没找到，返回nil；否则返回表
		if index > 0 && idx <= index {
			L.Push(lua.LNil)
			return 1
		}

		if index > 0 {
			return 1
		}
		L.Push(result)
		return 1
	}
}

// 检查消息是否包含图片
func (m *Manager) luaMsgHasImage() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LBool(false))
			return 1
		}
		
		// 从message字段获取消息段
		messageField := L.GetField(event, "message")
		if messageField.Type() != lua.LTTable {
			L.Push(lua.LBool(false))
			return 1
		}
		
		messageTable := messageField.(*lua.LTable)
		hasImage := false
		
		messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
			if hasImage {
				return
			}
			
			if segment.Type() != lua.LTTable {
				return
			}
			
			segmentTable := segment.(*lua.LTable)
			segType := L.GetField(segmentTable, "type")
			if segType.Type() == lua.LTString && segType.String() == "image" {
				hasImage = true
			}
		})
		
		L.Push(lua.LBool(hasImage))
		return 1
	}
}

// 检查消息是否包含语音
func (m *Manager) luaMsgHasVoice() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LBool(false))
			return 1
		}
		
		// 从message字段获取消息段
		messageField := L.GetField(event, "message")
		if messageField.Type() != lua.LTTable {
			L.Push(lua.LBool(false))
			return 1
		}
		
		messageTable := messageField.(*lua.LTable)
		hasVoice := false
		
		messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
			if hasVoice {
				return
			}
			
			if segment.Type() != lua.LTTable {
				return
			}
			
			segmentTable := segment.(*lua.LTable)
			segType := L.GetField(segmentTable, "type")
			if segType.Type() == lua.LTString && segType.String() == "record" {
				hasVoice = true
			}
		})
		
		L.Push(lua.LBool(hasVoice))
		return 1
	}
}

// 检查消息是否包含视频
func (m *Manager) luaMsgHasVideo() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LBool(false))
			return 1
		}
		
		// 从message字段获取消息段
		messageField := L.GetField(event, "message")
		if messageField.Type() != lua.LTTable {
			L.Push(lua.LBool(false))
			return 1
		}
		
		messageTable := messageField.(*lua.LTable)
		hasVideo := false
		
		messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
			if hasVideo {
				return
			}
			
			if segment.Type() != lua.LTTable {
				return
			}
			
			segmentTable := segment.(*lua.LTable)
			segType := L.GetField(segmentTable, "type")
			if segType.Type() == lua.LTString && segType.String() == "video" {
				hasVideo = true
			}
		})
		
		L.Push(lua.LBool(hasVideo))
		return 1
	}
}

// 检查消息是否包含表情
func (m *Manager) luaMsgHasFace() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LBool(false))
			return 1
		}
		
		// 从message字段获取消息段
		messageField := L.GetField(event, "message")
		if messageField.Type() != lua.LTTable {
			L.Push(lua.LBool(false))
			return 1
		}
		
		messageTable := messageField.(*lua.LTable)
		hasFace := false
		
		messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
			if hasFace {
				return
			}
			
			if segment.Type() != lua.LTTable {
				return
			}
			
			segmentTable := segment.(*lua.LTable)
			segType := L.GetField(segmentTable, "type")
			if segType.Type() == lua.LTString && segType.String() == "face" {
				hasFace = true
			}
		})
		
		L.Push(lua.LBool(hasFace))
		return 1
	}
}

// 提取消息中的链接
func (m *Manager) luaMsgGetLinks() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(L.NewTable())
			return 1
		}
		
		// 先获取纯文本内容，再从中提取链接
		plainText := ""
		messageField := L.GetField(event, "message")
		if messageField.Type() == lua.LTTable {
			messageTable := messageField.(*lua.LTable)
			var textBuilder strings.Builder
			
			messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
				if segment.Type() != lua.LTTable {
					return
				}
				
				segmentTable := segment.(*lua.LTable)
				segType := L.GetField(segmentTable, "type")
				if segType.Type() == lua.LTString && segType.String() == "text" {
					segData := L.GetField(segmentTable, "data")
					if segData.Type() == lua.LTTable {
						segDataTable := segData.(*lua.LTable)
						textContent := L.GetField(segDataTable, "text")
						if textContent.Type() == lua.LTString {
							textBuilder.WriteString(textContent.String())
						}
					}
				}
			})
			
			plainText = textBuilder.String()
		} else if messageField.Type() == lua.LTString {
			plainText = messageField.String()
		}
		
		// 使用预编译的正则表达式提取URL
		links := urlExtractPattern.FindAllString(plainText, -1)
		
		// 转换为Lua表
		resultTable := L.NewTable()
		for i, link := range links {
			L.SetField(resultTable, strconv.Itoa(i+1), lua.LString(link))
		}
		
		L.Push(resultTable)
		return 1
	}
}

// 检查是否@所有人
func (m *Manager) luaMsgIsAtAll() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LBool(false))
			return 1
		}
		
		// 从message字段获取消息段
		messageField := L.GetField(event, "message")
		if messageField.Type() != lua.LTTable {
			L.Push(lua.LBool(false))
			return 1
		}
		
		messageTable := messageField.(*lua.LTable)
		isAtAll := false
		
		messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
			if isAtAll {
				return
			}
			
			if segment.Type() != lua.LTTable {
				return
			}
			
			segmentTable := segment.(*lua.LTable)
			segType := L.GetField(segmentTable, "type")
			if segType.Type() == lua.LTString && segType.String() == "at" {
				segData := L.GetField(segmentTable, "data")
				if segData.Type() == lua.LTTable {
					segDataTable := segData.(*lua.LTable)
					atQQ := L.GetField(segDataTable, "qq")
					if (atQQ.Type() == lua.LTString && atQQ.String() == "all") || 
					   (atQQ.Type() == lua.LTString && atQQ.String() == "0") {
						isAtAll = true
					}
				}
			}
		})
		
		L.Push(lua.LBool(isAtAll))
		return 1
	}
}

// 提取所有CQ码
func (m *Manager) luaMsgGetCQCodes() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(L.NewTable())
			return 1
		}
		
		// 先获取原始消息，再从中提取CQ码
		rawMessage := ""
		rawMessageField := L.GetField(event, "raw_message")
		if rawMessageField.Type() == lua.LTString {
			rawMessage = rawMessageField.String()
		} else {
			// 从message字段构建原始消息
			messageField := L.GetField(event, "message")
			if messageField.Type() == lua.LTTable {
				messageTable := messageField.(*lua.LTable)
				var msgBuilder strings.Builder
				
				messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
					if segment.Type() != lua.LTTable {
						return
					}
					
					segmentTable := segment.(*lua.LTable)
					segType := L.GetField(segmentTable, "type")
					if segType.Type() == lua.LTString {
						if segType.String() == "text" {
							segData := L.GetField(segmentTable, "data")
							if segData.Type() == lua.LTTable {
								segDataTable := segData.(*lua.LTable)
								textContent := L.GetField(segDataTable, "text")
								if textContent.Type() == lua.LTString {
									msgBuilder.WriteString(textContent.String())
								}
							}
						} else {
							// 构建CQ码
							msgBuilder.WriteString("[CQ:")
							msgBuilder.WriteString(segType.String())
							
							segData := L.GetField(segmentTable, "data")
							if segData.Type() == lua.LTTable {
								segDataTable := segData.(*lua.LTable)
								segDataTable.ForEach(func(key lua.LValue, value lua.LValue) {
									if key.Type() == lua.LTString && value.Type() == lua.LTString {
										msgBuilder.WriteString(",")
										msgBuilder.WriteString(key.String())
										msgBuilder.WriteString("=")
										msgBuilder.WriteString(value.String())
									}
								})
							}
							
							msgBuilder.WriteString("]")
						}
					}
				})
				
				rawMessage = msgBuilder.String()
			}
		}
		
		// 使用预编译的正则表达式提取CQ码
		cqCodes := cqExtractPattern.FindAllString(rawMessage, -1)
		
		// 转换为Lua表
		resultTable := L.NewTable()
		for i, cqCode := range cqCodes {
			L.SetField(resultTable, strconv.Itoa(i+1), lua.LString(cqCode))
		}
		
		L.Push(resultTable)
		return 1
	}
}

// 提取所有文件信息
func (m *Manager) luaMsgGetFiles() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(L.NewTable())
			return 1
		}
		
		// 从message字段获取消息段
		messageField := L.GetField(event, "message")
		if messageField.Type() != lua.LTTable {
			L.Push(L.NewTable())
			return 1
		}
		
		messageTable := messageField.(*lua.LTable)
		resultTable := L.NewTable()
		index := 1
		
		messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
			if segment.Type() != lua.LTTable {
				return
			}
			
			segmentTable := segment.(*lua.LTable)
			segType := L.GetField(segmentTable, "type")
			if segType.Type() == lua.LTString {
				segTypeStr := segType.String()
				// 检查是否为文件类型
				if segTypeStr == "file" || segTypeStr == "record" || segTypeStr == "video" {
					fileInfo := L.NewTable()
					
					// 设置文件类型
					L.SetField(fileInfo, "type", lua.LString(segTypeStr))
					
					// 获取文件数据
					segData := L.GetField(segmentTable, "data")
					if segData.Type() == lua.LTTable {
						segDataTable := segData.(*lua.LTable)
						// 复制所有数据字段
						segDataTable.ForEach(func(key lua.LValue, value lua.LValue) {
							if key.Type() == lua.LTString {
								L.SetField(fileInfo, key.String(), value)
							}
						})
					}
					
					// 添加到结果表
					L.SetField(resultTable, strconv.Itoa(index), fileInfo)
					index++
				}
			}
		})
		
		L.Push(resultTable)
		return 1
	}
}

// 获取消息中的所有CQ码类型
func (m *Manager) luaMsgGetCQTypes() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(L.NewTable())
			return 1
		}
		
		// 从message字段获取消息段
		messageField := L.GetField(event, "message")
		if messageField.Type() != lua.LTTable {
			L.Push(L.NewTable())
			return 1
		}
		
		messageTable := messageField.(*lua.LTable)
		typeMap := make(map[string]bool)
		
		messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
			if segment.Type() != lua.LTTable {
				return
			}
			
			segmentTable := segment.(*lua.LTable)
			segType := L.GetField(segmentTable, "type")
			if segType.Type() == lua.LTString {
				segTypeStr := segType.String()
				// 只记录非text类型的消息段（text类型不是CQ码）
				if segTypeStr != "text" {
					typeMap[segTypeStr] = true
				}
			}
		})
		
		// 转换为Lua表
		resultTable := L.NewTable()
		index := 1
		for segType := range typeMap {
			L.SetField(resultTable, strconv.Itoa(index), lua.LString(segType))
			index++
		}
		
		L.Push(resultTable)
		return 1
	}
}

// 获取消息中的所有表情ID
func (m *Manager) luaMsgGetFaceIds() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(L.NewTable())
			return 1
		}
		
		// 从message字段获取消息段
		messageField := L.GetField(event, "message")
		if messageField.Type() != lua.LTTable {
			L.Push(L.NewTable())
			return 1
		}
		
		messageTable := messageField.(*lua.LTable)
		resultTable := L.NewTable()
		index := 1
		
		messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
			if segment.Type() != lua.LTTable {
				return
			}
			
			segmentTable := segment.(*lua.LTable)
			segType := L.GetField(segmentTable, "type")
			if segType.Type() == lua.LTString && segType.String() == "face" {
				segData := L.GetField(segmentTable, "data")
				if segData.Type() == lua.LTTable {
					segDataTable := segData.(*lua.LTable)
					faceId := L.GetField(segDataTable, "id")
					if faceId.Type() == lua.LTString || faceId.Type() == lua.LTNumber {
						L.SetField(resultTable, strconv.Itoa(index), faceId)
						index++
					}
				}
			}
		})
		
		L.Push(resultTable)
		return 1
	}
}

// 检查消息是否包含特定CQ码类型
func (m *Manager) luaMsgHasCQType() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LBool(false))
			return 1
		}
		cqType := L.CheckString(2)
		
		// 从message字段获取消息段
		messageField := L.GetField(event, "message")
		if messageField.Type() != lua.LTTable {
			L.Push(lua.LBool(false))
			return 1
		}
		
		messageTable := messageField.(*lua.LTable)
		hasType := false
		
		messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
			if hasType {
				return
			}
			
			if segment.Type() != lua.LTTable {
				return
			}
			
			segmentTable := segment.(*lua.LTable)
			segType := L.GetField(segmentTable, "type")
			if segType.Type() == lua.LTString && segType.String() == cqType {
				hasType = true
			}
		})
		
		L.Push(lua.LBool(hasType))
		return 1
	}
}

// 检查是否为群消息
func (m *Manager) luaMsgIsGroupMessage() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LBool(false))
			return 1
		}

		messageType := L.GetField(event, "message_type")
		if messageType.Type() == lua.LTString && messageType.String() == "group" {
			L.Push(lua.LBool(true))
			return 1
		}

		// 检查是否有group_id字段
		groupId := L.GetField(event, "group_id")
		if groupId.Type() == lua.LTNumber || groupId.Type() == lua.LTString {
			L.Push(lua.LBool(true))
			return 1
		}

		L.Push(lua.LBool(false))
		return 1
	}
}

// 检查是否为私聊消息
func (m *Manager) luaMsgIsPrivateMessage() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LBool(false))
			return 1
		}

		messageType := L.GetField(event, "message_type")
		if messageType.Type() == lua.LTString && messageType.String() == "private" {
			L.Push(lua.LBool(true))
			return 1
		}

		// 检查是否有group_id字段，如果没有则为私聊
		groupId := L.GetField(event, "group_id")
		if groupId.Type() == lua.LTNil {
			L.Push(lua.LBool(true))
			return 1
		}

		L.Push(lua.LBool(false))
		return 1
	}
}

// 获取消息类型
func (m *Manager) luaMsgGetType() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LString(""))
			return 1
		}

		messageType := L.GetField(event, "message_type")
		if messageType.Type() == lua.LTString {
			L.Push(messageType)
			return 1
		}

		// 如果没有message_type，根据group_id判断
		groupId := L.GetField(event, "group_id")
		if groupId.Type() == lua.LTNumber || groupId.Type() == lua.LTString {
			L.Push(lua.LString("group"))
			return 1
		}

		L.Push(lua.LString("private"))
		return 1
	}
}

// ========== 卡片消息判断与解析 ==========

// msg.has_json - 检查消息是否包含JSON卡片
func (m *Manager) luaMsgHasJSON() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LFalse)
			return 1
		}

		messageField := L.GetField(event, "message")
		if messageField.Type() != lua.LTTable {
			L.Push(lua.LFalse)
			return 1
		}

		messageTable := messageField.(*lua.LTable)
		found := false
		messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
			if found {
				return
			}
			if segment.Type() != lua.LTTable {
				return
			}
			segmentTable := segment.(*lua.LTable)
			segType := L.GetField(segmentTable, "type")
			if segType.Type() == lua.LTString && segType.String() == "json" {
				found = true
			}
		})

		L.Push(lua.LBool(found))
		return 1
	}
}

// msg.is_contact_card - 检查消息是否为联系人名片
func (m *Manager) luaMsgIsContactCard() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LFalse)
			return 1
		}

		messageField := L.GetField(event, "message")
		if messageField.Type() != lua.LTTable {
			L.Push(lua.LFalse)
			return 1
		}

		messageTable := messageField.(*lua.LTable)
		found := false

		messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
			if found {
				return
			}
			if segment.Type() != lua.LTTable {
				return
			}
			segmentTable := segment.(*lua.LTable)
			segType := L.GetField(segmentTable, "type")
			if segType.Type() == lua.LTString && segType.String() == "json" {
				segData := L.GetField(segmentTable, "data")
				if segData.Type() == lua.LTTable {
					dataTable := segData.(*lua.LTable)
					// 尝试从内嵌JSON字符串中获取 bizsrc
					if bizsrc := L.GetField(dataTable, "data"); bizsrc.Type() == lua.LTString {
						jsonStr := html.UnescapeString(bizsrc.String())
						var parsedData map[string]interface{}
						if json.Unmarshal([]byte(jsonStr), &parsedData) == nil {
							if b, ok := parsedData["bizsrc"].(string); ok {
								if b == "cardshare.cardshare" {
									found = true
									return
								}
							}
						}
					}
				}
			}
		})

		L.Push(lua.LBool(found))
		return 1
	}
}

// msg.is_group_card - 检查消息是否为群名片
func (m *Manager) luaMsgIsGroupCard() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LFalse)
			return 1
		}

		messageField := L.GetField(event, "message")
		if messageField.Type() != lua.LTTable {
			L.Push(lua.LFalse)
			return 1
		}

		messageTable := messageField.(*lua.LTable)
		found := false

		messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
			if found {
				return
			}
			if segment.Type() != lua.LTTable {
				return
			}
			segmentTable := segment.(*lua.LTable)
			segType := L.GetField(segmentTable, "type")
			if segType.Type() == lua.LTString && segType.String() == "json" {
				segData := L.GetField(segmentTable, "data")
				if segData.Type() == lua.LTTable {
					dataTable := segData.(*lua.LTable)
					// 尝试从内嵌JSON字符串中获取 bizsrc
					if bizsrc := L.GetField(dataTable, "data"); bizsrc.Type() == lua.LTString {
						jsonStr := html.UnescapeString(bizsrc.String())
						var parsedData map[string]interface{}
						if json.Unmarshal([]byte(jsonStr), &parsedData) == nil {
							if b, ok := parsedData["bizsrc"].(string); ok {
								if b == "qun.share" || strings.Contains(b, "group") {
									found = true
									return
								}
							}
							if t, ok := parsedData["tag"].(string); ok {
								if strings.Contains(t, "群名片") {
									found = true
									return
								}
							}
						}
					}
				}
			}
		})

		L.Push(lua.LBool(found))
		return 1
	}
}

// msg.is_channel_card - 检查消息是否为频道名片
func (m *Manager) luaMsgIsChannelCard() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LFalse)
			return 1
		}

		messageField := L.GetField(event, "message")
		if messageField.Type() != lua.LTTable {
			L.Push(lua.LFalse)
			return 1
		}

		messageTable := messageField.(*lua.LTable)
		found := false

		messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
			if found {
				return
			}
			if segment.Type() != lua.LTTable {
				return
			}
			segmentTable := segment.(*lua.LTable)
			segType := L.GetField(segmentTable, "type")
			if segType.Type() == lua.LTString && segType.String() == "json" {
				segData := L.GetField(segmentTable, "data")
				if segData.Type() == lua.LTTable {
					dataTable := segData.(*lua.LTable)
					// 尝试从内嵌JSON字符串中获取 bizsrc
					if bizsrc := L.GetField(dataTable, "data"); bizsrc.Type() == lua.LTString {
						jsonStr := html.UnescapeString(bizsrc.String())
						var parsedData map[string]interface{}
						if json.Unmarshal([]byte(jsonStr), &parsedData) == nil {
							if b, ok := parsedData["bizsrc"].(string); ok {
								if b == "pindao.home" {
									found = true
									return
								}
							}
							if t, ok := parsedData["tag"].(string); ok {
								if strings.Contains(t, "频道名片") {
									found = true
									return
								}
							}
						}
					}
				}
			}
		})

		L.Push(lua.LBool(found))
		return 1
	}
}

// getNestedFieldFromTable - 从表中获取嵌套字段，支持 data.data 字符串解析
func (m *Manager) getNestedFieldFromTable(L *lua.LState, table *lua.LTable, path string) lua.LValue {
	parts := strings.Split(path, ".")

	// 首先检查表中是否有该字段
	current := lua.LValue(table)
	for _, part := range parts {
		if current.Type() != lua.LTTable {
			break
		}
		next := L.GetField(current.(*lua.LTable), part)
		if next == lua.LNil {
			// 字段不存在，尝试从内嵌JSON中查找
			// 先尝试从当前表的data字段获取
			if dataField := L.GetField(current.(*lua.LTable), "data"); dataField.Type() == lua.LTString {
				jsonStr := dataField.String()
				jsonStr = html.UnescapeString(jsonStr)
				var parsedData map[string]interface{}
				if json.Unmarshal([]byte(jsonStr), &parsedData) == nil {
					return m.getValueFromParsedData(L, parsedData, parts)
				}
			}
			// 再尝试从原始table的data字段获取（兼容处理）
			if dataField := L.GetField(table, "data"); dataField.Type() == lua.LTString {
				jsonStr := dataField.String()
				jsonStr = html.UnescapeString(jsonStr)
				var parsedData map[string]interface{}
				if json.Unmarshal([]byte(jsonStr), &parsedData) == nil {
					return m.getValueFromParsedData(L, parsedData, parts)
				}
			}
			return nil
		}
		current = next
	}

	// 如果当前值是 Lua 字符串
	if current.Type() == lua.LTString {
		strValue := current.String()
		// 尝试解析为 JSON（可能是内嵌的 JSON 字符串）
		if jsonStr := html.UnescapeString(strValue); len(parts) > 1 {
			var parsedData map[string]interface{}
			if json.Unmarshal([]byte(jsonStr), &parsedData) == nil {
				return m.getValueFromParsedData(L, parsedData, parts[1:])
			}
		}
		// 如果不是 JSON 或已经是最终字段，返回字符串值
		return current
	}

	// 如果当前值不是表也不是字符串，说明路径中间某个节点不是表结构，返回nil
	return nil
}

// getValueFromParsedData - 从解析后的JSON数据中获取值
func (m *Manager) getValueFromParsedData(L *lua.LState, parsedData map[string]interface{}, pathParts []string) lua.LValue {
	if len(pathParts) == 0 {
		return nil
	}

	current := parsedData
	for i, part := range pathParts {
		if i == len(pathParts)-1 {
			// 最后一个字段
			if val, ok := current[part]; ok {
				return convertGoValueToLua(L, val)
			}
			return nil
		}

		// 不是最后一个字段，继续深入
		if next, ok := current[part].(map[string]interface{}); ok {
			current = next
		} else {
			return nil
		}
	}

	return nil
}

// msg.get_json_data - 获取消息中的JSON数据，并解析内嵌的JSON字符串
func (m *Manager) luaMsgGetJSONData() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LNil)
			return 1
		}

		messageField := L.GetField(event, "message")
		if messageField.Type() != lua.LTTable {
			L.Push(lua.LNil)
			return 1
		}

		messageTable := messageField.(*lua.LTable)
		resultTable := L.NewTable()
		foundCount := 0

		messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
			if segment.Type() != lua.LTTable {
				return
			}
			segmentTable := segment.(*lua.LTable)
			segType := L.GetField(segmentTable, "type")
			if segType.Type() == lua.LTString && segType.String() == "json" {
				segData := L.GetField(segmentTable, "data")
				if segData.Type() == lua.LTTable {
					dataTable := segData.(*lua.LTable)

					// 检查 data.data 字段 - 它可能是字符串(需要解析)或表(直接使用)
					dataDataField := L.GetField(dataTable, "data")
					var parsedData map[string]interface{}

					if dataDataField.Type() == lua.LTString {
						// data.data 是字符串，需要解析
						jsonStr := dataDataField.String()
						// 先进行HTML实体解码 (如 &#44; -> ,)
						jsonStr = html.UnescapeString(jsonStr)
						if json.Unmarshal([]byte(jsonStr), &parsedData) != nil {
							return
						}
						foundCount++
						L.SetField(resultTable, "count", lua.LNumber(foundCount))
						// 将解析后的数据展开放入resultTable
						for k, v := range parsedData {
							L.SetField(resultTable, k, convertGoValueToLua(L, v))
						}
						// 同时保存原始数据表
						L.SetField(resultTable, "_raw", dataTable)
					} else if dataDataField.Type() == lua.LTTable {
						// data.data 已经是表
						foundCount++
						dataDataTable := dataDataField.(*lua.LTable)
						L.SetField(resultTable, "count", lua.LNumber(foundCount))
						L.SetField(resultTable, "_raw", dataDataTable)
						// 复制所有字段
						dataDataTable.ForEach(func(key lua.LValue, value lua.LValue) {
							L.SetField(resultTable, key.String(), value)
						})
					}

					// 从原始data表复制顶层字段
					dataTable.ForEach(func(key lua.LValue, value lua.LValue) {
						if key.String() != "data" {
							L.SetField(resultTable, key.String(), value)
						}
					})
				}
			}
		})

		if foundCount == 0 {
			L.Push(lua.LNil)
		} else {
			L.Push(resultTable)
		}
		return 1
	}
}

// convertGoValueToLua 将 Go 值转换为 Lua 值
func convertGoValueToLua(L *lua.LState, v interface{}) lua.LValue {
	switch val := v.(type) {
	case map[string]interface{}:
		t := L.NewTable()
		for k, v := range val {
			L.SetField(t, k, convertGoValueToLua(L, v))
		}
		return t
	case []interface{}:
		t := L.NewTable()
		for i, v := range val {
			t.RawSetInt(i+1, convertGoValueToLua(L, v))
		}
		return t
	case string:
		return lua.LString(val)
	case float64:
		return lua.LNumber(val)
	case bool:
		return lua.LBool(val)
	case nil:
		return lua.LNil
	default:
		return lua.LString(fmt.Sprintf("%v", val))
	}
}

// msg.parse_card - 解析消息中的名片
func (m *Manager) luaMsgParseCard() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LNil)
			return 1
		}

		messageField := L.GetField(event, "message")
		if messageField.Type() != lua.LTTable {
			L.Push(lua.LNil)
			return 1
		}

		messageTable := messageField.(*lua.LTable)
		var jsonData *lua.LTable

		messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
			if jsonData != nil {
				return
			}
			if segment.Type() != lua.LTTable {
				return
			}
			segmentTable := segment.(*lua.LTable)
			segType := L.GetField(segmentTable, "type")
			if segType.Type() == lua.LTString && segType.String() == "json" {
				segData := L.GetField(segmentTable, "data")
				if segData.Type() == lua.LTTable {
					jsonData = segData.(*lua.LTable)
				}
			}
		})

		if jsonData == nil {
			L.Push(lua.LNil)
			return 1
		}

		cardTable := L.NewTable()

		app := L.GetField(jsonData, "app")
		if app.Type() == lua.LTString {
			L.SetField(cardTable, "tag", app)
		}

		desc := L.GetField(jsonData, "desc")
		if desc.Type() == lua.LTString {
			L.SetField(cardTable, "nickname", desc)
		}

		prompt := L.GetField(jsonData, "prompt")
		if prompt.Type() == lua.LTString {
			L.SetField(cardTable, "source", prompt)
		}

		bizsrc := L.GetField(jsonData, "bizsrc")
		if bizsrc.Type() == lua.LTString {
			L.SetField(cardTable, "source", bizsrc)
		}

		dataDataField := L.GetField(jsonData, "data")
		var parsedData map[string]interface{}

		if dataDataField.Type() == lua.LTString {
			jsonStr := dataDataField.String()
			jsonStr = html.UnescapeString(jsonStr)
			if json.Unmarshal([]byte(jsonStr), &parsedData) == nil {
				if meta, ok := parsedData["meta"].(map[string]interface{}); ok {
					if contact, ok := meta["contact"].(map[string]interface{}); ok {
						contactTable := L.NewTable()
						for k, v := range contact {
							L.SetField(contactTable, k, convertGoValueToLua(L, v))
						}
						L.SetField(cardTable, "contact", contactTable)

						if nickname, ok := contact["nickname"].(string); ok {
							L.SetField(cardTable, "nickname", lua.LString(nickname))
						}
						if avatar, ok := contact["avatar"].(string); ok {
							L.SetField(cardTable, "avatar", lua.LString(avatar))
						}
						if contactInfo, ok := contact["contact"].(string); ok {
							L.SetField(cardTable, "contactInfo", lua.LString(contactInfo))
						}
						if tag, ok := contact["tag"].(string); ok {
							L.SetField(cardTable, "tag", lua.LString(tag))
						}
						if jumpUrl, ok := contact["jumpUrl"].(string); ok {
							L.SetField(cardTable, "jumpUrl", lua.LString(jumpUrl))
							decodedUrl := html.UnescapeString(jumpUrl)
							decodedUrl = normalizeTencentURL(decodedUrl)
							if strings.Contains(decodedUrl, "uin=") {
								start := strings.Index(decodedUrl, "uin=") + 4
								end := start
								for end < len(decodedUrl) && decodedUrl[end] >= '0' && decodedUrl[end] <= '9' {
									end++
								}
								if end > start {
									L.SetField(cardTable, "uin", lua.LString(decodedUrl[start:end]))
								}
							}
							if strings.Contains(decodedUrl, "card_type=group") {
								L.SetField(cardTable, "cardType", lua.LString("group"))
							}
						}
						// 处理 pcJumpUrl (tencent协议，PC端使用)
						if pcJumpUrl, ok := contact["pcJumpUrl"].(string); ok {
							decodedPcUrl := html.UnescapeString(pcJumpUrl)
							decodedPcUrl = normalizeTencentURL(decodedPcUrl)
							L.SetField(cardTable, "pcJumpUrl", lua.LString(decodedPcUrl))
							// 如果还没找到uin，尝试从pcJumpUrl解析
							if uin := L.GetField(cardTable, "uin"); uin == lua.LNil {
								if strings.Contains(decodedPcUrl, "uin=") {
									start := strings.Index(decodedPcUrl, "uin=") + 4
									end := start
									for end < len(decodedPcUrl) && decodedPcUrl[end] >= '0' && decodedPcUrl[end] <= '9' {
										end++
									}
									if end > start {
										L.SetField(cardTable, "uin", lua.LString(decodedPcUrl[start:end]))
									}
								}
							}
						}
					}

					if news, ok := meta["news"].(map[string]interface{}); ok {
						if title, ok := news["title"].(string); ok {
							L.SetField(cardTable, "title", lua.LString(title))
						}
						if desc, ok := news["desc"].(string); ok {
							L.SetField(cardTable, "description", lua.LString(desc))
						}
						if jumpUrl, ok := news["jumpUrl"].(string); ok {
							L.SetField(cardTable, "articleUrl", lua.LString(jumpUrl))
						}
						if preview, ok := news["preview"].(string); ok {
							L.SetField(cardTable, "previewImage", lua.LString(preview))
						}
					}

					if Location, ok := meta["Location"].(map[string]interface{}); ok {
						if Search, ok := Location["Search"].(map[string]interface{}); ok {
							if name, ok := Search["name"].(string); ok {
								L.SetField(cardTable, "locationName", lua.LString(name))
							}
							if address, ok := Search["address"].(string); ok {
								L.SetField(cardTable, "address", lua.LString(address))
							}
							if lat, ok := Search["lat"].(string); ok {
								if f, err := strconv.ParseFloat(lat, 64); err == nil {
									L.SetField(cardTable, "latitude", lua.LNumber(f))
								}
							}
							if lng, ok := Search["lng"].(string); ok {
								if f, err := strconv.ParseFloat(lng, 64); err == nil {
									L.SetField(cardTable, "longitude", lua.LNumber(f))
								}
							}
						}
					}
				}
			}
		}

		L.Push(cardTable)
		return 1
	}
}

// msg.get_card_info - 从事件或卡片数据中获取指定字段
func (m *Manager) luaMsgGetCardInfo() func(*lua.LState) int {
	return func(L *lua.LState) int {
		firstArg := L.CheckTable(1)
		field := L.CheckString(2)

		var jsonData *lua.LTable

		// 检查是否是事件对象
		messageField := L.GetField(firstArg, "message")
		if messageField.Type() == lua.LTTable {
			messageTable := messageField.(*lua.LTable)
			messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
				if jsonData != nil {
					return
				}
				if segment.Type() != lua.LTTable {
					return
				}
				segmentTable := segment.(*lua.LTable)
				segType := L.GetField(segmentTable, "type")
				if segType.Type() == lua.LTString && segType.String() == "json" {
					segData := L.GetField(segmentTable, "data")
					if segData.Type() == lua.LTTable {
						jsonData = segData.(*lua.LTable)
					}
				}
			})
		} else {
			jsonData = firstArg
		}

		if jsonData == nil {
			L.Push(lua.LNil)
			return 1
		}

		value := m.getNestedFieldFromTable(L, jsonData, field)
		if value == nil {
			L.Push(lua.LNil)
		} else {
			L.Push(value)
		}
		return 1
	}
}

// msg.json_has_app - 检查JSON卡片来源是否匹配（使用bizsrc判断）
func (m *Manager) luaMsgJSONHasApp() func(*lua.LState) int {
	return func(L *lua.LState) int {
		jsonData := L.CheckTable(1)
		expectedBizsrc := L.CheckString(2)

		// 首先尝试直接从表中获取 bizsrc
		if bizsrc := L.GetField(jsonData, "bizsrc"); bizsrc.Type() == lua.LTString {
			if strings.Contains(bizsrc.String(), expectedBizsrc) {
				L.Push(lua.LTrue)
				return 1
			}
		}

		// 尝试从内嵌JSON字符串中获取 bizsrc
		if dataField := L.GetField(jsonData, "data"); dataField.Type() == lua.LTString {
			jsonStr := html.UnescapeString(dataField.String())
			var parsedData map[string]interface{}
			if json.Unmarshal([]byte(jsonStr), &parsedData) == nil {
				if b, ok := parsedData["bizsrc"].(string); ok {
					if strings.Contains(b, expectedBizsrc) {
						L.Push(lua.LTrue)
						return 1
					}
				}
			}
		}

		L.Push(lua.LFalse)
		return 1
	}
}

// msg.get_json_app_type - 获取JSON卡片的来源类型（bizsrc）
func (m *Manager) luaMsgGetJSONAppType() func(*lua.LState) int {
	return func(L *lua.LState) int {
		jsonData := L.CheckTable(1)

		// 首先尝试直接从表中获取 bizsrc
		if bizsrc := L.GetField(jsonData, "bizsrc"); bizsrc.Type() == lua.LTString {
			L.Push(bizsrc)
			return 1
		}

		// 尝试从内嵌JSON字符串中获取 bizsrc
		if dataField := L.GetField(jsonData, "data"); dataField.Type() == lua.LTString {
			jsonStr := html.UnescapeString(dataField.String())
			var parsedData map[string]interface{}
			if json.Unmarshal([]byte(jsonStr), &parsedData) == nil {
				if b, ok := parsedData["bizsrc"].(string); ok {
					L.Push(lua.LString(b))
					return 1
				}
			}
		}

		L.Push(lua.LString(""))
		return 1
	}
}

// msg.get_json_field - 从JSON卡片中获取嵌套字段
func (m *Manager) luaMsgGetJSONField() func(*lua.LState) int {
	return func(L *lua.LState) int {
		firstArg := L.CheckTable(1)
		fieldPath := L.CheckString(2)

		var jsonData *lua.LTable

		// 检查是否是事件对象（通过检查是否有message字段）
		messageField := L.GetField(firstArg, "message")
		if messageField.Type() == lua.LTTable {
			messageTable := messageField.(*lua.LTable)
			messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
				if jsonData != nil {
					return
				}
				if segment.Type() != lua.LTTable {
					return
				}
				segmentTable := segment.(*lua.LTable)
				segType := L.GetField(segmentTable, "type")
				if segType.Type() == lua.LTString && segType.String() == "json" {
					segData := L.GetField(segmentTable, "data")
					if segData.Type() == lua.LTTable {
						jsonData = segData.(*lua.LTable)
					}
				}
			})
		} else {
			jsonData = firstArg
		}

		if jsonData == nil {
			L.Push(lua.LNil)
			return 1
		}

		value := m.getNestedFieldFromTable(L, jsonData, fieldPath)
		if value == nil {
			L.Push(lua.LNil)
		} else {
			L.Push(value)
		}
		return 1
	}
}

// msg.get_card_id_from_url - 从卡片URL中提取ID（群号/用户QQ/频道ID等）
// 支持 mqqapi:// 和 tencent:// 两种协议
func (m *Manager) luaMsgGetCardIDFromURL() func(*lua.LState) int {
	return func(L *lua.LState) int {
		url := L.CheckString(1)
		idType := L.CheckString(2)

		// 规范化URL：先进行HTML解码，再处理tencent协议的额外转义
		url = html.UnescapeString(url)
		url = normalizeTencentURL(url)

		var result string
		var found bool

		switch idType {
		case "uin", "qq":
			result, found = extractIDFromURL(url, "uin=")
		case "group", "groupUin":
			result, found = extractGroupIDFromURL(url)
		case "guild", "guildId":
			result, found = extractIDFromURL(url, "guild_id=")
		case "inviteCode":
			result, found = extractIDFromURL(url, "inviteCode=")
		}

		if found {
			L.Push(lua.LString(result))
		} else {
			L.Push(lua.LNil)
		}
		return 1
	}
}

// normalizeTencentURL - 规范化tencent协议的URL
// tencent:// 协议的URL中，反斜杠被转义为 \\/，需要去除多余的 \
func normalizeTencentURL(url string) string {
	// 处理 tencent:// 协议中的 \/ -> /
	url = strings.ReplaceAll(url, "\\/", "/")
	// 去除多余的反斜杠
	url = strings.ReplaceAll(url, "\\", "")
	return url
}

// extractIDFromURL - 从URL中提取指定类型的ID
func extractIDFromURL(url, prefix string) (string, bool) {
	if strings.Contains(url, prefix) {
		start := strings.Index(url, prefix) + len(prefix)
		end := start
		for end < len(url) && (url[end] >= '0' && url[end] <= '9' || url[end] >= 'a' && url[end] <= 'z' || url[end] >= 'A' && url[end] <= 'Z') {
			end++
		}
		if end > start {
			return url[start:end], true
		}
	}
	return "", false
}

// extractGroupIDFromURL - 从URL中提取群号
func extractGroupIDFromURL(url string) (string, bool) {
	// 如果包含 card_type=group 或 group= 参数
	if strings.Contains(url, "card_type=group") || strings.Contains(url, "groupUin=") {
		return extractIDFromURL(url, "uin=")
	}
	// 否则尝试直接从 URL 中找数字（群号通常是比较长的数字）
	if strings.Contains(url, "uin=") {
		start := strings.Index(url, "uin=") + 4
		end := start
		// 群号通常大于10000
		for end < len(url) && url[end] >= '0' && url[end] <= '9' {
			end++
		}
		if end > start && end-start >= 5 {
			return url[start:end], true
		}
	}
	return "", false
}

// msg.parse_card_full - 完整解析卡片信息，返回结构化数据
func (m *Manager) luaMsgParseCardFull() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LNil)
			return 1
		}

		messageField := L.GetField(event, "message")
		if messageField.Type() != lua.LTTable {
			L.Push(lua.LNil)
			return 1
		}

		messageTable := messageField.(*lua.LTable)
		var jsonData *lua.LTable

		messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
			if jsonData != nil {
				return
			}
			if segment.Type() != lua.LTTable {
				return
			}
			segmentTable := segment.(*lua.LTable)
			segType := L.GetField(segmentTable, "type")
			if segType.Type() == lua.LTString && segType.String() == "json" {
				segData := L.GetField(segmentTable, "data")
				if segData.Type() == lua.LTTable {
					jsonData = segData.(*lua.LTable)
				}
			}
		})

		if jsonData == nil {
			L.Push(lua.LNil)
			return 1
		}

		cardTable := L.NewTable()

		app := L.GetField(jsonData, "app")
		if app.Type() == lua.LTString {
			L.SetField(cardTable, "tag", app)
		}

		desc := L.GetField(jsonData, "desc")
		if desc.Type() == lua.LTString {
			L.SetField(cardTable, "name", desc)
		}

		prompt := L.GetField(jsonData, "prompt")
		if prompt.Type() == lua.LTString {
			L.SetField(cardTable, "prompt", prompt)
		}

		bizsrc := L.GetField(jsonData, "bizsrc")
		if bizsrc.Type() == lua.LTString {
			L.SetField(cardTable, "source", bizsrc)
		}

		dataDataField := L.GetField(jsonData, "data")
		var parsedData map[string]interface{}

		if dataDataField.Type() == lua.LTString {
			jsonStr := dataDataField.String()
			jsonStr = html.UnescapeString(jsonStr)
			if json.Unmarshal([]byte(jsonStr), &parsedData) == nil {
				if meta, ok := parsedData["meta"].(map[string]interface{}); ok {
					if contact, ok := meta["contact"].(map[string]interface{}); ok {
						contactTable := L.NewTable()
						for k, v := range contact {
							L.SetField(contactTable, k, convertGoValueToLua(L, v))
						}
						L.SetField(cardTable, "contact", contactTable)

						if nickname, ok := contact["nickname"].(string); ok {
							L.SetField(cardTable, "nickname", lua.LString(nickname))
						}
						if avatar, ok := contact["avatar"].(string); ok {
							L.SetField(cardTable, "avatar", lua.LString(avatar))
						}
						if contactInfo, ok := contact["contact"].(string); ok {
							L.SetField(cardTable, "contactInfo", lua.LString(contactInfo))
						}
						if tag, ok := contact["tag"].(string); ok {
							L.SetField(cardTable, "tag", lua.LString(tag))
						}
						if jumpUrl, ok := contact["jumpUrl"].(string); ok {
							L.SetField(cardTable, "jumpUrl", lua.LString(jumpUrl))
							decodedUrl := html.UnescapeString(jumpUrl)
							decodedUrl = normalizeTencentURL(decodedUrl)
							if strings.Contains(decodedUrl, "uin=") {
								start := strings.Index(decodedUrl, "uin=") + 4
								end := start
								for end < len(decodedUrl) && decodedUrl[end] >= '0' && decodedUrl[end] <= '9' {
									end++
								}
								if end > start {
									L.SetField(cardTable, "uin", lua.LString(decodedUrl[start:end]))
								}
							}
							if strings.Contains(decodedUrl, "card_type=group") {
								L.SetField(cardTable, "cardType", lua.LString("group"))
							}
						}
						// 处理 pcJumpUrl (tencent协议，PC端使用)
						if pcJumpUrl, ok := contact["pcJumpUrl"].(string); ok {
							decodedPcUrl := html.UnescapeString(pcJumpUrl)
							decodedPcUrl = normalizeTencentURL(decodedPcUrl)
							L.SetField(cardTable, "pcJumpUrl", lua.LString(decodedPcUrl))
							// 如果还没找到uin，尝试从pcJumpUrl解析
							if uin := L.GetField(cardTable, "uin"); uin == lua.LNil {
								if strings.Contains(decodedPcUrl, "uin=") {
									start := strings.Index(decodedPcUrl, "uin=") + 4
									end := start
									for end < len(decodedPcUrl) && decodedPcUrl[end] >= '0' && decodedPcUrl[end] <= '9' {
										end++
									}
									if end > start {
										L.SetField(cardTable, "uin", lua.LString(decodedPcUrl[start:end]))
									}
								}
							}
						}
					}

					if news, ok := meta["news"].(map[string]interface{}); ok {
						if title, ok := news["title"].(string); ok {
							L.SetField(cardTable, "title", lua.LString(title))
						}
						if desc, ok := news["desc"].(string); ok {
							L.SetField(cardTable, "description", lua.LString(desc))
						}
						if jumpUrl, ok := news["jumpUrl"].(string); ok {
							L.SetField(cardTable, "articleUrl", lua.LString(jumpUrl))
						}
						if preview, ok := news["preview"].(string); ok {
							L.SetField(cardTable, "previewImage", lua.LString(preview))
						}
					}

					if Location, ok := meta["Location"].(map[string]interface{}); ok {
						if Search, ok := Location["Search"].(map[string]interface{}); ok {
							if name, ok := Search["name"].(string); ok {
								L.SetField(cardTable, "locationName", lua.LString(name))
							}
							if address, ok := Search["address"].(string); ok {
								L.SetField(cardTable, "address", lua.LString(address))
							}
							if lat, ok := Search["lat"].(string); ok {
								if f, err := strconv.ParseFloat(lat, 64); err == nil {
									L.SetField(cardTable, "latitude", lua.LNumber(f))
								}
							}
							if lng, ok := Search["lng"].(string); ok {
								if f, err := strconv.ParseFloat(lng, 64); err == nil {
									L.SetField(cardTable, "longitude", lua.LNumber(f))
								}
							}
						}
					}
				}
			}
		}

		L.Push(cardTable)
		return 1
	}
}

// getNestedField - 获取嵌套表中的字段，支持点号路径如 "meta.news.title"
func (m *Manager) getNestedField(L *lua.LState, table *lua.LTable, path string) lua.LValue {
	parts := strings.Split(path, ".")
	current := lua.LValue(table)

	for _, part := range parts {
		if current.Type() != lua.LTTable {
			return nil
		}
		current = L.GetField(current.(*lua.LTable), part)
		if current == lua.LNil {
			return nil
		}
	}

	return current
}

// 获取第一张图片
func (m *Manager) luaMsgGetFirstImage() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LNil)
			return 1
		}

		// 从message字段获取消息段
		messageField := L.GetField(event, "message")
		if messageField.Type() != lua.LTTable {
			L.Push(lua.LNil)
			return 1
		}

		messageTable := messageField.(*lua.LTable)

		messageTable.ForEach(func(_ lua.LValue, segment lua.LValue) {
			if segment.Type() != lua.LTTable {
				return
			}

			segmentTable := segment.(*lua.LTable)
			segType := L.GetField(segmentTable, "type")
			if segType.Type() != lua.LTString || segType.String() != "image" {
				return
			}

			// 获取图片数据
			segData := L.GetField(segmentTable, "data")
			if segData.Type() != lua.LTTable {
				return
			}

			segDataTable := segData.(*lua.LTable)
			urlContent := L.GetField(segDataTable, "url")
			if urlContent.Type() == lua.LTString {
				L.Push(urlContent)
				L.SetTop(1) // 只保留返回值
			}
		})

		if L.GetTop() == 0 {
			L.Push(lua.LNil)
		}

		return 1
	}
}

// 获取发送者ID
func (m *Manager) luaMsgGetSenderId() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LNil)
			return 1
		}

		// 优先从user_id字段获取
		userId := L.GetField(event, "user_id")
		if userId.Type() == lua.LTNumber || userId.Type() == lua.LTString {
			L.Push(userId)
			return 1
		}

		// 从sender对象获取
		sender := L.GetField(event, "sender")
		if sender.Type() == lua.LTTable {
			senderId := L.GetField(sender.(*lua.LTable), "user_id")
			if senderId.Type() == lua.LTNumber || senderId.Type() == lua.LTString {
				L.Push(senderId)
				return 1
			}
		}

		L.Push(lua.LNil)
		return 1
	}
}

// 获取发送者昵称
func (m *Manager) luaMsgGetSenderNickname() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LString(""))
			return 1
		}

		// 从sender对象获取
		sender := L.GetField(event, "sender")
		if sender.Type() == lua.LTTable {
			senderTable := sender.(*lua.LTable)
			nickname := L.GetField(senderTable, "nickname")
			if nickname.Type() == lua.LTString {
				L.Push(nickname)
				return 1
			}
			card := L.GetField(senderTable, "card")
			if card.Type() == lua.LTString {
				L.Push(card)
				return 1
			}
		}

		L.Push(lua.LString(""))
		return 1
	}
}

// 获取群ID
func (m *Manager) luaMsgGetGroupId() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LNil)
			return 1
		}

		groupId := L.GetField(event, "group_id")
		if groupId.Type() == lua.LTNumber || groupId.Type() == lua.LTString {
			L.Push(groupId)
			return 1
		}

		L.Push(lua.LNil)
		return 1
	}
}

// 获取消息时间
func (m *Manager) luaMsgGetTime() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LNil)
			return 1
		}

		time := L.GetField(event, "time")
		if time.Type() == lua.LTNumber || time.Type() == lua.LTString {
			L.Push(time)
			return 1
		}

		L.Push(lua.LNil)
		return 1
	}
}

// 获取消息类型（与get_type相同，用于兼容）
func (m *Manager) luaMsgGetMessageType() func(*lua.LState) int {
	return func(L *lua.LState) int {
		event := m.getEventTable(L, 1)
		if event == nil {
			L.Push(lua.LString(""))
			return 1
		}

		messageType := L.GetField(event, "message_type")
		if messageType.Type() == lua.LTString {
			L.Push(messageType)
			return 1
		}

		// 如果没有message_type，根据group_id判断
		groupId := L.GetField(event, "group_id")
		if groupId.Type() == lua.LTNumber || groupId.Type() == lua.LTString {
			L.Push(lua.LString("group"))
			return 1
		}

		L.Push(lua.LString("private"))
		return 1
	}
}

// decodeUnicodeEscape 解码 \uXXXX 格式的Unicode转义字符
func decodeUnicodeEscape(str string) string {
	if str == "" {
		return ""
	}

	// 使用UTF-8编码转换算法解码 \uXXXX 格式的Unicode转义字符
	result := ""
	i := 0
	for i < len(str) {
		if i+5 < len(str) && str[i:i+2] == "\\u" {
			// 尝试解析 \uXXXX 格式
			hexStr := str[i+2 : i+6]
			unicodeValue, err := strconv.ParseInt(hexStr, 16, 0)
			if err == nil && unicodeValue >= 0 {
				// UTF-8编码转换
				if unicodeValue <= 0x7F {
					// 单字节字符 (0-127)
					result += string(byte(unicodeValue))
				} else if unicodeValue <= 0x7FF {
					// 双字节字符 (128-2047)
					byte1 := 0xC0 + byte(unicodeValue/64)
					byte2 := 0x80 + byte(unicodeValue%64)
					result += string([]byte{byte1, byte2})
				} else if unicodeValue <= 0xFFFF {
					// 三字节字符 (2048-65535) - 包括大部分中文字符
					byte1 := 0xE0 + byte(unicodeValue/4096)
					byte2 := 0x80 + byte((unicodeValue%4096)/64)
					byte3 := 0x80 + byte(unicodeValue%64)
					result += string([]byte{byte1, byte2, byte3})
				} else {
					// 四字节字符 (65536-1114111) - 暂时返回原始转义序列
					result += "\\u" + hexStr
				}
				i += 6
				continue
			}
		}
		// 如果不是Unicode转义字符，直接添加字符
		result += string(str[i])
		i++
	}
	return result
}

// ========== JSON解析API (已弃用，请使用前端生成的Lua运行时库) ==========
// 注意：以下API已弃用，保留仅用于向后兼容
// 新的Blockly代码生成器会在生成的Lua代码中包含 blockly_json 和 blockly_table_utils 模块
// 这些纯Lua实现的模块无需后端API调用，性能更好

// luaJSONEncode 将Lua表或值编码为JSON字符串
// 已弃用：请使用前端生成的 blockly_json.encode 函数
func (m *Manager) luaJSONEncode(L *lua.LState) int {
	// 获取要编码的值
	value := L.Get(1)
	if value == lua.LNil {
		L.Push(lua.LString("null"))
		return 1
	}

	// 转换为Go值
	goValue := luaValueToGo(L, value)

	// 编码为JSON
	jsonBytes, err := json.Marshal(goValue)
	if err != nil {
		L.Push(lua.LNil)
		L.Push(lua.LString(fmt.Sprintf("JSON编码失败: %v", err)))
		return 2
	}

	L.Push(lua.LString(string(jsonBytes)))
	return 1
}

// luaJSONDecode 将JSON字符串解码为Lua表
// 已弃用：请使用前端生成的 blockly_json.decode 函数
func (m *Manager) luaJSONDecode(L *lua.LState) int {
	jsonStr := L.ToString(1)
	if jsonStr == "" {
		L.Push(lua.LNil)
		L.Push(lua.LString("JSON字符串不能为空"))
		return 2
	}

	// 解析JSON
	var result interface{}
	if err := json.Unmarshal([]byte(jsonStr), &result); err != nil {
		L.Push(lua.LNil)
		L.Push(lua.LString(fmt.Sprintf("JSON解析失败: %v", err)))
		return 2
	}

	// 转换为Lua值
	L.Push(m.convertToLuaValue(L, result))
	return 1
}

// luaJSONGet 从JSON字符串中获取指定路径的值
// 已弃用：请使用前端生成的 blockly_json.get_path 函数
func (m *Manager) luaJSONGet(L *lua.LState) int {
	jsonStr := L.ToString(1)
	path := L.ToString(2)

	if jsonStr == "" {
		L.Push(lua.LNil)
		return 1
	}

	// 解析JSON
	var data interface{}
	if err := json.Unmarshal([]byte(jsonStr), &data); err != nil {
		L.Push(lua.LNil)
		return 1
	}

	// 按路径获取值
	keys := strings.Split(path, ".")
	result := data
	for _, key := range keys {
		if key == "" {
			continue
		}

		switch v := result.(type) {
		case map[string]interface{}:
			if val, ok := v[key]; ok {
				result = val
			} else {
				L.Push(lua.LNil)
				return 1
			}
		default:
			L.Push(lua.LNil)
			return 1
		}
	}

	L.Push(m.convertToLuaValue(L, result))
	return 1
}

// luaTableGet 从Lua表中获取指定键的值（支持嵌套路径和数组索引）
// 已弃用：请使用前端生成的 blockly_table_utils.get 函数
func (m *Manager) luaTableGet(L *lua.LState) int {
	if L.Get(1).Type() != lua.LTTable {
		L.Push(lua.LNil)
		return 1
	}

	table := L.ToTable(1)
	path := L.ToString(2)

	if path == "" {
		L.Push(table)
		return 1
	}

	// 解析路径，支持点号和数组索引，如 "message[0].text"
	keys := parsePath(path)
	current := lua.LValue(table)

	for _, key := range keys {
		if key == "" {
			continue
		}

		if current.Type() != lua.LTTable {
			L.Push(lua.LNil)
			return 1
		}

		tbl := current.(*lua.LTable)
		current = L.GetField(tbl, key)

		if current == lua.LNil {
			L.Push(lua.LNil)
			return 1
		}
	}

	L.Push(current)
	return 1
}

// parsePath 解析路径，支持点号和数组索引，如 "message[0].text"
func parsePath(path string) []string {
	var keys []string
	var current strings.Builder
	inBracket := false

	for i := 0; i < len(path); i++ {
		ch := path[i]
		switch ch {
		case '.':
			if !inBracket && current.Len() > 0 {
				keys = append(keys, current.String())
				current.Reset()
			}
		case '[':
			if !inBracket && current.Len() > 0 {
				keys = append(keys, current.String())
				current.Reset()
			}
			inBracket = true
		case ']':
			inBracket = false
			if current.Len() > 0 {
				keys = append(keys, current.String())
				current.Reset()
			}
		default:
			current.WriteByte(ch)
		}
	}

	if current.Len() > 0 {
		keys = append(keys, current.String())
	}

	return keys
}

// luaTableSet 向Lua表中设置指定键的值（支持嵌套路径）
// 已弃用：请使用前端生成的 blockly_table_utils.set 函数
func (m *Manager) luaTableSet(L *lua.LState) int {
	if L.Get(1).Type() != lua.LTTable {
		L.Push(lua.LFalse)
		L.Push(lua.LString("第一个参数必须是表"))
		return 2
	}

	table := L.ToTable(1)
	path := L.ToString(2)
	value := L.Get(3)

	if path == "" {
		L.Push(lua.LFalse)
		L.Push(lua.LString("路径不能为空"))
		return 2
	}

	// 按路径设置值
	keys := strings.Split(path, ".")
	current := table

	// 遍历到倒数第二个键
	for i := 0; i < len(keys)-1; i++ {
		key := keys[i]
		if key == "" {
			continue
		}

		next := L.GetField(current, key)
		if next == lua.LNil || next.Type() != lua.LTTable {
			// 创建新的子表
			newTable := L.NewTable()
			L.SetField(current, key, newTable)
			next = newTable
		}
		current = next.(*lua.LTable)
	}

	// 设置最终值
	lastKey := keys[len(keys)-1]
	L.SetField(current, lastKey, value)

	L.Push(lua.LTrue)
	return 1
}
