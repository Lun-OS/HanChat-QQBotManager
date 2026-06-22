# QQBot Lua插件系统文档
## 目录
1. 系统概述
2. 插件基础结构
3. 快速导入（注释式一键创建）
4. 全局变量和对象
5. API接口详解
6. 事件系统
7. 完整示例
8. 最佳实践
## 系统概述
QQBot Lua插件系统是一个基于沙箱环境的安全脚本执行系统，允许开发者使用Lua语言编写自定义功能来扩展QQ机器人的能力。

### 核心特性
- 沙箱安全 : 插件运行在受限环境中，无法访问危险的系统资源
- 多账号支持 : 每个QQ账号拥有独立的插件容器，插件实例完全隔离
- 事件驱动 : 基于消息、通知、请求等事件的响应机制
- 丰富API : 提供消息发送、群管理、文件操作、网络请求等多种API
- 定时任务 : 支持间隔、每日、每周、每月等多种定时任务
- 插件间通信 : 支持插件间的RPC调用和数据交换
### 插件目录结构
```
plugins/
├── {self_id}/              # QQ
账号ID目录
│   ├── {plugin_name}/      # 插
件目录
│   │   ├── main.lua        # 插
件入口文件（必需）
│   │   └── config.json     # 插
件配置文件（可选）
│   └── ...
└── blockly/                # 
Blockly可视化编辑器项目目录
```
## 插件基础结构
### 最小插件示例
```
-- 插件基本信息
plugin.name = "my_plugin"
plugin.version = "1.0.0"
plugin.description = "我的第一个
插件"

-- 初始化函数（可选）
function on_init()
    log.info("插件已启动")
end

-- 消息事件处理器
on_message(function(event)
    -- 处理消息逻辑
end)

-- 清理函数（可选）
function on_destroy()
    log.info("插件已停止")
end
```
### 插件生命周期
1. 加载阶段 : 系统读取main.lua，注册API，执行全局代码
2. 初始化阶段 : 调用 on_init() 函数（异步执行，不阻塞加载）
3. 运行阶段 : 插件接收并处理各种事件
4. 卸载阶段 : 调用 on_destroy() 函数，清理资源
## 快速导入（注释式一键创建）
### 概述
在 Web 管理后台的「插件管理 → 高级模式」中，工具栏提供了一个 ⚡ **快速导入** 按钮。它允许只粘贴一段 Lua 代码即自动生成完整的插件目录结构（main.lua、config.json 等），无需在界面上反复点击新建文件。
### 指令格式
在 Lua 代码**头部**使用单行注释（`--`）标注插件元信息和附加文件。所有指令必须出现在第一个非注释代码行之前。

| 指令 | 必填 | 说明 |
| --- | --- | --- |
| `-- @plugin: <name>` | 是 | 插件名称（同时作为插件目录名） |
| `-- @file <filename>` | 否 | 声明一个附加文件，后续以 `--` 开头的行作为文件内容 |
| `-- @end` | 否 | 显式结束头部；之后的内容作为 `main.lua` |

**注意**：
- 头部之后的代码（`@end` 之后或第一个非注释行起）会被写入 `main.lua`。
- 如果省略 `@end`，第一个非空非注释行即为 `main.lua` 起点。
- `@file` 块内每行必须以 `--` 开头，导入时自动去除前缀。
- 可声明任意数量的 `@file` 块（config.json、readme.md、data/*.lua 等）。
- 插件名不能与已存在的插件目录冲突，否则导入失败。
### 完整示例
```lua
-- @plugin: hello-world
-- @file config.json
-- {
--   "enabled": true,
--   "version": "1.0.0",
--   "command": "ping"
-- }
-- @file readme.md
-- # Hello World 插件
--
-- 一个简单的 ping/pong 示例插件
-- @end

plugin.name = "hello-world"
plugin.version = "1.0.0"
plugin.description = "示例插件：回复 ping"

function on_init()
    log.info("hello-world 插件已加载")
end

on_message(function(event)
    local text = msg.get_plain_text(event)
    if text == "ping" then
        if msg.is_group_message(event) then
            message.reply_group(event.group_id, event.message_id, "pong")
        else
            message.reply_private(event.user_id, event.message_id, "pong")
        end
    end
end)

function on_destroy()
    log.info("hello-world 插件已卸载")
end
```

点击「⚡ 快速导入」后会在右侧面板的目标账号插件目录下生成：

```
plugins/<self_id>/
└── hello-world/
    ├── main.lua        # 上例中 @end 之后的内容
    ├── config.json     # 来自 @file config.json 块
    └── readme.md       # 来自 @file readme.md 块
```
### 解析规则
1. 从第 1 行开始扫描注释行。
2. 遇到 `-- @plugin: 名称` 记录插件名。
3. 遇到 `-- @file 文件名` 开启一个文件收集器；其后的每一行注释行（去掉 `-- ` 前缀）追加到该文件内容。
4. 遇到 `-- @end` 或第一个非空非注释行，头部结束，余下内容写入 `main.lua`。
5. 头部内的非指令注释行（不在 `@file` 块内）会被忽略。
### 常见错误
- **未指定插件名**：会提示「未检测到插件名称，请使用 -- @plugin: 名称 标注」。
- **同名插件已存在**：与现有插件目录冲突，需先删除或改名。
- **附加文件创建失败**：会在右下角弹出警告，但已创建的文件会保留。

## 全局变量和对象
### plugin - 当前插件信息
```
plugin.name         -- 插件名称
（字符串）
plugin.self_id      -- 绑定的QQ账
号ID（字符串）
plugin.reload()     -- 重新加载当
前插件
plugin.stop()       -- 停止当前插
件
plugin.unload_self() -- 卸载当前
插件
```
### PLUGIN_DIR - 插件工作目录
```
-- 插件专属的工作目录路径
-- 例如: plugins/123456789/
my_plugin/
local pluginDir = PLUGIN_DIR
```
## API接口详解

以下文档详细列出了所有Lua API的函数签名、参数类型、返回值类型及使用示例。其中 `[param]` 表示可选参数，`string|number` 表示支持多种类型。

### 1. 日志API (log)

记录插件运行日志，支持字符串、数字、表等任意类型，表会自动转为JSON。

#### `log.info`

**签名**: `log.info(message: any) -> void`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| message | any | 是 | 日志内容，支持任意类型，表自动转JSON |

**返回**: 无返回值

**示例**:
```lua
log.info("插件已启动")
log.info({status = "ok", count = 10})
```

#### `log.warn`

**签名**: `log.warn(message: any) -> void`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| message | any | 是 | 警告信息 |

**返回**: 无返回值

**示例**:
```lua
log.warn("配置项缺失")
```

#### `log.error`

**签名**: `log.error(message: any) -> void`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| message | any | 是 | 错误信息 |

**返回**: 无返回值

**示例**:
```lua
log.error("连接失败")
```

#### `log.debug`

**签名**: `log.debug(message: any) -> void`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| message | any | 是 | 调试信息 |

**返回**: 无返回值

**示例**:
```lua
log.debug("调试信息")
```

### 2. 配置API (config)

读取插件的 config.json 配置文件。

#### `config.get`

**签名**: `config.get(key: string, [default: any]) -> any`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| key | string | 是 | 配置项键名 |
| default | any | 否 | 不存在时的默认值，默认空字符串 |

**返回**: any - 配置值或默认值

**示例**:
```lua
local v = config.get("prefix", "!")
```

#### `config.all`

**签名**: `config.all() -> table`

**返回**: table - 所有配置项

**示例**:
```lua
local cfg = config.all()
```

### 3. 消息API (message)

发送、回复、撤回消息，获取消息详情及多媒体信息。

#### `message.send_group`

**签名**: `message.send_group(group_id: number, message: string|table) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 目标群号 |
| message | string|table | 是 | 消息内容，支持文本或消息段数组 |

**返回**: table - {success: boolean, message_id: string|nil, error: string|nil}

**示例**:
```lua
local ok, res = message.send_group(123456789, "大家好")
```

#### `message.send_private`

**签名**: `message.send_private(user_id: number, message: string|table) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| user_id | number | 是 | 目标用户QQ号 |
| message | string|table | 是 | 消息内容 |

**返回**: table - {success: boolean, message_id: string|nil, error: string|nil}

**示例**:
```lua
local ok, res = message.send_private(987654321, "你好")
```

#### `message.reply_group`

**签名**: `message.reply_group(group_id: number, [message_id: number|string], message: string|table) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |
| message_id | number|string | 否 | 引用消息ID |
| message | string|table | 是 | 回复内容 |

**返回**: table - 发送结果

**示例**:
```lua
message.reply_group(event.group_id, event.message_id, "收到")
```

#### `message.reply_private`

**签名**: `message.reply_private(user_id: number, [message_id: number|string], message: string|table) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| user_id | number | 是 | 用户QQ号 |
| message_id | number|string | 否 | 引用消息ID |
| message | string|table | 是 | 回复内容 |

**返回**: table - 发送结果

**示例**:
```lua
message.reply_private(event.user_id, event.message_id, "收到")
```

#### `message.send_group_image`

**签名**: `message.send_group_image(group_id: number, image_data: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |
| image_data | string | 是 | 图片Base64编码（不含data:image前缀） |

**返回**: table - 发送结果

**示例**:
```lua
message.send_group_image(123456789, base64_str)
```

#### `message.send_private_image`

**签名**: `message.send_private_image(user_id: number, image_data: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| user_id | number | 是 | 用户QQ号 |
| image_data | string | 是 | 图片Base64编码 |

**返回**: table - 发送结果

**示例**:
```lua
message.send_private_image(987654321, base64_str)
```

#### `message.delete_msg`

**签名**: `message.delete_msg(message_id: number|string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| message_id | number|string | 是 | 要撤回的消息ID |

**返回**: table - 操作结果

**示例**:
```lua
message.delete_msg(event.message_id)
```

#### `message.get_msg`

**签名**: `message.get_msg(message_id: number|string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| message_id | number|string | 是 | 消息ID |

**返回**: table - 消息详情

**示例**:
```lua
local info = message.get_msg("12345")
```

#### `message.get_forward_msg`

**签名**: `message.get_forward_msg(message_id: number|string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| message_id | number|string | 是 | 合并转发消息ID |

**返回**: table - 合并转发内容

**示例**:
```lua
local fwd = message.get_forward_msg("12345")
```

#### `message.mark_msg_as_read`

**签名**: `message.mark_msg_as_read(message_id: number) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| message_id | number | 是 | 消息ID |

**返回**: table - 操作结果

**示例**:
```lua
message.mark_msg_as_read(12345)
```

#### `message.set_essence`

**签名**: `message.set_essence(message_id: number) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| message_id | number | 是 | 消息ID |

**返回**: table - 操作结果

**示例**:
```lua
message.set_essence(12345)
```

#### `message.delete_essence_msg`

**签名**: `message.delete_essence_msg(message_id: number) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| message_id | number | 是 | 消息ID |

**返回**: table - 操作结果

**示例**:
```lua
message.delete_essence_msg(12345)
```

#### `message.get_essence_list`

**签名**: `message.get_essence_list(group_id: number) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |

**返回**: table - 精华消息列表

**示例**:
```lua
local list = message.get_essence_list(123456789)
```

#### `message.get_image`

**签名**: `message.get_image(file: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| file | string | 是 | 图片文件名或缓存标识 |

**返回**: table - 图片信息

**示例**:
```lua
local img = message.get_image("abc.jpg")
```

#### `message.get_msg_image`

**签名**: `message.get_msg_image(message_id: number|string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| message_id | number|string | 是 | 消息ID |

**返回**: table - 消息中的图片信息

**示例**:
```lua
local img = message.get_msg_image(event.message_id)
```

#### `message.get_file`

**签名**: `message.get_file(file_id: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| file_id | string | 是 | 文件ID |

**返回**: table - 文件信息

**示例**:
```lua
local f = message.get_file("file_id")
```

#### `message.get_video`

**签名**: `message.get_video(file: string, [out_format: string]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| file | string | 是 | 视频文件名 |
| out_format | string | 否 | 输出格式 |

**返回**: table - 视频信息

**示例**:
```lua
local v = message.get_video("video.mp4")
```

#### `message.get_record`

**签名**: `message.get_record(file: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| file | string | 是 | 语音文件名 |

**返回**: table - 语音信息

**示例**:
```lua
local r = message.get_record("record.amr")
```

#### `message.voice_to_text`

**签名**: `message.voice_to_text(message_id: number) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| message_id | number | 是 | 包含语音的消息ID |

**返回**: table - 语音识别结果

**示例**:
```lua
local text = message.voice_to_text(event.message_id)
```

#### `message.ocr_image`

**签名**: `message.ocr_image(image: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| image | string | 是 | 图片文件名或URL |

**返回**: table - OCR识别结果

**示例**:
```lua
local ocr = message.ocr_image("img.png")
```

#### `message.scan_qrcode`

**签名**: `message.scan_qrcode(image: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| image | string | 是 | 图片文件名 |

**返回**: table - 二维码扫描结果

**示例**:
```lua
local qr = message.scan_qrcode("qrcode.png")
```

#### `message.image_has_qrcode`

**签名**: `message.image_has_qrcode(image: string) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| image | string | 是 | 图片文件名 |

**返回**: boolean - 是否包含二维码

**示例**:
```lua
local has = message.image_has_qrcode("img.png")
```

#### `message.image_count_qrcodes`

**签名**: `message.image_count_qrcodes(image: string) -> number`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| image | string | 是 | 图片文件名 |

**返回**: number - 二维码数量

**示例**:
```lua
local count = message.image_count_qrcodes("img.png")
```

#### `message.image_get_qrcodes`

**签名**: `message.image_get_qrcodes(image: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| image | string | 是 | 图片文件名 |

**返回**: table - 二维码内容列表

**示例**:
```lua
local codes = message.image_get_qrcodes("img.png")
```

#### `message.send_group_forward`

**签名**: `message.send_group_forward(group_id: number, messages: table) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |
| messages | table | 是 | 合并转发消息段数组 |

**返回**: table - 发送结果

**示例**:
```lua
message.send_group_forward(123456789, msgs)
```

#### `message.send_private_forward`

**签名**: `message.send_private_forward(user_id: number, messages: table) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| user_id | number | 是 | 用户QQ号 |
| messages | table | 是 | 合并转发消息段数组 |

**返回**: table - 发送结果

**示例**:
```lua
message.send_private_forward(987654321, msgs)
```

#### `message.forward_group_single_msg`

**签名**: `message.forward_group_single_msg(message_id: number, group_id: number) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| message_id | number | 是 | 消息ID |
| group_id | number | 是 | 目标群号 |

**返回**: table - 转发结果

**示例**:
```lua
message.forward_group_single_msg(123, 456)
```

#### `message.forward_friend_single_msg`

**签名**: `message.forward_friend_single_msg(message_id: number, user_id: number) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| message_id | number | 是 | 消息ID |
| user_id | number | 是 | 目标用户QQ号 |

**返回**: table - 转发结果

**示例**:
```lua
message.forward_friend_single_msg(123, 456)
```

#### `message.get_group_msg_history`

**签名**: `message.get_group_msg_history(group_id: number, [message_seq: string], [count: number]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |
| message_seq | string | 否 | 起始消息序列号 |
| count | number | 否 | 获取数量，默认20 |

**返回**: table - 消息历史列表

**示例**:
```lua
local hist = message.get_group_msg_history(123456789, nil, 50)
```

#### `message.get_friend_msg_history`

**签名**: `message.get_friend_msg_history(user_id: number, [message_seq: string], [count: number]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| user_id | number | 是 | 用户QQ号 |
| message_seq | string | 否 | 起始消息序列号 |
| count | number | 否 | 获取数量，默认20 |

**返回**: table - 消息历史列表

**示例**:
```lua
local hist = message.get_friend_msg_history(987654321, nil, 50)
```

#### `message.set_msg_emoji_like`

**签名**: `message.set_msg_emoji_like(message_id: number, emoji_id: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| message_id | number | 是 | 消息ID |
| emoji_id | string | 是 | 表情ID |

**返回**: table - 操作结果

**示例**:
```lua
message.set_msg_emoji_like(12345, "76")
```

#### `message.unset_msg_emoji_like`

**签名**: `message.unset_msg_emoji_like(message_id: number, emoji_id: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| message_id | number | 是 | 消息ID |
| emoji_id | string | 是 | 表情ID |

**返回**: table - 操作结果

**示例**:
```lua
message.unset_msg_emoji_like(12345, "76")
```

#### `message.check_url_safely`

**签名**: `message.check_url_safely(url: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| url | string | 是 | 要检查的URL |

**返回**: table - URL安全检查结果

**示例**:
```lua
local r = message.check_url_safely("https://example.com")
```

#### `message.send_like`

**签名**: `message.send_like(user_id: number, [times: number]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| user_id | number | 是 | 用户QQ号 |
| times | number | 否 | 点赞次数，默认1 |

**返回**: table - 操作结果

**示例**:
```lua
message.send_like(987654321, 10)
```

#### `message.send_poke`

**签名**: `message.send_poke(group_id: number, user_id: number) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |
| user_id | number | 是 | 用户QQ号 |

**返回**: table - 操作结果

**示例**:
```lua
message.send_poke(event.group_id, event.user_id)
```

#### `message.send_group_ai_record`

**签名**: `message.send_group_ai_record(group_id: number, character_id: string, text: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |
| character_id | string | 是 | AI语音角色ID |
| text | string | 是 | 要转换的文本 |

**返回**: table - 发送结果

**示例**:
```lua
message.send_group_ai_record(123456789, "角色ID", "你好")
```

#### `message.get_ai_characters`

**签名**: `message.get_ai_characters() -> table`

**返回**: table - AI语音角色列表

**示例**:
```lua
local chars = message.get_ai_characters()
```

#### `message.create_image_processor`

**签名**: `message.create_image_processor(image_data: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| image_data | string | 是 | Base64编码的图片数据 |

**返回**: table - 图像处理器对象

**示例**:
```lua
local proc = message.create_image_processor(base64_data)
```

### 4. 用户API (user)

获取用户信息、管理好友关系。

#### `user.get_info`

**签名**: `user.get_info(user_id: number) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| user_id | number | 是 | 用户QQ号 |

**返回**: table - 用户信息

**示例**:
```lua
local info = user.get_info(987654321)
```

#### `user.get_friends`

**签名**: `user.get_friends() -> table`

**返回**: table - 好友列表

**示例**:
```lua
local friends = user.get_friends()
```

#### `user.get_friend_list`

**签名**: `user.get_friend_list() -> table`

**返回**: table - 好友列表（get_friends别名）

**示例**:
```lua
local friends = user.get_friend_list()
```

#### `user.set_remark`

**签名**: `user.set_remark(user_id: number, remark: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| user_id | number | 是 | 用户QQ号 |
| remark | string | 是 | 备注名 |

**返回**: table - 操作结果

**示例**:
```lua
user.set_remark(987654321, "备注")
```

#### `user.poke`

**签名**: `user.poke(user_id: number) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| user_id | number | 是 | 用户QQ号 |

**返回**: table - 操作结果

**示例**:
```lua
user.poke(987654321)
```

#### `user.send_like`

**签名**: `user.send_like(user_id: number, [times: number]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| user_id | number | 是 | 用户QQ号 |
| times | number | 否 | 点赞次数，默认1 |

**返回**: table - 操作结果

**示例**:
```lua
user.send_like(987654321, 10)
```

#### `user.delete_friend`

**签名**: `user.delete_friend(user_id: number) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| user_id | number | 是 | 用户QQ号 |

**返回**: table - 操作结果

**示例**:
```lua
user.delete_friend(987654321)
```

#### `user.get_friend_info`

**签名**: `user.get_friend_info(user_id: number) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| user_id | number | 是 | 用户QQ号 |

**返回**: table - 好友详细信息

**示例**:
```lua
local info = user.get_friend_info(987654321)
```

#### `user.get_stranger_info`

**签名**: `user.get_stranger_info(user_id: number, [no_cache: boolean]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| user_id | number | 是 | 用户QQ号 |
| no_cache | boolean | 否 | 是否不使用缓存 |

**返回**: table - 陌生人信息

**示例**:
```lua
local info = user.get_stranger_info(987654321)
```

#### `user.upload_file`

**签名**: `user.upload_file(user_id: number, file: string, [name: string]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| user_id | number | 是 | 用户QQ号 |
| file | string | 是 | 本地文件路径（相对插件目录） |
| name | string | 否 | 发送时显示的文件名 |

**返回**: table - 发送结果

**示例**:
```lua
user.upload_file(987654321, "data.txt", "文件.txt")
```

#### `user.set_qq_profile`

**签名**: `user.set_qq_profile(nickname: string, company: string, email: string, college: string, personal_note: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| nickname | string | 是 | 昵称 |
| company | string | 是 | 公司 |
| email | string | 是 | 邮箱 |
| college | string | 是 | 学校 |
| personal_note | string | 是 | 个人说明 |

**返回**: table - 操作结果

**示例**:
```lua
user.set_qq_profile("昵称", "", "", "", "")
```

### 5. 群组API (group)

群管理、群成员管理、群文件操作。

#### `group.get_list`

**签名**: `group.get_list() -> table`

**返回**: table - 群列表

**示例**:
```lua
local groups = group.get_list()
```

#### `group.get_info`

**签名**: `group.get_info(group_id: number, [no_cache: boolean]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |
| no_cache | boolean | 否 | 是否不使用缓存 |

**返回**: table - 群信息

**示例**:
```lua
local info = group.get_info(123456789)
```

#### `group.get_members`

**签名**: `group.get_members(group_id: number) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |

**返回**: table - 群成员列表

**示例**:
```lua
local members = group.get_members(123456789)
```

#### `group.get_member_info`

**签名**: `group.get_member_info(group_id: number, user_id: number, [no_cache: boolean]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |
| user_id | number | 是 | 用户QQ号 |
| no_cache | boolean | 否 | 是否不使用缓存 |

**返回**: table - 群成员信息

**示例**:
```lua
local info = group.get_member_info(123456789, 987654321)
```

#### `group.set_ban`

**签名**: `group.set_ban(group_id: number, user_id: number, duration: number) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |
| user_id | number | 是 | 用户QQ号 |
| duration | number | 是 | 禁言时长（秒），0为解除 |

**返回**: table - 操作结果

**示例**:
```lua
group.set_ban(123456789, 987654321, 600)
```

#### `group.set_whole_ban`

**签名**: `group.set_whole_ban(group_id: number, enable: boolean) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |
| enable | boolean | 是 | true开启/false关闭 |

**返回**: table - 操作结果

**示例**:
```lua
group.set_whole_ban(123456789, true)
```

#### `group.set_admin`

**签名**: `group.set_admin(group_id: number, user_id: number, enable: boolean) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |
| user_id | number | 是 | 用户QQ号 |
| enable | boolean | 是 | true设为管理员/false取消 |

**返回**: table - 操作结果

**示例**:
```lua
group.set_admin(123456789, 987654321, true)
```

#### `group.set_card`

**签名**: `group.set_card(group_id: number, user_id: number, [card: string]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |
| user_id | number | 是 | 用户QQ号 |
| card | string | 否 | 群名片内容，空字符串表示清空 |

**返回**: table - 操作结果

**示例**:
```lua
group.set_card(123456789, 987654321, "名片")
```

#### `group.kick`

**签名**: `group.kick(group_id: number, user_id: number, [reject_add_request: boolean]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |
| user_id | number | 是 | 用户QQ号 |
| reject_add_request | boolean | 否 | true拒绝再次申请 |

**返回**: table - 操作结果

**示例**:
```lua
group.kick(123456789, 987654321, false)
```

#### `group.poke`

**签名**: `group.poke(group_id: number, user_id: number) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |
| user_id | number | 是 | 用户QQ号 |

**返回**: table - 操作结果

**示例**:
```lua
group.poke(123456789, 987654321)
```

#### `group.set_name`

**签名**: `group.set_name(group_id: number, name: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |
| name | string | 是 | 新群名 |

**返回**: table - 操作结果

**示例**:
```lua
group.set_name(123456789, "新群名")
```

#### `group.set_special_title`

**签名**: `group.set_special_title(group_id: number, user_id: number, title: string, [duration: number]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |
| user_id | number | 是 | 用户QQ号 |
| title | string | 是 | 专属头衔 |
| duration | number | 否 | 有效期（秒），默认-1永久 |

**返回**: table - 操作结果

**示例**:
```lua
group.set_special_title(123456789, 987654321, "头衔", -1)
```

#### `group.set_leave`

**签名**: `group.set_leave(group_id: number, [is_dismiss: boolean]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |
| is_dismiss | boolean | 否 | true解散群（需权限） |

**返回**: table - 操作结果

**示例**:
```lua
group.set_leave(123456789, false)
```

#### `group.get_file_url`

**签名**: `group.get_file_url(group_id: number, file_id: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |
| file_id | string | 是 | 文件ID |

**返回**: table - 文件下载URL等信息

**示例**:
```lua
local url = group.get_file_url(123456789, "file_id")
```

#### `group.get_file_system_info`

**签名**: `group.get_file_system_info(group_id: number) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |

**返回**: table - 群文件系统信息

**示例**:
```lua
local info = group.get_file_system_info(123456789)
```

#### `group.get_root_files`

**签名**: `group.get_root_files(group_id: number) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |

**返回**: table - 根目录文件列表

**示例**:
```lua
local files = group.get_root_files(123456789)
```

#### `group.get_files_by_folder`

**签名**: `group.get_files_by_folder(group_id: number, folder_id: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |
| folder_id | string | 是 | 文件夹ID |

**返回**: table - 文件夹内文件列表

**示例**:
```lua
local files = group.get_files_by_folder(123456789, "folder_id")
```

#### `group.upload_file`

**签名**: `group.upload_file(group_id: number, file: string, [name: string], [folder_id: string]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |
| file | string | 是 | 本地文件路径（相对插件目录） |
| name | string | 否 | 发送时显示的文件名 |
| folder_id | string | 否 | 目标文件夹ID |

**返回**: table - 发送结果

**示例**:
```lua
group.upload_file(123456789, "data.txt", "文件.txt", "folder_id")
```

#### `group.get_honor_info`

**签名**: `group.get_honor_info(group_id: number, type: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |
| type | string | 是 | 荣誉类型: talkative/actor/emotion |

**返回**: table - 荣誉信息

**示例**:
```lua
local honor = group.get_honor_info(123456789, "talkative")
```

### 6. 存储API (storage)

插件级持久化键值存储，数据保存在插件目录下，重启后保留。

#### `storage.set`

**签名**: `storage.set(key: string, [value: any]) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| key | string | 是 | 存储键名 |
| value | any | 否 | 存储值，支持任意可序列化类型 |

**返回**: boolean - 是否存储成功

**示例**:
```lua
storage.set("count", 10)
storage.set("data", {a=1, b=2})
```

#### `storage.get`

**签名**: `storage.get(key: string, [default: any]) -> any`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| key | string | 是 | 存储键名 |
| default | any | 否 | 不存在时的默认值 |

**返回**: any - 存储的值或默认值

**示例**:
```lua
local count = storage.get("count", 0)
```

#### `storage.delete`

**签名**: `storage.delete(key: string) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| key | string | 是 | 要删除的键名 |

**返回**: boolean - 是否删除成功

**示例**:
```lua
storage.delete("count")
```

### 7. 文件操作API (file)

读写插件目录下的本地文件，以及群文件管理。

#### `file.read`

**签名**: `file.read(file_path: string) -> string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| file_path | string | 是 | 文件路径（相对插件目录） |

**返回**: string - 文件内容，失败返回空字符串

**示例**:
```lua
local content = file.read("data.txt")
```

#### `file.write`

**签名**: `file.write(file_path: string, content: string) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| file_path | string | 是 | 文件路径（相对插件目录） |
| content | string | 是 | 写入内容 |

**返回**: boolean - 是否写入成功

**示例**:
```lua
file.write("data.txt", "hello")
```

#### `file.delete`

**签名**: `file.delete(file_path: string) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| file_path | string | 是 | 文件路径 |

**返回**: boolean - 是否删除成功

**示例**:
```lua
file.delete("data.txt")
```

#### `file.list`

**签名**: `file.list([dir_path: string]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| dir_path | string | 否 | 目录路径，默认插件根目录 |

**返回**: table - 文件条目列表，每项包含name, is_dir, size, mod_time

**示例**:
```lua
local files = file.list("subdir")
```

#### `file.exists`

**签名**: `file.exists(file_path: string) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| file_path | string | 是 | 文件路径 |

**返回**: boolean - 文件是否存在

**示例**:
```lua
local ok = file.exists("data.txt")
```

#### `file.mkdir`

**签名**: `file.mkdir(dir_path: string) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| dir_path | string | 是 | 目录路径 |

**返回**: boolean - 是否创建成功

**示例**:
```lua
file.mkdir("subdir")
```

#### `file.read_base64`

**签名**: `file.read_base64(file_path: string) -> string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| file_path | string | 是 | 文件路径 |

**返回**: string - Base64编码的文件内容

**示例**:
```lua
local b64 = file.read_base64("image.png")
```

#### `file.write_base64`

**签名**: `file.write_base64(file_path: string, base64_content: string) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| file_path | string | 是 | 文件路径 |
| base64_content | string | 是 | Base64编码内容 |

**返回**: boolean - 是否写入成功

**示例**:
```lua
file.write_base64("image.png", base64_str)
```

#### `file.delete_group_file`

**签名**: `file.delete_group_file(group_id: number, file_id: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |
| file_id | string | 是 | 文件ID |

**返回**: table - 操作结果

**示例**:
```lua
file.delete_group_file(123456789, "file_id")
```

#### `file.get_group_file_system_info`

**签名**: `file.get_group_file_system_info(group_id: number) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |

**返回**: table - 群文件系统信息

**示例**:
```lua
local info = file.get_group_file_system_info(123456789)
```

#### `file.get_group_root_files`

**签名**: `file.get_group_root_files(group_id: number) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |

**返回**: table - 根目录文件列表

**示例**:
```lua
local files = file.get_group_root_files(123456789)
```

#### `file.get_group_files_by_folder`

**签名**: `file.get_group_files_by_folder(group_id: number, folder_id: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |
| folder_id | string | 是 | 文件夹ID |

**返回**: table - 文件夹内文件列表

**示例**:
```lua
local files = file.get_group_files_by_folder(123456789, "folder_id")
```

#### `file.create_group_file_folder`

**签名**: `file.create_group_file_folder(group_id: number, name: string, [parent_id: string]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |
| name | string | 是 | 文件夹名称 |
| parent_id | string | 否 | 父文件夹ID |

**返回**: table - 创建结果

**示例**:
```lua
file.create_group_file_folder(123456789, "新文件夹")
```

#### `file.delete_group_folder`

**签名**: `file.delete_group_folder(group_id: number, folder_id: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |
| folder_id | string | 是 | 文件夹ID |

**返回**: table - 操作结果

**示例**:
```lua
file.delete_group_folder(123456789, "folder_id")
```

#### `file.move_group_file`

**签名**: `file.move_group_file(group_id: number, file_id: string, target_folder_id: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |
| file_id | string | 是 | 文件ID |
| target_folder_id | string | 是 | 目标文件夹ID |

**返回**: table - 操作结果

**示例**:
```lua
file.move_group_file(123456789, "file_id", "target_folder")
```

#### `file.rename_group_file`

**签名**: `file.rename_group_file(group_id: number, file_id: string, new_file_name: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | number | 是 | 群号 |
| file_id | string | 是 | 文件ID |
| new_file_name | string | 是 | 新文件名 |

**返回**: table - 操作结果

**示例**:
```lua
file.rename_group_file(123456789, "file_id", "new_name.txt")
```

#### `file.download_file`

**签名**: `file.download_file(url: string, [headers: table], [thread_count: number]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| url | string | 是 | 下载URL |
| headers | table | 否 | 请求头 |
| thread_count | number | 否 | 线程数 |

**返回**: table - 下载结果，包含file路径

**示例**:
```lua
local res = file.download_file("https://example.com/file.zip")
```

#### `file.reshare_flash_file`

**签名**: `file.reshare_flash_file(share_link_or_file_set_id: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| share_link_or_file_set_id | string | 是 | 分享链接或文件集ID |

**返回**: table - 操作结果

**示例**:
```lua
file.reshare_flash_file("share_link")
```

### 8. 网络请求API (http)

发送HTTP请求，支持GET、POST等方法，已内置SSRF安全防护。

#### `http.request`

**签名**: `http.request(method: string, url: string, [headers: table], [body: string]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| method | string | 是 | HTTP方法: GET/POST/PUT/DELETE等 |
| url | string | 是 | 请求URL |
| headers | table | 否 | 请求头表 |
| body | string | 否 | 请求体 |

**返回**: table - {status: number, status_text: string, body: string, headers: table}

**示例**:
```lua
local res = http.request("POST", "https://api.example.com", {["Content-Type"]="application/json"}, "{}")
```

#### `http.download_base64`

**签名**: `http.download_base64(url: string) -> string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| url | string | 是 | 下载URL |

**返回**: string - Base64编码的文件内容，失败返回nil

**示例**:
```lua
local b64 = http.download_base64("https://example.com/img.png")
```

#### `http.get`

**签名**: `http.get(url: string, [headers: table]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| url | string | 是 | 请求URL |
| headers | table | 否 | 请求头 |

**返回**: table - 响应表

**示例**:
```lua
local res = http.get("https://api.example.com")
```

#### `http.post`

**签名**: `http.post(url: string, [body: string], [headers: table]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| url | string | 是 | 请求URL |
| body | string | 否 | 请求体 |
| headers | table | 否 | 请求头 |

**返回**: table - 响应表

**示例**:
```lua
local res = http.post("https://api.example.com", "{}", {["Content-Type"]="application/json"})
```

### 9. 请求处理API (request)

处理好友添加请求和群添加请求。

#### `request.approve_friend`

**签名**: `request.approve_friend(flag: string, [approve: boolean], [remark: string]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| flag | string | 是 | 请求标识 |
| approve | boolean | 否 | true同意/false拒绝，默认true |
| remark | string | 否 | 备注名 |

**返回**: table - 操作结果

**示例**:
```lua
request.approve_friend("flag", true, "备注")
```

#### `request.approve_group`

**签名**: `request.approve_group(flag: string, [sub_type: string], [approve: boolean], [reason: string]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| flag | string | 是 | 请求标识 |
| sub_type | string | 否 | 子类型add/invite |
| approve | boolean | 否 | 是否同意 |
| reason | string | 否 | 拒绝理由 |

**返回**: table - 操作结果

**示例**:
```lua
request.approve_group("flag", "add", true, "")
```

#### `request.set_friend_add_request`

**签名**: `request.set_friend_add_request(flag: string, [approve: boolean], [remark: string]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| flag | string | 是 | 请求标识 |
| approve | boolean | 否 | 是否同意 |
| remark | string | 否 | 备注名 |

**返回**: table - 操作结果

**示例**:
```lua
request.set_friend_add_request("flag", true, "备注")
```

#### `request.set_group_add_request`

**签名**: `request.set_group_add_request(flag: string, sub_type: string, [approve: boolean], [reason: string]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| flag | string | 是 | 请求标识 |
| sub_type | string | 是 | 子类型 |
| approve | boolean | 否 | 是否同意 |
| reason | string | 否 | 拒绝理由 |

**返回**: table - 操作结果

**示例**:
```lua
request.set_group_add_request("flag", "add", true, "")
```

#### `request.get_doubt_friends`

**签名**: `request.get_doubt_friends() -> table`

**返回**: table - 可疑好友请求列表

**示例**:
```lua
local list = request.get_doubt_friends()
```

#### `request.handle_doubt_friend`

**签名**: `request.handle_doubt_friend(flag: string, [approve: boolean]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| flag | string | 是 | 请求标识 |
| approve | boolean | 否 | 是否同意，默认true |

**返回**: table - 操作结果

**示例**:
```lua
request.handle_doubt_friend("flag", true)
```

### 10. 网络通信API (network)

底层TCP/UDP网络通信，已限制内网访问。

#### `network.udp_send`

**签名**: `network.udp_send(address: string, message: string) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| address | string | 是 | 目标地址，如 "1.2.3.4:8080" |
| message | string | 是 | 发送内容 |

**返回**: boolean - 是否发送成功

**示例**:
```lua
network.udp_send("8.8.8.8:53", "hello")
```

#### `network.tcp_connect`

**签名**: `network.tcp_connect(address: string, [message: string], [timeout: number]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| address | string | 是 | 目标地址 |
| message | string | 否 | 发送内容 |
| timeout | number | 否 | 超时秒数，默认10，最大30 |

**返回**: string - 服务器响应内容

**示例**:
```lua
local resp = network.tcp_connect("example.com:80", "GET / HTTP/1.1

", 10)
```

### 11. 系统API (system)

获取系统状态、时间戳、登录信息等。

#### `system.now`

**签名**: `system.now() -> table`

**返回**: table - 当前时间信息，包含unix/date/datetime/iso/zone/offset

**示例**:
```lua
local t = system.now()
log.info(t.datetime)
```

#### `system.status`

**签名**: `system.status() -> table`

**返回**: table - 系统状态，包含server/bot/plugins信息

**示例**:
```lua
local status = system.status()
```

#### `system.get_cookies`

**签名**: `system.get_cookies([domain: string], [target_self_id: string]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| domain | string | 否 | 域名过滤 |
| target_self_id | string | 否 | 目标机器人QQ号 |

**返回**: table - Cookie列表

**示例**:
```lua
local cookies = system.get_cookies("qq.com")
```

#### `system.call_api`

**签名**: `system.call_api(endpoint: string, [params: table]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| endpoint | string | 是 | API端点 |
| params | table | 否 | 请求参数 |

**返回**: table - API响应

**示例**:
```lua
local res = system.call_api("get_version_info", {})
```

#### `system.get_timestamp_seconds`

**签名**: `system.get_timestamp_seconds() -> number`

**返回**: number - 当前Unix时间戳（秒）

**示例**:
```lua
local ts = system.get_timestamp_seconds()
```

#### `system.get_timestamp_milliseconds`

**签名**: `system.get_timestamp_milliseconds() -> number`

**返回**: number - 当前Unix时间戳（毫秒）

**示例**:
```lua
local ts = system.get_timestamp_milliseconds()
```

#### `system.get_login_info`

**签名**: `system.get_login_info() -> table`

**返回**: table - 当前登录账号信息

**示例**:
```lua
local info = system.get_login_info()
```

#### `system.get_version_info`

**签名**: `system.get_version_info() -> table`

**返回**: table - 机器人版本信息

**示例**:
```lua
local ver = system.get_version_info()
```

#### `system.get_memory`

**签名**: `system.get_memory() -> table`

**返回**: table - 插件内存使用情况

**示例**:
```lua
local mem = system.get_memory()
```

### 12. 工具API (utils)

常用编码解码工具函数。

#### `utils.url_encode`

**签名**: `utils.url_encode(str: string) -> string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| str | string | 是 | 要编码的字符串 |

**返回**: string - URL编码结果

**示例**:
```lua
local enc = utils.url_encode("hello world")
```

#### `utils.url_decode`

**签名**: `utils.url_decode(str: string) -> string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| str | string | 是 | 要解码的字符串 |

**返回**: string - URL解码结果

**示例**:
```lua
local dec = utils.url_decode("hello%20world")
```

#### `utils.unicode_escape`

**签名**: `utils.unicode_escape(str: string) -> string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| str | string | 是 | 要转义的字符串 |

**返回**: string - Unicode转义结果

**示例**:
```lua
local esc = utils.unicode_escape("中文")
```

#### `utils.base64_encode`

**签名**: `utils.base64_encode(data: string) -> string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| data | string | 是 | 要编码的数据 |

**返回**: string - Base64编码结果

**示例**:
```lua
local b64 = utils.base64_encode("hello")
```

#### `utils.base64_decode`

**签名**: `utils.base64_decode(str: string) -> string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| str | string | 是 | 要解码的Base64字符串 |

**返回**: string - Base64解码结果

**示例**:
```lua
local raw = utils.base64_decode("aGVsbG8=")
```

#### `utils.html_escape`

**签名**: `utils.html_escape(str: string) -> string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| str | string | 是 | 要转义的HTML |

**返回**: string - HTML转义结果

**示例**:
```lua
local esc = utils.html_escape("<div>")
```

#### `utils.html_unescape`

**签名**: `utils.html_unescape(str: string) -> string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| str | string | 是 | 要反转义的字符串 |

**返回**: string - HTML反转义结果

**示例**:
```lua
local raw = utils.html_unescape("&lt;div&gt;")
```

### 13. JSON API (json)

JSON编码解码及安全字段获取。

#### `json.encode`

**签名**: `json.encode(data: any) -> string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| data | any | 是 | 要编码的表或值 |

**返回**: string - JSON字符串

**示例**:
```lua
local s = json.encode({name="test", count=10})
```

#### `json.decode`

**签名**: `json.decode(json_str: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| json_str | string | 是 | JSON字符串 |

**返回**: table - 解码后的表

**示例**:
```lua
local t = json.decode('{"name":"test"}')
```

#### `json.get`

**签名**: `json.get(data: table, path: string) -> any`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| data | table | 是 | 已解码的JSON表 |
| path | string | 是 | 字段路径，支持嵌套如 "data.name" |

**返回**: any - 字段值，不存在返回nil

**示例**:
```lua
local v = json.get(t, "data.name")
```

### 14. 表操作API (table_utils)

安全获取和设置嵌套表字段。

#### `table_utils.get`

**签名**: `table_utils.get(table: table, key: string|number) -> any`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| table | table | 是 | 目标表 |
| key | string|number | 是 | 键名，支持嵌套路径如 "a.b.c" |

**返回**: any - 字段值，不存在返回nil

**示例**:
```lua
local v = table_utils.get(t, "a.b.c")
```

#### `table_utils.set`

**签名**: `table_utils.set(table: table, key: string|number, value: any) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| table | table | 是 | 目标表 |
| key | string|number | 是 | 键名，支持嵌套路径 |
| value | any | 是 | 要设置的值 |

**返回**: table - 修改后的表

**示例**:
```lua
table_utils.set(t, "a.b", 123)
```

### 15. 调度器API (scheduler)

注册和管理定时任务，支持间隔、每日、每周、每月任务。

#### `scheduler.interval`

**签名**: `scheduler.interval(seconds: number, callback: function, [options: table]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| seconds | number | 是 | 间隔秒数 |
| callback | function | 是 | 执行函数 |
| options | table | 否 | 配置项，如{maxExec=最大执行次数} |

**返回**: table - 任务信息，包含task_id

**示例**:
```lua
local task = scheduler.interval(60, function() log.info("tick") end, {maxExec=10})
```

#### `scheduler.daily`

**签名**: `scheduler.daily(hour: number, minute: number, second: number, callback: function) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| hour | number | 是 | 小时(0-23) |
| minute | number | 是 | 分钟(0-59) |
| second | number | 是 | 秒(0-59) |
| callback | function | 是 | 执行函数 |

**返回**: table - 任务信息

**示例**:
```lua
scheduler.daily(8, 0, 0, function() log.info("早上好") end)
```

#### `scheduler.weekly`

**签名**: `scheduler.weekly(weekday: number, hour: number, minute: number, second: number, callback: function) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| weekday | number | 是 | 星期(0=周日,1=周一...) |
| hour | number | 是 | 小时 |
| minute | number | 是 | 分钟 |
| second | number | 是 | 秒 |
| callback | function | 是 | 执行函数 |

**返回**: table - 任务信息

**示例**:
```lua
scheduler.weekly(1, 9, 0, 0, function() log.info("周一") end)
```

#### `scheduler.monthly`

**签名**: `scheduler.monthly(day: number, hour: number, minute: number, second: number, callback: function) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| day | number | 是 | 日期(1-31) |
| hour | number | 是 | 小时 |
| minute | number | 是 | 分钟 |
| second | number | 是 | 秒 |
| callback | function | 是 | 执行函数 |

**返回**: table - 任务信息

**示例**:
```lua
scheduler.monthly(1, 0, 0, 0, function() log.info("月初") end)
```

#### `scheduler.cancel`

**签名**: `scheduler.cancel(task_id: string) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| task_id | string | 是 | 任务ID |

**返回**: boolean - 是否取消成功

**示例**:
```lua
scheduler.cancel(task_id)
```

#### `scheduler.pause`

**签名**: `scheduler.pause(task_id: string) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| task_id | string | 是 | 任务ID |

**返回**: boolean - 是否暂停成功

**示例**:
```lua
scheduler.pause(task_id)
```

#### `scheduler.resume`

**签名**: `scheduler.resume(task_id: string) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| task_id | string | 是 | 任务ID |

**返回**: boolean - 是否恢复成功

**示例**:
```lua
scheduler.resume(task_id)
```

#### `scheduler.get_status`

**签名**: `scheduler.get_status(task_id: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| task_id | string | 是 | 任务ID |

**返回**: table - 任务状态

**示例**:
```lua
local st = scheduler.get_status(task_id)
```

#### `scheduler.list`

**签名**: `scheduler.list() -> table`

**返回**: table - 所有任务列表

**示例**:
```lua
local tasks = scheduler.list()
```

### 16. 消息解析API (msg)

解析消息事件，提取文本、图片、@用户等信息。event参数可省略，省略时使用当前消息上下文。

#### `msg.is_at_bot`

**签名**: `msg.is_at_bot([event: table], [bot_id: number|string]) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |
| bot_id | number|string | 否 | 指定机器人ID |

**返回**: boolean - 是否@了机器人

**示例**:
```lua
local at = msg.is_at_bot(event)
```

#### `msg.get_plain_text`

**签名**: `msg.get_plain_text([event: table]) -> string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: string - 纯文本内容

**示例**:
```lua
local text = msg.get_plain_text(event)
```

#### `msg.contains_keyword`

**签名**: `msg.contains_keyword([event: table], keyword: string) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |
| keyword | string | 是 | 关键字 |

**返回**: boolean - 是否包含关键字

**示例**:
```lua
local has = msg.contains_keyword(event, "测试")
```

#### `msg.get_images`

**签名**: `msg.get_images([event: table]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: table - 图片信息列表

**示例**:
```lua
local imgs = msg.get_images(event)
```

#### `msg.get_at_users`

**签名**: `msg.get_at_users([event: table]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: table - 被@的用户列表

**示例**:
```lua
local users = msg.get_at_users(event)
```

#### `msg.has_image`

**签名**: `msg.has_image([event: table]) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: boolean - 是否包含图片

**示例**:
```lua
local has = msg.has_image(event)
```

#### `msg.has_voice`

**签名**: `msg.has_voice([event: table]) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: boolean - 是否包含语音

**示例**:
```lua
local has = msg.has_voice(event)
```

#### `msg.has_video`

**签名**: `msg.has_video([event: table]) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: boolean - 是否包含视频

**示例**:
```lua
local has = msg.has_video(event)
```

#### `msg.has_face`

**签名**: `msg.has_face([event: table]) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: boolean - 是否包含表情

**示例**:
```lua
local has = msg.has_face(event)
```

#### `msg.get_reply_id`

**签名**: `msg.get_reply_id([event: table]) -> number|nil`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: number|nil - 回复的消息ID

**示例**:
```lua
local id = msg.get_reply_id(event)
```

#### `msg.get_sender_role`

**签名**: `msg.get_sender_role([event: table]) -> string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: string - 发送者角色: owner/admin/member

**示例**:
```lua
local role = msg.get_sender_role(event)
```

#### `msg.is_sender_owner`

**签名**: `msg.is_sender_owner([event: table]) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: boolean - 是否为群主

**示例**:
```lua
local ok = msg.is_sender_owner(event)
```

#### `msg.is_sender_admin`

**签名**: `msg.is_sender_admin([event: table]) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: boolean - 是否为管理员

**示例**:
```lua
local ok = msg.is_sender_admin(event)
```

#### `msg.is_sender_member`

**签名**: `msg.is_sender_member([event: table]) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: boolean - 是否为普通成员

**示例**:
```lua
local ok = msg.is_sender_member(event)
```

#### `msg.has_reply`

**签名**: `msg.has_reply([event: table]) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: boolean - 是否为回复消息

**示例**:
```lua
local ok = msg.has_reply(event)
```

#### `msg.is_group_message`

**签名**: `msg.is_group_message([event: table]) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: boolean - 是否为群消息

**示例**:
```lua
local ok = msg.is_group_message(event)
```

#### `msg.is_private_message`

**签名**: `msg.is_private_message([event: table]) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: boolean - 是否为私聊消息

**示例**:
```lua
local ok = msg.is_private_message(event)
```

#### `msg.get_type`

**签名**: `msg.get_type([event: table]) -> string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: string - 消息类型: group/private

**示例**:
```lua
local t = msg.get_type(event)
```

#### `msg.get_first_image`

**签名**: `msg.get_first_image([event: table]) -> table|nil`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: table|nil - 第一张图片的信息

**示例**:
```lua
local img = msg.get_first_image(event)
```

#### `msg.get_sender_id`

**签名**: `msg.get_sender_id([event: table]) -> number`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: number - 发送者QQ号

**示例**:
```lua
local id = msg.get_sender_id(event)
```

#### `msg.get_sender_nickname`

**签名**: `msg.get_sender_nickname([event: table]) -> string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: string - 发送者昵称

**示例**:
```lua
local name = msg.get_sender_nickname(event)
```

#### `msg.get_group_id`

**签名**: `msg.get_group_id([event: table]) -> number|nil`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: number|nil - 群号（私聊返回nil）

**示例**:
```lua
local gid = msg.get_group_id(event)
```

#### `msg.get_time`

**签名**: `msg.get_time([event: table]) -> number`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: number - 消息时间戳

**示例**:
```lua
local t = msg.get_time(event)
```

#### `msg.get_message_type`

**签名**: `msg.get_message_type([event: table]) -> string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: string - 内容类型: text/image/face等

**示例**:
```lua
local mt = msg.get_message_type(event)
```

#### `msg.is_at_all`

**签名**: `msg.is_at_all([event: table]) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: boolean - 是否@全体成员

**示例**:
```lua
local ok = msg.is_at_all(event)
```

#### `msg.has_url`

**签名**: `msg.has_url([event: table]) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: boolean - 是否包含URL

**示例**:
```lua
local ok = msg.has_url(event)
```

#### `msg.count_urls`

**签名**: `msg.count_urls([event: table]) -> number`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: number - URL数量

**示例**:
```lua
local n = msg.count_urls(event)
```

#### `msg.get_urls`

**签名**: `msg.get_urls([event: table]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: table - URL列表

**示例**:
```lua
local urls = msg.get_urls(event)
```

#### `msg.has_json`

**签名**: `msg.has_json([event: table]) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: boolean - 是否包含JSON卡片

**示例**:
```lua
local ok = msg.has_json(event)
```

#### `msg.is_contact_card`

**签名**: `msg.is_contact_card([event: table]) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: boolean - 是否为联系人卡片

**示例**:
```lua
local ok = msg.is_contact_card(event)
```

#### `msg.is_group_card`

**签名**: `msg.is_group_card([event: table]) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: boolean - 是否为群卡片

**示例**:
```lua
local ok = msg.is_group_card(event)
```

#### `msg.is_channel_card`

**签名**: `msg.is_channel_card([event: table]) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: boolean - 是否为频道卡片

**示例**:
```lua
local ok = msg.is_channel_card(event)
```

#### `msg.get_json_data`

**签名**: `msg.get_json_data([event: table]) -> table|nil`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: table|nil - JSON卡片数据

**示例**:
```lua
local data = msg.get_json_data(event)
```

#### `msg.parse_card`

**签名**: `msg.parse_card([event: table]) -> table|nil`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: table|nil - 卡片解析结果

**示例**:
```lua
local card = msg.parse_card(event)
```

#### `msg.get_card_info`

**签名**: `msg.get_card_info([event: table]) -> table|nil`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: table|nil - 卡片详细信息

**示例**:
```lua
local info = msg.get_card_info(event)
```

#### `msg.json_has_app`

**签名**: `msg.json_has_app([event: table], [app_name: string]) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |
| app_name | string | 否 | 应用名称 |

**返回**: boolean - 是否包含指定应用

**示例**:
```lua
local ok = msg.json_has_app(event, "com.tencent.miniapp")
```

#### `msg.get_json_app_type`

**签名**: `msg.get_json_app_type([event: table]) -> string|nil`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: string|nil - 应用类型

**示例**:
```lua
local app = msg.get_json_app_type(event)
```

#### `msg.get_json_field`

**签名**: `msg.get_json_field([event: table], field: string) -> any`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |
| field | string | 是 | 字段路径 |

**返回**: any - 字段值

**示例**:
```lua
local v = msg.get_json_field(event, "prompt")
```

#### `msg.get_card_id_from_url`

**签名**: `msg.get_card_id_from_url(url: string) -> string|nil`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| url | string | 是 | 卡片URL |

**返回**: string|nil - 卡片ID

**示例**:
```lua
local id = msg.get_card_id_from_url("https://...")
```

#### `msg.parse_card_full`

**签名**: `msg.parse_card_full([event: table]) -> table|nil`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: table|nil - 完整卡片信息

**示例**:
```lua
local card = msg.parse_card_full(event)
```

#### `msg.is_group_admin`

**签名**: `msg.is_group_admin([event: table]) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event | table | 否 | 消息事件 |

**返回**: boolean - 机器人是否为群管理员

**示例**:
```lua
local ok = msg.is_group_admin(event)
```

### 17. 机器人管理API (bot)

查询和管理机器人账号状态。

#### `bot.get_list`

**签名**: `bot.get_list() -> table`

**返回**: table - 所有机器人列表

**示例**:
```lua
local bots = bot.get_list()
```

#### `bot.get_info`

**签名**: `bot.get_info(self_id: string) -> table|nil, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| self_id | string | 是 | 机器人QQ号 |

**返回**: table|nil, string - 机器人信息或错误信息

**示例**:
```lua
local info, err = bot.get_info("123456789")
```

#### `bot.get_count`

**签名**: `bot.get_count() -> table`

**返回**: table - {total=总数, online=在线数, offline=离线数}

**示例**:
```lua
local cnt = bot.get_count()
```

#### `bot.is_online`

**签名**: `bot.is_online([self_id: string]) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| self_id | string | 否 | 机器人QQ号，省略则检查当前插件绑定的机器人 |

**返回**: boolean - 是否在线

**示例**:
```lua
local ok = bot.is_online()
local ok2 = bot.is_online("123456789")
```

#### `bot.disconnect`

**签名**: `bot.disconnect(self_id: string) -> boolean, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| self_id | string | 是 | 机器人QQ号 |

**返回**: boolean, string - 是否成功及错误信息

**示例**:
```lua
bot.disconnect("123456789")
```

#### `bot.get_status`

**签名**: `bot.get_status() -> table`

**返回**: table - 机器人状态信息

**示例**:
```lua
local st = bot.get_status()
```

#### `bot.get_version`

**签名**: `bot.get_version() -> table`

**返回**: table - 版本信息

**示例**:
```lua
local ver = bot.get_version()
```

### 18. 插件管理API (plugin / plugins)

当前插件控制和跨插件管理。

#### `plugin.name`

**签名**: `plugin.name -> string (属性)`

**返回**: string - 当前插件名称

**示例**:
```lua
log.info(plugin.name)
```

#### `plugin.self_id`

**签名**: `plugin.self_id -> string (属性)`

**返回**: string - 绑定的机器人QQ号

**示例**:
```lua
log.info(plugin.self_id)
```

#### `plugin.reload`

**签名**: `plugin.reload() -> boolean, string`

**返回**: boolean, string - 是否成功

**示例**:
```lua
plugin.reload()
```

#### `plugin.stop`

**签名**: `plugin.stop() -> boolean, string`

**返回**: boolean, string - 是否成功

**示例**:
```lua
plugin.stop()
```

#### `plugin.unload_self`

**签名**: `plugin.unload_self() -> boolean, string`

**返回**: boolean, string - 是否成功

**示例**:
```lua
plugin.unload_self()
```

#### `plugins.list`

**签名**: `plugins.list() -> table`

**返回**: table - 所有插件列表

**示例**:
```lua
local list = plugins.list()
```

#### `plugins.status`

**签名**: `plugins.status(name: string) -> table|nil, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| name | string | 是 | 插件名 |

**返回**: table|nil, string - 插件状态或错误

**示例**:
```lua
local st = plugins.status("my_plugin")
```

#### `plugins.get_config`

**签名**: `plugins.get_config(name: string) -> table|nil, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| name | string | 是 | 插件名 |

**返回**: table|nil, string - 其他插件的配置表

**示例**:
```lua
local cfg = plugins.get_config("other")
```

#### `plugins.save_config`

**签名**: `plugins.save_config(name: string, config: table) -> boolean, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| name | string | 是 | 插件名（只能修改当前插件） |
| config | table | 是 | 配置内容 |

**返回**: boolean, string - 是否成功

**示例**:
```lua
plugins.save_config(plugin.name, {key="value"})
```

#### `plugins.delete_config`

**签名**: `plugins.delete_config(name: string) -> boolean, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| name | string | 是 | 插件名（只能删除当前插件） |

**返回**: boolean, string - 是否成功

**示例**:
```lua
plugins.delete_config(plugin.name)
```

#### `plugins.json_read`

**签名**: `plugins.json_read(name: string, rel_path: string) -> table|nil, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| name | string | 是 | 插件名（只能读取当前插件） |
| rel_path | string | 是 | 相对插件目录的JSON文件路径 |

**返回**: table|nil, string - JSON内容或错误

**示例**:
```lua
local data = plugins.json_read(plugin.name, "data.json")
```

#### `plugins.json_save`

**签名**: `plugins.json_save(name: string, rel_path: string, data: table) -> boolean, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| name | string | 是 | 插件名（只能保存当前插件） |
| rel_path | string | 是 | 相对路径 |
| data | table | 是 | 要保存的数据 |

**返回**: boolean, string - 是否成功

**示例**:
```lua
plugins.json_save(plugin.name, "data.json", {count=1})
```

#### `plugins.json_delete`

**签名**: `plugins.json_delete(name: string, rel_path: string) -> boolean, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| name | string | 是 | 插件名（只能删除当前插件） |
| rel_path | string | 是 | 相对路径 |

**返回**: boolean, string - 是否成功

**示例**:
```lua
plugins.json_delete(plugin.name, "data.json")
```

### 19. 自定义API (api)

调用底层自定义API。

#### `api.call`

**签名**: `api.call(endpoint: string, [params: table]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| endpoint | string | 是 | API端点名称 |
| params | table | 否 | 请求参数 |

**返回**: table - API响应结果

**示例**:
```lua
local res = api.call("get_version_info", {})
```

### 20. 插件间通信API (plugin_comm)

插件间RPC通信，支持连接、发送、接收数据。

#### `plugin_comm.connect`

**签名**: `plugin_comm.connect(to_self_id: string, to_plugin: string, [remark: string]) -> boolean, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| to_self_id | string | 是 | 目标机器人QQ号 |
| to_plugin | string | 是 | 目标插件名 |
| remark | string | 否 | 连接备注 |

**返回**: boolean, string - 是否成功

**示例**:
```lua
plugin_comm.connect("123456789", "other_plugin", "连接")
```

#### `plugin_comm.accept`

**签名**: `plugin_comm.accept(from_self_id: string, from_plugin: string) -> boolean, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| from_self_id | string | 是 | 来源机器人QQ号 |
| from_plugin | string | 是 | 来源插件名 |

**返回**: boolean, string - 是否成功

**示例**:
```lua
plugin_comm.accept("123456789", "other_plugin")
```

#### `plugin_comm.reject`

**签名**: `plugin_comm.reject(from_self_id: string, from_plugin: string) -> boolean, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| from_self_id | string | 是 | 来源机器人QQ号 |
| from_plugin | string | 是 | 来源插件名 |

**返回**: boolean, string - 是否成功

**示例**:
```lua
plugin_comm.reject("123456789", "other_plugin")
```

#### `plugin_comm.send`

**签名**: `plugin_comm.send(to_self_id: string, to_plugin: string, data: table) -> boolean, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| to_self_id | string | 是 | 目标机器人QQ号 |
| to_plugin | string | 是 | 目标插件名 |
| data | table | 是 | 发送的数据 |

**返回**: boolean, string - 是否成功

**示例**:
```lua
plugin_comm.send("123456789", "other_plugin", {key="value"})
```

#### `plugin_comm.receive`

**签名**: `plugin_comm.receive(from_self_id: string, from_plugin: string) -> table|nil`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| from_self_id | string | 是 | 来源机器人QQ号 |
| from_plugin | string | 是 | 来源插件名 |

**返回**: table|nil - 收到的数据

**示例**:
```lua
local data = plugin_comm.receive("123456789", "other_plugin")
```

#### `plugin_comm.get_pending`

**签名**: `plugin_comm.get_pending() -> table`

**返回**: table - 待处理的连接请求列表

**示例**:
```lua
local pending = plugin_comm.get_pending()
```

#### `plugin_comm.close`

**签名**: `plugin_comm.close(target_self_id: string, target_plugin: string) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| target_self_id | string | 是 | 目标机器人QQ号 |
| target_plugin | string | 是 | 目标插件名 |

**返回**: boolean - 是否关闭成功

**示例**:
```lua
plugin_comm.close("123456789", "other_plugin")
```

### 21. 插件RPC API (plugin_rpc)

声明可被其他插件调用的事件和函数。

#### `plugin_rpc.declare_event`

**签名**: `plugin_rpc.declare_event(event_name: string, handler: function) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| event_name | string | 是 | 事件名称 |
| handler | function | 是 | 处理函数，接收args参数表 |

**返回**: boolean - 是否注册成功

**示例**:
```lua
plugin_rpc.declare_event("get_data", function(args) return {data=123} end)
```

#### `plugin_rpc.call_function`

**签名**: `plugin_rpc.call_function(function_name: string, [args: any], [timeout: number]) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| function_name | string | 是 | 函数名 |
| args | any | 否 | 传递的参数 |
| timeout | number | 否 | 超时秒数 |

**返回**: table - 所有插件的返回结果数组

**示例**:
```lua
local results = plugin_rpc.call_function("get_data", {}, 5)
```

#### `plugin_rpc.return_function`

**签名**: `plugin_rpc.return_function(function_name: string, handler: function) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| function_name | string | 是 | 函数名 |
| handler | function | 是 | 处理函数 |

**返回**: boolean - 是否注册成功

**示例**:
```lua
plugin_rpc.return_function("calc", function(args) return args.a + args.b end)
```

### 22. HTTP接口API (http_interface)

注册自定义HTTP接口供外部调用。

#### `http_interface.register`

**签名**: `http_interface.register(external_name: string, handler: function, [methods: table], [is_global: boolean]) -> boolean, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| external_name | string | 是 | 接口路径，如 "/api/my" |
| handler | function | 是 | 处理函数，接收request表参数 |
| methods | table | 否 | 允许的HTTP方法数组，如{"GET","POST"} |
| is_global | boolean | 否 | 是否全局接口（所有账号共享） |

**返回**: boolean, string - 是否成功

**示例**:
```lua
http_interface.register("/api/ping", function(req) return {status=200, body="pong"} end, {"GET"})
```

#### `http_interface.unregister`

**签名**: `http_interface.unregister(external_name: string, [self_id: string]) -> boolean, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| external_name | string | 是 | 接口路径 |
| self_id | string | 否 | 机器人QQ号，省略则使用当前插件的 |

**返回**: boolean, string - 是否成功

**示例**:
```lua
http_interface.unregister("/api/ping")
```

### 23. 日期时间API (time)

时间戳转换和格式化。

#### `time.now`

**签名**: `time.now() -> number`

**返回**: number - 当前Unix时间戳（秒）

**示例**:
```lua
local ts = time.now()
```

#### `time.format`

**签名**: `time.format(timestamp: number, format: string) -> string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| timestamp | number | 是 | Unix时间戳 |
| format | string | 是 | Go时间格式，如 "2006-01-02 15:04:05" |

**返回**: string - 格式化后的时间字符串

**示例**:
```lua
local s = time.format(time.now(), "2006-01-02 15:04:05")
```

#### `time.parse`

**签名**: `time.parse(time_str: string, format: string) -> number|nil, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| time_str | string | 是 | 时间字符串 |
| format | string | 是 | 对应格式 |

**返回**: number|nil, string - 时间戳或错误信息

**示例**:
```lua
local ts = time.parse("2024-01-01 12:00:00", "2006-01-02 15:04:05")
```

#### `time.components`

**签名**: `time.components(timestamp: number) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| timestamp | number | 是 | Unix时间戳 |

**返回**: table - {year, month, day, hour, minute, second, weekday}

**示例**:
```lua
local c = time.components(time.now())
```

### 24. 加密/哈希API (crypto)

常用哈希算法。

#### `crypto.md5`

**签名**: `crypto.md5(data: string) -> string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| data | string | 是 | 输入数据 |

**返回**: string - MD5哈希值（32位小写）

**示例**:
```lua
local hash = crypto.md5("hello")
```

#### `crypto.sha1`

**签名**: `crypto.sha1(data: string) -> string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| data | string | 是 | 输入数据 |

**返回**: string - SHA1哈希值

**示例**:
```lua
local hash = crypto.sha1("hello")
```

#### `crypto.sha256`

**签名**: `crypto.sha256(data: string) -> string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| data | string | 是 | 输入数据 |

**返回**: string - SHA256哈希值

**示例**:
```lua
local hash = crypto.sha256("hello")
```

### 25. 正则表达式API (regex)

正则匹配、查找和替换。

#### `regex.match`

**签名**: `regex.match(pattern: string, str: string) -> boolean, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| pattern | string | 是 | 正则表达式 |
| str | string | 是 | 目标字符串 |

**返回**: boolean, string - 是否匹配及错误信息

**示例**:
```lua
local ok = regex.match("^\d+$", "12345")
```

#### `regex.find_all`

**签名**: `regex.find_all(pattern: string, str: string) -> table|nil, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| pattern | string | 是 | 正则表达式 |
| str | string | 是 | 目标字符串 |

**返回**: table|nil, string - 所有匹配项数组

**示例**:
```lua
local matches = regex.find_all("\d+", "a1b2c3")
```

#### `regex.replace`

**签名**: `regex.replace(pattern: string, str: string, replacement: string) -> string|nil, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| pattern | string | 是 | 正则表达式 |
| str | string | 是 | 目标字符串 |
| replacement | string | 是 | 替换内容 |

**返回**: string|nil, string - 替换后字符串

**示例**:
```lua
local s = regex.replace("\d+", "a1b2", "X")
```

### 26. 数学扩展API (math_ext)

扩展数学函数。

#### `math_ext.random_float`

**签名**: `math_ext.random_float([min: number], [max: number]) -> number`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| min | number | 否 | 最小值，默认0 |
| max | number | 否 | 最大值，默认1 |

**返回**: number - 随机浮点数

**示例**:
```lua
local r = math_ext.random_float(1.0, 10.0)
```

#### `math_ext.random_int`

**签名**: `math_ext.random_int(min: number, max: number) -> number`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| min | number | 是 | 最小值（含） |
| max | number | 是 | 最大值（含） |

**返回**: number - 随机整数

**示例**:
```lua
local r = math_ext.random_int(1, 100)
```

#### `math_ext.round`

**签名**: `math_ext.round(x: number) -> number`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| x | number | 是 | 输入值 |

**返回**: number - 四舍五入结果

**示例**:
```lua
local r = math_ext.round(3.14159)
```

#### `math_ext.abs`

**签名**: `math_ext.abs(x: number) -> number`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| x | number | 是 | 输入值 |

**返回**: number - 绝对值

**示例**:
```lua
local a = math_ext.abs(-10)
```

#### `math_ext.pow`

**签名**: `math_ext.pow(x: number, y: number) -> number`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| x | number | 是 | 底数 |
| y | number | 是 | 指数 |

**返回**: number - x的y次幂

**示例**:
```lua
local p = math_ext.pow(2, 10)
```

### 27. 字符串处理扩展API (string_ext)

常用字符串处理函数。

#### `string_ext.split`

**签名**: `string_ext.split(str: string, sep: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| str | string | 是 | 源字符串 |
| sep | string | 是 | 分隔符 |

**返回**: table - 分割后的字符串数组

**示例**:
```lua
local parts = string_ext.split("a,b,c", ",")
```

#### `string_ext.join`

**签名**: `string_ext.join(parts: table, sep: string) -> string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| parts | table | 是 | 字符串数组 |
| sep | string | 是 | 连接符 |

**返回**: string - 连接后的字符串

**示例**:
```lua
local s = string_ext.join({"a","b"}, "-")
```

#### `string_ext.replace`

**签名**: `string_ext.replace(str: string, old: string, new: string, [n: number]) -> string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| str | string | 是 | 源字符串 |
| old | string | 是 | 被替换子串 |
| new | string | 是 | 替换子串 |
| n | number | 否 | 最大替换次数，默认-1表示全部 |

**返回**: string - 替换后字符串

**示例**:
```lua
local s = string_ext.replace("hello world", "world", "lua", -1)
```

#### `string_ext.contains`

**签名**: `string_ext.contains(str: string, substr: string) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| str | string | 是 | 源字符串 |
| substr | string | 是 | 子串 |

**返回**: boolean - 是否包含

**示例**:
```lua
local ok = string_ext.contains("hello", "ll")
```

#### `string_ext.trim`

**签名**: `string_ext.trim(str: string, [cutset: string]) -> string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| str | string | 是 | 源字符串 |
| cutset | string | 否 | 要修剪的字符集，默认空白字符 |

**返回**: string - 修剪后字符串

**示例**:
```lua
local s = string_ext.trim("  hello  ")
```

### 28. UUID生成API (uuid)

生成标准UUID。

#### `uuid.new`

**签名**: `uuid.new() -> string`

**返回**: string - UUID字符串，格式 xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

**示例**:
```lua
local id = uuid.new()
```

### 29. 图像处理API (image)

基于图像处理器的图像操作，需先通过 message.create_image_processor 创建处理器。

#### `image.crop`

**签名**: `image.crop(processor: table, x: number, y: number, width: number, height: number) -> boolean, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| processor | table | 是 | 图像处理器对象 |
| x | number | 是 | 裁剪起点X |
| y | number | 是 | 裁剪起点Y |
| width | number | 是 | 裁剪宽度 |
| height | number | 是 | 裁剪高度 |

**返回**: boolean, string - 是否成功及错误信息

**示例**:
```lua
image.crop(proc, 10, 10, 100, 100)
```

#### `image.resize`

**签名**: `image.resize(processor: table, new_width: number, new_height: number) -> boolean, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| processor | table | 是 | 图像处理器对象 |
| new_width | number | 是 | 新宽度 |
| new_height | number | 是 | 新高度 |

**返回**: boolean, string - 是否成功

**示例**:
```lua
image.resize(proc, 200, 200)
```

#### `image.rotate`

**签名**: `image.rotate(processor: table, degrees: number) -> boolean, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| processor | table | 是 | 图像处理器对象 |
| degrees | number | 是 | 旋转角度 |

**返回**: boolean, string - 是否成功

**示例**:
```lua
image.rotate(proc, 90)
```

#### `image.grayscale`

**签名**: `image.grayscale(processor: table) -> boolean, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| processor | table | 是 | 图像处理器对象 |

**返回**: boolean, string - 是否成功

**示例**:
```lua
image.grayscale(proc)
```

#### `image.add_watermark`

**签名**: `image.add_watermark(processor: table, text: string, [x: number], [y: number], [font_size: number]) -> boolean, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| processor | table | 是 | 图像处理器对象 |
| text | string | 是 | 水印文字 |
| x | number | 否 | X坐标，默认0 |
| y | number | 否 | Y坐标，默认0 |
| font_size | number | 否 | 字体大小，默认12 |

**返回**: boolean, string - 是否成功

**示例**:
```lua
image.add_watermark(proc, "水印", 10, 10, 12)
```

#### `image.blur`

**签名**: `image.blur(processor: table, [radius: number]) -> boolean, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| processor | table | 是 | 图像处理器对象 |
| radius | number | 否 | 模糊半径，默认5 |

**返回**: boolean, string - 是否成功

**示例**:
```lua
image.blur(proc, 5)
```

#### `image.adjust_brightness`

**签名**: `image.adjust_brightness(processor: table, brightness: number) -> boolean, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| processor | table | 是 | 图像处理器对象 |
| brightness | number | 是 | 亮度倍数，1.0为原亮度 |

**返回**: boolean, string - 是否成功

**示例**:
```lua
image.adjust_brightness(proc, 1.5)
```

#### `image.adjust_contrast`

**签名**: `image.adjust_contrast(processor: table, contrast: number) -> boolean, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| processor | table | 是 | 图像处理器对象 |
| contrast | number | 是 | 对比度倍数 |

**返回**: boolean, string - 是否成功

**示例**:
```lua
image.adjust_contrast(proc, 1.2)
```

#### `image.adjust_saturation`

**签名**: `image.adjust_saturation(processor: table, saturation: number) -> boolean, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| processor | table | 是 | 图像处理器对象 |
| saturation | number | 是 | 饱和度倍数 |

**返回**: boolean, string - 是否成功

**示例**:
```lua
image.adjust_saturation(proc, 0.8)
```

#### `image.get_size`

**签名**: `image.get_size(processor: table) -> table|nil, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| processor | table | 是 | 图像处理器对象 |

**返回**: table|nil, string - {width, height} 或错误

**示例**:
```lua
local size = image.get_size(proc)
```

#### `image.save_png`

**签名**: `image.save_png(processor: table) -> string|nil, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| processor | table | 是 | 图像处理器对象 |

**返回**: string|nil, string - Base64编码的PNG数据

**示例**:
```lua
local b64 = image.save_png(proc)
```

#### `image.save_jpeg`

**签名**: `image.save_jpeg(processor: table, [quality: number]) -> string|nil, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| processor | table | 是 | 图像处理器对象 |
| quality | number | 否 | JPEG质量(1-100)，默认90 |

**返回**: string|nil, string - Base64编码的JPEG数据

**示例**:
```lua
local b64 = image.save_jpeg(proc, 90)
```

#### `image.draw_circle`

**签名**: `image.draw_circle(processor: table, x: number, y: number, radius: number, r: number, g: number, b: number, [a: number], [filled: boolean]) -> boolean, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| processor | table | 是 | 图像处理器对象 |
| x | number | 是 | 圆心X |
| y | number | 是 | 圆心Y |
| radius | number | 是 | 半径 |
| r | number | 是 | 红色(0-255) |
| g | number | 是 | 绿色(0-255) |
| b | number | 是 | 蓝色(0-255) |
| a | number | 否 | 透明度(0-255)，默认255 |
| filled | boolean | 否 | 是否填充，默认false |

**返回**: boolean, string - 是否成功

**示例**:
```lua
image.draw_circle(proc, 100, 100, 50, 255, 0, 0, 255, true)
```

#### `image.draw_line`

**签名**: `image.draw_line(processor: table, x1: number, y1: number, x2: number, y2: number, r: number, g: number, b: number, [a: number], [thickness: number]) -> boolean, string`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| processor | table | 是 | 图像处理器对象 |
| x1 | number | 是 | 起点X |
| y1 | number | 是 | 起点Y |
| x2 | number | 是 | 终点X |
| y2 | number | 是 | 终点Y |
| r | number | 是 | 红色 |
| g | number | 是 | 绿色 |
| b | number | 是 | 蓝色 |
| a | number | 否 | 透明度，默认255 |
| thickness | number | 否 | 线宽，默认1 |

**返回**: boolean, string - 是否成功

**示例**:
```lua
image.draw_line(proc, 0, 0, 200, 200, 0, 0, 255, 255, 2)
```

#### `image.release`

**签名**: `image.release(processor: table) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| processor | table | 是 | 图像处理器对象 |

**返回**: boolean - 是否释放成功

**示例**:
```lua
image.release(proc)
```

### 30. 数据库API (db)

基于CSV的简化数据库操作。

#### `db.open`

**签名**: `db.open(name: string) -> table`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| name | string | 是 | 数据库名称 |

**返回**: table - 数据库对象，包含insert/query等方法

**示例**:
```lua
local db = db.open("mydata")
```

#### `db.set`

**签名**: `db.set(dbname: string, key: string, value: any) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| dbname | string | 是 | 数据库名称 |
| key | string | 是 | 键名 |
| value | any | 是 | 值 |

**返回**: boolean - 是否成功

**示例**:
```lua
db.set("mydb", "name", "张三")
```

#### `db.get`

**签名**: `db.get(dbname: string, key: string) -> any`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| dbname | string | 是 | 数据库名称 |
| key | string | 是 | 键名 |

**返回**: any - 值或nil

**示例**:
```lua
local v = db.get("mydb", "name")
```

#### `db.delete`

**签名**: `db.delete(dbname: string, key: string) -> boolean`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| dbname | string | 是 | 数据库名称 |
| key | string | 是 | 键名 |

**返回**: boolean - 是否成功

**示例**:
```lua
db.delete("mydb", "name")
```

### 31. 全局事件注册

注册各类事件处理器。所有 `on_*` 系列函数均支持一个**可选的过滤配置表**作为第二参数，**不传则保持原有行为，接收所有该类型事件**。过滤机制参考代理适配器的白/黑名单思路（[internal/services/proxy/filter.go](../internal/services/proxy/filter.go)），按事件类型粒度生效。

#### `on_message`

**签名**: `on_message(handler: function, filter?: table) -> void`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| handler | function | 是 | 处理函数，参数为event表 |
| filter | table | 否 | 事件级过滤配置，不传则接收全部消息 |

**filter 表字段**（所有字段均可选，全部为空等同于不传）：

| 字段 | 类型 | 说明 |
|------|------|------|
| whitelistTypes | string[] | 类型白名单（如 `"message.group"` / `"message.private"` / `"sub.friend"`），命中其一才放行 |
| blacklistTypes | string[] | 类型黑名单，命中即丢弃 |
| whitelistKeywords | string[] | 关键词白名单（不区分大小写），消息文本需包含其中之一 |
| blacklistKeywords | string[] | 关键词黑名单，消息文本包含则丢弃 |

**返回**: 无返回值

**示例**:
```lua
-- 原用法保持不变：接收所有消息
on_message(function(event)
    log.info(msg.get_plain_text(event))
end)

-- 仅接收群消息，且过滤包含 "广告" 的内容
on_message(function(event)
    log.info(msg.get_plain_text(event))
end, {
    whitelistTypes    = { "message.group" },
    blacklistKeywords = { "广告" },
})

-- 仅接收群消息里包含 "签到" 或 "打卡" 的
on_message(function(event)
    handle_sign(event)
end, {
    whitelistTypes     = { "message.group" },
    whitelistKeywords  = { "签到", "打卡" },
})
```

#### `on_notice`

**签名**: `on_notice(handler: function, filter?: table) -> void`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| handler | function | 是 | 处理函数 |
| filter | table | 否 | 过滤配置（同 `on_message`），按 notice_type / sub_type 过滤 |

**返回**: 无返回值

**示例**:
```lua
-- 原用法：接收所有通知
on_notice(function(event)
    log.info("通知事件")
end)

-- 仅接收群文件上传、群成员增加 通知
on_notice(function(event)
    log.info("notice:", event.notice_type)
end, {
    whitelistTypes = { "notice.group_upload", "notice.group_increase" },
})
```

#### `on_request`

**签名**: `on_request(handler: function, filter?: table) -> void`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| handler | function | 是 | 处理函数 |
| filter | table | 否 | 过滤配置，按 request_type 过滤 |

**返回**: 无返回值

**示例**:
```lua
-- 原用法：接收所有请求
on_request(function(event)
    request.approve_friend(event.flag, true)
end)

-- 只处理加好友请求（过滤掉加群请求）
on_request(function(event)
    if event.request_type == "friend" then
        request.approve_friend(event.flag, true)
    end
end, {
    whitelistTypes = { "request.friend" },
})
```

#### `on_message_sent`

**签名**: `on_message_sent(handler: function, filter?: table) -> void`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| handler | function | 是 | 处理函数 |
| filter | table | 否 | 过滤配置，可按 message_type / 关键词过滤 |

**返回**: 无返回值

**示例**:
```lua
-- 原用法：接收自己发送的所有消息
on_message_sent(function(event)
    log.info("消息已发送")
end)

-- 只关心自己发送的群消息
on_message_sent(function(event)
    log.info("sent:", msg.get_plain_text(event))
end, {
    whitelistTypes = { "message_sent.group" },
})
```

#### `on_meta_event`

**签名**: `on_meta_event(handler: function, filter?: table) -> void`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| handler | function | 是 | 处理函数 |
| filter | table | 否 | 过滤配置，按 meta_event_type 过滤 |

**返回**: 无返回值

**示例**:
```lua
-- 原用法：接收所有元事件
on_meta_event(function(event)
    -- 处理元事件
end)

-- 只处理生命周期事件，过滤掉心跳
on_meta_event(function(event)
    log.info("lifecycle:", event.meta_event_type)
end, {
    whitelistTypes = { "meta_event.lifecycle" },
})
```

> **过滤规则说明**：
> 1. `whitelist*` 数组非空时，**必须命中其一**才放行；为空则不限制。
> 2. `blacklist*` 数组中**任一命中即丢弃**；为空则不限制。
> 3. 类型匹配支持精确、前缀（如 `"message"` 匹配 `"message.group"` / `"message.private"`）以及 `sub.xxx` 形式匹配 `sub_type` 字段。
> 4. 事件级过滤独立于插件全局 `config.filter`，可与全局过滤**叠加生效**（两者均需通过）。

#### `on_bot_status_change`

**签名**: `on_bot_status_change(handler: function) -> void`

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| handler | function | 是 | 处理函数 |

**返回**: 无返回值

**示例**:
```lua
on_bot_status_change(function(event)
    log.info("机器人状态变化")
end)
```

## 事件系统
### 事件类型
```
-- 消息事件
on_message(function(event)
    -- event包含:
    --   post_type: "message"
    --   message_type: "group"/
    "private"
    --   user_id: 发送者ID
    --   group_id: 群号（群消息）
    --   message: 消息内容（数组格
    式）
    --   raw_message: 原始消息字
    符串
    --   plain_text: 纯文本内容
    --   message_id: 消息ID
    --   time: 发送时间戳
    --   sender: 发送者信息表
end)

-- 通知事件
on_notice(function(event)
    -- 群文件上传、管理员变动、群成
    员变动、群禁言、好友添加等
end)

-- 请求事件
on_request(function(event)
    -- 好友添加请求、群添加请求
end)

-- 消息发送事件
on_message_sent(function(event)
    -- 机器人发送消息后的回调
end)

-- 机器人状态变化事件
on_bot_status_change(function
(event)
    -- 在线状态变化
end)
```
### 事件数据结构 群消息事件
```
{
    post_type = "message",
    message_type = "group",
    time = 1234567890,
    self_id = "123456789",
    user_id = "987654321",
    group_id = "123456789",
    message_id = "12345",
    message = {
        {type = "text", data = 
        {text = "你好"}},
        {type = "at", data = 
        {qq = "123456789"}},
        {type = "image", data = 
        {url = "http://...", 
        file = "..."}}
    },
    raw_message = "你好[CQ:at,
    qq=123456789]",
    plain_text = "你好",
    sender = {
        user_id = "987654321",
        nickname = "用户昵称",
        card = "群名片",
        role = "member",  -- 
        owner/admin/member
        title = "专属头衔"
    }
}
``` 私聊消息事件
```
{
    post_type = "message",
    message_type = "private",
    time = 1234567890,
    self_id = "123456789",
    user_id = "987654321",
    message_id = "12345",
    message = {...},
    raw_message = "...",
    plain_text = "...",
    sender = {
        user_id = "987654321",
        nickname = "用户昵称"
    }
}
```
## 完整示例
### 示例1: 简单的关键词回复插件
```
-- 插件信息
plugin.name = "keyword_reply"
plugin.version = "1.0.0"
plugin.description = "关键词自动
回复插件"

-- 配置
local replies = {
    ["你好"] = "你好呀！",
    ["帮助"] = "我可以帮你：查询天
    气、讲笑话、查资料",
    ["时间"] = function()
        return "当前时间: " .. 
        os.date("%Y-%m-%d 
        %H:%M:%S")
    end
}

function on_init()
    log.info("关键词回复插件已启动
    ")
end

on_message(function(event)
    local text = msg.
    get_plain_text(event)
    
    for keyword, reply in pairs
    (replies) do
        if text:find(keyword) 
        then
            local response
            if type(reply) == 
            "function" then
                response = reply
                ()
            else
                response = reply
            end
            
            if msg.
            is_group_message
            (event) then
                message.
                send_group
                (event.
                group_id, 
                response)
            else
                message.
                send_private
                (event.user_id, 
                response)
            end
            break
        end
    end
end)

function on_destroy()
    log.info("关键词回复插件已停止
    ")
end
```
### 示例2: 群管助手插件
```
plugin.name = "group_manager"
plugin.version = "2.0.0"
plugin.description = "群管助手 - 
提供禁言、踢人等功能"

-- 管理员QQ列表
local admins = {
    ["123456789"] = true,
    ["987654321"] = true
}

-- 检查是否为管理员
local function isAdmin(userId)
    return admins[userId] == 
    true or msg.is_sender_owner
    (__blc_var___) or msg.
    is_sender_admin
    (__blc_var___)
end

on_message(function(event)
    if not msg.is_group_message
    (event) then
        return
    end
    
    local text = msg.
    get_plain_text(event)
    local userId = tostring(msg.
    get_sender_id(event))
    
    -- 禁言命令
    if text:find("^禁言%s+%d+%s
    +%d+$") then
        if not isAdmin(userId) 
        then
            message.reply_group
            (event.group_id, 
            event.message_id, "
            你没有权限使用此命令")
            return
        end
        
        local targetId, 
        duration = text:match("^
        禁言%s+(%d+)%s+(%d+)$")
        group.set_ban(event.
        group_id, targetId, 
        tonumber(duration) * 60)
        message.reply_group
        (event.group_id, event.
        message_id, "已禁言 
        " .. duration .. " 分钟
        ")
    end
    
    -- 解除禁言命令
    if text:find("^解除禁言%s+%d
    +$") then
        if not isAdmin(userId) 
        then
            return
        end
        
        local targetId = 
        text:match("^解除禁言%s
        +(%d+)$")
        group.set_ban(event.
        group_id, targetId, 0)
        message.reply_group
        (event.group_id, event.
        message_id, "已解除禁言")
    end
    
    -- 踢人命令
    if text:find("^踢出%s+%d
    +$") then
        if not isAdmin(userId) 
        then
            return
        end
        
        local targetId = 
        text:match("^踢出%s+(%d
        +)$")
        group.kick(event.
        group_id, targetId, 
        false)
        message.reply_group
        (event.group_id, event.
        message_id, "已踢出该成员
        ")
    end
    
    -- 全员禁言
    if text == "全员禁言" then
        if not isAdmin(userId) 
        then
            return
        end
        group.set_whole_ban
        (event.group_id, true)
        message.send_group
        (event.group_id, "已开启
        全员禁言")
    end
    
    -- 解除全员禁言
    if text == "解除全员禁言" 
    then
        if not isAdmin(userId) 
        then
            return
        end
        group.set_whole_ban
        (event.group_id, false)
        message.send_group
        (event.group_id, "已解除
        全员禁言")
    end
end)
```
### 示例3: 定时任务插件
```
plugin.name = "scheduled_tasks"
plugin.version = "1.0.0"
plugin.description = "定时任务示
例"

function on_init()
    log.info("定时任务插件已启动")
    
    -- 每天早上8点发送问候
    scheduler.daily(8, 0, 0, 
    function()
        local groups = group.
        get_list()
        for _, g in ipairs
        (groups) do
            message.send_group
            (g.group_id, "早上
            好！新的一天开始了~")
        end
    end)
    
    -- 每周一早上9点发送周报提醒
    scheduler.weekly(1, 9, 0, 
    0, function()
        local groups = group.
        get_list()
        for _, g in ipairs
        (groups) do
            message.send_group
            (g.group_id, "周一早
            上好！记得提交周报哦~")
        end
    end)
    
    -- 每5分钟检查一次系统状态
    scheduler.interval(300, 
    function()
        log.info("系统状态检查...
        ")
        -- 执行检查逻辑
    end)
end

function on_destroy()
    log.info("定时任务插件已停止")
end
```
### 示例4: 使用数据库存储的签到插件
```
plugin.name = "check_in"
plugin.version = "1.0.0"
plugin.description = "群签到系统"

-- 打开数据库
local db = db.open
("checkin_data")

on_message(function(event)
    if not msg.is_group_message
    (event) then
        return
    end
    
    local text = msg.
    get_plain_text(event)
    local userId = msg.
    get_sender_id(event)
    local groupId = event.
    group_id
    
    if text == "签到" then
        -- 查询今日是否已签到
        local today = os.date
        ("%Y-%m-%d")
        local records = db:query
        ({
            user_id = userId,
            group_id = groupId,
            date = today
        })
        
        if #records > 0 then
            message.reply_group
            (groupId, event.
            message_id, "你今天已
            经签到过了！")
            return
        end
        
        -- 查询连续签到天数
        local allRecords = 
        db:query({user_id = 
        userId, group_id = 
        groupId})
        local streak = 1
        
        -- 插入签到记录
        db:insert({
            user_id = userId,
            group_id = groupId,
            date = today,
            time = os.time()
        })
        
        message.reply_group
        (groupId, event.
        message_id, 
            "签到成功！连续签到 
            " .. streak .. " 天
            ")
    end
    
    if text == "签到排行" then
        local records = db:query
        ({group_id = groupId})
        -- 统计每个人的签到次数
        local stats = {}
        for _, r in ipairs
        (records) do
            stats[r.user_id] = 
            (stats[r.user_id] 
            or 0) + 1
        end
        
        -- 排序并显示前10名
        local sorted = {}
        for uid, count in pairs
        (stats) do
            table.insert
            (sorted, {user_id = 
            uid, count = count})
        end
        table.sort(sorted, 
        function(a, b) return a.
        count > b.count end)
        
        local msg_text = "🏆 签
        到排行榜 TOP10\n"
        for i = 1, math.min(10, 
        #sorted) do
            msg_text = 
            msg_text .. i .. ". 
            " .. sorted[i].
            user_id .. " - " .. 
            sorted[i].count .. "
            次\n"
        end
        
        message.send_group
        (groupId, msg_text)
    end
end)
```
## 最佳实践
### 1. 错误处理
```
-- 始终检查API返回值
local success, result = message.
send_group(123456789, "消息")
if not success then
    log.error("发送消息失败: 
    " .. tostring(result))
end

-- 使用pcall保护危险操作
local ok, err = pcall(function()
    -- 可能出错的操作
end)
if not ok then
    log.error("操作失败: " .. 
    err)
end
```
### 2. 性能优化
```
-- 避免在事件处理器中执行耗时操作
-- 如需执行，使用异步方式

on_message(function(event)
    -- 快速响应
    message.reply_group(event.
    group_id, event.message_id, 
    "处理中...")
    
    -- 耗时操作放到后面或使用
    coroutine
    -- ...
end)
```
### 3. 安全配置
```
-- 始终验证操作权限
local function isAuthorized
(userId)
    -- 验证用户是否在白名单中
    return whitelist[userId] == 
    true
end

-- 限制操作频率
local lastOperation = {}
on_message(function(event)
    local userId = msg.
    get_sender_id(event)
    local now = os.time()
    
    if lastOperation[userId] 
    and now - lastOperation
    [userId] < 60 then
        message.reply_group
        (event.group_id, event.
        message_id, "操作太频繁，
        请稍后再试")
        return
    end
    
    lastOperation[userId] = now
    -- 执行操作
end)
```
### 4. 代码组织
```
-- 将功能模块化
local function handleCommand
(event, command)
    -- 命令处理逻辑
end

local function handleMessage
(event)
    -- 消息处理逻辑
end

on_message(function(event)
    local text = msg.
    get_plain_text(event)
    
    if text:sub(1, 1) == "/" 
    then
        handleCommand(event, 
        text)
    else
        handleMessage(event)
    end
end)
```
### 5. 日志记录
```
-- 记录关键操作
log.info("用户 " .. userId .. " 
执行了 " .. command)

-- 使用结构化日志
log.info({
    action = "send_message",
    target = groupId,
    content_length = #message
})
```

### 6. gopher-lua 大数字 Key 内存问题

在使用哈希表存储用户ID等大数字时，**禁止使用数字作为表的 key**，否则会导致严重的内存问题。

**错误示例（内存暴涨）**：
```lua
local BLACKLIST = {
    [2970293688] = true,     -- 大数字作为key
    [2265407768] = true,
    [66600000] = true
}

-- 查询时也会导致问题
local uid = tonumber(friend.user_id)
if BLACKLIST[uid] then  -- 使用数字key查询
    -- 过滤
end
```

**正确示例（内存正常）**：
```lua
local BLACKLIST = {
    ["2970293688"] = true,   -- 字符串作为key
    ["2265407768"] = true,
    ["66600000"] = true
}

-- 查询时转换为字符串
local uid = tonumber(friend.user_id)
local uid_str = tostring(uid)
if uid and not BLACKLIST[uid_str] then  -- 使用字符串key查询
    -- 过滤
end
```

**问题原因**：gopher-lua（Go语言实现的Lua虚拟机）在处理大数字作为哈希表key时存在内存分配问题，大数字key会导致内存暴涨数GB。

**适用场景**：用户ID、群号、消息ID等QQ号段的数字都应使用字符串形式存储和查询。