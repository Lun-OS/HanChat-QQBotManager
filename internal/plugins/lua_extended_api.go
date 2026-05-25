package plugins

import (
	"bytes"
	"bufio"
	"crypto/md5"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"math/rand"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	lua "github.com/yuin/gopher-lua"
	"github.com/google/uuid"
)

// ==================== 日期时间API ====================

// 格式化时间
func (m *Manager) luaTimeFormat() func(*lua.LState) int {
	return func(L *lua.LState) int {
		timestamp := L.CheckInt64(1)
		format := L.CheckString(2)
		t := time.Unix(timestamp, 0)
		L.Push(lua.LString(t.Format(format)))
		return 1
	}
}

// 解析时间
func (m *Manager) luaTimeParse() func(*lua.LState) int {
	return func(L *lua.LState) int {
		timeStr := L.CheckString(1)
		format := L.CheckString(2)
		t, err := time.Parse(format, timeStr)
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}
		L.Push(lua.LNumber(t.Unix()))
		return 1
	}
}

// 获取当前时间
func (m *Manager) luaTimeNow() func(*lua.LState) int {
	return func(L *lua.LState) int {
		L.Push(lua.LNumber(time.Now().Unix()))
		return 1
	}
}

// 获取时间组件
func (m *Manager) luaTimeComponents() func(*lua.LState) int {
	return func(L *lua.LState) int {
		timestamp := L.CheckInt64(1)
		t := time.Unix(timestamp, 0)
		result := L.NewTable()
		L.SetField(result, "year", lua.LNumber(t.Year()))
		L.SetField(result, "month", lua.LNumber(int(t.Month())))
		L.SetField(result, "day", lua.LNumber(t.Day()))
		L.SetField(result, "hour", lua.LNumber(t.Hour()))
		L.SetField(result, "minute", lua.LNumber(t.Minute()))
		L.SetField(result, "second", lua.LNumber(t.Second()))
		L.SetField(result, "weekday", lua.LNumber(int(t.Weekday())))
		L.Push(result)
		return 1
	}
}

// ==================== 加密/哈希API ====================

// MD5哈希
func (m *Manager) luaMD5() func(*lua.LState) int {
	return func(L *lua.LState) int {
		data := L.CheckString(1)
		hash := md5.Sum([]byte(data))
		L.Push(lua.LString(hex.EncodeToString(hash[:])))
		return 1
	}
}

// SHA1哈希
func (m *Manager) luaSHA1() func(*lua.LState) int {
	return func(L *lua.LState) int {
		data := L.CheckString(1)
		hash := sha1.Sum([]byte(data))
		L.Push(lua.LString(hex.EncodeToString(hash[:])))
		return 1
	}
}

// SHA256哈希
func (m *Manager) luaSHA256() func(*lua.LState) int {
	return func(L *lua.LState) int {
		data := L.CheckString(1)
		hash := sha256.Sum256([]byte(data))
		L.Push(lua.LString(hex.EncodeToString(hash[:])))
		return 1
	}
}

// ==================== 正则表达式API ====================

// 匹配
func (m *Manager) luaRegexMatch() func(*lua.LState) int {
	return func(L *lua.LState) int {
		pattern := L.CheckString(1)
		str := L.CheckString(2)
		matched, err := regexp.MatchString(pattern, str)
		if err != nil {
			L.Push(lua.LBool(false))
			L.Push(lua.LString(err.Error()))
			return 2
		}
		L.Push(lua.LBool(matched))
		return 1
	}
}

// 查找所有匹配
func (m *Manager) luaRegexFindAll() func(*lua.LState) int {
	return func(L *lua.LState) int {
		pattern := L.CheckString(1)
		str := L.CheckString(2)
		re, err := regexp.Compile(pattern)
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}
		matches := re.FindAllString(str, -1)
		result := L.NewTable()
		for i, match := range matches {
			L.SetField(result, strconv.Itoa(i+1), lua.LString(match))
		}
		L.Push(result)
		return 1
	}
}

// 替换
func (m *Manager) luaRegexReplace() func(*lua.LState) int {
	return func(L *lua.LState) int {
		pattern := L.CheckString(1)
		str := L.CheckString(2)
		replace := L.CheckString(3)
		re, err := regexp.Compile(pattern)
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}
		result := re.ReplaceAllString(str, replace)
		L.Push(lua.LString(result))
		return 1
	}
}

// ==================== 数学扩展API ====================

// 随机浮点数
func (m *Manager) luaMathRandomFloat() func(*lua.LState) int {
	return func(L *lua.LState) int {
		min := L.OptNumber(1, 0.0)
		max := L.OptNumber(2, 1.0)
		result := float64(min) + rand.Float64()*(float64(max)-float64(min))
		L.Push(lua.LNumber(result))
		return 1
	}
}

// 随机整数
func (m *Manager) luaMathRandomInt() func(*lua.LState) int {
	return func(L *lua.LState) int {
		min := L.CheckInt(1)
		max := L.CheckInt(2)
		result := min + rand.Intn(max-min+1)
		L.Push(lua.LNumber(result))
		return 1
	}
}

// 四舍五入
func (m *Manager) luaMathRound() func(*lua.LState) int {
	return func(L *lua.LState) int {
		x := L.CheckNumber(1)
		result := math.Round(float64(x))
		L.Push(lua.LNumber(result))
		return 1
	}
}

// 绝对值
func (m *Manager) luaMathAbs() func(*lua.LState) int {
	return func(L *lua.LState) int {
		x := L.CheckNumber(1)
		result := math.Abs(float64(x))
		L.Push(lua.LNumber(result))
		return 1
	}
}

// 幂运算
func (m *Manager) luaMathPow() func(*lua.LState) int {
	return func(L *lua.LState) int {
		x := L.CheckNumber(1)
		y := L.CheckNumber(2)
		result := math.Pow(float64(x), float64(y))
		L.Push(lua.LNumber(result))
		return 1
	}
}

// ==================== 字符串处理扩展API ====================

// 字符串分割
func (m *Manager) luaStringSplit() func(*lua.LState) int {
	return func(L *lua.LState) int {
		str := L.CheckString(1)
		sep := L.CheckString(2)
		parts := strings.Split(str, sep)
		result := L.NewTable()
		for i, part := range parts {
			L.SetField(result, strconv.Itoa(i+1), lua.LString(part))
		}
		L.Push(result)
		return 1
	}
}

// 字符串连接
func (m *Manager) luaStringJoin() func(*lua.LState) int {
	return func(L *lua.LState) int {
		table := L.CheckTable(1)
		sep := L.CheckString(2)
		var parts []string
		table.ForEach(func(_, val lua.LValue) {
			parts = append(parts, val.String())
		})
		result := strings.Join(parts, sep)
		L.Push(lua.LString(result))
		return 1
	}
}

// 字符串替换
func (m *Manager) luaStringReplace() func(*lua.LState) int {
	return func(L *lua.LState) int {
		str := L.CheckString(1)
		old := L.CheckString(2)
		newStr := L.CheckString(3)
		n := L.OptInt(4, -1)
		result := strings.Replace(str, old, newStr, n)
		L.Push(lua.LString(result))
		return 1
	}
}

// 字符串是否包含
func (m *Manager) luaStringContains() func(*lua.LState) int {
	return func(L *lua.LState) int {
		str := L.CheckString(1)
		substr := L.CheckString(2)
		result := strings.Contains(str, substr)
		L.Push(lua.LBool(result))
		return 1
	}
}

// 字符串修剪
func (m *Manager) luaStringTrim() func(*lua.LState) int {
	return func(L *lua.LState) int {
		str := L.CheckString(1)
		cutset := L.OptString(2, " \t\n\r")
		result := strings.Trim(str, cutset)
		L.Push(lua.LString(result))
		return 1
	}
}

// ==================== UUID生成API ====================

// 生成UUID
func (m *Manager) luaUUIDNew() func(*lua.LState) int {
	return func(L *lua.LState) int {
		u := uuid.New()
		L.Push(lua.LString(u.String()))
		return 1
	}
}

// ==================== WebSocket自定义消息API ====================

// 发送自定义WebSocket消息（用于发送未声明过的消息）
// 参数：action (string) - 接口地址/动作名称
//       data (table) - 请求数据
// 返回：成功返回 true，失败返回 nil, error
func (m *Manager) luaSendCustomWSMessage(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		if instance == nil || instance.reverseWS == nil {
			L.Push(lua.LNil)
			L.Push(lua.LString("WebSocket服务未初始化"))
			return 2
		}

		action := L.CheckString(1)
		if action == "" {
			L.Push(lua.LNil)
			L.Push(lua.LString("接口地址不能为空"))
			return 2
		}

		var data interface{}
		if L.GetTop() >= 2 {
			tbl := L.CheckTable(2)
			data = luaTableToMap(L, tbl)
		} else {
			data = make(map[string]interface{})
		}

		request := map[string]interface{}{
			"action": action,
			"params": data,
		}

		if err := instance.reverseWS.SendMessageToAccount(instance.SelfID, request); err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		L.Push(lua.LBool(true))
		return 1
	}
}

// ==================== AI对接API ====================

// AI聊天请求
// 参数：config (table) - 配置表，包含以下字段：
//   api_format (number) - API格式：0=OpenAI Chat Completions, 1=Anthropic Messages
//   url (string) - 完整请求地址
//   model (string) - 模型名称
//   api_key (string) - API密钥
//   system_prompt (string) - 系统提示词（可选）
//   content (table/string) - 内容，支持多模态（文字、图片、或两者混合）
//     文字内容示例: "你好"
//     图片内容示例: { type = "image", data = "base64编码", media_type = "image/png" }
//     混合内容示例: { { type = "text", text = "描述这张图" }, { type = "image", data = "...", media_type = "..." } }
//   max_tokens (number) - 最大token数（可选，默认4096）
//   temperature (number) - 温度参数（可选，默认0.7）
//   stream (boolean) - 是否使用流式响应（可选，默认false，长回答建议开启避免超时）
//
// 返回：成功返回 table（包含 response, usage 等信息），失败返回 nil, error
func (m *Manager) luaAIChat() func(*lua.LState) int {
	return func(L *lua.LState) int {
		config := L.CheckTable(1)

		apiFormat := 0
		if val := L.GetField(config, "api_format"); val != lua.LNil {
			apiFormat = int(val.(lua.LNumber))
		}

		url := L.GetField(config, "url").String()
		if url == "" {
			L.Push(lua.LNil)
			L.Push(lua.LString("请求地址不能为空"))
			return 2
		}

		model := L.GetField(config, "model").String()
		if model == "" {
			L.Push(lua.LNil)
			L.Push(lua.LString("模型名称不能为空"))
			return 2
		}

		apiKey := L.GetField(config, "api_key").String()

		systemPrompt := L.GetField(config, "system_prompt").String()

		contentVal := L.GetField(config, "content")
		if contentVal == lua.LNil {
			L.Push(lua.LNil)
			L.Push(lua.LString("内容不能为空"))
			return 2
		}

		maxTokens := 4096
		if val := L.GetField(config, "max_tokens"); val != lua.LNil && val.Type() == lua.LTNumber {
			maxTokens = int(val.(lua.LNumber))
		}

		temperature := 0.7
		if val := L.GetField(config, "temperature"); val != lua.LNil && val.Type() == lua.LTNumber {
			temperature = float64(val.(lua.LNumber))
		}

		useStream := false
		if val := L.GetField(config, "stream"); val != lua.LNil {
			useStream = val == lua.LTrue
		}

		var requestBody []byte
		var contentType string

		switch apiFormat {
		case 0:
			requestBody, contentType = buildOpenAIRequest(model, systemPrompt, contentVal, maxTokens, temperature, useStream)
		case 1:
			requestBody, contentType = buildAnthropicRequest(apiKey, model, systemPrompt, contentVal, maxTokens, temperature, useStream)
		default:
			L.Push(lua.LNil)
			L.Push(lua.LString(fmt.Sprintf("不支持的API格式: %d", apiFormat)))
			return 2
		}

		req, err := http.NewRequest("POST", url, bytes.NewBuffer(requestBody))
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(fmt.Sprintf("创建请求失败: %v", err)))
			return 2
		}

		req.Header.Set("Content-Type", contentType)
		if apiKey != "" {
			switch apiFormat {
			case 0:
				req.Header.Set("Authorization", "Bearer "+apiKey)
			case 1:
				req.Header.Set("x-api-key", apiKey)
				req.Header.Set("anthropic-version", "2023-06-01")
			}
		}

		client := &http.Client{
			Timeout: 300 * time.Second,
		}

		resp, err := client.Do(req)
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(fmt.Sprintf("请求失败: %v", err)))
			return 2
		}
		defer resp.Body.Close()

		var responseText string
		var result map[string]interface{}
		var rawResponse string

		if useStream {
			responseText, result, rawResponse, err = handleStreamResponse(apiFormat, resp)
		} else {
			respBody, readErr := io.ReadAll(io.LimitReader(resp.Body, 50*1024*1024))
			if readErr != nil {
				L.Push(lua.LNil)
				L.Push(lua.LString(fmt.Sprintf("读取响应失败: %v", readErr)))
				return 2
			}
			rawResponse = string(respBody)

			if resp.StatusCode != http.StatusOK {
				L.Push(lua.LNil)
				L.Push(lua.LString(fmt.Sprintf("API错误 [%d]: %s", resp.StatusCode, rawResponse)))
				return 2
			}

			result = make(map[string]interface{})
			if unmarshalErr := json.Unmarshal(respBody, &result); unmarshalErr != nil {
				L.Push(lua.LNil)
				L.Push(lua.LString(fmt.Sprintf("解析响应失败: %v", unmarshalErr)))
				return 2
			}
			responseText = extractAIResponse(apiFormat, result)
		}

		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(fmt.Sprintf("处理响应失败: %v", err)))
			return 2
		}

		resultTable := L.NewTable()
		L.SetField(resultTable, "response", lua.LString(responseText))
		L.SetField(resultTable, "raw_response", lua.LString(rawResponse))

		if usage, ok := result["usage"]; ok {
			if usageMap, ok := usage.(map[string]interface{}); ok {
				usageTable := L.NewTable()
				for k, v := range usageMap {
					switch tv := v.(type) {
					case float64:
						L.SetField(usageTable, k, lua.LNumber(tv))
					case int64:
						L.SetField(usageTable, k, lua.LNumber(tv))
					case int:
						L.SetField(usageTable, k, lua.LNumber(tv))
					default:
						L.SetField(usageTable, k, lua.LString(fmt.Sprintf("%v", v)))
					}
				}
				L.SetField(resultTable, "usage", usageTable)
			}
		}

		if modelResult, ok := result["model"]; ok {
			L.SetField(resultTable, "model", lua.LString(fmt.Sprintf("%v", modelResult)))
		}

		L.Push(resultTable)
		return 1
	}
}

func buildOpenAIRequest(model, systemPrompt string, contentVal lua.LValue, maxTokens int, temperature float64, useStream bool) ([]byte, string) {
	messages := make([]map[string]interface{}, 0)

	if systemPrompt != "" {
		messages = append(messages, map[string]interface{}{
			"role":    "system",
			"content": systemPrompt,
		})
	}

	userContent := convertToOpenAIContent(contentVal)
	messages = append(messages, map[string]interface{}{
		"role":    "user",
		"content": userContent,
	})

	request := map[string]interface{}{
		"model":       model,
		"messages":    messages,
		"max_tokens":  maxTokens,
		"temperature": temperature,
		"stream":      useStream,
	}

	body, _ := json.Marshal(request)
	return body, "application/json"
}

func buildAnthropicRequest(apiKey, model, systemPrompt string, contentVal lua.LValue, maxTokens int, temperature float64, useStream bool) ([]byte, string) {
	system := []string{}
	if systemPrompt != "" {
		system = append(system, systemPrompt)
	}

	content := convertToAnthropicContent(contentVal)

	request := map[string]interface{}{
		"model":       model,
		"max_tokens":  maxTokens,
		"temperature": temperature,
		"stream":      useStream,
		"system":      system,
		"messages": []map[string]interface{}{
			{
				"role":    "user",
				"content": content,
			},
		},
	}

	body, _ := json.Marshal(request)
	return body, "application/json"
}

func convertToOpenAIContent(contentVal lua.LValue) interface{} {
	switch contentVal.Type() {
	case lua.LTString:
		return contentVal.String()
	case lua.LTTable:
		tbl := contentVal.(*lua.LTable)
		if tbl.Len() > 0 || hasStringKeys(tbl) {
			var parts []interface{}
			tbl.ForEach(func(_, val lua.LValue) {
				part := convertLuaToOpenAIPart(val)
				if part != nil {
					parts = append(parts, part)
				}
			})
			if len(parts) > 0 {
				return parts
			}
		}
		if typeVal := luaValueToGo(nil, LGetFieldSafe(nil, contentVal, "type")); typeVal == "image" {
			data := luaValueToGo(nil, LGetFieldSafe(nil, contentVal, "data"))
			mediaType := luaValueToGo(nil, LGetFieldSafe(nil, contentVal, "media_type"))
			if dataStr, ok := data.(string); ok {
				mediaTypeStr, _ := mediaType.(string)
				if mediaTypeStr == "" {
					mediaTypeStr = "image/png"
				}
				return []interface{}{
					map[string]interface{}{
						"type": "text",
						"text": "",
					},
					map[string]interface{}{
						"type": "image_url",
						"image_url": map[string]interface{}{
							"url": fmt.Sprintf("data:%s;base64,%s", mediaTypeStr, dataStr),
						},
					},
				}
			}
		}
		return contentVal.String()
	default:
		return contentVal.String()
	}
}

func convertLuaToOpenAIPart(val lua.LValue) interface{} {
	if val.Type() == lua.LTString {
		return map[string]interface{}{
			"type": "text",
			"text": val.String(),
		}
	}
	if val.Type() == lua.LTTable {
		typeVal := luaValueToGo(nil, LGetFieldSafe(nil, val, "type"))
		switch typeVal {
		case "text":
			text := luaValueToGo(nil, LGetFieldSafe(nil, val, "text"))
			textStr, _ := text.(string)
			return map[string]interface{}{
				"type": "text",
				"text": textStr,
			}
		case "image":
			data := luaValueToGo(nil, LGetFieldSafe(nil, val, "data"))
			mediaType := luaValueToGo(nil, LGetFieldSafe(nil, val, "media_type"))
			if dataStr, ok := data.(string); ok {
				mediaTypeStr, _ := mediaType.(string)
				if mediaTypeStr == "" {
					mediaTypeStr = "image/png"
				}
				return map[string]interface{}{
					"type": "image_url",
					"image_url": map[string]interface{}{
						"url": fmt.Sprintf("data:%s;base64,%s", mediaTypeStr, dataStr),
					},
				}
			}
		}
	}
	return nil
}

func convertToAnthropicContent(contentVal lua.LValue) interface{} {
	switch contentVal.Type() {
	case lua.LTString:
		return []interface{}{
			map[string]interface{}{
				"type": "text",
				"text": contentVal.String(),
			},
		}
	case lua.LTTable:
		tbl := contentVal.(*lua.LTable)
		if tbl.Len() > 0 || hasStringKeys(tbl) {
			var parts []interface{}
			tbl.ForEach(func(_, val lua.LValue) {
				part := convertLuaToAnthropicPart(val)
				if part != nil {
					parts = append(parts, part)
				}
			})
			if len(parts) > 0 {
				return parts
			}
		}
		typeVal := luaValueToGo(nil, LGetFieldSafe(nil, contentVal, "type"))
		if typeVal == "image" {
			data := luaValueToGo(nil, LGetFieldSafe(nil, contentVal, "data"))
			mediaType := luaValueToGo(nil, LGetFieldSafe(nil, contentVal, "media_type"))
			if dataStr, ok := data.(string); ok {
				mediaTypeStr, _ := mediaType.(string)
				if mediaTypeStr == "" {
					mediaTypeStr = "image/png"
				}
				return []interface{}{
					map[string]interface{}{
						"type":  "image",
						"source": map[string]interface{}{
							"type":      "base64",
							"media_type": mediaTypeStr,
							"data":      dataStr,
						},
					},
				}
			}
		}
		return []interface{}{
			map[string]interface{}{
				"type": "text",
				"text": contentVal.String(),
			},
		}
	default:
		return []interface{}{
			map[string]interface{}{
				"type": "text",
				"text": contentVal.String(),
			},
		}
	}
}

func convertLuaToAnthropicPart(val lua.LValue) interface{} {
	if val.Type() == lua.LTString {
		return map[string]interface{}{
			"type": "text",
			"text": val.String(),
		}
	}
	if val.Type() == lua.LTTable {
		typeVal := luaValueToGo(nil, LGetFieldSafe(nil, val, "type"))
		switch typeVal {
		case "text":
			text := luaValueToGo(nil, LGetFieldSafe(nil, val, "text"))
			textStr, _ := text.(string)
			return map[string]interface{}{
				"type": "text",
				"text": textStr,
			}
		case "image":
			data := luaValueToGo(nil, LGetFieldSafe(nil, val, "data"))
			mediaType := luaValueToGo(nil, LGetFieldSafe(nil, val, "media_type"))
			if dataStr, ok := data.(string); ok {
				mediaTypeStr, _ := mediaType.(string)
				if mediaTypeStr == "" {
					mediaTypeStr = "image/png"
				}
				return map[string]interface{}{
					"type": "image",
					"source": map[string]interface{}{
						"type":      "base64",
						"media_type": mediaTypeStr,
						"data":      dataStr,
					},
				}
			}
		}
	}
	return nil
}

func extractAIResponse(apiFormat int, result map[string]interface{}) string {
	switch apiFormat {
	case 0:
		if choices, ok := result["choices"].([]interface{}); ok && len(choices) > 0 {
			if choice, ok := choices[0].(map[string]interface{}); ok {
				if message, ok := choice["message"].(map[string]interface{}); ok {
					if content, ok := message["content"].(string); ok {
						return content
					}
				}
			}
		}
	case 1:
		if content, ok := result["content"].([]interface{}); ok {
			var texts []string
			for _, block := range content {
				if blockMap, ok := block.(map[string]interface{}); ok {
					if blockType, ok := blockMap["type"].(string); ok && blockType == "text" {
						if text, ok := blockMap["text"].(string); ok {
							texts = append(texts, text)
						}
					}
				}
			}
			return strings.Join(texts, "")
		}
	}
	return ""
}

func handleStreamResponse(apiFormat int, resp *http.Response) (string, map[string]interface{}, string, error) {
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024*1024))
		return "", nil, string(body), fmt.Errorf("API错误 [%d]: %s", resp.StatusCode, string(body))
	}

	var fullResponse strings.Builder
	var rawResponse strings.Builder
	var usage map[string]interface{}
	var modelName string

	scanner := bufio.NewScanner(resp.Body)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		rawResponse.WriteString(line)
		rawResponse.WriteString("\n")

		if apiFormat == 0 {
			if strings.HasPrefix(line, "data: ") {
				data := strings.TrimPrefix(line, "data: ")
				if data == "[DONE]" {
					break
				}
				var chunk map[string]interface{}
				if err := json.Unmarshal([]byte(data), &chunk); err != nil {
					continue
				}
				if choices, ok := chunk["choices"].([]interface{}); ok && len(choices) > 0 {
					if choice, ok := choices[0].(map[string]interface{}); ok {
						if delta, ok := choice["delta"].(map[string]interface{}); ok {
							if content, ok := delta["content"].(string); ok {
								fullResponse.WriteString(content)
							}
						}
						if finishReason, ok := choice["finish_reason"].(string); ok && finishReason != "" {
							if chunkUsage, ok := chunk["usage"]; ok {
								if u, ok := chunkUsage.(map[string]interface{}); ok {
									usage = u
								}
							}
						}
					}
				}
				if m, ok := chunk["model"]; ok {
					modelName = fmt.Sprintf("%v", m)
				}
			}
		} else if apiFormat == 1 {
			if strings.HasPrefix(line, "data: ") {
				data := strings.TrimPrefix(line, "data: ")
				var chunk map[string]interface{}
				if err := json.Unmarshal([]byte(data), &chunk); err != nil {
					continue
				}
				if eventType, ok := chunk["type"].(string); ok {
					switch eventType {
					case "content_block_delta":
						if delta, ok := chunk["delta"].(map[string]interface{}); ok {
							if text, ok := delta["text"].(string); ok {
								fullResponse.WriteString(text)
							}
						}
					case "message_stop":
						if msg, ok := chunk["message"].(map[string]interface{}); ok {
							if u, ok := msg["usage"].(map[string]interface{}); ok {
								usage = u
							}
						}
					case "message_start":
						if msg, ok := chunk["message"].(map[string]interface{}); ok {
							if m, ok := msg["model"].(string); ok {
								modelName = m
							}
						}
					}
				}
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return fullResponse.String(), nil, rawResponse.String(), fmt.Errorf("读取流数据失败: %v", err)
	}

	result := make(map[string]interface{})
	result["response"] = fullResponse.String()
	if usage != nil {
		result["usage"] = usage
	}
	if modelName != "" {
		result["model"] = modelName
	}

	return fullResponse.String(), result, rawResponse.String(), nil
}

func hasStringKeys(tbl *lua.LTable) bool {
	hasNonIntKey := false
	tbl.ForEach(func(key, _ lua.LValue) {
		if key.Type() != lua.LTNumber {
			hasNonIntKey = true
		}
	})
	return hasNonIntKey
}

func LGetFieldSafe(L *lua.LState, tbl lua.LValue, field string) lua.LValue {
	if L == nil || tbl == lua.LNil || tbl.Type() != lua.LTTable {
		return lua.LNil
	}
	return L.GetField(tbl.(*lua.LTable), field)
}

// ==================== MCP Lua API ====================

// 连接MCP服务器
// 参数：config (table) - 配置表
//   name (string) - 服务器名称（必填）
//   command (string) - 启动命令（stdio模式必填）
//   args (table) - 命令参数
//   env (table) - 环境变量 {key=value}
//   url (string) - SSE/HTTP模式URL
//   transport (string) - "stdio" | "sse" | "http"，默认 "stdio"
//
// 返回：成功返回 true，失败返回 nil, error
func (m *Manager) luaMCPConnect() func(*lua.LState) int {
	return func(L *lua.LState) int {
		config := L.CheckTable(1)

		name := L.GetField(config, "name").String()
		if name == "" {
			L.Push(lua.LNil)
			L.Push(lua.LString("服务器名称不能为空"))
			return 2
		}

		serverConfig := &MCPServerConfig{
			Name:      name,
			Command:   L.GetField(config, "command").String(),
			Transport: L.GetField(config, "transport").String(),
			URL:       L.GetField(config, "url").String(),
			Enabled:   true,
		}

		if serverConfig.Transport == "" {
			serverConfig.Transport = "stdio"
		}

		// 解析args参数
		argsVal := L.GetField(config, "args")
		if argsVal.Type() == lua.LTTable {
			argsVal.(*lua.LTable).ForEach(func(_, v lua.LValue) {
				serverConfig.Args = append(serverConfig.Args, v.String())
			})
		}

		// 解析env参数
		envVal := L.GetField(config, "env")
		if envVal.Type() == lua.LTTable {
			serverConfig.Env = make(map[string]string)
			envVal.(*lua.LTable).ForEach(func(k, v lua.LValue) {
				serverConfig.Env[k.String()] = v.String()
			})
		}

		if err := m.mcpManager.AddServer(name, serverConfig); err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		L.Push(lua.LBool(true))
		return 1
	}
}

// 断开MCP服务器连接
// 参数：name (string) - 服务器名称
func (m *Manager) luaMCPDisconnect() func(*lua.LState) int {
	return func(L *lua.LState) int {
		name := L.CheckString(1)

		if err := m.mcpManager.RemoveServer(name); err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		L.Push(lua.LBool(true))
		return 1
	}
}

// 调用MCP工具
// 参数：server_name (string) - 服务器名称
//       tool_name (string) - 工具名称
//       arguments (table) - 工具参数
//
// 返回：成功返回 table { content, is_error }，失败返回 nil, error
func (m *Manager) luaMCPCallTool() func(*lua.LState) int {
	return func(L *lua.LState) int {
		serverName := L.CheckString(1)
		toolName := L.CheckString(2)

		var arguments map[string]interface{}
		if L.GetTop() >= 3 && L.Get(3).Type() == lua.LTTable {
			arguments = luaTableToMap(L, L.CheckTable(3))
		} else {
			arguments = make(map[string]interface{})
		}

		result, err := m.mcpManager.CallTool(serverName, toolName, arguments)
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		resultTable := L.NewTable()

		var contents []string
		for _, c := range result.Content {
			contents = append(contents, c.Text)
		}
		L.SetField(resultTable, "content", lua.LString(strings.Join(contents, "\n")))
		L.SetField(resultTable, "is_error", lua.LBool(result.IsError))

		L.Push(resultTable)
		return 1
	}
}

// 列出所有已连接的MCP服务器和工具
// 返回：table { server_name = { tools... } }
func (m *Manager) luaMCPListServers() func(*lua.LState) int {
	return func(L *lua.LState) int {
		allTools := m.mcpManager.GetAllTools()
		servers := m.mcpManager.GetServers()

		resultTable := L.NewTable()

		for _, serverName := range servers {
			serverTable := L.NewTable()

			client := m.mcpManager.GetServer(serverName)
			if client != nil && client.GetServerInfo() != nil {
				info := client.GetServerInfo()
				infoTable := L.NewTable()
				L.SetField(infoTable, "name", lua.LString(info.Name))
				L.SetField(infoTable, "version", lua.LString(info.Version))
				L.SetField(serverTable, "info", infoTable)
			}

			toolsTable := L.NewTable()
			if tools, ok := allTools[serverName]; ok {
				for i, tool := range tools {
					toolTable := L.NewTable()
					L.SetField(toolTable, "name", lua.LString(tool.Name))
					L.SetField(toolTable, "description", lua.LString(tool.Description))

					// 尝试解析 inputSchema
					var schema map[string]interface{}
					if json.Unmarshal(tool.InputSchema, &schema) == nil {
						schemaStr, _ := json.Marshal(schema)
						L.SetField(toolTable, "input_schema", lua.LString(string(schemaStr)))
					}

					L.RawSetInt(toolsTable, i+1, toolTable)
				}
			}
			L.SetField(serverTable, "tools", toolsTable)

			L.SetField(resultTable, serverName, serverTable)
		}

		L.Push(resultTable)
		return 1
	}
}

// 获取指定服务器的工具列表
// 参数：server_name (string) - 服务器名称（可选，不传则返回所有）
// 返回：tools 数组或 { server: tools } 表
func (m *Manager) luaMCPGetTools() func(*lua.LState) int {
	return func(L *lua.LState) int {
		if L.GetTop() >= 1 && L.Get(1).Type() == lua.LTString {
			serverName := L.CheckString(1)
			client := m.mcpManager.GetServer(serverName)
			if client == nil {
				L.Push(lua.LNil)
				L.Push(lua.LString(fmt.Sprintf("服务器 [%s] 不存在", serverName)))
				return 2
			}

			tools := client.GetTools()
			toolsTable := L.NewTable()
			for i, tool := range tools {
				toolTable := L.NewTable()
				L.SetField(toolTable, "name", lua.LString(tool.Name))
				L.SetField(toolTable, "description", lua.LString(tool.Description))
				L.RawSetInt(toolsTable, i+1, toolTable)
			}

			L.Push(toolsTable)
			return 1
		}

		allTools := m.mcpManager.GetAllTools()
		resultTable := L.NewTable()
		for serverName, tools := range allTools {
			toolsTable := L.NewTable()
			for i, tool := range tools {
				toolTable := L.NewTable()
				L.SetField(toolTable, "name", lua.LString(tool.Name))
				L.SetField(toolTable, "description", lua.LString(tool.Description))
				L.RawSetInt(toolsTable, i+1, toolTable)
			}
			L.SetField(resultTable, serverName, toolsTable)
		}

		L.Push(resultTable)
		return 1
	}
}

// ==================== 注册扩展API ====================

func (m *Manager) registerExtendedAPI(L *lua.LState, instance *LuaPluginInstance) {
	// 日期时间API
	timeTable := L.NewTable()
	L.SetField(timeTable, "now", L.NewFunction(m.luaTimeNow()))
	L.SetField(timeTable, "format", L.NewFunction(m.luaTimeFormat()))
	L.SetField(timeTable, "parse", L.NewFunction(m.luaTimeParse()))
	L.SetField(timeTable, "components", L.NewFunction(m.luaTimeComponents()))
	L.SetGlobal("time", timeTable)

	// 加密/哈希API
	cryptoTable := L.NewTable()
	L.SetField(cryptoTable, "md5", L.NewFunction(m.luaMD5()))
	L.SetField(cryptoTable, "sha1", L.NewFunction(m.luaSHA1()))
	L.SetField(cryptoTable, "sha256", L.NewFunction(m.luaSHA256()))
	L.SetGlobal("crypto", cryptoTable)

	// 正则表达式API
	regexTable := L.NewTable()
	L.SetField(regexTable, "match", L.NewFunction(m.luaRegexMatch()))
	L.SetField(regexTable, "find_all", L.NewFunction(m.luaRegexFindAll()))
	L.SetField(regexTable, "replace", L.NewFunction(m.luaRegexReplace()))
	L.SetGlobal("regex", regexTable)

	// 数学扩展API
	mathTable := L.NewTable()
	L.SetField(mathTable, "random_float", L.NewFunction(m.luaMathRandomFloat()))
	L.SetField(mathTable, "random_int", L.NewFunction(m.luaMathRandomInt()))
	L.SetField(mathTable, "round", L.NewFunction(m.luaMathRound()))
	L.SetField(mathTable, "abs", L.NewFunction(m.luaMathAbs()))
	L.SetField(mathTable, "pow", L.NewFunction(m.luaMathPow()))
	L.SetGlobal("math_ext", mathTable)

	// 字符串处理扩展API
	stringTable := L.NewTable()
	L.SetField(stringTable, "split", L.NewFunction(m.luaStringSplit()))
	L.SetField(stringTable, "join", L.NewFunction(m.luaStringJoin()))
	L.SetField(stringTable, "replace", L.NewFunction(m.luaStringReplace()))
	L.SetField(stringTable, "contains", L.NewFunction(m.luaStringContains()))
	L.SetField(stringTable, "trim", L.NewFunction(m.luaStringTrim()))
	L.SetGlobal("string_ext", stringTable)

	// UUID API
	uuidTable := L.NewTable()
	L.SetField(uuidTable, "new", L.NewFunction(m.luaUUIDNew()))
	L.SetGlobal("uuid", uuidTable)

	// WebSocket自定义消息API
	wsTable := L.NewTable()
	L.SetField(wsTable, "send", L.NewFunction(m.luaSendCustomWSMessage(instance)))
	L.SetGlobal("ws", wsTable)

	// AI对接API
	aiTable := L.NewTable()
	L.SetField(aiTable, "chat", L.NewFunction(m.luaAIChat()))
	L.SetGlobal("ai", aiTable)

	// MCP API
	mcpTable := L.NewTable()
	L.SetField(mcpTable, "connect", L.NewFunction(m.luaMCPConnect()))
	L.SetField(mcpTable, "disconnect", L.NewFunction(m.luaMCPDisconnect()))
	L.SetField(mcpTable, "call", L.NewFunction(m.luaMCPCallTool()))
	L.SetField(mcpTable, "list", L.NewFunction(m.luaMCPListServers()))
	L.SetField(mcpTable, "tools", L.NewFunction(m.luaMCPGetTools()))
	L.SetGlobal("mcp", mcpTable)
}
