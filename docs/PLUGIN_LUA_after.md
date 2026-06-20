## 事件系统
### 事件类型
```
-- 消息事件
on_message(function(event)
    -- event包含:
    --   post_type: "message"
    --   message_type: "group"/
    "private"
    --   user_id: 发送者ID
    --   group_id: 群号（群消息）
    --   message: 消息内容（数组格
    式）
    --   raw_message: 原始消息字
    符串
    --   plain_text: 纯文本内容
    --   message_id: 消息ID
    --   time: 发送时间戳
    --   sender: 发送者信息表
end)

-- 通知事件
on_notice(function(event)
    -- 群文件上传、管理员变动、群成
    员变动、群禁言、好友添加等
end)

-- 请求事件
on_request(function(event)
    -- 好友添加请求、群添加请求
end)

-- 消息发送事件
on_message_sent(function(event)
    -- 机器人发送消息后的回调
end)

-- 机器人状态变化事件
on_bot_status_change(function
(event)
    -- 在线状态变化
end)
```
### 事件数据结构 群消息事件
```
{
    post_type = "message",
    message_type = "group",
    time = 1234567890,
    self_id = "123456789",
    user_id = "987654321",
    group_id = "123456789",
    message_id = "12345",
    message = {
        {type = "text", data = 
        {text = "你好"}},
        {type = "at", data = 
        {qq = "123456789"}},
        {type = "image", data = 
        {url = "http://...", 
        file = "..."}}
    },
    raw_message = "你好[CQ:at,
    qq=123456789]",
    plain_text = "你好",
    sender = {
        user_id = "987654321",
        nickname = "用户昵称",
        card = "群名片",
        role = "member",  -- 
        owner/admin/member
        title = "专属头衔"
    }
}
``` 私聊消息事件
```
{
    post_type = "message",
    message_type = "private",
    time = 1234567890,
    self_id = "123456789",
    user_id = "987654321",
    message_id = "12345",
    message = {...},
    raw_message = "...",
    plain_text = "...",
    sender = {
        user_id = "987654321",
        nickname = "用户昵称"
    }
}
```
## 完整示例
### 示例1: 简单的关键词回复插件
```
-- 插件信息
plugin.name = "keyword_reply"
plugin.version = "1.0.0"
plugin.description = "关键词自动
回复插件"

-- 配置
local replies = {
    ["你好"] = "你好呀！",
    ["帮助"] = "我可以帮你：查询天
    气、讲笑话、查资料",
    ["时间"] = function()
        return "当前时间: " .. 
        os.date("%Y-%m-%d 
        %H:%M:%S")
    end
}

function on_init()
    log.info("关键词回复插件已启动
    ")
end

on_message(function(event)
    local text = msg.
    get_plain_text(event)
    
    for keyword, reply in pairs
    (replies) do
        if text:find(keyword) 
        then
            local response
            if type(reply) == 
            "function" then
                response = reply
                ()
            else
                response = reply
            end
            
            if msg.
            is_group_message
            (event) then
                message.
                send_group
                (event.
                group_id, 
                response)
            else
                message.
                send_private
                (event.user_id, 
                response)
            end
            break
        end
    end
end)

function on_destroy()
    log.info("关键词回复插件已停止
    ")
end
```
### 示例2: 群管助手插件
```
plugin.name = "group_manager"
plugin.version = "2.0.0"
plugin.description = "群管助手 - 
提供禁言、踢人等功能"

-- 管理员QQ列表
local admins = {
    ["123456789"] = true,
    ["987654321"] = true
}

-- 检查是否为管理员
local function isAdmin(userId)
    return admins[userId] == 
    true or msg.is_sender_owner
    (__blc_var___) or msg.
    is_sender_admin
    (__blc_var___)
end

on_message(function(event)
    if not msg.is_group_message
    (event) then
        return
    end
    
    local text = msg.
    get_plain_text(event)
    local userId = tostring(msg.
    get_sender_id(event))
    
    -- 禁言命令
    if text:find("^禁言%s+%d+%s
    +%d+$") then
        if not isAdmin(userId) 
        then
            message.reply_group
            (event.group_id, 
            event.message_id, "
            你没有权限使用此命令")
            return
        end
        
        local targetId, 
        duration = text:match("^
        禁言%s+(%d+)%s+(%d+)$")
        group.set_ban(event.
        group_id, targetId, 
        tonumber(duration) * 60)
        message.reply_group
        (event.group_id, event.
        message_id, "已禁言 
        " .. duration .. " 分钟
        ")
    end
    
    -- 解除禁言命令
    if text:find("^解除禁言%s+%d
    +$") then
        if not isAdmin(userId) 
        then
            return
        end
        
        local targetId = 
        text:match("^解除禁言%s
        +(%d+)$")
        group.set_ban(event.
        group_id, targetId, 0)
        message.reply_group
        (event.group_id, event.
        message_id, "已解除禁言")
    end
    
    -- 踢人命令
    if text:find("^踢出%s+%d
    +$") then
        if not isAdmin(userId) 
        then
            return
        end
        
        local targetId = 
        text:match("^踢出%s+(%d
        +)$")
        group.kick(event.
        group_id, targetId, 
        false)
        message.reply_group
        (event.group_id, event.
        message_id, "已踢出该成员
        ")
    end
    
    -- 全员禁言
    if text == "全员禁言" then
        if not isAdmin(userId) 
        then
            return
        end
        group.set_whole_ban
        (event.group_id, true)
        message.send_group
        (event.group_id, "已开启
        全员禁言")
    end
    
    -- 解除全员禁言
    if text == "解除全员禁言" 
    then
        if not isAdmin(userId) 
        then
            return
        end
        group.set_whole_ban
        (event.group_id, false)
        message.send_group
        (event.group_id, "已解除
        全员禁言")
    end
end)
```
### 示例3: 定时任务插件
```
plugin.name = "scheduled_tasks"
plugin.version = "1.0.0"
plugin.description = "定时任务示
例"

function on_init()
    log.info("定时任务插件已启动")
    
    -- 每天早上8点发送问候
    scheduler.daily(8, 0, 0, 
    function()
        local groups = group.
        get_list()
        for _, g in ipairs
        (groups) do
            message.send_group
            (g.group_id, "早上
            好！新的一天开始了~")
        end
    end)
    
    -- 每周一早上9点发送周报提醒
    scheduler.weekly(1, 9, 0, 
    0, function()
        local groups = group.
        get_list()
        for _, g in ipairs
        (groups) do
            message.send_group
            (g.group_id, "周一早
            上好！记得提交周报哦~")
        end
    end)
    
    -- 每5分钟检查一次系统状态
    scheduler.interval(300, 
    function()
        log.info("系统状态检查...
        ")
        -- 执行检查逻辑
    end)
end

function on_destroy()
    log.info("定时任务插件已停止")
end
```
### 示例4: 使用数据库存储的签到插件
```
plugin.name = "check_in"
plugin.version = "1.0.0"
plugin.description = "群签到系统"

-- 打开数据库
local db = db.open
("checkin_data")

on_message(function(event)
    if not msg.is_group_message
    (event) then
        return
    end
    
    local text = msg.
    get_plain_text(event)
    local userId = msg.
    get_sender_id(event)
    local groupId = event.
    group_id
    
    if text == "签到" then
        -- 查询今日是否已签到
        local today = os.date
        ("%Y-%m-%d")
        local records = db:query
        ({
            user_id = userId,
            group_id = groupId,
            date = today
        })
        
        if #records > 0 then
            message.reply_group
            (groupId, event.
            message_id, "你今天已
            经签到过了！")
            return
        end
        
        -- 查询连续签到天数
        local allRecords = 
        db:query({user_id = 
        userId, group_id = 
        groupId})
        local streak = 1
        
        -- 插入签到记录
        db:insert({
            user_id = userId,
            group_id = groupId,
            date = today,
            time = os.time()
        })
        
        message.reply_group
        (groupId, event.
        message_id, 
            "签到成功！连续签到 
            " .. streak .. " 天
            ")
    end
    
    if text == "签到排行" then
        local records = db:query
        ({group_id = groupId})
        -- 统计每个人的签到次数
        local stats = {}
        for _, r in ipairs
        (records) do
            stats[r.user_id] = 
            (stats[r.user_id] 
            or 0) + 1
        end
        
        -- 排序并显示前10名
        local sorted = {}
        for uid, count in pairs
        (stats) do
            table.insert
            (sorted, {user_id = 
            uid, count = count})
        end
        table.sort(sorted, 
        function(a, b) return a.
        count > b.count end)
        
        local msg_text = "🏆 签
        到排行榜 TOP10\n"
        for i = 1, math.min(10, 
        #sorted) do
            msg_text = 
            msg_text .. i .. ". 
            " .. sorted[i].
            user_id .. " - " .. 
            sorted[i].count .. "
            次\n"
        end
        
        message.send_group
        (groupId, msg_text)
    end
end)
```
## 最佳实践
### 1. 错误处理
```
-- 始终检查API返回值
local success, result = message.
send_group(123456789, "消息")
if not success then
    log.error("发送消息失败: 
    " .. tostring(result))
end

-- 使用pcall保护危险操作
local ok, err = pcall(function()
    -- 可能出错的操作
end)
if not ok then
    log.error("操作失败: " .. 
    err)
end
```
### 2. 性能优化
```
-- 避免在事件处理器中执行耗时操作
-- 如需执行，使用异步方式

on_message(function(event)
    -- 快速响应
    message.reply_group(event.
    group_id, event.message_id, 
    "处理中...")
    
    -- 耗时操作放到后面或使用
    coroutine
    -- ...
end)
```
### 3. 安全配置
```
-- 始终验证操作权限
local function isAuthorized
(userId)
    -- 验证用户是否在白名单中
    return whitelist[userId] == 
    true
end

-- 限制操作频率
local lastOperation = {}
on_message(function(event)
    local userId = msg.
    get_sender_id(event)
    local now = os.time()
    
    if lastOperation[userId] 
    and now - lastOperation
    [userId] < 60 then
        message.reply_group
        (event.group_id, event.
        message_id, "操作太频繁，
        请稍后再试")
        return
    end
    
    lastOperation[userId] = now
    -- 执行操作
end)
```
### 4. 代码组织
```
-- 将功能模块化
local function handleCommand
(event, command)
    -- 命令处理逻辑
end

local function handleMessage
(event)
    -- 消息处理逻辑
end

on_message(function(event)
    local text = msg.
    get_plain_text(event)
    
    if text:sub(1, 1) == "/" 
    then
        handleCommand(event, 
        text)
    else
        handleMessage(event)
    end
end)
```
### 5. 日志记录
```
-- 记录关键操作
log.info("用户 " .. userId .. " 
执行了 " .. command)

-- 使用结构化日志
log.info({
    action = "send_message",
    target = groupId,
    content_length = #message
})
```

### 6. gopher-lua 大数字 Key 内存问题

在使用哈希表存储用户ID等大数字时，**禁止使用数字作为表的 key**，否则会导致严重的内存问题。

**错误示例（内存暴涨）**：
```lua
local BLACKLIST = {
    [2970293688] = true,     -- 大数字作为key
    [2265407768] = true,
    [66600000] = true
}

-- 查询时也会导致问题
local uid = tonumber(friend.user_id)
if BLACKLIST[uid] then  -- 使用数字key查询
    -- 过滤
end
```

**正确示例（内存正常）**：
```lua
local BLACKLIST = {
    ["2970293688"] = true,   -- 字符串作为key
    ["2265407768"] = true,
    ["66600000"] = true
}

-- 查询时转换为字符串
local uid = tonumber(friend.user_id)
local uid_str = tostring(uid)
if uid and not BLACKLIST[uid_str] then  -- 使用字符串key查询
    -- 过滤
end
```

**问题原因**：gopher-lua（Go语言实现的Lua虚拟机）在处理大数字作为哈希表key时存在内存分配问题，大数字key会导致内存暴涨数GB。

**适用场景**：用户ID、群号、消息ID等QQ号段的数字都应使用字符串形式存储和查询。