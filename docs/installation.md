# 安装指南

本文档将详细介绍如何安装和部署 HanChat-QQBotManager。

## 系统要求

### 硬件要求
- CPU: 双核及以上
- 内存: 2GB 及以上
- 硬盘: 至少 50MB 可用空间

### 软件要求
- **操作系统**: Windows 10+, Linux
- **Go**: 1.24 或更高版本
- **Node.js**: 18 或更高版本
- **Git**: 最新版本

## 安装步骤

### 1. 克隆项目

```bash
git clone https://github.com/Lun-OS/HanChat-QQBotManager.git
cd HanChat-QQBotManager
```

### 2. 安装后端依赖

确保您已安装 Go 1.24+，然后运行：

```bash
go mod download
```

### 3. 安装前端依赖

进入 web 目录并安装依赖：

```bash
cd web
npm install
# 或者使用 pnpm
pnpm install
```

### 4. 配置环境变量

复制环境变量模板文件：

```bash
cd ..
cp .env
```

编辑 `.env` 文件，填入您的配置信息：

```env
# 服务器配置
SERVER_HOST=0.0.0.0
SERVER_PORT=8080

# WebSocket 配置
WEBSOCKET_AUTHORIZATION=your_token_here

# 管理员配置
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_password_here

# 日志配置
LOG_LEVEL=info
LOG_PATH=./logs
```

### 5. 构建前端

在 web 目录下构建前端：

```bash
cd web
npm run build
```

构建完成后，静态文件将输出到 `web/dist` 目录。

### 6. 运行服务

返回项目根目录，启动服务：

```bash
cd ..
go run cmd/app/main.go
```

或者使用 Makefile：

```bash
make run
```

Windows 用户可以使用批处理文件：

```bash
build.bat
```

### 7. 验证安装

打开浏览器访问 `http://localhost:8080`，如果看到登录页面，说明安装成功。

使用您在 `.env` 文件中配置的管理员账号登录。

## 安装 QQ 协议客户端

HanChat-QQBotManager 需要配合 OneBot 协议客户端使用，推荐使用 NapCat 或 LLOneBot。

### 推荐配置参数

无论使用哪个客户端，都推荐采用以下配置：

| 配置项 | 推荐值 |
|--------|--------|
| 连接方式 | WebSocket 反向连接 |
| 心跳间隔 | 60000 毫秒 |
| 消息格式 | 消息段 (array) |
| 其他配置 | 保持默认 |

### 详细配置指南

详细的配置步骤请参考 [OneBot 配置指南](./onebot-config.md)，其中包含：

- NapCat 的多种配置方式（配置文件、Web 界面、环境变量）
- LLOneBot 的配置步骤
- 配置参数详细说明
- 连接验证方法
- 常见问题解答

### 快速配置步骤

如果您想快速配置，可以按以下步骤操作：

#### NapCat 快速配置

1. 下载 NapCat：https://github.com/NapNeko/NapCatQQ
2. 编辑配置文件，添加反向 WebSocket：
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
     }
   }
   ```
3. 启动 NapCat 并登录 QQ 账号

#### LLOneBot 快速配置

1. 下载 LLOneBot：https://github.com/LLOneBot/LLOneBot
2. 配置反向 WebSocket：
   - URL: `ws://localhost:8080/ws/your_bot_name`
   - Access Token: `your_websocket_token`
   - 心跳间隔: `60000`
   - 消息格式: `array`
3. 启动并登录 QQ

## Docker 部署（可选）

如果您使用 Docker，可以使用以下方式部署：

```dockerfile
# Dockerfile 示例
FROM golang:1.24-alpine AS builder

WORKDIR /app
COPY . .
RUN go mod download
RUN go build -o app cmd/app/main.go

FROM node:18-alpine AS frontend-builder
WORKDIR /web
COPY web/ .
RUN npm install
RUN npm run build

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/app .
COPY --from=frontend-builder /web/dist ./web
COPY config.json .

EXPOSE 8080
CMD ["./app"]
```

## 常见问题

### Q: 启动时提示缺少 .env 文件？
A: 确保您已从 .env 复制并创建了 .env 文件。

### Q: 前端页面无法访问？
A: 确认已执行 `npm run build` 构建前端，或者在开发模式下运行 `npm run dev`。

### Q: Go 依赖下载失败？
A: 可以尝试设置 Go 代理：`go env -w GOPROXY=https://goproxy.cn,direct`

## 下一步

安装完成后，请阅读 [配置说明](./configuration.md) 了解如何配置系统。
