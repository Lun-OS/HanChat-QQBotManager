-- 群消息同步插件
-- 插件名称
plugin.name = "群消息同步"
plugin.version = "1.0.0"
plugin.description = "群消息同步插件 - 同步指定群的消息到其他群，支持黑名单过滤"

-- 配置变量
local groupList = {}  -- 源群列表
local blacklist = {}  -- 黑名单用户列表
local logFile = "message.log"  -- 日志文件名
local prohibitedWords = {}  -- 违禁词列表

-- 缓存变量
local groupNameCache = {}  -- 群名称缓存 {group_id = group_name}
local userNameCache = {}   -- 用户名称缓存 {user_id = user_name}
local cacheExpireTime = 3600  -- 缓存过期时间（秒），1小时
local cacheUpdateTime = {}    -- 缓存更新时间 {key = timestamp}

-- 辅助函数：从配置中读取数组
local function getConfigArray(config, key, defaultKey)
    local value = config[key]
    if not value then
        value = config[defaultKey]
    end
    
    if not value then
        return {}
    end
    
    local result = {}
    if type(value) == "table" then
        local idx = 1
        while value[idx] do
            local v = value[idx]
            local numVal = tonumber(v)
            if numVal then
                table.insert(result, numVal)
            else
                table.insert(result, tostring(v))
            end
            idx = idx + 1
        end
    elseif type(value) == "number" or type(value) == "string" then
        table.insert(result, tonumber(value) or value)
    end
    
    return result
end

-- 辅助函数：检查数字是否在数组中
local function isInArray(arr, value)
    for _, v in ipairs(arr) do
        if tonumber(v) == tonumber(value) then
            return true
        end
    end
    return false
end

-- 辅助函数：将表转换为字符串（用于日志）
local function tableToString(tbl, indent)
    indent = indent or 0
    local str = ""
    local indentStr = string.rep("  ", indent)
    
    if type(tbl) == "table" then
        str = str .. "{\n"
        for k, v in pairs(tbl) do
            if type(v) == "table" then
                str = str .. indentStr .. "  " .. tostring(k) .. " = " .. tableToString(v, indent + 1) .. ",\n"
            else
                str = str .. indentStr .. "  " .. tostring(k) .. " = " .. tostring(v) .. ",\n"
            end
        end
        str = str .. indentStr .. "}"
    else
        str = tostring(tbl)
    end
    
    return str
end

-- 辅助函数：写入日志文件（异步，不阻塞）
local function writeLog(content)
    local success, err = pcall(function()
        local existingContent = ""
        local fileExists = file.exists(logFile)
        if fileExists then
            local readResult, readErr = file.read(logFile)
            if readResult and readResult ~= "" and not readErr then
                existingContent = readResult
            end
        end
        
        local newContent = existingContent .. content
        local writeSuccess, writeErr = file.write(logFile, newContent)
        if not writeSuccess then
            error("写入文件失败: " .. tostring(writeErr or "未知错误"))
        end
    end)
    if not success then
        log.error("写入日志文件失败: " .. tostring(err))
    end
end

-- 辅助函数：获取用户名称（带缓存），优化版
local function getUserName(userId, event)
    local currentTime = os.time()
    local cacheKey = tostring(userId)
    
    if userNameCache[cacheKey] and cacheUpdateTime["user_" .. cacheKey] then
        local cacheAge = currentTime - cacheUpdateTime["user_" .. cacheKey]
        if cacheAge < cacheExpireTime then
            log.debug("从缓存获取用户名: " .. tostring(userId) .. " = " .. userNameCache[cacheKey])
            return userNameCache[cacheKey]
        end
    end
    
    local userName = "Unknown"
    
    -- 优先从事件的 sender 字段获取用户名称（这是最常用和可靠的方式）
    if event and event.sender then
        if event.sender.card and event.sender.card ~= "" then
            userName = tostring(event.sender.card)
            log.info("✓ 从事件 sender.card 获取用户名: " .. userName .. ", 用户ID: " .. tostring(userId))
        elseif event.sender.nickname then
            userName = tostring(event.sender.nickname)
            log.info("✓ 从事件 sender.nickname 获取用户名: " .. userName .. ", 用户ID: " .. tostring(userId))
        elseif event.sender.nick then
            userName = tostring(event.sender.nick)
            log.info("✓ 从事件 sender.nick 获取用户名: " .. userName .. ", 用户ID: " .. tostring(userId))
        elseif event.sender.name then
            userName = tostring(event.sender.name)
            log.info("✓ 从事件 sender.name 获取用户名: " .. userName .. ", 用户ID: " .. tostring(userId))
        end
        
        if userName ~= "Unknown" then
            userNameCache[cacheKey] = userName
            cacheUpdateTime["user_" .. cacheKey] = currentTime
            log.info("用户名称已缓存: " .. tostring(userId) .. " = " .. userName)
            return userName
        end
    end
    
    -- 如果事件中没有找到，则尝试通过API获取
    log.info("开始调用 user.get_info 获取用户信息，用户ID: " .. tostring(userId))
    
    local userInfo = user.get_info(userId)
    
    if userInfo == nil then
        log.error("user.get_info 返回 nil，用户ID: " .. tostring(userId) .. "，API调用可能失败")
        return userName
    end
    
    if type(userInfo) ~= "table" then
        log.error("user.get_info 返回的不是表类型，类型: " .. type(userInfo) .. ", 值: " .. tostring(userInfo))
        return userName
    end
    
    log.info("成功获取用户信息表，用户ID: " .. tostring(userId))
    
    if userInfo.success ~= nil and userInfo.success == false then
        log.error("API返回 success=false，用户ID: " .. tostring(userId))
        return userName
    end
    
    local dataTable = userInfo.data
    if dataTable and type(dataTable) == "table" then
        log.info("找到 data 字段，用户ID: " .. tostring(userId))
        if dataTable.nickname then
            userName = tostring(dataTable.nickname)
            log.info("✓ 成功从 userInfo.data.nickname 获取用户名: " .. userName .. ", 用户ID: " .. tostring(userId))
        elseif dataTable.nick then
            userName = tostring(dataTable.nick)
            log.info("✓ 成功从 userInfo.data.nick 获取用户名: " .. userName .. ", 用户ID: " .. tostring(userId))
        elseif dataTable.name then
            userName = tostring(dataTable.name)
            log.info("✓ 成功从 userInfo.data.name 获取用户名: " .. userName .. ", 用户ID: " .. tostring(userId))
        else
            log.warn("userInfo.data 表中没有找到 nickname/nick/name 字段")
        end
    elseif userInfo.nickname then
        userName = tostring(userInfo.nickname)
        log.info("✓ 成功从 userInfo.nickname 获取用户名: " .. userName .. ", 用户ID: " .. tostring(userId))
    elseif userInfo.nick then
        userName = tostring(userInfo.nick)
        log.info("✓ 成功从 userInfo.nick 获取用户名: " .. userName .. ", 用户ID: " .. tostring(userId))
    elseif userInfo.name then
        userName = tostring(userInfo.name)
        log.info("✓ 成功从 userInfo.name 获取用户名: " .. userName .. ", 用户ID: " .. tostring(userId))
    else
        log.warn("用户信息表中没有找到任何用户名字段")
    end
    
    if userName ~= "Unknown" then
        userNameCache[cacheKey] = userName
        cacheUpdateTime["user_" .. cacheKey] = currentTime
        log.info("用户名称已缓存: " .. tostring(userId) .. " = " .. userName)
    else
        log.warn("无法获取用户名称，使用默认值 Unknown，用户ID: " .. tostring(userId))
    end
    
    return userName
end

-- 修复核心：获取群名称（优先用event自带group_name，API兜底）
local function getGroupName(groupId, event)
    -- 1. 优先使用事件自带的group_name（最可靠，无需API调用）
    if event and event.group_name and type(event.group_name) == "string" and event.group_name ~= "" then
        log.debug("从事件直接获取群名称: " .. event.group_name .. " (群ID: " .. tostring(groupId) .. ")")
        return event.group_name
    end
    
    -- 2. 检查缓存
    local currentTime = os.time()
    local cacheKey = tostring(groupId)
    if groupNameCache[cacheKey] and cacheUpdateTime["group_" .. cacheKey] then
        local cacheAge = currentTime - cacheUpdateTime["group_" .. cacheKey]
        if cacheAge < cacheExpireTime then
            log.debug("从缓存获取群名称: " .. groupNameCache[cacheKey] .. " (群ID: " .. tostring(groupId) .. ")")
            return groupNameCache[cacheKey]
        end
    end
    
    -- 3. API调用兜底（仅当事件无group_name时使用）
    local groupName = "Unknown"
    local ok, groupInfo = pcall(function()
        return group.get_info(groupId)
    end)
    
    if ok and groupInfo and groupInfo ~= nil then
        -- 兼容多种返回格式
        if groupInfo.data then
            groupName = groupInfo.data.group_name or groupInfo.data.name or groupName
        else
            groupName = groupInfo.group_name or groupInfo.name or groupName
        end
    end
    
    -- 更新缓存
    if groupName ~= "Unknown" then
        groupNameCache[cacheKey] = groupName
        cacheUpdateTime["group_" .. cacheKey] = currentTime
        log.debug("API获取并缓存群名称: " .. groupName .. " (群ID: " .. tostring(groupId) .. ")")
    else
        log.warn("无法获取群名称，使用默认值 Unknown (群ID: " .. tostring(groupId) .. ")")
    end
    
    return groupName
end

-- 辅助函数：格式化消息ID（每4个字符加一个点）
local function formatMessageId(messageId)
    local msgIdStr = tostring(messageId)
    local isNegative = false
    if string.sub(msgIdStr, 1, 1) == "-" then
        isNegative = true
        msgIdStr = string.sub(msgIdStr, 2)
    end
    
    local formatted = ""
    local len = string.len(msgIdStr)
    for i = 1, len do
        if i > 1 and (i - 1) % 4 == 0 then
            formatted = formatted .. "."
        end
        formatted = formatted .. string.sub(msgIdStr, i, i)
    end
    
    if isNegative then
        formatted = "-" .. formatted
    end
    
    return formatted
end

-- 辅助函数：读取违禁词列表
local function loadProhibitedWords()
    local prohibitedWordsFile = "Prohibited_words.json"
    prohibitedWords = {}
    
    local success, content = pcall(function()
        local result, err = file.read(prohibitedWordsFile)
        if err then
            error("读取违禁词文件失败: " .. tostring(err))
        end
        return result
    end)
    
    if not success or not content then
        log.warn("无法读取违禁词文件: " .. prohibitedWordsFile .. "，将使用空列表")
        return
    end
    
    local wordsPattern = '"words"%s*:%s*%['
    local wordsStart = string.find(content, wordsPattern)
    
    if wordsStart then
        local arrayStart = string.find(content, '%[', wordsStart)
        if arrayStart then
            local depth = 0
            local i = arrayStart
            local arrayEnd = nil
            while i <= #content do
                local char = string.sub(content, i, i)
                if char == '[' then
                    depth = depth + 1
                elseif char == ']' then
                    depth = depth - 1
                    if depth == 0 then
                        arrayEnd = i
                        break
                    end
                end
                i = i + 1
            end
            
            if arrayEnd then
                local arrayContent = string.sub(content, arrayStart + 1, arrayEnd - 1)
                for word in string.gmatch(arrayContent, '"([^"]+)"') do
                    word = string.gsub(word, "^%s+", "")
                    word = string.gsub(word, "%s+$", "")
                    word = string.gsub(word, ",%s*$", "")
                    word = string.gsub(word, "^%s*,%s*", "")
                    if word and word ~= "" and word ~= "words" then
                        table.insert(prohibitedWords, word)
                    end
                end
            end
        end
    end
    
    if #prohibitedWords == 0 then
        log.warn("使用宽松模式解析违禁词文件")
        for word in string.gmatch(content, '"([^"]+)"') do
            if word and word ~= "" and word ~= "words" then
                local exists = false
                for _, w in ipairs(prohibitedWords) do
                    if w == word then
                        exists = true
                        break
                    end
                end
                if not exists then
                    table.insert(prohibitedWords, word)
                end
            end
        end
    end
    
    log.info("已加载 " .. tostring(#prohibitedWords) .. " 个违禁词")
    if #prohibitedWords > 0 and #prohibitedWords <= 10 then
        log.debug("违禁词示例: " .. table.concat(prohibitedWords, ", ", 1, math.min(5, #prohibitedWords)))
    end
end

-- 辅助函数：检查消息是否包含违禁词
local function containsProhibitedWord(message)
    if not message or message == "" then
        return false, nil
    end
    
    message = tostring(message)
    for _, word in ipairs(prohibitedWords) do
        if word and word ~= "" then
            local lowerMessage = string.lower(message)
            local lowerWord = string.lower(word)
            if string.find(lowerMessage, lowerWord, 1, true) then
                return true, word
            end
        end
    end
    
    return false, nil
end

-- 辅助函数：检测并转换图片消息为文字（OCR）
local function convertImageToText(event)
    if not event.message or type(event.message) ~= "table" then
        return nil, nil
    end
    
    local imageFile = nil
    local imageUrl = nil
    
    local idx = 1
    while event.message[idx] do
        local segment = event.message[idx]
        if type(segment) == "table" then
            local segType = segment.type or segment.data_type
            if segType == "image" or segType == "img" then
                if segment.file then
                    imageFile = segment.file
                elseif segment.url then
                    imageUrl = segment.url
                elseif segment.data and type(segment.data) == "table" then
                    imageFile = segment.data.file or segment.data.url
                    imageUrl = segment.data.url
                end
                break
            end
        end
        idx = idx + 1
    end
    
    if not imageFile and not imageUrl then
        return nil, "未找到图片信息"
    end
    
    local imageParam = imageFile or imageUrl
    if not imageParam or imageParam == "" then
        return nil, "图片参数为空"
    end
    
    log.info("检测到图片消息，开始OCR识别，图片: " .. tostring(imageParam))
    
    local ocrResult, ocrErr = message.ocr_image(imageParam)
    
    if ocrErr then
        log.error("OCR请求失败，错误信息: " .. tostring(ocrErr))
        return nil, "OCR请求失败: " .. tostring(ocrErr)
    end
    
    if not ocrResult then
        log.warn("OCR请求返回nil（可能是超时或服务错误）")
        return nil, "OCR请求返回nil（可能是超时或服务错误）"
    end
    
    if type(ocrResult) ~= "table" then
        log.warn("OCR请求返回类型错误: " .. type(ocrResult) .. ", 值: " .. tostring(ocrResult))
        return nil, "OCR请求返回类型错误: " .. type(ocrResult)
    end
    
    log.debug("OCR响应类型: table, 字段数量: " .. tostring(#ocrResult))
    
    if ocrResult.status and ocrResult.status ~= "ok" then
        local retcode = ocrResult.retcode or -1
        log.warn("OCR请求失败: status=" .. tostring(ocrResult.status) .. ", retcode=" .. tostring(retcode))
        return nil, "OCR请求失败: status=" .. tostring(ocrResult.status) .. ", retcode=" .. tostring(retcode)
    end
    
    local text = nil
    if ocrResult.data then
        if type(ocrResult.data) == "table" then
            if ocrResult.data.texts and type(ocrResult.data.texts) == "table" then
                local texts = {}
                local textIdx = 1
                while ocrResult.data.texts[textIdx] do
                    local textItem = ocrResult.data.texts[textIdx]
                    if type(textItem) == "table" then
                        local itemText = textItem.text or textItem.content or textItem.data
                        if itemText and itemText ~= "" then
                            table.insert(texts, tostring(itemText))
                        end
                    elseif type(textItem) == "string" then
                        table.insert(texts, textItem)
                    end
                    textIdx = textIdx + 1
                end
                if #texts > 0 then
                    text = table.concat(texts, " ")
                end
            else
                text = ocrResult.data.text or ocrResult.data.content or ocrResult.data.message
            end
        elseif type(ocrResult.data) == "string" then
            text = ocrResult.data
        end
    elseif ocrResult.text then
        text = ocrResult.text
    elseif ocrResult.content then
        text = ocrResult.content
    end
    
    if text and text ~= "" then
        log.info("图片OCR识别成功（用于违禁词检测）")
        return text, nil
    else
        log.warn("图片OCR识别返回空结果")
        local errorHint = "OCR识别结果为空"
        local responseBody = tableToString(ocrResult)
        if string.len(responseBody) > 0 then
            local errorPattern = '"message"%s*:%s*"([^"]*)"'
            local errorMsg = string.match(responseBody, errorPattern)
            if errorMsg then
                errorHint = "OCR识别失败: " .. errorMsg
            else
                errorHint = "OCR识别结果为空，响应: " .. string.sub(responseBody, 1, 100)
            end
        end
        return nil, errorHint
    end
end

-- 辅助函数：检测并转换语音消息为文字
local function convertVoiceToText(event)
    if not event.message or type(event.message) ~= "table" then
        return nil, nil
    end
    
    local hasVoice = false
    local voiceSegment = nil
    
    local idx = 1
    while event.message[idx] do
        local segment = event.message[idx]
        if type(segment) == "table" then
            local segType = segment.type or segment.data_type
            if segType == "record" or segType == "voice" then
                hasVoice = true
                voiceSegment = segment
                break
            end
        end
        idx = idx + 1
    end
    
    if not hasVoice or not event.message_id then
        return nil, nil
    end
    
    local result = message.voice_to_text(event.message_id)
    
    if not result or result == nil then
        log.warn("语音转文字失败，消息ID: " .. tostring(event.message_id))
        return nil, "语音转文字失败"
    end
    
    local text = nil
    if type(result) == "table" then
        if result.data then
            if type(result.data) == "table" then
                text = result.data.text or result.data.content or result.data.message
            elseif type(result.data) == "string" then
                text = result.data
            end
        elseif result.text then
            text = result.text
        elseif result.content then
            text = result.content
        elseif result.message then
            text = result.message
        end
    elseif type(result) == "string" then
        text = result
    end
    
    if text and text ~= "" then
        log.info("语音转文字成功: " .. tostring(text))
        return text, nil
    else
        log.warn("语音转文字返回空结果，消息ID: " .. tostring(event.message_id))
        return nil, "转换结果为空"
    end
end

-- 辅助函数：格式化日志消息
local function formatLogMessage(event, userNickname, messageType)
    local timestamp = os.date("%Y-%m-%d %H:%M:%S")
    local logMsg = string.format(
        "[%s] Group: %s | User: %s (%s) | UserID: %s | MessageID: %s | Type: %s | Content: %s\n",
        timestamp,
        tostring(event.group_id),
        userNickname or "Unknown",
        tostring(event.user_id),
        tostring(event.message_id),
        messageType or "text",
        msg.get_plain_text(event) or ""
    )
    return logMsg
end

-- 初始化函数
function on_init()
    log.info("群消息同步插件初始化中...")
    
    local allConfig = config.all()
    
    groupList = getConfigArray(allConfig, "group_list", "group_list")
    log.info("配置的源群列表数量: " .. tostring(#groupList))
    for i, groupId in ipairs(groupList) do
        log.info("  群 " .. tostring(i) .. ": " .. tostring(groupId))
    end
    
    blacklist = getConfigArray(allConfig, "black_list_user_list", "black_list_user list")
    if #blacklist == 0 then
        blacklist = getConfigArray(allConfig, "blacklist", "blacklist")
    end
    log.info("黑名单用户数量: " .. tostring(#blacklist))
    for i, userId in ipairs(blacklist) do
        log.info("  黑名单用户 " .. tostring(i) .. ": " .. tostring(userId))
    end
    
    loadProhibitedWords()
    
    if #groupList == 0 then
        log.warn("警告: 未配置源群列表，插件将不会同步任何消息")
    else
        log.info("群消息同步插件已启动，监听 " .. tostring(#groupList) .. " 个群的消息")
    end
    
    local groupListStr = ""
    for i, gid in ipairs(groupList) do
        if i > 1 then
            groupListStr = groupListStr .. ", "
        end
        groupListStr = groupListStr .. tostring(gid)
    end
    
    local blacklistStr = ""
    for i, uid in ipairs(blacklist) do
        if i > 1 then
            blacklistStr = blacklistStr .. ", "
        end
        blacklistStr = blacklistStr .. tostring(uid)
    end
    
    writeLog("=== 插件启动: " .. os.date("%Y-%m-%d %H:%M:%S") .. " ===\n")
    writeLog("源群列表: " .. groupListStr .. "\n")
    writeLog("黑名单: " .. blacklistStr .. "\n")
    writeLog("违禁词数量: " .. tostring(#prohibitedWords) .. "\n")
    writeLog("==========================================\n\n")
    
    log.info("插件初始化完成，缓存将在首次使用时自动填充")
end

-- 注册消息事件处理器
on_message(function(event)
    local msgType = msg.get_type(event)
    if msgType ~= "group" then
        return
    end
    
    local groupId = event.group_id
    local userId = event.user_id
    local messageId = event.message_id
    local rawMessage = msg.get_plain_text(event) or ""
    
    if not isInArray(groupList, groupId) then
        return
    end
    
    if not rawMessage or rawMessage == "" or string.match(rawMessage, "^%s*$") then
        return
    end
    
    -- 跳过包含"$"符号的消息
    if string.find(rawMessage, "%$") then
        log.debug("消息包含\"$\"符号，跳过同步: 用户 " .. tostring(userId) .. " 在群 " .. tostring(groupId))
        return
    end
    
    if isInArray(blacklist, userId) then
        log.debug("黑名单用户消息，跳过同步: 用户 " .. tostring(userId) .. " 在群 " .. tostring(groupId))
        local userName = getUserName(userId, event)
        local logMsg = formatLogMessage(event, userName, "BLOCKED")
        writeLog(logMsg)
        return
    end
    
    local userName = getUserName(userId, event)
    -- 关键修改：传入event参数，优先获取事件中的group_name
    local groupName = getGroupName(groupId, event)
    
    local messageType = "text"
    local finalMessage = rawMessage
    local voiceText = nil
    local imageText = nil
    local imageFile = nil
    local imageUrl = nil
    local hasImage = false
    local hasAt = false
    local hasFace = false
    local hasVoice = false
    
    if event.message and type(event.message) == "table" then
        local idx = 1
        while event.message[idx] do
            local segment = event.message[idx]
            if type(segment) == "table" then
                local segType = segment.type or segment.data_type
                if segType == "image" or segType == "img" then
                    hasImage = true
                    messageType = "image"
                elseif segType == "at" then
                    hasAt = true
                elseif segType == "face" then
                    hasFace = true
                elseif segType == "record" or segType == "voice" then
                    hasVoice = true
                    messageType = "voice"
                end
            end
            idx = idx + 1
        end
        
        if hasImage and hasAt then
            messageType = "mixed(image+at)"
        elseif hasImage then
            messageType = "image"
        elseif hasAt then
            messageType = "at"
        elseif hasFace then
            messageType = "face"
        elseif hasVoice then
            messageType = "voice"
        end
    end
    
    if messageType == "image" or (messageType == "mixed(image+at)" and hasImage) then
        local convertedText, err = convertImageToText(event)
        if convertedText and convertedText ~= "" then
            imageText = convertedText
            finalMessage = rawMessage
            log.info("图片OCR识别成功（仅用于违禁词检测，不展示文字）")
        else
            log.warn("图片OCR识别失败，跳过转发。消息ID: " .. tostring(messageId) .. ", 错误: " .. tostring(err or "未知错误"))
            local logMsg = formatLogMessage(event, userName, "image(OCR失败)")
            writeLog(logMsg)
            return
        end
    end
    
    if messageType == "voice" then
        local convertedText, err = convertVoiceToText(event)
        if convertedText and convertedText ~= "" then
            voiceText = convertedText
            finalMessage = convertedText
            rawMessage = convertedText
            log.info("语音消息转换成功，将转发文字内容: " .. convertedText)
        else
            log.warn("语音转文字失败，跳过转发。消息ID: " .. tostring(messageId) .. ", 错误: " .. tostring(err or "未知错误"))
            local logMsg = formatLogMessage(event, userName, "voice(转换失败)")
            writeLog(logMsg)
            return
        end
    end
    
    local checkMessage = finalMessage
    if voiceText and voiceText ~= "" then
        checkMessage = voiceText
    elseif imageText and imageText ~= "" then
        checkMessage = imageText
    end
    
    local hasProhibitedWord, prohibitedWord = containsProhibitedWord(checkMessage)
    if hasProhibitedWord then
        log.warn("检测到违禁词，跳过转发: 违禁词=" .. tostring(prohibitedWord) .. ", 用户=" .. tostring(userId) .. ", 群=" .. tostring(groupId))
        local logMsg = formatLogMessage(event, userName, messageType .. "(违禁词过滤)")
        writeLog(logMsg)
        return
    end
    
    local targetGroups = {}
    for _, targetGroupId in ipairs(groupList) do
        local targetId = tonumber(targetGroupId)
        if targetId and targetId ~= tonumber(groupId) then
            table.insert(targetGroups, targetId)
        end
    end
    
    if #targetGroups == 0 then
        local logMsg = formatLogMessage(event, userName, messageType)
        writeLog(logMsg)
        return
    end
    
    local logMsg = formatLogMessage(event, userName, messageType)
    writeLog(logMsg)
    
    local forwardCount = 0
    local failCount = 0
    
    for _, targetId in ipairs(targetGroups) do
        local messageContent = finalMessage
        
        if messageType == "voice" and voiceText and voiceText ~= "" then
            messageContent = "[语音转文字] " .. finalMessage
        end
        
        local formattedMessageId = formatMessageId(messageId)
        
        local forwardMessage = string.format("【%s ：%s】\n\n%s\n\n[%s-%s]",
            groupName,
            userName,
            messageContent,
            tostring(userId),
            formattedMessageId
        )
        
        local sendSuccess, sendResult = message.send_group(targetId, forwardMessage)
        if sendSuccess then
            forwardCount = forwardCount + 1
        else
            failCount = failCount + 1
            if failCount <= 3 then
                local errorMsg = "unknown error"
                if sendResult then
                    errorMsg = type(sendResult) == "string" and sendResult or tostring(sendResult)
                end
                log.error("消息转发失败: 群 " .. tostring(targetId) .. " | 错误: " .. errorMsg)
            end
        end
    end
    
    if forwardCount > 0 then
        log.debug("消息已转发到 " .. tostring(forwardCount) .. " 个群")
    end
    if failCount > 0 then
        log.warn("转发失败 " .. tostring(failCount) .. " 个群")
    end
end)

-- 清理函数
function on_destroy()
    log.info("群消息同步插件正在停止...")
    writeLog("=== 插件停止: " .. os.date("%Y-%m-%d %H:%M:%S") .. " ===\n\n")
    log.info("群消息同步插件已停止")
end