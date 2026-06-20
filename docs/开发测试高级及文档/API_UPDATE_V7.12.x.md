# llbot OneBot 协议接口更新说明 (V7.12.x)

## 更新概述

本次更新基于 `llbot-api.md` 和 `llbot更新.md` 文档中的技术规范，对 llbot OneBot 协议接口进行了系统性全面更新。更新严格遵循**向后兼容原则**，确保与旧版本 llbot 协议实现完全兼容。

---

## 一、后端 Lua 沙箱环境增强

### 1.1 新增文件

| 文件路径 | 说明 |
|---------|------|
| `internal/plugins/lua_sandbox_enhanced.go` | 增强型 Lua 沙箱安全控制器 |

### 1.2 增强型沙箱配置

新增 `SandboxConfig` 结构体，支持以下可配置项：

| 配置项 | 类型 | 默认值 | 说明 |
|-------|------|--------|------|
| `MaxStackDepth` | int64 | 1000 | 最大堆栈深度 |
| `MaxInstructions` | int64 | 10000000 | 最大指令数 |
| `MaxMemoryUsage` | uint64 | 128MB | 最大内存使用量 |
| `MaxExecutionTime` | time.Duration | 30s | 最大单次执行时间 |
| `InstructionInterval` | int64 | 10000 | 指令检查间隔 |
| `Permissions` | SandboxPermission | PermAll | 权限掩码 |
| `AllowedHTTPHosts` | []string | nil | HTTP 域名白名单 |
| `BlockedHTTPHosts` | []string | [] | HTTP 域名黑名单 |
| `MaxFileSize` | int64 | 10MB | 最大文件操作大小 |
| `MaxStorageSize` | int64 | 50MB | 最大存储空间 |
| `EnableAuditLog` | bool | true | 是否启用审计日志 |

### 1.3 权限系统

新增细粒度权限控制：

| 权限常量 | 值 | 说明 |
|---------|-----|------|
| `PermFileRead` | 1 << 0 | 文件读取权限 |
| `PermFileWrite` | 1 << 1 | 文件写入权限 |
| `PermFileDelete` | 1 << 2 | 文件删除权限 |
| `PermNetworkHTTP` | 1 << 3 | HTTP 网络请求权限 |
| `PermNetworkTCP` | 1 << 4 | TCP 网络权限 |
| `PermNetworkUDP` | 1 << 5 | UDP 网络权限 |
| `PermBotAPI` | 1 << 6 | 调用 Bot API 权限 |
| `BotAdminAPI` | 1 << 7 | 管理员级 Bot API 权限 |
| `PermScheduler` | 1 << 8 | 定时任务权限 |
| `PermPluginComm` | 1 << 9 | 插件间通信权限 |
| `PermImageProcess` | 1 << 10 | 图像处理权限 |
| `PermStorage` | 1 << 11 | 存储操作权限 |

### 1.4 审计日志

增强型沙箱支持操作审计日志，记录每条 API 调用的：
- 时间戳
- 操作类型
- 详细信息
- 是否允许执行

### 1.5 HTTP 访问控制

支持基于白名单/黑名单的 HTTP 域名访问控制：
- 支持精确域名匹配
- 支持通配符 `*` 匹配（如 `*.example.com`）
- 访问结果缓存（最大 1000 条）

---

## 二、后端 Lua API 新增绑定

### 2.1 群组 API 新增

| Lua API | OneBot API | 版本 | 说明 |
|---------|-----------|------|------|
| `group.get_shut_list()` | `get_group_shut_list` | V7.12.3+ | 获取被禁言成员列表 |
| `group.get_at_all_remain()` | `get_group_at_all_remain` | V7.12.3+ | 获取@全体成员剩余次数 |
| `group.set_remark()` | `set_group_remark` | V7.12.3+ | 设置群备注 |
| `group.set_msg_recv()` | `set_group_msg_recv` | V7.12.3+ | 设置群消息接收方式 |
| `group.sign_in()` | `group_sign_in` | V7.12.3+ | 群打卡 |
| `group.get_filtered_requests()` | `get_filtered_group_requests` | V7.12.3+ | 获取被过滤的加群请求 |
| `group.send_notice()` | `_send_group_notice` | V7.12.5+ | 发送群公告（增强版，支持弹窗、引导修改昵称） |
| `group.get_notice()` | `_get_group_notice` | V7.12.5+ | 获取群公告列表 |
| `group.delete_notice()` | `_del_group_notice` | V7.12.5+ | 删除群公告 |
| `group.set_avatar()` | `set_group_avatar` | V7.12.3+ | 设置群头像 |
| `group.create_album()` | `create_group_album` | V7.12.3+ | 创建群相册 |
| `group.delete_album()` | `delete_group_album` | V7.12.3+ | 删除群相册 |
| `group.get_album_list()` | `get_group_album_list` | V7.12.3+ | 获取群相册列表 |
| `group.get_album_media_list()` | `get_group_album_media_list` | V7.12.3+ | 获取群相册媒体列表 |
| `group.upload_album()` | `upload_group_album` | V7.12.5+ | 上传群相册（支持视频） |

### 2.2 用户 API 新增

| Lua API | OneBot API | 版本 | 说明 |
|---------|-----------|------|------|
| `user.move_friend()` | `move_friend` | V7.12.3+ | 移动好友分组 |
| `user.get_who_liked_me()` | `get_who_liked_me` | V7.12.3+ | 获取谁赞过我列表 |
| `user.get_who_i_liked()` | `get_who_i_liked` | V7.12.3+ | 获取我赞过谁列表 |
| `user.get_filtered_requests()` | `get_filtered_friend_requests` | V7.12.3+ | 获取被过滤好友请求 |
| `user.handle_filtered_request()` | `handle_filtered_friend_request` | V7.12.3+ | 处理被过滤好友请求 |
| `user.get_qq_avatar()` | `get_qq_avatar` | V7.12.3+ | 获取QQ/群头像 |

### 2.3 系统 API 新增

| Lua API | OneBot API | 版本 | 说明 |
|---------|-----------|------|------|
| `system.set_login_info()` | `set_login_info` | V7.12.3+ | 设置登录号资料 |
| `system.set_online_status()` | `set_online_status` | V7.12.3+ | 设置在线状态 |
| `system.set_input_status()` | `set_input_status` | V7.12.3+ | 设置输入状态 |
| `system.send_protobuf()` | `send_protobuf` | V7.12.3+ | 发送Protobuf数据包 |
| `system.get_recommended_faces()` | `get_recommended_faces` | V7.12.3+ | 获取推荐表情 |
| `system.get_favorite_faces()` | `get_favorite_faces` | V7.12.3+ | 获取收藏表情 |
| `system.get_rkey()` | `get_rkey` | V7.12.3+ | 获取图片rkey |
| `system.download_file()` | `download_file` | V7.12.3+ | 下载文件到缓存目录 |
| `system.get_official_bot_range()` | `get_official_bot_qq_range` | V7.12.3+ | 获取官方机器人QQ号范围 |

### 2.4 增强版 API

| Lua API | 说明 |
|---------|------|
| `user.get_stranger_info()` | 增强版，支持 VIP 信息返回（V7.12.9+） |
| `group.upload_album()` | 增强版，支持视频上传（V7.12.5+） |
| `message.get_msg()` | 增强版，返回 `status` 字段（V7.12.3+） |

---

## 三、前端 Blockly 编辑器增强

### 3.1 新增积木块

#### 群管理积木（15个）

| 积木类型 | 类别 | 说明 |
|---------|------|------|
| `group_get_shut_list` | 群信息 | 获取被禁言成员列表 |
| `group_get_at_all_remain` | 群信息 | 获取@全体成员剩余次数 |
| `group_set_remark` | 群设置 | 设置群备注 |
| `group_set_msg_recv` | 群设置 | 设置群消息接收方式 |
| `group_sign_in` | 群设置 | 群打卡 |
| `group_send_notice` | 群公告 | 发送群公告（增强版） |
| `group_get_notice` | 群公告 | 获取群公告列表 |
| `group_delete_notice` | 群公告 | 删除群公告 |
| `group_set_avatar` | 群设置 | 设置群头像 |
| `group_create_album` | 群相册 | 创建群相册 |
| `group_delete_album` | 群相册 | 删除群相册 |
| `group_get_album_list` | 群相册 | 获取群相册列表 |
| `group_get_album_media_list` | 群相册 | 获取群相册媒体列表 |
| `group_upload_album` | 群相册 | 上传群相册（支持视频） |

#### 好友管理积木（6个）

| 积木类型 | 说明 |
|---------|------|
| `user_move_friend` | 移动好友分组 |
| `user_get_who_liked_me` | 获取谁赞过我列表 |
| `user_get_who_i_liked` | 获取我赞过谁列表 |
| `user_get_filtered_requests` | 获取被过滤好友请求 |
| `user_handle_filtered_request` | 处理被过滤好友请求 |
| `user_get_qq_avatar` | 获取QQ/群头像 |

#### 系统 API 积木（9个）

| 积木类型 | 说明 |
|---------|------|
| `system_set_login_info` | 设置登录号资料 |
| `system_set_online_status` | 设置在线状态 |
| `system_set_input_status` | 设置输入状态 |
| `system_send_protobuf` | 发送Protobuf数据包 |
| `system_get_recommended_faces` | 获取推荐表情 |
| `system_get_favorite_faces` | 获取收藏表情 |
| `system_get_rkey` | 获取图片rkey |
| `system_download_file` | 下载文件到缓存 |
| `system_get_official_bot_range` | 获取官方机器人QQ号范围 |

### 3.2 工具箱更新

所有新增积木已按功能分类添加到 Blockly 工具箱中：
- 群管理积木 → `群组` 分类
- 好友管理积木 → `用户` 分类
- 系统 API 积木 → `系统` 分类

---

## 四、向后兼容性说明

### 4.1 完全兼容的 API

以下现有 API **未做任何修改**，保持 100% 向后兼容：

- `bot.send_private_msg()` / `bot.send_group_msg()`
- `bot.delete_msg()` / `bot.get_msg()`
- `bot.get_forward_msg()`
- `bot.send_like()`
- `bot.set_group_kick()` / `bot.set_group_ban()`
- `bot.set_group_whole_ban()` / `bot.set_group_admin()`
- `bot.set_group_card()` / `bot.set_group_name()`
- `bot.set_group_leave()` / `bot.set_group_special_title()`
- `bot.get_login_info()` / `bot.get_stranger_info()`
- `bot.get_friend_list()` / `bot.get_group_list()`
- `bot.get_group_info()` / `bot.get_group_member_info()`
- `bot.get_group_member_list()`
- `bot.get_cookies()` / `bot.get_csrf_token()`
- `bot.get_credentials()` / `bot.get_record()`
- `bot.get_image()` / `bot.can_send_image()` / `bot.can_send_record()`
- `bot.get_status()` / `bot.get_version_info()`
- `bot.set_restart()` / `bot.clean_cache()`
- 所有文件操作 API
- 所有 HTTP 请求 API
- 所有存储操作 API

### 4.2 增强但兼容的 API

以下 API 在原有基础上增加了可选参数或返回字段，**不影响旧代码**：

| API | 变更说明 |
|-----|---------|
| `user.get_stranger_info()` | 返回结果中可能包含 VIP 信息字段（V7.12.9+） |
| `group.upload_album()` | 新增可选参数 `is_video` 支持视频上传 |
| `message.get_msg()` | 返回结果中新增 `status` 字段 |

### 4.3 废弃说明

本次更新**未废弃任何现有 API**。

---

## 五、文件变更清单

### 5.1 新增文件

| 文件 | 说明 |
|------|------|
| `internal/plugins/lua_sandbox_enhanced.go` | 增强型 Lua 沙箱 |
| `docs/API_UPDATE_V7.12.x.md` | 接口变更说明文档 |
| `docs/COMPATIBILITY_REPORT_V7.12.x.md` | 兼容性测试报告 |
| `docs/USAGE_EXAMPLES_V7.12.x.md` | 使用示例文档 |

### 5.2 修改文件

| 文件 | 变更说明 |
|------|---------|
| `internal/plugins/lua_api.go` | 新增 33 个 Lua API 绑定函数 |
| `internal/plugins/manager.go` | 注册新增 API 到 Lua 环境 |
| `web/src/app/blockly/blocks/index.ts` | 新增 31 个 Blockly 积木定义 |
| `web/src/app/blockly/generator.ts` | 新增 30 个 Lua 代码生成器 |
| `web/src/app/blockly/toolbox/index.ts` | 更新工具箱分类，添加新积木 |

---

## 六、安全增强

### 6.1 沙箱安全

- 堆栈深度限制（默认 1000）
- 指令数限制（默认 1000 万）
- 内存使用限制（默认 128MB）
- 执行时间限制（默认 30 秒）
- 细粒度权限控制
- HTTP 域名黑白名单
- 操作审计日志

### 6.2 恶意代码防护

- 死循环检测（指令计数器）
- 内存溢出防护
- 堆栈溢出防护
- 执行超时强制终止
- 权限不足自动拒绝

---

## 七、性能优化

- 预编译正则表达式缓存
- HTTP 域名检查结果缓存
- 审计日志自动裁剪（最大 1000 条）
- 原子操作保证线程安全

---

## 八、版本对应关系

| llbot 版本 | 新增 API 数量 | 主要特性 |
|-----------|--------------|---------|
| V7.12.3 | 20+ | 群相册、群设置、好友管理、系统 API |
| V7.12.5 | 5+ | 群公告增强、视频上传 |
| V7.12.9 | 1+ | 陌生人 VIP 信息 |

---

*文档版本: 1.0*
*更新日期: 2026-05-03*
