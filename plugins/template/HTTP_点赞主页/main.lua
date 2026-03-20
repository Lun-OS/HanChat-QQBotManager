-- HTTP点赞主页插件
-- 插件名称
plugin.name = "http_like_user"
plugin.version = "1.0.0"
plugin.description = "HTTP点赞主页插件 - 通过HTTP接口点赞用户主页"

-- 从配置读取认证密钥
local authKey = config.get("key", "")

-- 初始化函数
function on_init()
    log.info("HTTP点赞主页插件已启动")
    log.info("认证密钥已加载: " .. (authKey ~= "" and "是" or "否"))

    -- 注册HTTP接口（单插件模式，带selfID）
    local selfId = tostring(plugin.self_id)
    local success, err = http_interface.register("likeuser", selfId, function(ctx)
        log.info("收到HTTP请求: " .. ctx.method .. " " .. ctx.path)
        
        -- 只处理POST请求
        if ctx.method ~= "POST" then
            return {
                status = 405,
                headers = {
                    ["Content-Type"] = "application/json"
                },
                body = '{"success":false,"message":"只支持POST请求"}'
            }
        end
        
        -- 验证Authorization请求头
        if authKey ~= "" then
            local authHeader = ctx.headers["Authorization"] or ""
            -- 去除Bearer前缀
            if string.sub(authHeader, 1, 7) == "Bearer " then
                authHeader = string.sub(authHeader, 8)
            end
            
            if authHeader ~= authKey then
                log.warn("认证失败: Authorization不匹配")
                return {
                    status = 401,
                    headers = {
                        ["Content-Type"] = "application/json"
                    },
                    body = '{"success":false,"message":"认证失败"}'
                }
            end
        end
        
        -- 解析JSON请求体
        local body = ctx.body or ""
        local userId = nil
        local times = 1
        
        -- 简单的JSON解析
        if body ~= "" then
            -- 提取user_id
            local userIdPattern = '"user_id"%s*:%s*"?([^,}]+)"?'
            local userIdMatch = string.match(body, userIdPattern)
            if userIdMatch then
                userId = string.gsub(userIdMatch, '"', '')
            end
            
            -- 提取times
            local timesPattern = '"times"%s*:%s*"?([^,}]+)"?'
            local timesMatch = string.match(body, timesPattern)
            if timesMatch then
                times = tonumber(string.gsub(timesMatch, '"', '')) or 1
            end
        end
        
        -- 验证参数
        if not userId or userId == "" then
            return {
                status = 400,
                headers = {
                    ["Content-Type"] = "application/json"
                },
                body = '{"success":false,"message":"缺少user_id参数"}'
            }
        end
        
        -- 验证times范围
        if times < 1 then
            times = 1
        elseif times > 20 then
            times = 20
        end
        
        log.info("准备点赞用户主页: user_id=" .. tostring(userId) .. ", times=" .. tostring(times))
        
        -- 调用点赞接口
        local success, result = user.send_like(userId, times)
        
        if success then
            log.info("点赞成功: user_id=" .. tostring(userId) .. ", times=" .. tostring(times))
            return {
                status = 200,
                headers = {
                    ["Content-Type"] = "application/json"
                },
                body = string.format('{"success":true,"message":"点赞成功","user_id":"%s","times":%d}', 
                    tostring(userId), times)
            }
        else
            log.error("点赞失败: " .. tostring(result))
            return {
                status = 500,
                headers = {
                    ["Content-Type"] = "application/json"
                },
                body = string.format('{"success":false,"message":"点赞失败: %s"}', tostring(result))
            }
        end
    end, {"POST"})
    
    if not success then
        log.error("注册HTTP接口失败: " .. tostring(err))
    else
        log.info("HTTP接口已注册: /plugins/" .. selfId .. "/likeuser")
    end
end

-- 注册消息事件处理器
on_message(function(event)
    local msgType = msg.get_type(event)
    
    if msgType == "private" then
        local msg = msg.get_plain_text(event)
        local userId = event.user_id
        
        -- 检查是否是测试命令
        if msg == "http_test" then
            log.info("收到HTTP测试请求，用户ID: " .. tostring(userId))
            
            local helpMsg = "HTTP点赞接口已就绪！\n\n"
            helpMsg = helpMsg .. "访问路径：/plugins/" .. selfId .. "/likeuser\n"
            helpMsg = helpMsg .. "请求方法：POST\n"
            helpMsg = helpMsg .. "请求头：Authorization: Bearer " .. (authKey ~= "" and authKey or "配置中的key") .. "\n\n"
            helpMsg = helpMsg .. "请求格式：\n"
            helpMsg = helpMsg .. "POST /plugins/" .. selfId .. "/likeuser\n"
            helpMsg = helpMsg .. "Content-Type: application/json\n\n"
            helpMsg = helpMsg .. "{\n"
            helpMsg = helpMsg .. '  "user_id": 目标用户id,\n'
            helpMsg = helpMsg .. '  "times": 数量（1-20）\n'
            helpMsg = helpMsg .. "}"
            
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
    log.info("HTTP点赞主页插件已停止")
    
    -- 注销HTTP接口
    local success, err = http_interface.unregister("likeuser", selfId)
    if not success then
        log.error("注销HTTP接口失败: " .. tostring(err))
    else
        log.info("HTTP接口已注销: /plugins/" .. selfId .. "/likeuser")
    end
end
