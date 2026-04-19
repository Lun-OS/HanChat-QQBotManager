# HanChat QQBot Manager

<p align="center">
  <img src="https://img.shields.io/badge/OneBot-v11-blue?style=flat-square" alt="OneBot v11">
  <img src="https://img.shields.io/badge/Go-1.24+-00ADD8?style=flat-square&logo=go" alt="Go 1.24+">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License: MIT">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey?style=flat-square" alt="Platform">
</p>

<p align="center">
  <b>基于 OneBot v11 协议的高性能 QQ 机器人管理框架</b><br>
  <b>完美支持 LuckyLilliaBot / NapCatQQ 等主流 OneBot v11 实现</b>
</p>

<p align="center">
  <a href="#功能特性">功能特性</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#技术架构">技术架构</a> •
  <a href="#开发历史">开发历史</a> •
  <a href="#参与贡献">参与贡献</a>
</p>

***

## 功能特性

### 多账号管理

- 🤖 **多机器人支持**：同时管理多个 QQ 机器人账号，每个账号独立隔离运行
- 🔌 **反向 WebSocket**：采用反向 WS 连接模式（HanChat ← OneBot），机器人客户端主动连接，更稳定可靠
- ⚡ **高并发处理**：每个账号支持最多 5 个并发 API 请求，智能队列调度

### 插件系统

- 🧩 **Lua 脚本扩展**：基于 Lua 沙箱的插件系统，安全可控
- ⏰ **定时任务**：支持 Cron 表达式和延时任务，灵活调度
- 🎯 **可视化编程**：内置 Blockly 图形化编程工具，零代码创建自动化流程
- 🔗 **HTTP 接口**：插件可注册自定义 HTTP 接口，扩展性强

### Web 管理界面

- 🌐 **现代化前端**：基于 React + TypeScript 的响应式 Web 界面
- 💬 **WebQQ 客户端**：内置类 QQ 网页聊天界面，便捷管理消息
- 📊 **实时监控**：机器人状态、消息日志实时展示
- 🔧 **在线配置**：无需重启，动态调整配置参数

### 安全与稳定

- 🔐 **Token 鉴权**：全局 Token 认证，支持动态更新
- 🛡️ **沙箱隔离**：Lua 插件运行在独立沙箱环境
- 📝 **完整日志**：请求日志、WebSocket 通信日志全面记录
- 🔄 **优雅关闭**：信号处理机制，确保服务安全退出

***

## 快速开始

### 环境要求

- Go 1.24 或更高版本
- Node.js 18+（如需构建前端）
- 支持 OneBot v11 协议的 QQ 机器人客户端（如 LuckyLilliaBot、NapCatQQ）

### 安装

```bash
# 克隆仓库
git clone https://github.com/Lun-OS/HanChat-QQBotManager.git
cd HanChat-QQBotManager

# 安装依赖
go mod download

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，设置必要的配置项

# 运行
go run cmd/app/main.go
```

### 配置 OneBot 客户端

在 LuckyLilliaBot 或 NapCatQQ 的配置中，设置反向 WebSocket 连接：

```json
{
  "ws": {
    "enable": true,
    "url": "ws://localhost:8080/ws/bot1",
    "authorization": "your-token-here"
  }
}
```

确保 `X-Self-ID` 头部包含正确的 QQ 号（LuckyLilliaBot自带）。

***

## 技术架构

### 为什么选择 Go 语言？

本项目采用 **Go 语言** 开发，充分利用了 Go 在现代后端开发中的核心优势：

| 特性         | 优势说明                                           |
| ---------- | ---------------------------------------------- |
| **高并发性能**  | Goroutine + Channel 模型，轻松处理数千并发连接，适合多机器人高消息量场景 |
| **编译型语言**  | 单二进制文件部署，无运行时依赖，启动速度快，内存占用低                    |
| **原生网络支持** | 标准库完善的 WebSocket、HTTP/2 支持，无需额外依赖              |
| **跨平台**    | 一次编写，Windows/Linux/macOS 全平台运行                 |
| **类型安全**   | 静态类型检查，编译期发现问题，运行时更稳定                          |
| **丰富生态**   | Gin、Gorilla WebSocket、Zap 等成熟库，开发效率高           |

### 核心模块

```
┌─────────────────────────────────────────────────────────────┐
│                      Web 管理界面 (React)                    │
├─────────────────────────────────────────────────────────────┤
│  HTTP API  │  插件管理  │  多账号管理  │  日志监控  │ WebQQ  │
├─────────────────────────────────────────────────────────────┤
│                    Gin Web 框架                              │
├─────────────────────────────────────────────────────────────┤
│  反向 WebSocket  │  插件系统(Lua)  │  定时任务  │  配置管理 │
├─────────────────────────────────────────────────────────────┤
│              OneBot v11 协议适配层                           │
├─────────────────────────────────────────────────────────────┤
│         LuckyLilliaBot / NapCatQQ / 其他 OneBot v11          │
└─────────────────────────────────────────────────────────────┘
```

### 关键技术栈

**后端**

- [Gin](https://gin-gonic.com/) - 高性能 HTTP Web 框架
- [Gorilla WebSocket](https://github.com/gorilla/websocket) - WebSocket 实现
- [Zap](https://github.com/uber-go/zap) - 高性能日志库
- [Gopher-Lua](https://github.com/yuin/gopher-lua) - Lua 虚拟机
- [go-co-op/gocron](https://github.com/go-co-op/gocron) - 定时任务调度

**前端**

- React 18 + TypeScript
- Tailwind CSS + shadcn/ui
- Blockly - 谷歌可视化编程工具
- Zustand - 状态管理

***

## 项目结构

```
QQbot-LLbot/
├── cmd/
│   └── app/
│       └── main.go          # 程序入口点
├── config/                  # 配置文件目录
├── docs/                    # 项目文档
│   ├── BLOCKLY_DOCUMENTATION.md
│   ├── CLI_COMMANDS.md
│   ├── PLUGIN_LUA.md
│   └── 性能压力测试工具.py
├── internal/                # 内部业务逻辑
│   ├── api/                 # HTTP API 接口定义
│   ├── config/              # 配置管理
│   ├── console/             # 控制台功能
│   ├── middleware/          # Gin 中间件
│   ├── models/              # 数据模型定义
│   ├── plugins/             # 插件系统核心实现
│   ├── services/            # 核心服务层
│   └── utils/               # 工具函数
├── plugins/                 # 用户插件目录
│   └── template/            # 插件模板
├── web/                     # Web 前端项目
│   └── src/                 # React 源代码
├── .gitignore
├── go.mod
├── go.sum
└── README.md
```

## 开发历史

### 2025年6月 - 项目启动

- 开始编写 v1 单账号版本
- 基于 HTTP 通信协议
- 支持基础的消息收发功能

### 2026年1月 - 重大重构

- 🎉 **支持多机器人管理**：从单账号扩展到多账号架构
- 🔄 **通信协议升级**：从 HTTP 跟进为 **反向 WebSocket**，连接更稳定
- 🧩 **插件系统重构**：引入 Lua 脚本支持，功能可扩展
- 🌐 **Web 界面全新设计**：基于 React 的现代化管理后台
- ⏰ **定时任务系统**：支持 Cron 表达式和延时任务

***

## 参与贡献

### 作者说明

> 本项目全程由 **1 人主导开发**，采用现代 Vibe Coding 技术进行快速开发、构建和迭代。
>
> 虽然已尽力确保代码质量和功能完善，但难免仍有不足之处。如果您在使用过程中遇到任何问题，或有任何建议，欢迎通过 **Issues** 提出反馈，我会积极跟进修复。

### 如何贡献

**无论能力大小，都欢迎为项目贡献代码和意见！**

- 🐛 **提交 Bug**：发现问题请提交 Issue，描述复现步骤
- 💡 **功能建议**：有新想法？欢迎开启 Discussion 讨论
- 🔧 **代码贡献**：Fork 仓库，提交 PR，我会尽快 review
- 📖 **完善文档**：帮助改进 README 或编写使用教程
- ⭐ **Star 支持**：给项目点个 Star，让更多人看到


## 协议兼容性

| 框架                                              | 支持状态    | 说明               |
| ----------------------------------------------- | ------- | ---------------- |
| [LuckyLilliaBot](https://github.com/LLOneBot)   | ✅ 完美支持  | 推荐，功能完整（基于此环境开发） |
| [NapCatQQ](https://github.com/NapNeko/NapCatQQ) | ✅ 完美兼容  | 轻量级，资源占用低        |
| [go-cqhttp](https://github.com/Mrs4s/go-cqhttp) | ⚠️ 部分支持 | 需开启反向 WS         |
| 其他 OneBot v11                                   | ✅ 理论支持  | 符合标准即可           |

> **注意**：本项目仅支持 **反向 WebSocket** 连接模式，不支持正向 WS 或 HTTP POST。

***

## 开源协议

本项目基于 [MIT License](LICENSE) 开源，您可以自由使用、修改和分发。

***

<p align="center">
  Made with ❤️ by HanChat Team
</p>

***

