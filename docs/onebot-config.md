# OneBot 配置指南

本文档详细介绍如何配置 OneBot 协议客户端与 HanChat-QQBotManager 配合使用。

## 推荐配置参数

无论您使用 NapCat 还是 LLOneBot，都推荐使用以下参数设置：

| 配置项 | 推荐值 | 说明 |
|--------|--------|------|
| 连接方式 | WebSocket 反向连接 | 使用反向 WebSocket 连接到 HanChat-QQBotManager |
| 心跳间隔 | 60000 毫秒 | 每 60 秒发送一次心跳包 |
| 消息格式 | 消息段 (array) | 使用消息段数组格式，便于处理 |
| 其他配置 | 保持默认 | 其余配置项使用默认值即可 |

---

## NapCat 配置

### 1. 下载 NapCat

访问 NapCat GitHub 仓库下载最新版本：
- GitHub: https://github.com/NapNeko/NapCatQQ

### 2. 配置 NapCat

NapCat 提供多种配置方式，以下是详细步骤：

#### 方式一：使用配置文件

1. 找到 NapCat 的配置文件目录，通常为：
   - Windows: `NapCat/config/`
   - Linux: `~/.config/NapCat/`

2. 编辑 `napcat.json` 配置文件：

```json
{
  "network": {
    "websocketReverse": [
      {
        "url": "ws://localhost:8080/ws/your_bot_name",
        "authorization": "your_websocket_token",
        "heartInterval": 60000,
        "messagePostFormat": "array"
      }
    ]
  },
  "fileLog": {
    "enable": true,
    "level": "info"
  },
  "consoleLog": {
    "enable": true,
    "level": "info"
  }
}
```

#### 方式二：使用 Web 管理界面

1. 启动 NapCat
2. 访问 NapCat 的 Web 管理界面（默认 http://localhost:6099）
3. 进入"配置"页面
4. 找到"反向 WebSocket"配置部分
5. 点击"添加"，填入以下信息：

| 配置项 | 值 |
|--------|-----|
| URL | `ws://localhost:8080/ws/your_bot_name` |
| Authorization | `your_websocket_token` |
| 心跳间隔 | `60000` |
| 消息上报格式 | `array` |

6. 保存配置

#### 方式三：使用环境变量

在启动 NapCat 时设置环境变量：

```bash
# Windows (PowerShell)
$env:NC_WS_REVERSE_URLS='[{"url":"ws://localhost:8080/ws/your_bot_name","authorization":"your_websocket_token","heartInterval":60000,"messagePostFormat":"array"}]'

# Linux/macOS
export NC_WS_REVERSE_URLS='[{"url":"ws://localhost:8080/ws/your_bot_name","authorization":"your_websocket_token","heartInterval":60000,"messagePostFormat":"array"}]'
```

### 3. 配置说明

**重要参数详解：**

- **URL**: `ws://localhost:8080/ws/{custom_name}`
  - `localhost`: HanChat-QQBotManager 所在服务器地址
  - `8080`: HanChat-QQBotManager 监听端口
  - `your_bot_name`: 自定义账号名称，需要与 HanChat-QQBotManager 中的配置一致

- **Authorization**: WebSocket 认证令牌
  - 需要与 HanChat-QQBotManager 的 `.env` 文件中 `WEBSOCKET_AUTHORIZATION` 一致
  - 或者与 `config.json` 中的 `websocket.authorization` 一致

- **heartInterval**: 心跳间隔，单位毫秒
  - 推荐设置为 `60000`（60秒）
  - 过短会增加服务器负载，过长可能导致连接断开

- **messagePostFormat**: 消息上报格式
  - 必须设置为 `array`（消息段格式）
  - HanChat-QQBotManager 只支持消息段数组格式

### 4. 启动 NapCat

1. 确保 HanChat-QQBotManager 已启动并运行在 `http://localhost:8080`
2. 启动 NapCat
3. 登录 QQ 账号
4. 查看 NapCat 日志，确认 WebSocket 连接成功

---

## LLOneBot 配置

### 1. 下载 LLOneBot

访问 LLOneBot GitHub 仓库下载最新版本：
- GitHub: https://github.com/LLOneBot/LLOneBot

### 2. 配置 LLOneBot

#### 方式一：编辑配置文件

找到 LLOneBot 的配置文件 `config.yml` 或 `config.json`：

```yaml
# config.yml 示例
servers:
  - ws_reverse:
      enable: true
      url: "ws://localhost:8080/ws/your_bot_name"
      access_token: "your_websocket_token"
      heartbeat_interval: 60000
      use_http: false
      use_ws: false

message:
  post_format: "array"
```

或者使用 JSON 格式：

```json
{
  "servers": [
    {
      "ws_reverse": {
        "enable": true,
        "url": "ws://localhost:8080/ws/your_bot_name",
        "access_token": "your_websocket_token",
        "heartbeat_interval": 60000
      }
    }
  ],
  "message": {
    "post_format": "array"
  }
}
```

#### 方式二：使用图形界面配置

1. 启动 LLOneBot
2. 打开配置界面
3. 导航到"WebSocket"或"连接"设置
4. 启用"反向 WebSocket"
5. 填写以下配置：

| 配置项 | 值 |
|--------|-----|
| 启用反向 WebSocket | ✓ |
| URL | `ws://localhost:8080/ws/your_bot_name` |
| Access Token | `your_websocket_token` |
| 心跳间隔 | `60000` |
| 消息格式 | `array` |

6. 保存并重启 LLOneBot

### 3. 配置说明

**重要参数详解：**

- **url**: WebSocket 服务器地址
  - 格式：`ws://{host}:{port}/ws/{custom_name}`
  - 示例：`ws://localhost:8080/ws/my_bot`

- **access_token**: 访问令牌
  - 与 HanChat-QQBotManager 中的认证令牌一致

- **heartbeat_interval**: 心跳间隔
  - 单位：毫秒
  - 推荐值：`60000`

- **post_format**: 消息格式
  - 必须设置为 `array`

### 4. 启动 LLOneBot

1. 确保 HanChat-QQBotManager 已启动
2. 启动 LLOneBot
3. 登录 QQ 账号
4. 检查连接状态

---

## 验证连接

### 1. 检查 OneBot 客户端日志

启动 OneBot 客户端后，查看日志，确认有类似以下输出：

```
[INFO] WebSocket 连接成功
[INFO] 已连接到 ws://localhost:8080/ws/your_bot_name
[INFO] 心跳包已发送
```

### 2. 检查 HanChat-QQBotManager 日志

查看 HanChat-QQBotManager 的日志，确认有新连接：

```
[INFO] 新的 WebSocket 连接: your_bot_name (QQ: 123456789)
[INFO] 账号已上线: 123456789
```

### 3. 在 Web 界面验证

1. 登录 HanChat-QQBotManager Web 界面
2. 进入"账号管理"页面
3. 确认您的账号状态显示为"在线"

---

## 常见问题

### Q: WebSocket 连接失败怎么办？

A: 检查以下几点：
1. 确认 HanChat-QQBotManager 已启动
2. 检查 URL 地址是否正确
3. 确认认证令牌是否匹配
4. 检查防火墙是否阻止了连接
5. 查看日志文件获取详细错误信息

### Q: 心跳间隔设置多少合适？

A: 推荐设置为 60000 毫秒（60秒）。如果网络不稳定，可以适当缩短到 30000 毫秒，但不要短于 10000 毫秒。

### Q: 消息格式为什么必须用 array？

A: HanChat-QQBotManager 的插件系统设计为处理消息段数组格式，这种格式更灵活，便于处理复杂消息（如包含图片、@提及等的消息）。

### Q: 可以同时配置多个反向 WebSocket 地址吗？

A: 可以！OneBot 客户端支持同时连接到多个反向 WebSocket 服务器。但请注意，每个连接需要使用不同的 `custom_name`。

---

## 下一步

配置完成后，请继续阅读：
- [使用教程](./tutorial.md) - 学习如何使用系统
- [插件开发](./plugin-development.md) - 学习如何开发插件
