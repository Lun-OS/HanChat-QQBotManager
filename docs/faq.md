# 常见问题解答

## 安装相关

### Q: 启动时提示缺少 .env 文件？

A: 确保您已从 `.env` 复制并创建了 `.env` 文件，并填入了必要的配置信息。

### Q: Go 依赖下载失败怎么办？

A: 可以尝试设置 Go 代理：

```bash
go env -w GOPROXY=https://goproxy.cn,direct
```

### Q: 前端构建失败？

A: 确保 Node.js 版本 >= 18，并尝试删除 `node_modules` 和 `package-lock.json` 后重新安装：

```bash
cd web
rm -rf node_modules package-lock.json
npm install
```

## 配置相关

### Q: 如何修改管理员密码？

A: 有两种方式：

1. 修改 `.env` 文件中的 `ADMIN_PASSWORD`，然后重启服务
2. 登录 Web 界面，在"设置"页面修改

### Q: 机器人连接不上怎么办？

A: 检查以下几点：

1. 确认 QQ 协议客户端（NapCat/LLOneBot）已启动并登录
2. 检查 WebSocket 地址配置是否正确：`ws://localhost:8080/ws/{custom_name}`
3. 确认认证令牌与 `.env` 文件中的一致
4. 查看日志文件了解具体错误

### Q: 插件配置修改后需要重启吗？

A: 不需要，插件配置修改后会自动生效。但建议在 `on_init` 中缓存配置以提高性能。

## 使用相关

### Q: 插件为什么不生效？

A: 检查以下几点：

1. 插件目录结构是否正确
2. `main.lua` 文件名是否正确
3. 插件是否在 Web 界面启用
4. 查看日志是否有错误信息
5. 确认插件代码语法正确

### Q: 如何获取消息中的图片？

A: 使用消息解析 API：

```lua
local hasImage = msg.has_image(event)
local imageUrls = msg.get_image_urls(event)
```

### Q: 如何回复被@的消息？

A: 检查是否被@并获取发送者信息：

```lua
if msg.is_at_bot(event, botId) then
    local senderId = msg.get_sender_id(event)
    message.send_group(groupId, "[CQ:at,qq=" .. senderId .. "] 你好！")
end
```

### Q: 如何让插件只处理特定群的消息？

A: 在消息事件中添加群号判断：

```lua
on_message(function(event)
    local groupId = msg.get_group_id(event)
    if groupId == 123456789 then
        -- 处理逻辑
    end
end)
```

## 插件开发相关

### Q: Blockly 和 Lua 可以混合使用吗？

A: 可以！您可以：

1. 用 Blockly 生成基础代码
2. 导出 Lua 文件
3. 手动添加复杂逻辑
4. 或者在 Lua 插件中调用 Blockly 生成的函数

### Q: 如何调试 Lua 插件？

A: 使用日志输出调试信息：

```lua
log.debug("变量值: " .. tostring(variable))
```

然后在 Web 界面的"日志"页面查看调试信息。

### Q: 插件数据存储在哪里？

A: 每个插件的数据存储在 `plugins/{QQ号}/{插件名}/data.json` 文件中。

### Q: 如何调用其他插件的功能？

A: 目前插件之间是相互隔离的，不能直接调用。建议：

1. 将共享功能封装成独立插件
2. 通过 HTTP 接口进行通信
3. 使用文件进行数据交换

## 性能相关

### Q: 插件太多会影响性能吗？

A: 每个插件运行在独立的 Lua 沙箱中，相互隔离。只要插件代码质量良好，不会有明显性能影响。建议：

1. 避免在事件处理器中做耗时操作
2. 合理使用缓存
3. 及时释放不需要的资源

### Q: 如何优化插件性能？

A: 以下是一些优化建议：

1. 在 `on_init` 中缓存配置和频繁使用的数据
2. 避免在循环中进行耗时操作
3. 合理使用定时器，避免过于频繁的执行
4. 及时清理不需要的数据

## 安全相关

### Q: 如何保护我的插件代码？

A: 目前插件代码是明文存储的，建议：

1. 不要在代码中硬编码敏感信息
2. 使用配置文件存储敏感数据
3. 妥善保管服务器访问权限

### Q: 插件安全吗？

A: 每个插件运行在独立的沙箱环境中，文件操作被限制在插件目录内，无法访问系统其他文件。但仍需注意：

1. 只安装信任的插件
2. 审查插件代码
3. 不要在插件中执行外部命令

## 其他

### Q: 支持多少个机器人账号同时在线？

A: 默认最大连接数是 10，可以在 `.env` 文件中通过 `WEBSOCKET_MAX_CONNECTIONS` 配置调整。

### Q: 有备份机制吗？

A: 系统不会自动备份，建议定期备份：

1. `plugins/` 目录 - 插件和数据
2. `config.json` - 账号配置
3. `.env` - 环境变量

### Q: 如何提交 Issue 或贡献代码？

A: 欢迎访问项目 GitHub 仓库提交 Issue 和 Pull Request！

## 获取更多帮助

如果以上解答没有解决您的问题：

1. 查看日志文件获取详细错误信息
2. 阅读 [插件开发手册](../plugins/template/插件开发手册.md)
3. 在 GitHub 提交 Issue

