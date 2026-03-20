package utils

import (
	"regexp"
	"strconv"
	"strings"
)

// CQSegment represents a CQ code segment
type CQSegment struct {
	Type string
	Data map[string]string
	Raw  string
}

// ParseCQCode parses a message string containing CQ codes into structured segments
func ParseCQCode(message string) ([]CQSegment, string) {
	// Regular expression to match CQ codes: [CQ:type,key=value,...]
	re := regexp.MustCompile(`\[CQ:(\w+)(?:,([^]]+))?\]`)

	var segments []CQSegment
	plainText := message

	// Find all CQ codes
	matches := re.FindAllStringSubmatchIndex(message, -1)

	// Process matches in reverse order to maintain indices
	for i := len(matches) - 1; i >= 0; i-- {
		match := matches[i]
		start, end := match[0], match[1]
		cqType := message[match[2]:match[3]]

		var data map[string]string
		if match[4] != -1 && match[5] != -1 { // Has data part
			dataStr := message[match[4]:match[5]]
			data = parseCQData(dataStr)
		} else {
			data = make(map[string]string)
		}

		// Create segment
		segment := CQSegment{
			Type: cqType,
			Data: data,
			Raw:  message[start:end],
		}

		segments = append([]CQSegment{segment}, segments...) // Prepend to maintain order

		// Remove CQ code from plain text
		plainText = plainText[:start] + plainText[end:]
	}

	// Reverse the slice to maintain original order
	for i, j := 0, len(segments)-1; i < j; i, j = i+1, j-1 {
		segments[i], segments[j] = segments[j], segments[i]
	}

	return segments, strings.TrimSpace(plainText)
}

// parseCQData parses the data part of a CQ code (key=value,key2=value2,...)
func parseCQData(dataStr string) map[string]string {
	data := make(map[string]string)
	pairs := strings.Split(dataStr, ",")

	for _, pair := range pairs {
		parts := strings.SplitN(pair, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			value := strings.TrimSpace(parts[1])
			// Unescape common escapes
			value = strings.ReplaceAll(value, "&#91;", "[")
			value = strings.ReplaceAll(value, "&#93;", "]")
			value = strings.ReplaceAll(value, "&amp;", "&")
			data[key] = value
		}
	}

	return data
}

// ConvertCQMessageToSegments converts a raw message string with CQ codes to structured segments
// that can be used by plugins expecting structured data
func ConvertCQMessageToSegments(message string) []map[string]interface{} {
	segments, plainText := ParseCQCode(message)

	var result []map[string]interface{}

	// Add text segments for any plain text
	if plainText != "" {
		textSegment := map[string]interface{}{
			"type": "text",
			"data": map[string]string{"text": plainText},
		}
		result = append(result, textSegment)
	}

	// Add CQ code segments
	for _, segment := range segments {
		item := map[string]interface{}{
			"type": segment.Type,
			"data": segment.Data,
		}
		result = append(result, item)
	}

	return result
}

// GetPlainMessage extracts just the plain text from a message with CQ codes
func GetPlainMessage(message string) string {
	_, plainText := ParseCQCode(message)
	return plainText
}

// ReplaceCQCodes replaces CQ codes with readable text representations
func ReplaceCQCodes(message string, replacements map[string]string) string {
	// Default replacements if none provided
	if replacements == nil {
		replacements = map[string]string{
			"at":       "@用户",
			"face":     "[表情]",
			"image":    "[图片]",
			"record":   "[语音]",
			"video":    "[视频]",
			"share":    "[分享]",
			"contact":  "[推荐]",
			"location": "[位置]",
			"music":    "[音乐]",
			"reply":    "[回复]",
		}
	}

	segments, plainText := ParseCQCode(message)

	result := plainText
	for _, segment := range segments {
		placeholder, exists := replacements[segment.Type]
		if !exists {
			placeholder = "[" + segment.Type + "]"
		}
		// Replace the raw CQ code with the placeholder
		result = strings.Replace(result, segment.Raw, placeholder, 1)
	}

	return result
}

// ExtractUserIDsFromMessage extracts QQ IDs from at segments in the message
func ExtractUserIDsFromMessage(message string) []int64 {
	segments, _ := ParseCQCode(message)

	var userIDs []int64
	for _, segment := range segments {
		if segment.Type == "at" {
			if qqStr, exists := segment.Data["qq"]; exists {
				if id, err := strconv.ParseInt(qqStr, 10, 64); err == nil {
					userIDs = append(userIDs, id)
				}
			}
		}
	}

	return userIDs
}
