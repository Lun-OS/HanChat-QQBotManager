# 自动回复插件

这是一个简单的Lua插件示例，演示如何开发HanChat-QQBotManager的Lua插件。

## 功能

- 当收到特定触发词时自动回复
- 支持私聊和群聊
- 可配置触发词和回复内容

## 配置

在插件管理界面中，可以配置以下参数：

```json
{
  "trigger_word": "你好",
  "reply_text": "你好！"
}
```

### 配置说明

- `trigger_word`: 触发词，当消息包含此词时触发回复
- `reply_text`: 回复内容

## 使用方法

1. 在插件管理界面添加插件配置：
   - 名称: `auto_reply`
   - 语言: `lua`
   - 入口文件: `main.lua`
   - 启用: `true`
   - 配置JSON: 如上所示

2. 加载插件

3. 发送包含触发词的消息，插件会自动回复

## 开发说明

插件使用Lua 5.1语法，可以通过以下API：

- `log.info()`, `log.warn()`, `log.error()`, `log.debug()` - 日志输出
- `config.get(key, default)` - 获取配置
- `message.send_group(group_id, message)` - 发送群消息
- `message.send_private(user_id, message)` - 发送私聊消息
- `on_message(function(event) ... end)` - 注册消息事件处理器

更多API请参考插件系统文档。

