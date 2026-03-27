# 插件开发

本文档介绍如何开发 HanChat-QQBotManager 的 Lua 插件。

## 插件结构

一个标准的插件目录结构如下：

```
plugins/{QQ号}/
└── my_plugin/
    ├── main.lua          # 插件主文件（必需）
    ├── config.json       # 插件配置文件（可选）
    └── data.json         # 插件数据文件（自动创建）
```

## 插件基础

### 最小插件示例

```lua
plugin.name = "my_plugin"
plugin.version = "1.0.0"
plugin.description = "我的第一个插件"

function on_init()
    log.info("插件已启动")
end

function on_destroy()
    log.info("插件已停止")
end
```

### 插件信息字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `plugin.name` | string | 插件名称（唯一标识） |
| `plugin.version` | string | 插件版本号 |
| `plugin.description` | string | 插件描述 |
| `plugin.self_id` | number | 当前机器人 QQ 号（只读） |

## 事件处理

### 消息事件

```lua
on_message(function(event)
    local text = msg.get_plain_text(event)
    log.info("收到消息: " .. text)
    
    if msg.is_group_message(event) then
        local groupId = msg.get_group_id(event)
        message.send_group(groupId, "收到消息: " .. text)
    end
end)
```

### 通知事件

```lua
on_notice(function(event)
    log.info("收到通知: " .. event.notice_type)
end)
```

### 请求事件

```lua
on_request(function(event)
    if event.request_type == "friend" then
        friend.set_add_request(event.flag, true, "新好友")
    elseif event.request_type == "group" then
        group.set_add_request(event.flag, event.sub_type, true)
    end
end)
```

## 常用 API

### 日志 API

```lua
log.info("普通信息")
log.warn("警告信息")
log.error("错误信息")
log.debug("调试信息")
```

### 配置 API

```lua
-- 读取配置
local value = config.get("key", "default_value")
local allConfig = config.all()
```

### 消息 API

```lua
-- 发送群消息
message.send_group(groupId, "消息内容")

-- 发送私聊消息
message.send_private(userId, "消息内容")

-- 撤回消息
message.delete_msg(messageId)
```

### 群组 API

```lua
-- 获取群列表
local groups, err = group.get_list()

-- 设置禁言
group.set_ban(groupId, userId, 600)

-- 踢出群成员
group.kick(groupId, userId, false)
```

### 存储 API

```lua
-- 存储数据
storage.set("key", "value")
storage.set("count", 100)
storage.set("user", {name = "张三"})

-- 读取数据
local value = storage.get("key", "default")
local count = storage.get("count", 0)

-- 删除数据
storage.delete("key")
```

### HTTP 接口 API

```lua
local selfId = tostring(plugin.self_id)

-- 注册 HTTP 接口
http_interface.register("my_api", selfId, function(request)
    return {
        status = 200,
        headers = { ["Content-Type"] = "application/json" },
        body = '{"success": true}'
    }
end, {"GET", "POST"})
```

### 网络请求 API

```lua
-- GET 请求
local result = http.get("https://api.example.com/data")
if result and result.status == 200 then
    log.info("响应: " .. result.body)
end

-- POST 请求
local result = http.post(
    "https://api.example.com/submit",
    '{"key": "value"}',
    { ["Content-Type"] = "application/json" }
)
```

## 完整示例

### 关键词回复插件

```lua
plugin.name = "keyword_reply"
plugin.version = "1.0.0"
plugin.description = "关键词自动回复"

local replyText = config.get("reply_text", "你好！")
local triggerWord = config.get("trigger_word", "你好")

function on_init()
    log.info("关键词回复插件已启动")
end

on_message(function(event)
    if msg.contains_keyword(event, triggerWord) then
        local msgType = msg.get_type(event)
        
        if msgType == "group" then
            local groupId = msg.get_group_id(event)
            message.send_group(groupId, replyText)
        elseif msgType == "private" then
            local userId = msg.get_sender_id(event)
            message.send_private(userId, replyText)
        end
    end
end)
```

更多详细的 API 文档请参考 [插件开发手册](../plugins/template/插件开发手册.md)。
