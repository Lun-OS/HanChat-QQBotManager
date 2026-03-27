# HanChat-QQBotManager

一个功能强大的 QQ 机器人管理平台，支持多账号管理、可视化插件开发和 Lua 脚本扩展。

## ✨ 核心优势

- **多账号管理**：支持同时管理多个 QQ 机器人账号
- **可视化编程**：集成 Blockly 图形化编程，无需编码即可开发插件
- **Lua 脚本扩展**：提供丰富的 Lua API，支持复杂功能开发
- **Web 管理界面**：现代化的 React + Tailwind CSS 管理后台
- **热加载插件**：支持插件动态加载和卸载，无需重启服务
- **账号隔离**：每个账号的插件和数据独立存储，互不干扰

## 🚀 主要功能特性

### 机器人管理

- 多账号同时在线
- 账号状态实时监控
- WebQQ 在线聊天功能
- 消息日志记录和查询

### 插件系统

- Lua 脚本插件支持
- Blockly 可视化编程
- 插件热加载/热卸载
- 插件配置管理
- 模板插件库

### 开发能力

- 丰富的 API 接口
- HTTP 接口注册
- 数据持久化存储
- 消息事件处理
- 群组管理功能

## 🏗️ 技术架构

### 前端技术栈

- **Blockly**：Google 的可视化编程库，用于图形化插件开发
- **React**：现代化的前端框架，构建用户界面
- **Tailwind CSS**：实用优先的 CSS 框架，快速构建美观界面
- **TypeScript**：类型安全的 JavaScript 超集
- **Vite**：极速的前端构建工具

### 后端技术栈

- **Golang**：高性能后端语言
- **Gin**：轻量级 Web 框架
- **Gopher-Lua**：Lua 脚本引擎，用于插件运行
- **GORM**：ORM 数据库操作库
- **WebSocket**：实时通信支持

### Lua 相关库

- **gopher-lua**：Go 语言实现的 Lua 解释器
- 自定义 Lua API 封装，提供消息、群组、用户、文件、网络等接口

## 📖 文档导航

详细文档请查看 [使用文档导航](./docs/index.md)

- [安装指南](./docs/installation.md)
- [OneBot 配置](./docs/onebot-config.md) - NapCat/LLOneBot 配置指南
- [配置说明](./docs/configuration.md)
- [使用教程](./docs/tutorial.md)
- [API 文档](./docs/api.md)
- [插件开发](./docs/plugin-development.md)
- [常见问题](./docs/faq.md)

## ⚙️ OneBot 推荐配置

在配置 NapCat 或 LLOneBot 时，推荐使用以下参数：

| 配置项  | 推荐值            |
| ---- | -------------- |
| 连接方式 | WebSocket 反向连接 |
| 心跳间隔 | 60000 毫秒       |
| 消息格式 | 消息段 (array)    |
| 其他配置 | 保持默认           |

详细配置步骤请参考 [OneBot 配置指南](./docs/onebot-config.md)。

## 🏃 快速开始

### 前置要求

- Go 1.24+
- Node.js 18+
- 兼容的 QQ 协议客户端（如 NapCat、LLOneBot 等）

### 安装步骤

1. 克隆仓库

```bash
git clone https://github.com/Lun-OS/HanChat-QQBotManager.git
cd HanChat-QQBotManager
```

1. 配置环境变量

```bash
cp .env .env
# 编辑 .env 文件，填入配置信息
```

1. 构建前端

```bash
cd web
npm install
npm run build
```

1. 运行后端

```bash
cd ..
go run cmd/app/main.go
```

1. 访问 Web 界面
   打开浏览器访问 `http://localhost:8080`

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

本项目采用 **Apache-2.0 **许可证。
