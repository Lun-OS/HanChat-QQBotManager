# API 文档

本文档介绍 HanChat-QQBotManager 的 HTTP API 接口。

## 认证

大部分 API 需要认证。使用管理员账号登录后，系统会返回 JWT Token，后续请求需要在 Header 中携带：

```
Authorization: Bearer {token}
```

或者使用自定义 Header：

```
X-Admin-Token: {token}
```

## 基础接口

### 健康检查

```http
GET /health
```

**响应示例：**
```json
{
  "success": true,
  "message": "Service is running",
  "timestamp": "2026-03-21T12:00:00Z"
}
```

## 登录接口

### 管理员登录

```http
POST /api/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your_password"
}
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "username": "admin"
  }
}
```

## 系统接口

### 获取系统状态

```http
GET /api/system/status
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "server": {
      "host": "0.0.0.0",
      "port": 8080
    },
    "plugins": {
      "total": 10,
      "running": 8
    },
    "accounts": {
      "total": 3,
      "online": 2
    }
  }
}
```

## 账号接口

### 获取账号列表

```http
GET /api/accounts
```

### 添加账号

```http
POST /api/accounts
Content-Type: application/json

{
  "custom_name": "my_bot",
  "self_id": 123456789,
  "enabled": true
}
```

### 删除账号

```http
DELETE /api/accounts/:self_id
```

## 插件接口

### 获取插件列表

```http
GET /api/plugins/:self_id
```

### 启用插件

```http
POST /api/plugins/:self_id/:plugin_name/enable
```

### 禁用插件

```http
POST /api/plugins/:self_id/:plugin_name/disable
```

### 重载插件

```http
POST /api/plugins/:self_id/:plugin_name/reload
```

## 消息接口

### 发送群消息

```http
POST /api/:self_id/send_group_msg
Content-Type: application/json

{
  "group_id": 123456789,
  "message": "Hello World"
}
```

### 发送私聊消息

```http
POST /api/:self_id/send_private_msg
Content-Type: application/json

{
  "user_id": 987654321,
  "message": "Hello World"
}
```

### 撤回消息

```http
POST /api/:self_id/delete_msg
Content-Type: application/json

{
  "message_id": 123456
}
```

## 群组接口

### 获取群列表

```http
GET /api/:self_id/get_group_list
```

### 获取群成员列表

```http
GET /api/:self_id/get_group_member_list?group_id=123456789
```

### 设置群禁言

```http
POST /api/:self_id/set_group_ban
Content-Type: application/json

{
  "group_id": 123456789,
  "user_id": 987654321,
  "duration": 600
}
```

## 日志接口

### 获取日志列表

```http
GET /api/logs?level=info&limit=100&offset=0
```

## 插件 HTTP 接口

插件可以注册自定义 HTTP 接口，访问路径为：

```
/plugins/{self_id}/{interface_name}
```

更多关于插件开发的 API 请参考 [插件开发手册](../plugins/template/插件开发手册.md)。
