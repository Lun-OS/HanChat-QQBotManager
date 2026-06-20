# HanChat文档索引

本文档汇总了 HanChat QQBot Manager 项目的全部技术文档，按模块分类整理，方便快速查阅。

---

## 快速导航

| 如果你想知道/做… | 请查看… |
|---|---|
| 项目整体架构与接口分布 | [WEB_API.md](#web-控制操作-api) |
| OneBot v11 协议接口列表 | [llbot-api.md](#onebot-api-索引) |
| 网页后台接口详情 | [WEB_API.md](#web-控制操作-api) |
| 开发/测试/版本更新记录 | [API_UPDATE_V7.12.x.md](#版本更新记录) |
| 编写 Lua 插件 | [PLUGIN_LUA.md](#lua-插件开发) |
| 使用 Blockly 可视化编程 | [BLOCKLY_DOCUMENTATION.md](#blockly-图形化编程) |
| 控制台命令 | [CLI_COMMANDS.md](#cli-命令) |

---

## 一、API 与接口文档

### Web 控制操作 API
- **文件**：[WEB_API.md](WEB_API.md)
- **说明**：HanChat Web 管理后台的完整 HTTP API 文档。涵盖认证、账号管理、插件生命周期、文件管理（在线 IDE）、插件商店、系统设置与监控、WebQQ、日志查询、代理管理等全部网页控制接口。
- **适用对象**：前端开发者、第三方集成者、开源贡献者。

### OneBot API 索引
- **文件**：[开发测试高级及文档/llbot-api.md](开发测试高级及文档/llbot-api.md)
- **说明**：OneBot v11 协议接口索引，汇总了约 120+ 个 API 的外部链接（用户、群组、消息、文件、系统等分类），以及消息段 Schema 定义。
- **适用对象**：Bot 功能开发者、Lua/Blockly 插件作者。

---

## 二、插件开发文档

### Lua 插件开发
- **文件**：[PLUGIN_LUA.md](PLUGIN_LUA.md)
- **说明**：Lua 插件系统的完整开发指南，包含 API 绑定、事件系统、沙箱机制、调试技巧等。
- **适用对象**：Lua 插件开发者。

### Blockly 图形化编程
- **文件**：[BLOCKLY_DOCUMENTATION.md](BLOCKLY_DOCUMENTATION.md)
- **说明**：Blockly 可视化积木编程的使用说明与积木定义文档。
- **适用对象**：无代码/低代码插件开发者。

---

## 三、运维与工具文档

### CLI 命令
- **文件**：[CLI_COMMANDS.md](CLI_COMMANDS.md)
- **说明**：项目提供的全部控制台命令说明，用于服务器端运维与调试。
- **适用对象**：运维人员、后端开发者。

### 版本更新记录
- **文件**：[开发测试高级及文档/API_UPDATE_V7.12.x.md](开发测试高级及文档/API_UPDATE_V7.12.x.md)
- **说明**：V7.12.x 版本的系统性更新说明，包括新增 Lua API 绑定、Blockly 积木定义、安全增强、性能优化及向后兼容性说明。
- **适用对象**：升级维护者、插件开发者。

### 兼容性测试报告
- **文件**：[开发测试高级及文档/COMPATIBILITY_REPORT_V7.12.x.md](开发测试高级及文档/COMPATIBILITY_REPORT_V7.12.x.md)
- **说明**：V7.12.x 版本的兼容性测试报告。
- **适用对象**：升级维护者。

---

## 四、开发测试工具

测试工具脚本位于 `开发测试高级及文档/` 目录，供内部开发测试使用 暂无其他用处


---

## 五、文档变更对照（历史文件）

以下文件为 Lua 插件文档重构过程中的中间备份，如需对比修改前后差异可参考：

| 文件 | 说明 |
|---|---|
| `PLUGIN_LUA_before.md` | 重构前的 Lua 文档版本 |
| `PLUGIN_LUA_after.md` | 重构后的 Lua 文档版本 |
| `PLUGIN_LUA.md.bak` | 备份副本 |

> 当前生效版本请直接查阅 [PLUGIN_LUA.md](PLUGIN_LUA.md)。

---

## 六、图片资源

- **目录**：[img/](img/)
- **说明**：文档中引用的截图、流程图等静态图片资源。

---

## 文档阅读建议

1. **新用户/快速上手**：先阅读 [WEB_API.md](WEB_API.md) 了解框架能力，再根据需要查阅 [PLUGIN_LUA.md](PLUGIN_LUA.md) 或 [BLOCKLY_DOCUMENTATION.md](BLOCKLY_DOCUMENTATION.md)。
2. **前端/集成开发**：重点参考 [WEB_API.md](WEB_API.md)。
3. **插件开发**：Lua 开发者读 [PLUGIN_LUA.md](PLUGIN_LUA.md)，可视化开发者读 [BLOCKLY_DOCUMENTATION.md](BLOCKLY_DOCUMENTATION.md)；需要调用 QQ 功能时查 [llbot-api.md](开发测试高级及文档/llbot-api.md)。
4. **版本升级**：先读 [API_UPDATE_V7.12.x.md](开发测试高级及文档/API_UPDATE_V7.12.x.md)，再核对 [COMPATIBILITY_REPORT_V7.12.x.md](开发测试高级及文档/COMPATIBILITY_REPORT_V7.12.x.md)。

---

*索引最后更新：2026-06-21*
