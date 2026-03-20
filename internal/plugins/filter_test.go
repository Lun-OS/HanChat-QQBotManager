package plugins

import (
	"testing"
)

func TestShouldProcessEvent(t *testing.T) {
	m := &Manager{}

	t.Run("filter_nil", func(t *testing.T) {
		instance := &LuaPluginInstance{
			filter: nil,
		}
		eventData := map[string]interface{}{}

		if !m.shouldProcessEvent(instance, eventData) {
			t.Error("当过滤配置为nil时，应该处理所有事件")
		}
	})

	t.Run("whitelist_types_match", func(t *testing.T) {
		instance := &LuaPluginInstance{
			filter: &MessageFilterConfig{
				WhitelistTypes: []string{"message.private", "message.group"},
			},
		}
		eventData := map[string]interface{}{
			"post_type":    "message",
			"message_type": "private",
		}

		if !m.shouldProcessEvent(instance, eventData) {
			t.Error("message.private在白名单类型列表中，应该处理")
		}
	})

	t.Run("whitelist_types_no_match", func(t *testing.T) {
		instance := &LuaPluginInstance{
			filter: &MessageFilterConfig{
				WhitelistTypes: []string{"message.private"},
			},
		}
		eventData := map[string]interface{}{
			"post_type":    "message",
			"message_type": "group",
		}

		if m.shouldProcessEvent(instance, eventData) {
			t.Error("message.group不在白名单类型列表中，不应该处理")
		}
	})

	t.Run("blacklist_types_match", func(t *testing.T) {
		instance := &LuaPluginInstance{
			filter: &MessageFilterConfig{
				BlacklistTypes: []string{"notice.group"},
			},
		}
		eventData := map[string]interface{}{
			"post_type":   "notice",
			"notice_type": "group",
		}

		if m.shouldProcessEvent(instance, eventData) {
			t.Error("notice.group在黑名单类型列表中，不应该处理")
		}
	})

	t.Run("blacklist_types_no_match", func(t *testing.T) {
		instance := &LuaPluginInstance{
			filter: &MessageFilterConfig{
				BlacklistTypes: []string{"notice.group"},
			},
		}
		eventData := map[string]interface{}{
			"post_type":    "message",
			"message_type": "private",
		}

		if !m.shouldProcessEvent(instance, eventData) {
			t.Error("message.private不在黑名单类型列表中，应该处理")
		}
	})

	t.Run("whitelist_sub_type", func(t *testing.T) {
		instance := &LuaPluginInstance{
			filter: &MessageFilterConfig{
				WhitelistTypes: []string{"sub.friend"},
			},
		}
		eventData := map[string]interface{}{
			"post_type":    "message",
			"message_type": "private",
			"sub_type":     "friend",
		}

		if !m.shouldProcessEvent(instance, eventData) {
			t.Error("sub.friend在白名单类型列表中，应该处理")
		}
	})

	t.Run("blacklist_sub_type", func(t *testing.T) {
		instance := &LuaPluginInstance{
			filter: &MessageFilterConfig{
				BlacklistTypes: []string{"sub.group"},
			},
		}
		eventData := map[string]interface{}{
			"post_type":    "message",
			"message_type": "group",
			"sub_type":     "normal",
		}

		if !m.shouldProcessEvent(instance, eventData) {
			t.Error("sub.group不在黑名单类型列表中，应该处理")
		}
	})

	t.Run("whitelist_cq_type", func(t *testing.T) {
		instance := &LuaPluginInstance{
			filter: &MessageFilterConfig{
				WhitelistTypes: []string{"cq.text"},
			},
		}
		eventData := map[string]interface{}{
			"post_type": "message",
			"message": []interface{}{
				map[string]interface{}{
					"type": "text",
					"data": map[string]interface{}{
						"text": "测试消息",
					},
				},
			},
		}

		if !m.shouldProcessEvent(instance, eventData) {
			t.Error("cq.text在白名单类型列表中，应该处理")
		}
	})

	t.Run("blacklist_cq_type", func(t *testing.T) {
		instance := &LuaPluginInstance{
			filter: &MessageFilterConfig{
				BlacklistTypes: []string{"cq.image"},
			},
		}
		eventData := map[string]interface{}{
			"post_type": "message",
			"message": []interface{}{
				map[string]interface{}{
					"type": "image",
					"data": map[string]interface{}{
						"file": "abc.jpg",
					},
				},
			},
		}

		if m.shouldProcessEvent(instance, eventData) {
			t.Error("cq.image在黑名单类型列表中，不应该处理")
		}
	})

	t.Run("whitelist_keyword_match", func(t *testing.T) {
		instance := &LuaPluginInstance{
			filter: &MessageFilterConfig{
				WhitelistKeywords: []string{"你好", "测试"},
			},
		}
		eventData := map[string]interface{}{
			"post_type":    "message",
			"message_type": "private",
			"raw_message":  "你好，世界",
		}

		if !m.shouldProcessEvent(instance, eventData) {
			t.Error("白名单关键词匹配，应该处理")
		}
	})

	t.Run("whitelist_keyword_no_match", func(t *testing.T) {
		instance := &LuaPluginInstance{
			filter: &MessageFilterConfig{
				WhitelistKeywords: []string{"你好", "测试"},
			},
		}
		eventData := map[string]interface{}{
			"post_type":    "message",
			"message_type": "private",
			"raw_message":  "今天天气不错",
		}

		if m.shouldProcessEvent(instance, eventData) {
			t.Error("白名单关键词不匹配，不应该处理")
		}
	})

	t.Run("blacklist_keyword_match", func(t *testing.T) {
		instance := &LuaPluginInstance{
			filter: &MessageFilterConfig{
				BlacklistKeywords: []string{"广告", "垃圾"},
			},
		}
		eventData := map[string]interface{}{
			"post_type":    "message",
			"message_type": "private",
			"raw_message":  "这是一个广告信息",
		}

		if m.shouldProcessEvent(instance, eventData) {
			t.Error("黑名单关键词匹配，不应该处理")
		}
	})

	t.Run("blacklist_keyword_no_match", func(t *testing.T) {
		instance := &LuaPluginInstance{
			filter: &MessageFilterConfig{
				BlacklistKeywords: []string{"广告", "垃圾"},
			},
		}
		eventData := map[string]interface{}{
			"post_type":    "message",
			"message_type": "private",
			"raw_message":  "今天天气不错",
		}

		if !m.shouldProcessEvent(instance, eventData) {
			t.Error("黑名单关键词不匹配，应该处理")
		}
	})

	t.Run("combined_whitelist", func(t *testing.T) {
		instance := &LuaPluginInstance{
			filter: &MessageFilterConfig{
				WhitelistTypes:    []string{"message.private"},
				WhitelistKeywords: []string{"测试"},
			},
		}
		eventData := map[string]interface{}{
			"post_type":    "message",
			"message_type": "private",
			"raw_message":  "这是一个测试消息",
		}

		if !m.shouldProcessEvent(instance, eventData) {
			t.Error("类型和关键词都在白名单，应该处理")
		}
	})

	t.Run("combined_whitelist_type_match_keyword_no_match", func(t *testing.T) {
		instance := &LuaPluginInstance{
			filter: &MessageFilterConfig{
				WhitelistTypes:    []string{"message.private"},
				WhitelistKeywords: []string{"测试"},
			},
		}
		eventData := map[string]interface{}{
			"post_type":    "message",
			"message_type": "private",
			"raw_message":  "这是一个普通消息",
		}

		if m.shouldProcessEvent(instance, eventData) {
			t.Error("类型匹配但关键词不匹配，不应该处理")
		}
	})

	t.Run("case_insensitive", func(t *testing.T) {
		instance := &LuaPluginInstance{
			filter: &MessageFilterConfig{
				WhitelistTypes: []string{"MESSAGE.PRIVATE"},
			},
		}
		eventData := map[string]interface{}{
			"post_type":    "message",
			"message_type": "private",
		}

		if !m.shouldProcessEvent(instance, eventData) {
			t.Error("大小写应该不敏感，应该处理")
		}
	})

	t.Run("category_match", func(t *testing.T) {
		instance := &LuaPluginInstance{
			filter: &MessageFilterConfig{
				WhitelistTypes: []string{"message"},
			},
		}
		eventData := map[string]interface{}{
			"post_type":    "message",
			"message_type": "private",
		}

		if !m.shouldProcessEvent(instance, eventData) {
			t.Error("message类别应该匹配message.private，应该处理")
		}
	})

	t.Run("parse_message_array_text", func(t *testing.T) {
		instance := &LuaPluginInstance{
			filter: &MessageFilterConfig{
				WhitelistKeywords: []string{"关键词"},
			},
		}
		eventData := map[string]interface{}{
			"message": []interface{}{
				map[string]interface{}{
					"type": "text",
					"data": map[string]interface{}{
						"text": "这是一个包含关键词的消息",
					},
				},
			},
		}

		if !m.shouldProcessEvent(instance, eventData) {
			t.Error("从message数组解析到关键词，应该处理")
		}
	})
}

func TestParseFilterConfig(t *testing.T) {
	m := &Manager{}

	t.Run("full_config", func(t *testing.T) {
		filterMap := map[string]interface{}{
			"whitelistTypes":    []interface{}{"message.private", "message.group"},
			"blacklistTypes":    []interface{}{"notice.group"},
			"whitelistKeywords": []interface{}{"你好", "测试"},
			"blacklistKeywords": []interface{}{"广告"},
		}

		config := m.parseFilterConfig(filterMap)

		if len(config.WhitelistTypes) != 2 {
			t.Errorf("WhitelistTypes长度应该为2，实际为%d", len(config.WhitelistTypes))
		}
		if len(config.BlacklistTypes) != 1 {
			t.Errorf("BlacklistTypes长度应该为1，实际为%d", len(config.BlacklistTypes))
		}
		if len(config.WhitelistKeywords) != 2 {
			t.Errorf("WhitelistKeywords长度应该为2，实际为%d", len(config.WhitelistKeywords))
		}
		if len(config.BlacklistKeywords) != 1 {
			t.Errorf("BlacklistKeywords长度应该为1，实际为%d", len(config.BlacklistKeywords))
		}
	})

	t.Run("empty_config", func(t *testing.T) {
		filterMap := map[string]interface{}{}

		config := m.parseFilterConfig(filterMap)

		if len(config.WhitelistTypes) != 0 {
			t.Errorf("WhitelistTypes长度应该为0，实际为%d", len(config.WhitelistTypes))
		}
		if len(config.BlacklistTypes) != 0 {
			t.Errorf("BlacklistTypes长度应该为0，实际为%d", len(config.BlacklistTypes))
		}
		if len(config.WhitelistKeywords) != 0 {
			t.Errorf("WhitelistKeywords长度应该为0，实际为%d", len(config.WhitelistKeywords))
		}
		if len(config.BlacklistKeywords) != 0 {
			t.Errorf("BlacklistKeywords长度应该为0，实际为%d", len(config.BlacklistKeywords))
		}
	})

	t.Run("partial_config", func(t *testing.T) {
		filterMap := map[string]interface{}{
			"whitelistTypes": []interface{}{"message.private"},
		}

		config := m.parseFilterConfig(filterMap)

		if len(config.WhitelistTypes) != 1 {
			t.Errorf("WhitelistTypes长度应该为1，实际为%d", len(config.WhitelistTypes))
		}
		if config.WhitelistTypes[0] != "message.private" {
			t.Errorf("WhitelistTypes[0]应该为message.private，实际为%s", config.WhitelistTypes[0])
		}
	})
}
