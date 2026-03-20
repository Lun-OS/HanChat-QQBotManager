-- 自动回复插件示例
-- 插件名称
plugin.name = "auto_reply"
plugin.version = "2.0.0"
plugin.description = "自动回复插件 - 支持@机器人和关键字匹配自动回复"

-- 读取配置
local replyText = config.get("reply_text", "你好！")
local triggerWord = config.get("trigger_word", "你好")

-- 初始化函数
function on_init()
    log.info("自动回复插件已启动")
    log.info("触发词: " .. triggerWord)
    log.info("回复内容: " .. replyText)
end

-- 注册消息事件处理器
on_message(function(event)
    -- 检查消息类型
    local msgType = msg.get_type(event)
    
    -- 只检查是否包含关键字
    local shouldReply = false
    if msgType == "group" then
        -- 群消息：包含关键字
        shouldReply = msg.contains_keyword(event, triggerWord)
    elseif msgType == "private" then
        -- 私聊消息：包含关键字
        shouldReply = msg.contains_keyword(event, triggerWord)
    end
    
    if shouldReply then
        local msgContent = msg.get_plain_text(event)
        log.info("收到触发消息，准备回复: " .. msgContent)
        
        if msgType == "group" then
            -- 群消息回复
            local success, result = message.send_group(event.group_id, replyText)
            if success then
                log.info("群消息回复成功")
            else
                log.error("群消息回复失败: " .. tostring(result))
            end
        elseif msgType == "private" then
            -- 私聊消息回复
            local success, result = message.send_private(event.user_id, replyText)
            if success then
                log.info("私聊消息回复成功")
            else
                log.error("私聊消息回复失败: " .. tostring(result))
            end
        end
    end
end)

-- 清理函数
function on_destroy()
    log.info("自动回复插件已停止")
end

