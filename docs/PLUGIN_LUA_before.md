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
