-- HTTP私发送消息及好友管理插件（兼容无JSON库环境）
-- 插件名称
plugin.name = "http_private_helper"
plugin.version = "1.1.1"
plugin.description = "HTTP私聊助手 - 通过HTTP接口发送私聊消息、获取好友列表"

-- 从配置读取认证密钥
local authKey = config.get("key", "")

-- 辅助函数：验证 Authorization 头
local function check_auth(headers)
    if authKey == "" then
        return true -- 未设置密钥，视为认证通过
    end
    local authHeader = headers["Authorization"] or ""
    -- 去除Bearer前缀
    if string.sub(authHeader, 1, 7) == "Bearer " then
        authHeader = string.sub(authHeader, 8)
    end
    return authHeader == authKey
end

-- 手动构建 JSON 响应（不依赖外部库）
local function json_response(status, success, message, data)
    local parts = {}
    table.insert(parts, '{')
    table.insert(parts, '"success":' .. (success and "true" or "false"))
    -- 转义消息中的双引号
    local safe_message = tostring(message):gsub('"', '\\"')
    table.insert(parts, ',"message":"' .. safe_message .. '"')
    
    if data then
        table.insert(parts, ',"data":[')
        local items = {}
        for _, item in ipairs(data) do
            local item_parts = {}
            table.insert(item_parts, '{')
            -- 转义每个字段中的双引号
            local user_id = tostring(item.user_id):gsub('"', '\\"')
            local nickname = tostring(item.nickname):gsub('"', '\\"')
            local remark = tostring(item.remark or ""):gsub('"', '\\"')
            table.insert(item_parts, '"user_id":"' .. user_id .. '"')
            table.insert(item_parts, ',"nickname":"' .. nickname .. '"')
            table.insert(item_parts, ',"remark":"' .. remark .. '"')
            table.insert(item_parts, '}')
            table.insert(items, table.concat(item_parts))
        end
        table.insert(parts, table.concat(items, ','))
        table.insert(parts, ']')
    end
    table.insert(parts, '}')
    
    return {
        status = status,
        headers = { ["Content-Type"] = "application/json" },
        body = table.concat(parts)
    }
end

-- 初始化函数
function on_init()
    log.info("HTTP私聊助手插件已启动")
    log.info("认证密钥已加载: " .. (authKey ~= "" and "是" or "否"))

    -- 注册HTTP接口：发送私聊消息 (POST)（单插件模式，带selfID）
    local selfId = tostring(plugin.self_id)
    local success1, err1 = http_interface.register("sendprivate", selfId, function(ctx)
        log.info("收到HTTP请求 [sendprivate]: " .. ctx.method)
        
        if ctx.method ~= "POST" then
            return json_response(405, false, "只支持POST请求")
        end
        
        if not check_auth(ctx.headers) then
            log.warn("认证失败: Authorization不匹配")
            return json_response(401, false, "认证失败")
        end
        
        -- 简化的JSON解析（实际项目建议使用完整JSON库）
        local body = ctx.body or ""
        local userId = string.match(body, '"user_id"%s*:%s*([^,}]+)')
        if userId then
            userId = string.gsub(userId, '"', '')
            userId = string.gsub(userId, "%s+", "")
        end
        
        local messageText = string.match(body, '"text"%s*:%s*"([^"]+)"')
        if messageText then
            messageText = string.gsub(messageText, "\\n", "\n")
        end
        
        if not userId or userId == "" then
            return json_response(400, false, "缺少user_id参数")
        end
        if not messageText or messageText == "" then
            return json_response(400, false, "缺少message参数")
        end
        
        log.info("准备发送私聊消息: user_id=" .. tostring(userId))
        local success, result = message.send_private(userId, messageText)
        
        if success then
            log.info("发送私聊消息成功")
            return json_response(200, true, "发送成功", { user_id = userId })
        else
            log.error("发送私聊消息失败: " .. tostring(result))
            return json_response(500, false, "发送失败: " .. tostring(result))
        end
    end, {"POST"})
    
    -- 注册新接口：获取好友列表 (GET)（单插件模式，带selfID）
    local success2, err2 = http_interface.register("get_friends", selfId, function(ctx)
        log.info("收到HTTP请求 [get_friends]: " .. ctx.method)
        
        if ctx.method ~= "GET" then
            return json_response(405, false, "只支持GET请求")
        end
        
        if not check_auth(ctx.headers) then
            log.warn("认证失败: Authorization不匹配")
            return json_response(401, false, "认证失败")
        end
        
        log.info("正在获取好友列表...")
        local friends, result = user.get_friends()
        
        if friends and friends.data then
            log.info("获取好友列表成功，数量: " .. tostring(#friends.data))
            local friendList = {}
            for i, friend in ipairs(friends.data) do
                table.insert(friendList, {
                    user_id = tostring(friend.user_id),
                    nickname = friend.nickname,
                    remark = friend.remark or ""
                })
            end
            return json_response(200, true, "获取好友列表成功", friendList)
        else
            log.error("获取好友列表失败: " .. tostring(result))
            return json_response(500, false, "获取好友列表失败: " .. tostring(result))
        end
    end, {"GET"})
    
    if not success1 then
        log.error("注册接口 [/sendprivate] 失败: " .. tostring(err1))
    else
        log.info("HTTP接口已注册: /plugins/" .. selfId .. "/sendprivate [POST]")
    end
    
    if not success2 then
        log.error("注册接口 [/get_friends] 失败: " .. tostring(err2))
    else
        log.info("HTTP接口已注册: /plugins/" .. selfId .. "/get_friends [GET]")
    end
end

-- 注册消息事件处理器（用于测试指令，保持不变）
on_message(function(event)
    local msgType = msg.get_type(event)
    if msgType == "private" then
        local msg = msg.get_plain_text(event)
        local userId = event.user_id
        
        if msg == "http_test" then
            log.info("收到HTTP测试请求，用户ID: " .. tostring(userId))
            local helpMsg = "HTTP私发送消息接口已就绪！\n\n" ..
                "访问路径：/plugins/" .. selfId .. "/sendprivate [POST]\n" ..
                "        /plugins/" .. selfId .. "/get_friends [GET]\n" ..
                "请求头：Authorization: Bearer " .. (authKey ~= "" and authKey or "配置中的key") .. "\n\n" ..
                "POST /plugins/sendprivate 格式示例：\n" ..
                "{\n  \"user_id\": 目标用户id,\n  \"message\": [{\"type\":\"text\",\"data\":{\"text\":\"消息内容\\n换行\"}}]\n}"
            local success, result = message.send_private(userId, helpMsg)
            if success then
                log.info("已发送HTTP测试响应")
            else
                log.error("发送HTTP测试响应失败: " .. tostring(result))
            end
        end
    end
end)

-- 清理函数
function on_destroy()
    log.info("HTTP私聊助手插件已停止")
    
    local selfId = tostring(bot.get_id())
    local ok1, err1 = http_interface.unregister("sendprivate", selfId)
    if not ok1 then log.error("注销接口 [/sendprivate] 失败: " .. tostring(err1)) end
    
    local ok2, err2 = http_interface.unregister("get_friends", selfId)
    if not ok2 then log.error("注销接口 [/get_friends] 失败: " .. tostring(err2)) end
end