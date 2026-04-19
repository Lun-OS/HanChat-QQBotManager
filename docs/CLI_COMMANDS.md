# HanChat-QQBotManager 控制台命令文档

## 目录
1. [启动方式](#启动方式)
2. [命令使用规范](#命令使用规范)
3. [基础命令](#基础命令)
4. [机器人管理命令](#机器人管理命令)
5. [Lua 容器管理命令](#lua-容器管理命令)
6. [Lua 插件管理命令](#lua-插件管理命令)
7. [Lua 交互模式命令](#lua-交互模式命令)
8. [日志管理命令](#日志管理命令)
9. [系统管理命令](#系统管理命令)
10. [消息管理命令](#消息管理命令)
11. [群组管理命令](#群组管理命令)
12. [用户管理命令](#用户管理命令)
13. [通知消息命令](#通知消息命令)
14. [缓存管理命令](#缓存管理命令)
15. [配置管理命令](#配置管理命令)
16. [高级 API 调用命令](#高级-api-调用命令)
17. [常见问题](#常见问题)
18. [命令速查表](#命令速查表)

---

## 启动方式

### 正常启动
```bash
.\app.exe
```
日志输出到文件，控制台显示简洁信息。

### 调试模式启动
```bash
.\app.exe --debug
```
日志输出到终端，便于实时查看程序运行状态。

### 使用脚本启动
```bash
.\debug.ps1
```
自动以调试模式启动程序。

---

## 命令使用规范

### 参数说明
- `<参数>` - 必需参数，需要替换为实际值
- `[参数]` - 可选参数，可根据需要添加
- `|` - 表示多个选项中的一个

### ID 格式
- **Self ID**: 机器人的 QQ 号（数字字符串）
- **Group ID**: QQ 群号（数字字符串）
- **User ID**: QQ 用户号（数字字符串）
- **Message ID**: 消息 ID（数字字符串）

### 注意事项
1. 所有 ID 都应该是纯数字字符串
2. 消息内容如果包含空格，需要用引号包裹
3. JSON 参数必须格式正确
4. 命令和参数之间用空格分隔

---

## 基础命令

### /help - 帮助命令

**功能**：显示所有可用命令或查看指定命令的详细用法。

**语法**：
```bash
# 显示所有命令列表
/help

# 查看指定命令的详细用法
/help <command>
```

**参数**：
- `command` - 要查看帮助的命令名称（可选）

**示例**：
```bash
# 显示所有命令
/help

# 查看 bot 命令的详细用法
/help bot

# 查看 log 命令的详细用法
/help log
```

**输出示例**：
```
命令: /bot
描述: 机器人管理命令
用法: /bot [list|status <self_id>]
```

---

### /clear - 清空控制台

**功能**：清空控制台屏幕，使命令行界面更整洁。

**语法**：
```bash
/clear
```

**参数**：无

**示例**：
```bash
/clear
```

---

### /exit 或 /quit - 退出程序

**功能**：安全退出程序，关闭所有连接和资源。

**语法**：
```bash
/exit
# 或
/quit
```

**参数**：无

**示例**：
```bash
/exit
```

**注意**：退出前会自动保存配置和清理资源。

---

## 机器人管理命令

### /bot - 机器人管理

**功能**：管理机器人账号，查看机器人列表和状态。

**语法**：
```bash
# 列出所有机器人账号
/bot list

# 查看指定机器人状态
/bot status <self_id>
```

**参数**：
- `self_id` - 机器人的 QQ 号

**子命令**：
- `list` - 列出所有机器人账号
- `status` - 查看指定机器人的详细状态

**示例**：
```bash
# 列出所有机器人
/bot list

# 查看指定机器人状态
/bot status 123456789
```

**输出示例**：
```
机器人账号列表:
================
  SelfID: 123456789
  CustomName: Bot1
  Status: 在线
  Last Connected: 2026-04-15 10:30:25
  -------------------
  SelfID: 987654321
  CustomName: Bot2
  Status: 离线
  -------------------
```

---

## Lua 容器管理命令

### /container - Lua 容器管理

**功能**：管理 Lua 插件容器，每个机器人账号有独立的容器。

**语法**：
```bash
# 列出所有 Lua 容器
/container list

# 创建指定账号的 Lua 容器
/container create <self_id>

# 删除指定账号的 Lua 容器（提示手动删除目录）
/container delete <self_id>
```

**参数**：
- `self_id` - 机器人的 QQ 号

**子命令**：
- `list` - 列出所有 Lua 容器
- `create` - 创建容器（实际是创建插件目录）
- `delete` - 提示手动删除容器目录

**示例**：
```bash
# 列出所有容器
/container list

# 为机器人 123456789 创建容器
/container create 123456789

# 删除机器人 123456789 的容器
/container delete 123456789
```

**输出示例**：
```
Lua容器列表:
==============
  SelfID: 123456789
  CustomName: Bot1
  运行插件数: 3
  -------------------
```

**注意**：删除容器只是提示手动删除目录，实际文件需要手动清理。

---

## Lua 插件管理命令

### /plugin - Lua 插件管理

**功能**：管理 Lua 插件的加载、卸载和状态查看。

**语法**：
```bash
# 列出所有插件（可指定账号）
/plugin list [self_id]

# 加载插件到指定账号
/plugin load <self_id> <name>

# 卸载指定账号的插件
/plugin unload <self_id> <name>

# 查看插件详细状态
/plugin status <self_id> <name>
```

**参数**：
- `self_id` - 机器人的 QQ 号（可选，用于 list 命令）
- `name` - 插件名称

**子命令**：
- `list` - 列出插件
- `load` - 加载插件
- `unload` - 卸载插件
- `status` - 查看插件状态

**示例**：
```bash
# 列出所有插件
/plugin list

# 列出指定账号的插件
/plugin list 123456789

# 加载插件
/plugin load 123456789 welcome_plugin

# 卸载插件
/plugin unload 123456789 welcome_plugin

# 查看插件状态
/plugin status 123456789 welcome_plugin
```

**输出示例**：
```
插件列表:
==========
  Name: welcome_plugin
  SelfID: 123456789
  Status: 运行中
  Version: 1.0.0
  Remark: 欢迎插件
  -------------------
```

**插件状态说明**：
- `未运行` - 插件已安装但未启动
- `已启用` - 插件已启用但未运行
- `运行中` - 插件正在运行

---

## Lua 交互模式命令

### /lua - 进入 Lua 交互模式

**功能**：进入 Lua 容器或插件的交互模式，可以直接执行 Lua 代码进行调试。

**语法**：
```bash
# 进入账号的 Lua 容器交互模式
/lua <self_id>

# 进入指定插件的 Lua 交互模式
/lua <self_id> <plugin_name>
```

**参数**：
- `self_id` - 机器人的 QQ 号
- `plugin_name` - 插件名称（可选）

**交互模式命令**：
- `exit` 或 `quit` - 退出交互模式
- 其他输入将作为 Lua 代码执行

**示例**：
```bash
# 进入容器交互模式
/lua 123456789

# 进入插件交互模式
/lua 123456789 myplugin
```

**交互模式示例**：
```
进入账号 [123456789] 的Lua容器交互模式
提示: 输入 'exit' 或 'quit' 退出交互模式
安全限制: 最大执行时间 30 秒，最大指令数 1000 万

lua[123456789]> print("Hello World")
=> Hello World

lua[123456789]> a = 1 + 1
lua[123456789]> return a
=> 2

lua[123456789]> exit
退出Lua交互模式
```

**安全限制**：
- 最大执行时间：30 秒
- 最大指令数：1000 万
- 支持 panic 捕获，防止崩溃
- 堆栈深度限制：1000

**可用库**：
- base 库
- table 库
- string 库
- math 库

**注意**：
- 容器模式使用独立的 Lua 状态
- 插件模式在插件上下文中执行，可以访问插件变量和函数
- 危险函数（dofile, loadfile）已被移除

---

## 日志管理命令

### /log - 日志管理

**功能**：查看系统日志、WebSocket 日志和插件日志。支持实时输出和按数量查看。

**语法**：
```bash
# 实时输出系统日志（按 Ctrl+C 停止）
/log
# 或
/log system

# 查看 WebSocket 日志
/log ws <self_id> [limit]

# 查看插件日志
/log plugin <self_id> <plugin_name> [limit]
```

**参数**：
- `self_id` - 机器人的 QQ 号
- `plugin_name` - 插件名称
- `limit` - 查看的日志条数（可选，默认 100）

**子命令**：
- `system` - 实时输出系统日志
- `ws` - 查看 WebSocket 日志
- `plugin` - 查看插件日志

**示例**：
```bash
# 实时查看系统日志
/log

# 实时查看系统日志（明确指定）
/log system

# 查看 WebSocket 日志（默认 100 条）
/log ws 123456789

# 查看 WebSocket 日志（指定 50 条）
/log ws 123456789 50

# 查看插件日志（默认 100 条）
/log plugin 123456789 myplugin

# 查看插件日志（指定 200 条）
/log plugin 123456789 myplugin 200
```

**实时日志输出示例**：
```
正在实时输出系统日志...
提示: 按 Ctrl+C 停止输出，然后可以继续输入命令
===============================================

[2026-04-15 10:30:25.123] [INFO] 服务器启动成功
[2026-04-15 10:30:25.456] [INFO] WebSocket连接已建立
[2026-04-15 10:30:26.789] [DEBUG] 收到消息: {...}
...

[已停止日志输出，可以继续输入命令]
```

**注意**：
- 实时查看日志时，按 `Ctrl+C` 停止输出
- 停止后可以正常输入其他命令
- 日志文件位置：`./logs/combined.log`
- WebSocket 日志和插件日志从内存中获取

---

## 系统管理命令

### /system - 系统管理

**功能**：查看系统信息、机器人状态和服务器状态。

**语法**：
```bash
# 获取机器人状态
/system status

# 获取系统信息
/system info

# 获取服务器状态（CPU、内存、网络等）
/system server
```

**子命令**：
- `status` - 获取机器人状态
- `info` - 获取系统信息
- `server` - 获取服务器状态

**示例**：
```bash
# 获取机器人状态
/system status

# 获取系统信息
/system info

# 获取服务器状态
/system server
```

**输出示例**：
```
服务器状态:
============
系统:
  Platform: windows
  Platform Family: Windows
  Platform Version: 10.0.19044
  Kernel Version: 10.0.19044
  OS: windows

CPU:
  Model: Intel(R) Core(TM) i7-9700K
  Cores: 8
  Usage: 15.23%

内存:
  Total: 16.00 GB
  Used: 8.50 GB
  Available: 7.50 GB
  Usage Percent: 53.12%

网络:
  Upload: 125.50 MB
  Download: 1024.75 MB
```

---

## 消息管理命令

### /msg - 消息管理

**功能**：发送私聊消息、群消息和撤回消息。

**语法**：
```bash
# 发送私聊消息
/msg private <self_id> <user_id> <message>

# 发送群消息
/msg group <self_id> <group_id> <message>

# 撤回消息
/msg delete <self_id> <message_id>
```

**参数**：
- `self_id` - 机器人的 QQ 号
- `user_id` - 目标用户的 QQ 号
- `group_id` - 目标群的群号
- `message` - 消息内容
- `message_id` - 消息 ID

**子命令**：
- `private` - 发送私聊消息
- `group` - 发送群消息
- `delete` - 撤回消息

**示例**：
```bash
# 发送私聊消息
/msg private 123456789 987654321 你好，很高兴认识你！

# 发送群消息
/msg group 123456789 123456789 大家好，我是机器人助手

# 撤回消息
/msg delete 123456789 12345
```

**注意**：
- 消息内容如果包含空格，需要用引号包裹
- 撤回消息需要在消息发送后 2 分钟内
- 只能撤回自己发送的消息

---

## 群组管理命令

### /group - 群组管理

**功能**：查看群组列表、群信息和群成员列表。

**语法**：
```bash
# 获取群列表
/group list <self_id>

# 获取群信息
/group info <self_id> <group_id>

# 获取群成员列表
/group members <self_id> <group_id>
```

**参数**：
- `self_id` - 机器人的 QQ 号
- `group_id` - 群号

**子命令**：
- `list` - 获取群列表
- `info` - 获取群信息
- `members` - 获取群成员列表

**示例**：
```bash
# 获取群列表
/group list 123456789

# 获取群信息
/group info 123456789 987654321

# 获取群成员列表
/group members 123456789 987654321
```

**输出示例**：
```
群列表:
========
  GroupID: 987654321, Name: 测试群1
  GroupID: 987654322, Name: 测试群2

共 2 个群
```

---

### /groupadmin - 群组管理员命令

**功能**：群组管理员操作，包括踢人、设置群名片、设置管理员。

**语法**：
```bash
# 踢出群成员
/groupadmin kick <self_id> <group_id> <user_id>

# 设置群名片
/groupadmin setcard <self_id> <group_id> <user_id> <card>

# 设置/取消管理员
/groupadmin setadmin <self_id> <group_id> <user_id> <true|false>
```

**参数**：
- `self_id` - 机器人的 QQ 号
- `group_id` - 群号
- `user_id` - 目标用户的 QQ 号
- `card` - 群名片
- `true|false` - 设置或取消管理员

**子命令**：
- `kick` - 踢出群成员
- `setcard` - 设置群名片
- `setadmin` - 设置/取消管理员

**示例**：
```bash
# 踢出群成员
/groupadmin kick 123456789 987654321 111111111

# 设置群名片
/groupadmin setcard 123456789 987654321 111111111 新名片

# 设置管理员
/groupadmin setadmin 123456789 987654321 111111111 true

# 取消管理员
/groupadmin setadmin 123456789 987654321 111111111 false
```

**注意**：
- 需要机器人是群主或管理员
- 不能踢出群主和其他管理员
- 设置管理员需要群主权限

---

### /mute - 群禁言管理

**功能**：管理群禁言，包括全员禁言和单个用户禁言。

**语法**：
```bash
# 开启/关闭全员禁言
/mute all <self_id> <group_id> <true|false>

# 禁言/解除禁言指定用户
/mute user <self_id> <group_id> <user_id> <seconds>
```

**参数**：
- `self_id` - 机器人的 QQ 号
- `group_id` - 群号
- `user_id` - 目标用户的 QQ 号
- `true|false` - 开启或关闭全员禁言
- `seconds` - 禁言秒数（0 表示解除禁言）

**子命令**：
- `all` - 全员禁言
- `user` - 单个用户禁言

**示例**：
```bash
# 开启全员禁言
/mute all 123456789 987654321 true

# 关闭全员禁言
/mute all 123456789 987654321 false

# 禁言用户 300 秒（5 分钟）
/mute user 123456789 987654321 111111111 300

# 禁言用户 1 小时
/mute user 123456789 987654321 111111111 3600

# 解除用户禁言
/mute user 123456789 987654321 111111111 0
```

**常用禁言时间**：
- 5 分钟：300 秒
- 10 分钟：600 秒
- 30 分钟：1800 秒
- 1 小时：3600 秒
- 1 天：86400 秒
- 30 天：2592000 秒

**注意**：
- 需要机器人是群主或管理员
- 不能禁言群主和其他管理员
- 全员禁言需要管理员权限

---

## 用户管理命令

### /user - 用户管理

**功能**：管理好友，查看好友列表、登录信息和删除好友。

**语法**：
```bash
# 获取好友列表
/user list <self_id>

# 获取登录信息
/user info <self_id>

# 删除好友
/user delete <self_id> <user_id>
```

**参数**：
- `self_id` - 机器人的 QQ 号
- `user_id` - 目标用户的 QQ 号

**子命令**：
- `list` - 获取好友列表
- `info` - 获取登录信息
- `delete` - 删除好友

**示例**：
```bash
# 获取好友列表
/user list 123456789

# 获取登录信息
/user info 123456789

# 删除好友
/user delete 123456789 987654321
```

**输出示例**：
```
好友列表:
==========
  UserID: 987654321, Nickname: 张三, Remark: 好友1
  UserID: 987654322, Nickname: 李四, Remark: 好友2

共 2 个好友
```

---

## 通知消息命令

### /notice - 发送通知类消息

**功能**：发送戳一戳等通知消息。

**语法**：
```bash
# 在群中戳一戳用户
/notice poke <self_id> <group_id> <user_id>

# 戳一戳好友
/notice nudge <self_id> <user_id>
```

**参数**：
- `self_id` - 机器人的 QQ 号
- `group_id` - 群号
- `user_id` - 目标用户的 QQ 号

**子命令**：
- `poke` - 在群中戳一戳
- `nudge` - 戳一戳好友

**示例**：
```bash
# 在群中戳一戳用户
/notice poke 123456789 987654321 111111111

# 戳一戳好友
/notice nudge 123456789 987654321
```

**注意**：
- 戳一戳需要是好友或在同一个群
- 频繁戳一戳可能会被限制

---

## 缓存管理命令

### /cache - 缓存管理

**功能**：管理缓存，清理缓存和查看缓存状态。

**语法**：
```bash
# 清理缓存
/cache clean <self_id>

# 获取缓存状态
/cache status <self_id>
```

**参数**：
- `self_id` - 机器人的 QQ 号

**子命令**：
- `clean` - 清理缓存
- `status` - 获取缓存状态

**示例**：
```bash
# 清理缓存
/cache clean 123456789

# 获取缓存状态
/cache status 123456789
```

**注意**：
- 清理缓存可能会影响性能，建议在低峰期执行
- 缓存状态显示版本信息

---

## 配置管理命令

### /config - 配置管理

**功能**：管理配置信息，查看和修改配置项。

**语法**：
```bash
# 获取配置信息
/config get

# 设置配置项
/config set <key> <value>
```

**参数**：
- `key` - 配置项名称
- `value` - 配置项值

**子命令**：
- `get` - 获取配置信息
- `set` - 设置配置项

**支持的配置项**：

| 配置项 | 说明 |
|--------|------|
| `websocket_authorization` | WebSocket 授权 Token |

**示例**：
```bash
# 获取配置信息
/config get

# 设置 WebSocket 授权 Token
/config set websocket_authorization new_token_here
```

**输出示例**：
```
配置信息:
==========
  WebSocket Authorization: your_token_here
  WebSocket Port: 8080
```

**注意**：
- 修改配置后会立即生效
- WebSocket Token 修改后需要重新连接

---

## 高级 API 调用命令

### /api - 直接调用机器人 API

**功能**：直接调用机器人的 OneBot API 接口，可以执行任意支持的 API 操作。

**语法**：
```bash
/api <self_id> <action> [params_json]
```

**参数**：
- `self_id` - 机器人的 QQ 号
- `action` - API 动作名称
- `params_json` - JSON 格式的参数（可选）

**示例**：
```bash
# 获取好友列表
/api 123456789 get_friend_list

# 获取群信息
/api 123456789 get_group_info {"group_id":"987654321"}

# 发送私聊消息
/api 123456789 send_private_msg {"user_id":"987654321","message":"你好"}

# 发送群消息
/api 123456789 send_group_msg {"group_id":"987654321","message":"大家好"}

# 获取消息
/api 123456789 get_msg {"message_id":"12345"}

# 获取登录信息
/api 123456789 get_login_info

# 获取版本信息
/api 123456789 get_version_info
```

**常用 API 列表**：

### 账号相关
| API | 说明 |
|-----|------|
| `get_login_info` | 获取登录信息 |
| `get_version_info` | 获取版本信息 |
| `get_status` | 获取状态 |

### 消息相关
| API | 说明 |
|-----|------|
| `send_private_msg` | 发送私聊消息 |
| `send_group_msg` | 发送群消息 |
| `delete_msg` | 撤回消息 |
| `get_msg` | 获取消息 |
| `get_forward_msg` | 获取合并转发消息 |

### 好友相关
| API | 说明 |
|-----|------|
| `get_friend_list` | 获取好友列表 |
| `get_friend_info` | 获取好友信息 |
| `delete_friend` | 删除好友 |

### 群组相关
| API | 说明 |
|-----|------|
| `get_group_list` | 获取群列表 |
| `get_group_info` | 获取群信息 |
| `get_group_member_list` | 获取群成员列表 |
| `get_group_member_info` | 获取群成员信息 |
| `set_group_kick` | 踢出群成员 |
| `set_group_ban` | 禁言群成员 |
| `set_group_whole_ban` | 全员禁言 |
| `set_group_admin` | 设置群管理员 |
| `set_group_card` | 设置群名片 |
| `set_group_name` | 设置群名 |
| `set_group_leave` | 退出群组 |

### 其他
| API | 说明 |
|-----|------|
| `clean_cache` | 清理缓存 |
| `get_cookies` | 获取 Cookies |
| `get_csrf_token` | 获取 CSRF Token |

**注意**：
- JSON 参数必须格式正确
- 字符串参数需要用双引号包裹
- 详细 API 文档请参考 OneBot 标准

---

## 常见问题

### Q: 如何查看实时日志？
**A**: 使用 `/log` 或 `/log system` 命令，按 `Ctrl+C` 停止。

### Q: 如何调试 Lua 插件？
**A**: 使用 `/lua <self_id> <plugin_name>` 进入插件交互模式，直接执行 Lua 代码。

### Q: 如何发送包含空格的消息？
**A**: 消息内容如果包含空格，整个消息需要用引号包裹。

### Q: 如何获取消息 ID？
**A**: 消息 ID 通常在消息事件中获取，可以使用 `/api` 命令配合 `get_msg` 获取历史消息。

### Q: 为什么有些命令执行失败？
**A**: 可能的原因：
- 机器人没有权限（需要群主或管理员）
- 目标用户不存在
- 参数格式错误
- 网络连接问题

### Q: 如何退出 Lua 交互模式？
**A**: 输入 `exit` 或 `quit` 即可退出。

### Q: 如何停止实时日志输出？
**A**: 按 `Ctrl+C` 停止日志输出，然后可以继续输入其他命令。

---

## 命令速查表

| 命令 | 功能 | 常用示例 |
|------|------|----------|
| `/help` | 显示帮助 | `/help`, `/help bot` |
| `/clear` | 清空控制台 | `/clear` |
| `/exit` `/quit` | 退出程序 | `/exit` |
| `/bot list` | 列出机器人 | `/bot list` |
| `/bot status` | 机器人状态 | `/bot status 123456789` |
| `/container list` | 列出容器 | `/container list` |
| `/container create` | 创建容器 | `/container create 123456789` |
| `/plugin list` | 列出插件 | `/plugin list 123456789` |
| `/plugin load` | 加载插件 | `/plugin load 123456789 myplugin` |
| `/plugin unload` | 卸载插件 | `/plugin unload 123456789 myplugin` |
| `/lua` | Lua 交互模式 | `/lua 123456789`, `/lua 123456789 myplugin` |
| `/log` | 实时系统日志 | `/log` |
| `/log ws` | WebSocket 日志 | `/log ws 123456789 50` |
| `/log plugin` | 插件日志 | `/log plugin 123456789 myplugin` |
| `/system status` | 机器人状态 | `/system status` |
| `/system server` | 服务器状态 | `/system server` |
| `/msg private` | 发送私聊消息 | `/msg private 123456789 987654321 你好` |
| `/msg group` | 发送群消息 | `/msg group 123456789 987654321 大家好` |
| `/msg delete` | 撤回消息 | `/msg delete 123456789 12345` |
| `/group list` | 群列表 | `/group list 123456789` |
| `/group info` | 群信息 | `/group info 123456789 987654321` |
| `/group members` | 群成员 | `/group members 123456789 987654321` |
| `/groupadmin kick` | 踢出成员 | `/groupadmin kick 123456789 987654321 111111111` |
| `/groupadmin setcard` | 设置名片 | `/groupadmin setcard 123456789 987654321 111111111 名片` |
| `/groupadmin setadmin` | 设置管理员 | `/groupadmin setadmin 123456789 987654321 111111111 true` |
| `/mute all` | 全员禁言 | `/mute all 123456789 987654321 true` |
| `/mute user` | 禁言用户 | `/mute user 123456789 987654321 111111111 300` |
| `/user list` | 好友列表 | `/user list 123456789` |
| `/user info` | 登录信息 | `/user info 123456789` |
| `/user delete` | 删除好友 | `/user delete 123456789 987654321` |
| `/notice poke` | 戳一戳(群) | `/notice poke 123456789 987654321 111111111` |
| `/notice nudge` | 戳一戳(好友) | `/notice nudge 123456789 987654321` |
| `/cache clean` | 清理缓存 | `/cache clean 123456789` |
| `/config get` | 获取配置 | `/config get` |
| `/config set` | 设置配置 | `/config set websocket_authorization token` |
| `/api` | 调用 API | `/api 123456789 get_friend_list` |

---

**文档版本**: v1.0  
**最后更新**: 2026-04-15
