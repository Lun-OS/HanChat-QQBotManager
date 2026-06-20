# HanChat Web 控制操作 API 文档

本文档描述 HanChat Web 管理后台提供的 HTTP API，用于网页端控制框架本身、管理账号、插件、系统设置及监控等。区别于 OneBot v11 协议原生接口，本文档聚焦于 **Web 管理端特有的控制接口**。

---

## 目录

- [通用约定](#通用约定)
- [1. 认证管理](#1-认证管理)
- [2. 账号管理](#2-账号管理)
- [3. Bot API 代理](#3-bot-api-代理)
- [4. 插件管理](#4-插件管理)
- [5. 插件文件管理](#5-插件文件管理)
- [6. 插件商店](#6-插件商店)
- [7. 系统设置](#7-系统设置)
- [8. 系统状态与工具](#8-系统状态与工具)
- [9. 日志查询](#9-日志查询)
- [10. WebQQ](#10-webqq)
- [11. 代理管理](#11-代理管理)
- [12. 扩展 API](#12-扩展-api)

---

## 通用约定

### Base URL

```
http://<host>:<port>/
```

默认端口以实际启动配置为准。

### 认证方式

- **公开接口**：`/health`、`/api/version`、`/api/auth/*` 无需认证。
- **受保护接口**：其余 `/api/*` 接口需在请求头中携带 Token：
  ```http
  Authorization: Bearer <token>
  ```
  或者通过 Cookie `auth_token` 传递。

### 响应格式

默认返回 JSON，常见两种结构：

**标准响应（管理类接口）**
```json
{
  "success": true,
  "data": { ... },
  "message": "操作成功"
}
```

**日志/系统响应（部分接口）**
```json
{
  "status": "ok",
  "retcode": 0,
  "data": { ... }
}
```

---

## 1. 认证管理

### 1.1 获取验证码

```
GET /api/auth/captcha
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "captcha_id": "abc123",
    "image_base64": "data:image/png;base64,..."
  }
}
```

---

### 1.2 刷新验证码

```
POST /api/auth/captcha/refresh
```

**请求体**
```json
{
  "captcha_id": "abc123"
}
```

---

### 1.3 登录

```
POST /api/auth/login
```

**请求体**
```json
{
  "username": "admin",
  "password": "your_password",
  "captcha_id": "abc123",
  "captcha_code": "1234"
}
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "token": "jwt_token_string",
    "expires_at": "2026-06-22T10:00:00Z"
  },
  "message": "登录成功"
}
```

---

### 1.4 登出

```
POST /api/auth/logout
```

**响应示例**
```json
{
  "success": true,
  "message": "登出成功"
}
```

---

### 1.5 验证 Token

```
POST /api/auth/verify
```

**说明**：校验当前请求携带的 Token 是否有效。

**响应示例**
```json
{
  "success": true,
  "message": "token有效"
}
```

---

### 1.6 获取封禁 IP 列表

```
GET /api/auth/banip
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "banned_ips": ["192.168.1.100"],
    "count": 1
  }
}
```

---

### 1.7 解封 IP

```
POST /api/auth/unbanip
```

**请求体**
```json
{
  "ip": "192.168.1.100"
}
```

---

## 2. 账号管理

### 2.1 获取所有账号列表

```
GET /api/accounts
```

**响应示例**
```json
{
  "success": true,
  "data": [
    {
      "self_id": "123456789",
      "nickname": "BotA",
      "online": true,
      "plugin_count": 3
    }
  ]
}
```

---

### 2.2 获取指定账号状态

```
GET /api/accounts/:self_id/status
```

**路径参数**
| 参数 | 类型 | 说明 |
|------|------|------|
| self_id | string | 机器人 QQ 号 |

---

## 3. Bot API 代理

### 3.1 通用 OneBot API 调用通道

```
POST /api/bot/:self_id/:apiName
GET  /api/bot/:self_id/:apiName
```

**路径参数**
| 参数 | 类型 | 说明 |
|------|------|------|
| self_id | string | 机器人 QQ 号 |
| apiName | string | OneBot API 名称，如 `send_private_msg` |

**请求体**：OneBot 对应 API 的参数对象。

**示例**：发送私聊消息
```
POST /api/bot/123456789/send_private_msg
```
```json
{
  "user_id": 987654321,
  "message": "你好"
}
```

---

### 3.2 旧版兼容格式

```
POST /api/:self_id/:apiName
```

功能与 `/api/bot/:self_id/:apiName` 一致，为旧版前端兼容保留。

---

## 4. 插件管理

### 4.1 获取插件列表

```
GET /api/plugins/list
```

**查询参数**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| self_id | string | 否 | 指定账号，若提供则只返回该账号插件 |

**响应示例**
```json
{
  "success": true,
  "data": [
    {
      "name": "hello.lua",
      "type": "lua",
      "size": 1024,
      "modified_time": "2026-06-20 12:00:00"
    }
  ]
}
```

---

### 4.2 加载插件

```
POST /api/plugins/load
```

**请求体**
```json
{
  "self_id": "123456789",
  "name": "hello.lua"
}
```

---

### 4.3 卸载插件

```
POST /api/plugins/unload
```

**请求体**
```json
{
  "self_id": "123456789",
  "name": "hello.lua"
}
```

---

### 4.4 重启插件

```
POST /api/plugins/reload
```

**请求体**
```json
{
  "self_id": "123456789",
  "name": "hello.lua"
}
```

---

### 4.5 获取插件运行状态

```
GET /api/plugins/status/:self_id/:name
```

**路径参数**
| 参数 | 类型 | 说明 |
|------|------|------|
| self_id | string | 机器人 QQ 号 |
| name | string | 插件文件名 |

**响应示例**
```json
{
  "success": true,
  "data": {
    "running": true,
    "memory": 102400,
    "memory_mb": "0.10 MB",
    "event_count": 12,
    "error_count": 0
  }
}
```

---

### 4.6 获取运行中的插件

```
GET /api/plugins/running
```

**查询参数**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| self_id | string | 是 | 机器人 QQ 号 |

**响应示例**
```json
{
  "success": true,
  "data": ["hello.lua", "group_manager.lua"]
}
```

---

### 4.7 获取插件日志

```
GET /api/plugins/logs/:self_id/:name
```

**路径参数**
| 参数 | 类型 | 说明 |
|------|------|------|
| self_id | string | 机器人 QQ 号 |
| name | string | 插件文件名（需 URL 编码） |

**查询参数**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| limit | int | 否 | 返回日志条数上限 |

**响应示例**
```json
{
  "success": true,
  "data": ["[INFO] 插件已加载", "[INFO] 收到消息"]
}
```

---

### 4.8 获取插件配置

```
GET /api/plugins/config/:self_id/:name
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "enable": true,
    "keyword": "test"
  }
}
```

---

### 4.9 保存插件配置

```
POST /api/plugins/config/:self_id/:name
```

**请求体**
```json
{
  "config": {
    "enable": true,
    "keyword": "test"
  }
}
```

---

### 4.10 删除插件配置

```
DELETE /api/plugins/config/:self_id/:name
```

---

### 4.11 获取账号容器信息

```
GET /api/plugins/containers
```

**响应示例**
```json
{
  "success": true,
  "data": [
    {
      "self_id": "123456789",
      "plugin_count": 3,
      "ws_name": "ws1"
    }
  ]
}
```

---

### 4.12 获取所有插件（含内存占用）

```
GET /api/plugins/all-plugins
```

**响应示例**
```json
{
  "success": true,
  "data": [
    {
      "self_id": "123456789",
      "name": "hello.lua",
      "running": true,
      "memory": 102400,
      "memory_mb": "0.10 MB",
      "event_count": 12,
      "error_count": 0
    }
  ]
}
```

---

### 4.13 检查插件文件完整性

```
POST /api/plugins/check-files
```

**说明**：手动刷新并检查插件文件是否存在。

---

## 5. 插件文件管理

### 5.1 获取可用账号列表

```
GET /api/plugin-manager/accounts
```

**响应示例**
```json
{
  "success": true,
  "data": [
    {
      "self_id": "123456789",
      "nickname": "BotA",
      "online": true
    }
  ]
}
```

---

### 5.2 获取模板文件树

```
GET /api/plugin-manager/template-files
```

**响应示例**
```json
{
  "success": true,
  "data": [
    {
      "name": "template",
      "path": "/plugins/template",
      "isDirectory": true,
      "children": [...]
    }
  ]
}
```

---

### 5.3 获取指定账号插件文件树

```
GET /api/plugin-manager/plugin-files/:selfId
```

---

### 5.4 读取文件内容

```
GET /api/plugin-manager/file?path=<path>
```

**查询参数**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| path | string | 是 | 文件虚拟路径，如 `/plugins/123456789/hello.lua` |

**响应示例**
```json
{
  "success": true,
  "data": {
    "content": "print('hello')",
    "path": "/plugins/123456789/hello.lua"
  }
}
```

---

### 5.5 写入文件内容

```
POST /api/plugin-manager/file
```

**请求体**
```json
{
  "path": "/plugins/123456789/hello.lua",
  "content": "print('hello world')"
}
```

**限制**：单次写入内容最大 **15MB**。

---

### 5.6 创建文件或文件夹

```
POST /api/plugin-manager/create
```

**请求体**
```json
{
  "path": "/plugins/123456789/new_folder",
  "is_directory": true
}
```

---

### 5.7 删除文件或文件夹

```
DELETE /api/plugin-manager/file?path=<path>
```

---

### 5.8 复制文件或文件夹

```
POST /api/plugin-manager/copy
```

**请求体**
```json
{
  "src": "/plugins/123456789/hello.lua",
  "dst": "/plugins/123456789/hello_copy.lua"
}
```

**限制**：单次复制文件最大 **100MB**。

---

### 5.9 移动文件或文件夹

```
POST /api/plugin-manager/move
```

**请求体**
```json
{
  "src": "/plugins/123456789/hello.lua",
  "dst": "/plugins/123456789/sub/hello.lua"
}
```

---

### 5.10 重命名文件或文件夹

```
POST /api/plugin-manager/rename
```

**请求体**
```json
{
  "path": "/plugins/123456789/hello.lua",
  "new_name": "hello2.lua"
}
```

---

### 5.11 获取 Blockly 状态

```
GET /api/blockly/get_status
```

---

## 6. 插件商店

### 6.1 获取商店配置

```
GET /api/plugin-store/config
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "index_lua_url": "https://example.com/index.json",
    "index_blockly_url": "https://example.com/blockly.json",
    "index_blockly_config_url": "https://example.com/blockly_config.json"
  }
}
```

---

### 6.2 安装插件

```
POST /api/plugin-store/install
```

**请求体**
```json
{
  "type": "lua",
  "name": "weather",
  "version": "1.0.0",
  "index_url": "https://example.com/plugins/weather.json",
  "sha256_hash": "abc123..."
}
```

**说明**：`type` 支持 `lua`、`blockly`、`blockly_config`。

---

### 6.3 获取安装状态

```
GET /api/plugin-store/status
GET /api/plugin-store/status/:name
```

---

### 6.4 清理缓存

```
POST /api/plugin-store/cache/clean
```

---

### 6.5 获取缓存信息

```
GET /api/plugin-store/cache/info
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "file_count": 10,
    "total_size": 1024000,
    "cache_dir": "cache/download"
  }
}
```

---

### 6.6 获取已安装列表

```
GET /api/plugin-store/installed
```

---

### 6.7 卸载插件

```
POST /api/plugin-store/uninstall
```

**请求体**
```json
{
  "type": "lua",
  "name": "weather"
}
```

---

## 7. 系统设置

### 7.1 获取基础设置

```
GET /api/settings
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "websocket_authorization": "your_ws_token"
  }
}
```

---

### 7.2 保存基础设置

```
POST /api/settings
```

**请求体**
```json
{
  "websocket_authorization": "your_ws_token",
  "ws_port": 8080,
  "log_level": "info",
  "cors_origins": "http://localhost:3000, http://127.0.0.1:3000",
  "log_retention_days": 7
}
```

**参数说明**
| 参数 | 类型 | 限制 |
|------|------|------|
| websocket_authorization | string | 最大 512 字符，不能包含控制字符 |
| ws_port | int | 1024 - 65535 |
| log_level | string | `debug` / `info` / `warn` / `error` |
| log_retention_days | int | 1 - 365 |

---

### 7.3 获取日志清理配置

```
GET /api/settings/log-cleanup
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "interval": 24,
    "retention": 7,
    "scope": {
      "pluginLog": true,
      "loginLog": true,
      "fileOpLog": true,
      "pluginOpLog": true,
      "proxyLog": true,
      "botConnLog": true
    }
  }
}
```

---

### 7.4 保存日志清理配置

```
POST /api/settings/log-cleanup
```

**请求体**
```json
{
  "enabled": true,
  "interval": 24,
  "retention": 7,
  "scope": {
    "pluginLog": true,
    "loginLog": true,
    "fileOpLog": true,
    "pluginOpLog": true,
    "proxyLog": true,
    "botConnLog": true
  }
}
```

**限制**：`interval` 必须在 1-168 小时之间。

---

### 7.5 获取外观设置

```
GET /api/settings/appearance
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "theme": "dark",
    "fontSize": 14,
    "customCSS": {}
  }
}
```

---

### 7.6 保存外观设置

```
POST /api/settings/appearance
```

**请求体**
```json
{
  "theme": "dark",
  "fontSize": 14,
  "customCSS": {}
}
```

---

### 7.7 获取高级配置

```
GET /api/settings/advanced
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "wsPort": 8080,
    "logLevel": "info",
    "corsOrigins": ["http://localhost:3000"],
    "logRetentionDays": 7
  }
}
```

---

### 7.8 获取系统设置修改日志

```
GET /api/settings/logs?page=1&pageSize=50&level=info
```

**查询参数**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | int | 否 | 页码，默认 1 |
| pageSize | int | 否 | 每页条数，默认 50 |
| level | string | 否 | 日志级别过滤 |

---

### 7.9 获取管理员操作日志

```
GET /api/settings/admins
```

---

### 7.10 获取通用操作日志

```
GET /api/settings/operations?page=1&pageSize=50
```

---

## 8. 系统状态与工具

### 8.1 健康检查

```
GET /health
```

**说明**：公开接口，无需认证。

---

### 8.2 获取后端版本

```
GET /api/version
```

---

### 8.3 获取 Bot 版本信息

```
GET /api/system/version
```

**说明**：自动使用第一个在线账号查询。

---

### 8.4 获取 Bot 状态

```
GET /api/system/status
```

---

### 8.5 设置在线状态

```
POST /api/system/online-status
```

**请求体**
```json
{
  "status": 10,
  "ext_status": 0,
  "battery_status": 0
}
```

---

### 8.6 获取 Cookie

```
GET /api/system/cookies?domain=qun.qq.com
```

---

### 8.7 设置 Cookie

```
POST /api/system/cookies
```

**请求体**
```json
{
  "domain": "qun.qq.com",
  "cookies": "..."
}
```

---

### 8.8 清理缓存

```
GET /api/system/clean-cache
```

---

### 8.9 重启服务

```
POST /api/system/restart
```

---

### 8.10 图片 OCR

```
POST /api/system/ocr-image
```

**请求体**
```json
{
  "image": "base64_string"
}
```

---

### 8.11 获取图片 rkey

```
GET /api/system/rkey
```

---

### 8.12 推荐表情

```
POST /api/system/recommend-face
```

**请求体**
```json
{
  "msg": "开心",
  "count": 10
}
```

---

### 8.13 收藏表情

```
GET /api/system/custom-face
```

---

### 8.14 发送 Protobuf 数据包

```
POST /api/system/send-pb
```

**请求体**
```json
{
  "cmd": "OidbSvc.0x899_0",
  "hex": "08..."
}
```

---

### 8.15 获取服务器状态

```
GET /api/system/server-status
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "cpu_usage": 12.5,
    "mem_total": 16777216000,
    "mem_used": 8388608000,
    "mem_available": 8388608000,
    "mem_usage_percent": 50.0,
    "disk_usage": { ... }
  }
}
```

---

### 8.16 获取系统信息

```
GET /api/system/info
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "version": "v7.12.0"
  }
}
```

---

### 8.17 实时状态 SSE 流

```
GET /api/system/status-stream
```

**说明**：返回 `text/event-stream`，实时推送服务器状态。

---

### 8.18 获取网络速度

```
GET /api/system/network-speed
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "uploadSpeed": 10240,
    "downloadSpeed": 20480
  }
}
```

---

### 8.19 生成 WS 连接 Token

```
POST /api/system/generate-ws-token
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "token": "random_generated_token"
  }
}
```

---

## 9. 日志查询

### 9.1 WebSocket 通信日志

```
GET /api/logs/ws?self_id=123456789&limit=100
```

**响应格式**
```json
{
  "status": "ok",
  "retcode": 0,
  "data": {
    "self_id": "123456789",
    "logs": ["..."],
    "total": 100
  }
}
```

---

### 9.2 插件日志

```
GET /api/logs/plugin?self_id=123456789&plugin_name=hello.lua&limit=100
```

---

### 9.3 代理日志

```
GET /api/logs/proxy?self_id=123456789&limit=100
```

---

### 9.4 登录日志

```
GET /api/logs/login?limit=100
```

---

### 9.5 实时日志流（WebSocket）

```
GET /api/logs/stream?self_id=123456789&token=<websocket_authorization>
```

**说明**：此接口不走 JWT 认证，使用 `websocket_authorization`（从 `/api/settings` 获取）作为 token 鉴权。返回 WebSocket 实时日志流。

---

## 10. WebQQ

### 10.1 实时消息 SSE 订阅

```
GET /api/webqq/events?self_id=123456789&user_id=987654321&type=friend&target_id=987654321
```

**说明**：建立 SSE 连接，实时推送聊天消息。需在 Cookie 中携带 `auth_token`，或在 URL 中通过其他安全方式传递。

---

### 10.2 获取聊天历史

```
GET /api/webqq/history?self_id=123456789&user_id=987654321&type=friend&target_id=987654321
```

**响应示例**
```json
{
  "success": true,
  "data": [
    {
      "message_id": "12345",
      "user_id": "987654321",
      "raw_message": "你好",
      "sender_name": "User",
      "time": 1718888888,
      "message_type": "private"
    }
  ]
}
```

---

### 10.3 心跳保活

```
POST /api/webqq/ping
```

**说明**：WebQQ 客户端需定时发送心跳，防止服务端清理连接。

---

## 11. 代理管理

**说明**：代理管理接口用于 NapCat 多实例模式，额外使用 `AdminAuthMiddleware` 校验管理员 token。

### 11.1 获取代理配置

```
GET /api/admin/proxy/config
```

---

### 11.2 更新代理配置

```
PUT /api/admin/proxy/config
```

**请求体**：`ProxyConfig` 对象。

---

### 11.3 重载适配器

```
POST /api/admin/proxy/reload
```

---

### 11.4 获取所有适配器

```
GET /api/admin/proxy/adapters
```

---

### 11.5 获取单个适配器

```
GET /api/admin/proxy/adapters/:name
```

---

### 11.6 新增适配器

```
POST /api/admin/proxy/adapters
```

**请求体**
```json
{
  "type": "ws_client",
  "config": { ... }
}
```

**类型说明**：`ws_client`、`ws_server`、`http_server`、`http_client`。

---

### 11.7 更新适配器

```
PUT /api/admin/proxy/adapters/:name
```

---

### 11.8 删除适配器

```
DELETE /api/admin/proxy/adapters/:name
```

---

### 11.9 启用/禁用适配器

```
POST /api/admin/proxy/adapters/:name/enable
POST /api/admin/proxy/adapters/:name/disable
```

---

## 12. 扩展 API

### 12.1 查看所有注册接口

```
GET /api/expand/registry
```

**说明**：返回 Lua 插件通过 HTTP 接口管理器注册的所有自定义接口列表。

---

### 12.2 按分类查看注册接口

```
GET /api/expand/registry/category/:category
```

---

### 12.3 按支持类型查看注册接口

```
GET /api/expand/registry/support/:support
```

---

### 12.4 调用 Lua 插件注册的动态接口

```
GET|POST|PUT|DELETE /api/expand/:routePath
```

**说明**：由 Lua 插件在运行时动态注册，具体参数和响应取决于插件实现。

---

### 12.5 插件自定义 HTTP 接口

```
GET|POST|PUT|DELETE /plugins/:externalName
GET|POST|PUT|DELETE /plugins/:self_id/:externalName
```

**说明**：
- `/plugins/:externalName`：全局接口，所有账号可用。
- `/plugins/:self_id/:externalName`：账号隔离接口，仅指定 QQ 号可用。
- `:self_id` 必须为纯数字且长度 5-11 位（QQ 号规则）。

---

## 附录：全局状态码与错误处理

| HTTP 状态码 | 含义 |
|-------------|------|
| 200 | 请求成功 |
| 400 | 请求参数错误 |
| 401 | 未认证或 Token 无效/过期 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 405 | 请求方法不被允许 |
| 500 | 服务器内部错误 |
| 502 | 下游 Bot 接口调用失败 |
| 503 | 没有在线账号 |

---

## 附录：文件操作安全限制

插件文件管理禁止上传/创建以下后缀的文件：

```
.exe, .dll, .com, .bat, .cmd, .sh, .bash, .zsh, .ps1,
.so, .dylib, .php, .php3, .php4, .php5, .pht, .phtml,
.pl, .pm, .py, .pyc, .pyo, .rb, .jsp, .asp, .aspx, .cgi,
.wasm, .app, .msi, .scr, .pif, .vbs, .vbe, .js, .jse, .wsf, .wsh
```

路径最大长度：**4096 字符**。