-- 指定消息撤回插件
plugin.name = "retract_specified_message"
plugin.version = "1.0.0"
plugin.description = "管理员通过回复消息并@机器人+关键字来撤回指定消息"

-- 配置缓存
local adminList = {}
local groupList = {}
local keyword = "撤回"

-- 工具：数组包含（数字/字符串统一转字符串比较）
local function isInArray(arr, val)
    if not arr then return false end
    local target = tostring(val)
    for _, v in ipairs(arr) do
        if tostring(v) == target then return true end
    end
    return false
end

-- 工具：从配置中读取数组
local function getConfigArray(cfg, key)
    local v = cfg[key]
    if not v then return {} end
    local result = {}
    if type(v) == "table" then
        local i = 1
        while v[i] ~= nil do
            table.insert(result, tonumber(v[i]) or tostring(v[i]))
            i = i + 1
        end
    elseif type(v) == "number" or type(v) == "string" then
        table.insert(result, tonumber(v) or tostring(v))
    end
    return result
end

function on_init()
    log.info("指定消息撤回插件初始化...")
    
    -- 读取配置
    local cfg = config.all()
    adminList = getConfigArray(cfg, "admin")
    groupList = getConfigArray(cfg, "group_list")
    keyword = cfg["Keywords"] or "撤回"
    
    log.info("配置-管理员列表: " .. table.concat(adminList, ", "))
    log.info("配置-群列表: " .. table.concat(groupList, ", "))
    log.info("配置-关键字: " .. tostring(keyword))
    log.info("初始化完成")
end

on_message(function(event)
    log.info("收到新消息事件")
    log.info("消息类型: " .. tostring(event.message_type))
    log.info("事件类型: " .. tostring(event.post_type))
    
    -- 仅处理post_type为message的事件，忽略message_sent事件
    if event.post_type ~= "message" then
        log.info("不是message事件，跳过处理")
        return
    end
    
    -- 仅处理群消息
    if event.message_type ~= "group" then
        log.info("不是群消息，跳过处理")
        return
    end
    
    local groupId = event.group_id
    local userId = event.user_id
    local botId = event.self_id
    
    log.info("群ID: " .. tostring(groupId))
    log.info("用户ID: " .. tostring(userId))
    log.info("机器人ID: " .. tostring(botId))
    
    -- 群过滤：仅处理配置中的群（若配置为空，默认处理所有群）
    log.info("群列表数量: " .. tostring(#groupList))
    if #groupList > 0 then
        local inGroupList = isInArray(groupList, groupId)
        log.info("是否在群列表中: " .. tostring(inGroupList))
        if not inGroupList then
            log.info("不在群列表中，跳过处理")
            return
        end
    else
        log.info("群列表为空，处理所有群消息")
    end
    
    -- 使用新API检查是否@了机器人或回复消息
    -- botId需要转换为数字类型
    local botIdNum = tonumber(botId) or 0
    local isAt = msg.is_at_bot(event, botIdNum)
    
    -- 添加详细日志来调试消息结构
    log.info("事件消息段类型: " .. type(event.message))
    if type(event.message) == "table" then
        log.info("消息段长度: " .. tostring(#event.message))
        for i, seg in ipairs(event.message) do
            log.info("消息段 " .. i .. " 类型: " .. tostring(seg.type))
            if seg.type == "reply" then
                log.info("回复消息段数据: " .. (seg.data and tostring(seg.data.id) or "nil"))
            end
        end
    end
    
    local replyId = msg.get_reply_id(event)
    log.info("是否@了机器人: " .. tostring(isAt))
    log.info("是否有回复消息ID: " .. tostring(replyId ~= nil))
    log.info("实际回复ID值: " .. tostring(replyId))
    log.info("回复ID类型: " .. type(replyId))
    log.info("原始raw_message: " .. tostring(event.raw_message or "nil"))
    if not (isAt or replyId) then
        log.info("没有@机器人且没有回复消息，跳过处理")
        return
    end
    
    -- 使用新API检查是否包含关键字
    local hasKeyword = msg.contains_keyword(event, keyword)
    if not hasKeyword then
        log.info("不包含关键字，跳过处理")
        return
    end
    
    -- 检查是否是管理员
    log.info("管理员列表: " .. table.concat(adminList, ", "))
    local isAdmin = isInArray(adminList, userId)
    log.info("是否是管理员: " .. tostring(isAdmin))
    if not isAdmin then
        log.info("不是管理员，跳过处理")
        return
    end
    
    -- 获取要撤回的消息ID
    local targetMessageId = nil
    
    -- 优先从回复消息中获取ID
    if replyId then
        targetMessageId = replyId
        log.info("从回复消息中获取目标消息ID: " .. tostring(targetMessageId))
        log.info("目标消息ID类型: " .. type(targetMessageId))
        
        -- 如果ID是负数字符串，尝试转换
        if type(targetMessageId) == "string" then
            local numId = tonumber(targetMessageId)
            if numId and numId < 0 then
                -- 负数ID可能需要特殊处理，先记录下来
                log.info("发现负数消息ID，原始值: " .. targetMessageId)
                -- 对于LLOneBot，负数ID通常是有效的，不需要转换
            end
        end
    else
        -- 如果没有回复消息，检查是否在文本中包含了消息ID
        -- 检查消息文本是否包含消息ID（例如：$撤回 123456789）
        local plainText = msg.get_plain_text(event) or ""
        if plainText and plainText ~= "" then
            -- 提取消息ID（从指令后提取数字）
            local textWithoutKeyword = string.gsub(plainText, keyword, "", 1)
            textWithoutKeyword = string.gsub(textWithoutKeyword, "^%s+", "") -- 移除开头空白
            textWithoutKeyword = string.gsub(textWithoutKeyword, "%s+$", "") -- 移除结尾空白
            
            -- 如果剩余文本是数字，认为是要撤回的消息ID
            if textWithoutKeyword and string.match(textWithoutKeyword, "^%d+$") then
                targetMessageId = tonumber(textWithoutKeyword)
                log.info("从文本中解析到目标消息ID: " .. tostring(targetMessageId))
            end
        end
        
        if not targetMessageId then
            log.warn("未找到要撤回的消息ID，需要回复消息或提供消息ID")
            return
        end
    end
    
    local replyMessageId = targetMessageId
    
    -- 尝试撤回消息
    log.info("准备撤回消息，消息ID: " .. tostring(replyMessageId) .. ", 类型: " .. type(replyMessageId))
    local ok, err = message.delete_msg(replyMessageId)
    if ok then
        log.info("消息撤回成功: " .. tostring(replyMessageId))
    else
        log.error("消息撤回失败: " .. tostring(err or "未知错误") .. ", messageId: " .. tostring(replyMessageId))
        
        -- 发送错误消息（保留错误提示，但移除成功提示）
        local errorMsg = "❌ 消息撤回失败: " .. tostring(err or "未知错误") .. "\nID: " .. tostring(replyMessageId)
        if event.message_type == "group" then
            message.send_group(event.group_id, errorMsg)
        else
            message.send_private(event.user_id, errorMsg)
        end
    end
end)

function on_destroy()
    log.info("指定消息撤回插件停止")
end