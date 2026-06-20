package utils

import (
	"crypto/md5"
	"encoding/hex"
	"regexp"
	"strings"
)

// DataMasker 数据脱敏工具
type DataMasker struct{}

var masker = &DataMasker{}

// GetMasker 获取脱敏器实例
func GetMasker() *DataMasker {
	return masker
}

// MaskToken 脱敏Token
func (m *DataMasker) MaskToken(token string) string {
	if len(token) <= 8 {
		return "****"
	}
	return token[:4] + "****" + token[len(token)-4:]
}

// MaskPassword 脱敏密码
func (m *DataMasker) MaskPassword(password string) string {
	if password == "" {
		return ""
	}
	return "****"
}

// MaskAPIKey 脱敏API密钥
func (m *DataMasker) MaskAPIKey(key string) string {
	if len(key) <= 6 {
		return "****"
	}
	return key[:3] + "****" + key[len(key)-3:]
}

// MaskQQ 脱敏QQ号
func (m *DataMasker) MaskQQ(qq string) string {
	if len(qq) <= 4 {
		return "****"
	}
	return qq[:2] + "****" + qq[len(qq)-2:]
}

// MaskPhone 脱敏手机号
func (m *DataMasker) MaskPhone(phone string) string {
	if len(phone) != 11 {
		return phone
	}
	return phone[:3] + "****" + phone[7:]
}

// MaskEmail 脱敏邮箱
func (m *DataMasker) MaskEmail(email string) string {
	if !strings.Contains(email, "@") {
		return m.MaskString(email)
	}
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return m.MaskString(email)
	}
	
	local := parts[0]
	domain := parts[1]
	
	if len(local) <= 3 {
		return "***@" + domain
	}
	return local[:2] + "***" + local[len(local)-1:] + "@" + domain
}

// MaskString 通用字符串脱敏
func (m *DataMasker) MaskString(str string) string {
	if str == "" {
		return ""
	}
	if len(str) <= 4 {
		return "****"
	}
	if len(str) <= 8 {
		return str[:2] + "****" + str[len(str)-2:]
	}
	return str[:3] + "****" + str[len(str)-3:]
}

// MaskSensitiveData 脱敏敏感数据（自动识别类型）
func (m *DataMasker) MaskSensitiveData(data string) string {
	// 手机号
	phoneRegex := regexp.MustCompile(`^1[3-9]\d{9}$`)
	if phoneRegex.MatchString(data) {
		return m.MaskPhone(data)
	}
	
	// 邮箱
	emailRegex := regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
	if emailRegex.MatchString(data) {
		return m.MaskEmail(data)
	}
	
	// QQ号（5-12位数字）
	qqRegex := regexp.MustCompile(`^\d{5,12}$`)
	if qqRegex.MatchString(data) {
		return m.MaskQQ(data)
	}
	
	// API密钥（包含特殊字符的长字符串）
	if len(data) > 20 && strings.ContainsAny(data, "-_") {
		return m.MaskAPIKey(data)
	}
	
	// 默认字符串脱敏
	return m.MaskString(data)
}

// HashData 对数据进行哈希处理（用于需要唯一标识但不暴露原值的情况）
func (m *DataMasker) HashData(data string) string {
	hash := md5.Sum([]byte(data))
	return hex.EncodeToString(hash[:])[:8] // 返回前8位哈希值
}

// MaskConfig 脱敏配置对象
func (m *DataMasker) MaskConfig(config map[string]interface{}) map[string]interface{} {
	masked := make(map[string]interface{})
	for k, v := range config {
		switch k {
		case "password", "secret", "key", "token", "api_key", "api_secret", "access_token", "proxy_key":
			if str, ok := v.(string); ok {
				masked[k] = m.MaskPassword(str)
			} else {
				masked[k] = "****"
			}
		case "email":
			if str, ok := v.(string); ok {
				masked[k] = m.MaskEmail(str)
			} else {
				masked[k] = v
			}
		case "phone", "mobile":
			if str, ok := v.(string); ok {
				masked[k] = m.MaskPhone(str)
			} else {
				masked[k] = v
			}
		default:
			masked[k] = v
		}
	}
	return masked
}