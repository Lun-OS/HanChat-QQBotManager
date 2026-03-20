# 配置说明

本文档详细介绍 HanChat-QQBotManager 的各项配置选项。

## 环境变量配置 (.env)

项目使用 `.env` 文件进行环境变量配置。以下是所有可用配置项：

### 服务器配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `SERVER_HOST` | 服务器监听地址 | `0.0.0.0` |
| `SERVER_PORT` | 服务器监听端口 | `8080` |
| `ENV` | 运行环境 (development/production) | `production` |

### WebSocket 配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `WEBSOCKET_AUTHORIZATION` | WebSocket 认证令牌 | - |
| `WEBSOCKET_MAX_CONNECTIONS` | 最大连接数 | `10` |

### 管理员配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `ADMIN_USERNAME` | 管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 管理员密码 | - |

### 日志配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `LOG_LEVEL` | 日志级别 (debug/info/warn/error) | `info` |
| `LOG_PATH` | 日志文件路径 | `./logs` |

### CORS 配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `CORS_ENABLED` | 是否启用 CORS | `true` |
| `CORS_ORIGIN` | 允许的来源 | `*` |

## 账号配置 (config.json)

`config.json` 文件用于配置机器人账号信息。

### 配置示例

```json
{
  "websocket": {
    "authorization": "your_token_here"
  },
  "accounts": [
    {
      "custom_name": "my_bot",
      "self_id": 123456789,
      "enabled": true
    }
  ]
}
```

### 配置项说明

- `websocket.authorization`: WebSocket 认证令牌（优先使用环境变量）
- `accounts`: 账号列表
  - `custom_name`: 自定义账号名称（用于 WebSocket 路径）
  - `self_id`: QQ 账号
  - `enabled`: 是否启用

## 插件配置

每个插件都有自己的 `config.json` 配置文件，位于 `plugins/{QQ号}/{插件名}/config.json`。

### 配置示例

```json
{
  "reply_text": "你好！我是机器人。",
  "trigger_word": "你好",
  "enable_at": true,
  "admin_list": [123456789, 987654321]
}
```

### 在 Lua 中读取配置

```lua
-- 读取单个配置项
local replyText = config.get("reply_text", "默认回复")

-- 读取所有配置
local cfg = config.all()
local adminList = cfg.admin_list
```

## Web 界面配置

登录 Web 管理界面后，您可以在"设置"页面进行以下配置：

### 系统设置
- 服务器地址和端口
- WebSocket 配置
- 日志级别

### 账号管理
- 添加/删除机器人账号
- 配置账号信息
- 启用/禁用账号

### 插件配置
- 启用/禁用插件
- 编辑插件配置
- 管理插件文件

## 安全建议

1. **修改默认密码**: 首次登录后立即修改管理员密码
2. **使用强密码**: 管理员密码应包含大小写字母、数字和特殊字符
3. **保护 .env 文件**: 不要将 `.env` 文件提交到版本控制系统
4. **配置 CORS**: 生产环境中不要将 `CORS_ORIGIN` 设置为 `*`
5. **使用 HTTPS**: 生产环境建议使用 HTTPS

## 配置热重载

大部分配置修改后会自动生效，无需重启服务：

- 插件配置：修改后立即生效
- 账号配置：通过 Web 界面修改后立即生效
- 环境变量：需要重启服务

## 下一步

配置完成后，请阅读 [使用教程](./tutorial.md) 开始使用系统。
