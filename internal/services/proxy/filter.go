package proxy

import (
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"

	"HanChat-QQBotManager/internal/models"
)

// EventFilter 事件过滤器
type EventFilter struct {
	config EventFilterConfig
	logger Logger
}

// EventFilterConfig 事件过滤器配置（内部使用，与 models.EventFilterConfig 结构一致）
type EventFilterConfig struct {
	Mode      models.FilterMode
	IsEnabled bool
	Rules     []models.EventFilterRule
}

// NewEventFilter 创建过滤器
func NewEventFilter(config models.EventFilterConfig, logger Logger) *EventFilter {
	return &EventFilter{
		config: EventFilterConfig{
			Mode:      config.Mode,
			IsEnabled: config.IsEnabled,
			Rules:     config.Rules,
		},
		logger: logger,
	}
}

// UpdateConfig 更新过滤器配置
func (f *EventFilter) UpdateConfig(config models.EventFilterConfig) {
	f.config = EventFilterConfig{
		Mode:      config.Mode,
		IsEnabled: config.IsEnabled,
		Rules:     config.Rules,
	}
}

// ShouldPass 判断事件是否应该通过
func (f *EventFilter) ShouldPass(rawData []byte) bool {
	if f == nil {
		return true
	}
	if !f.config.IsEnabled || len(f.config.Rules) == 0 {
		return true
	}

	if IsHeartbeatEvent(rawData) {
		return true
	}

	var event map[string]interface{}
	if err := json.Unmarshal(rawData, &event); err != nil {
		if f.logger != nil {
			f.logger.Warnw("解析事件失败-过滤器跳过",
				"error", err,
				"raw_data_preview", truncateString(string(rawData), 100),
			)
		}
		return true
	}

	allMatch := true
	failedRules := make([]string, 0)
	for _, rule := range f.config.Rules {
		if !rule.IsEnabled {
			continue
		}
		match := f.matchRule(rule, event)
		if !match {
			allMatch = false
			failedRules = append(failedRules, fmt.Sprintf("%s(%s) %s %s",
				rule.Field,
				getFieldValue(event, rule.Field),
				rule.MatchType,
				rule.Value,
			))
			// 关键修复: 仅白名单模式在第一个不匹配时即失败；
			// 黑名单模式下需要继续检查其它规则是否命中，以决定是否过滤。
			if f.config.Mode == models.FilterModeWhitelist {
				break
			}
		} else if f.config.Mode == models.FilterModeBlacklist {
			// 黑名单模式: 任一规则命中即过滤，无需继续。
			allMatch = true
			break
		}
	}

	switch f.config.Mode {
	case models.FilterModeWhitelist:
		if !allMatch && f.logger != nil {
			f.logger.Infow("事件未通过白名单过滤",
				"failed_rules", failedRules,
				"mode", "whitelist",
				"event_type", getEventType(event),
			)
		}
		return allMatch
	case models.FilterModeBlacklist:
		if allMatch && f.logger != nil {
			f.logger.Infow("事件被黑名单过滤",
				"matched_rules", getMatchedRulesSummary(f.config.Rules, event),
				"mode", "blacklist",
				"event_type", getEventType(event),
			)
		}
		return !allMatch
	default:
		return true
	}
}

// toString 将 interface{} 值转为字符串（正确处理 JSON 解析后的数字类型）
func toString(val interface{}) string {
	switch v := val.(type) {
	case string:
		return v
	case float64:
		if math.Floor(v) == v && !math.IsInf(v, 0) {
			return strconv.FormatInt(int64(v), 10)
		}
		return strconv.FormatFloat(v, 'f', -1, 64)
	case int:
		return strconv.Itoa(v)
	case int64:
		return strconv.FormatInt(v, 10)
	case bool:
		return fmt.Sprintf("%v", v)
	default:
		return fmt.Sprintf("%v", v)
	}
}

// matchRule 匹配单个规则
func (f *EventFilter) matchRule(rule models.EventFilterRule, event map[string]interface{}) bool {
	var fieldValue string
	if val, ok := event[rule.Field]; ok && val != nil {
		fieldValue = toString(val)
	} else {
		return false
	}

	switch rule.MatchType {
	case models.FilterMatchExact:
		return fieldValue == rule.Value
	case models.FilterMatchContain:
		return strings.Contains(fieldValue, rule.Value)
	case models.FilterMatchRegex:
		matched, err := regexp.MatchString(rule.Value, fieldValue)
		if err != nil {
			if f.logger != nil {
				f.logger.Warnw("正则匹配失败", "pattern", rule.Value, "error", err)
			}
			return false
		}
		return matched
	default:
		return fieldValue == rule.Value
	}
}

// GetMode 获取过滤器模式
func (f *EventFilter) GetMode() string {
	if f == nil {
		return "none"
	}
	switch f.config.Mode {
	case models.FilterModeWhitelist:
		return "whitelist"
	case models.FilterModeBlacklist:
		return "blacklist"
	default:
		return "unknown"
	}
}

// GetRulesSummary 获取规则摘要
func (f *EventFilter) GetRulesSummary() string {
	if f == nil || len(f.config.Rules) == 0 {
		return "no rules"
	}

	var builder strings.Builder
	for i, rule := range f.config.Rules {
		if !rule.IsEnabled {
			continue
		}
		if i > 0 {
			builder.WriteString("; ")
		}
		builder.WriteString(fmt.Sprintf("%s %s %s", rule.Field, rule.MatchType, rule.Value))
	}
	return builder.String()
}

// getEventType 从事件map中获取事件类型
func getEventType(event map[string]interface{}) string {
	if event == nil {
		return "unknown"
	}
	if postType, ok := event["post_type"]; ok {
		return fmt.Sprintf("%v", postType)
	}
	return "unknown"
}

// getFieldValue 获取事件字段值
func getFieldValue(event map[string]interface{}, field string) string {
	if val, ok := event[field]; ok && val != nil {
		return toString(val)
	}
	return "(not found)"
}

// getMatchedRulesSummary 获取匹配的规则摘要(用于黑名单日志)
func getMatchedRulesSummary(rules []models.EventFilterRule, event map[string]interface{}) string {
	var matched []string
	for _, rule := range rules {
		if !rule.IsEnabled {
			continue
		}
		f := &EventFilter{}
		if f.matchRule(rule, event) {
			matched = append(matched, fmt.Sprintf("%s(%s)", rule.Field, getFieldValue(event, rule.Field)))
		}
	}
	if len(matched) == 0 {
		return "none"
	}
	return strings.Join(matched, ", ")
}

// IsHeartbeatEvent 判断事件是否为心跳事件（心跳不允许被过滤）
func IsHeartbeatEvent(rawData []byte) bool {
	var event map[string]interface{}
	if err := json.Unmarshal(rawData, &event); err != nil {
		return false
	}

	postType, ok := event["post_type"]
	if !ok || postType != "meta_event" {
		return false
	}

	subType, ok := event["sub_type"]
	return ok && subType == "heartbeat"
}
