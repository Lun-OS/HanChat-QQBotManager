# 使用教程

本教程将帮助您快速上手使用 HanChat-QQBotManager。

## 第一步：登录系统

1. 打开浏览器，访问 `http://localhost:8080`
2. 使用您在 `.env` 文件中配置的管理员账号和密码登录
3. 登录成功后，您将看到系统仪表盘

## 第二步：添加机器人账号

### 配置 QQ 协议客户端

在添加账号前，您需要先配置 QQ 协议客户端（如 NapCat 或 LLOneBot）：

1. 下载并安装 NapCat：https://github.com/NapNeko/NapCatQQ
2. 打开 NapCat 的配置文件
3. 配置反向 WebSocket 地址：
   ```
   ws://localhost:8080/ws/my_bot
   ```
   其中 `my_bot` 是您自定义的账号名称
4. 配置认证令牌（与 `.env` 文件中的 `WEBSOCKET_AUTHORIZATION` 一致）
5. 启动 NapCat 并登录 QQ 账号

### 在系统中添加账号

1. 登录 Web 管理界面
2. 进入"账号管理"页面
3. 点击"添加账号"
4. 填写账号信息：
   - 自定义名称：`my_bot`（与 WebSocket 路径一致）
   - QQ 号：您的机器人 QQ 号
5. 点击"保存"
6. 账号状态将变为"在线"

## 第三步：使用插件

### 启用模板插件

项目内置了多个模板插件供您使用：

1. 进入"插件管理"页面
2. 选择您的机器人账号
3. 您将看到可用的模板插件列表
4. 点击"复制"将模板插件复制到您的账号目录
5. 点击"启用"启用插件

### 插件列表示例

- **关键词回复**：简单的关键词自动回复
- **群管助手**：支持禁言、踢人、撤回等功能
- **违禁词处理**：自动检测和处理违禁词
- **群消息同步**：在多个群之间同步消息

## 第四步：开发您的第一个插件

### 使用 Blockly 可视化编程

1. 进入"Blockly 编辑器"页面
2. 选择您的机器人账号
3. 使用拖拽方式创建插件逻辑
4. 示例：创建一个简单的关键词回复
   - 从左侧工具箱拖拽"消息事件"块
   - 拖拽"包含关键词"判断块
   - 拖拽"发送群消息"块
   - 连接这些块
5. 点击"保存"并为插件命名
6. 点击"运行"测试插件

### 使用 Lua 脚本开发

如果您需要更复杂的功能，可以使用 Lua 脚本：

1. 在 `plugins/{QQ号}/` 目录下创建新文件夹，如 `my_first_plugin`
2. 创建 `main.lua` 文件：

```lua
plugin.name = "my_first_plugin"
plugin.version = "1.0.0"
plugin.description = "我的第一个插件"

function on_init()
    log.info("插件已启动！")
end

on_message(function(event)
    if msg.contains_keyword(event, "你好") then
        local groupId = msg.get_group_id(event)
        message.send_group(groupId, "你好！很高兴见到你！")
    end
end)

function on_destroy()
    log.info("插件已停止")
end
```

3. 在 Web 界面刷新插件列表
4. 启用您的插件

更多详细信息请参考 [插件开发](./plugin-development.md) 和 [插件开发手册](../plugins/template/插件开发手册.md)。

## 第五步：使用 WebQQ 聊天

系统内置了 WebQQ 功能，您可以直接在浏览器中聊天：

1. 进入"WebQQ"页面
2. 选择您的机器人账号
3. 在左侧选择好友或群组
4. 在输入框中输入消息并发送

## 第六步：查看日志

系统会记录所有消息和操作日志：

1. 进入"日志"页面
2. 选择日志类型和时间范围
3. 查看日志内容
4. 支持搜索和过滤功能

## 进阶使用

### 创建 HTTP 接口

您的插件可以创建自定义 HTTP 接口：

```lua
local selfId = tostring(plugin.self_id)

function on_init()
    http_interface.register("status", selfId, function(request)
        return {
            status = 200,
            headers = { ["Content-Type"] = "application/json" },
            body = '{"status": "ok"}'
        }
    end, {"GET"})
end
```

访问地址：`http://localhost:8080/plugins/{QQ号}/status`

### 使用数据存储

插件可以持久化存储数据：

```lua
-- 存储数据
storage.set("count", 100)
storage.set("user", {name = "张三", level = 10})

-- 读取数据
local count = storage.get("count", 0)
local user = storage.get("user", {})
```

## 下一步

- 阅读 [API 文档](./api.md) 了解所有可用接口
- 阅读 [插件开发](./plugin-development.md) 深入学习插件开发
- 查看 [常见问题](./faq.md) 解决使用中的问题
