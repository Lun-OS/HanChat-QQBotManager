-- 违规词自动处理插件
plugin.name = "automatic_handling_of_prohibited_words"
plugin.version = "1.0.0"
plugin.description = "检测群消息中的违规词，自动撤回并按日累计进行阶梯式禁言与重置"

local DB_FILE = "db.json"
local WORDS_FILE = "Prohibited_words.json"

-- 违禁词内存缓存
local prohibitedWords = {}
-- 配置缓存
local groupList = {}
local blacklist = {}

-- 工具：数组包含（数字/字符串统一转字符串比较）
local function isInArray(arr, val)
    if not arr then return false end
    local target = tostring(val)
    for _, v in ipairs(arr) do
        if tostring(v) == target then return true end
    end
    return false
end

-- 工具：将表转换为字符串（用于日志）
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

-- 读取违禁词，支持 JSON 格式 {"words": ["...", "..."]}
local function loadProhibitedWords()
    prohibitedWords = {}
    local ok, content = pcall(function()
        local result, err = file.read(WORDS_FILE)
        if err then error(tostring(err)) end
        return result
    end)

    if not ok or not content or content == "" then
        log.warn("未找到违禁词文件: " .. WORDS_FILE .. "，将使用空列表。请在插件目录放置 Prohibited_words.json")
        return
    end

    -- 尽量支持多种结构：数组或对象中的 words 字段
    local decoded = nil
    local success, err = pcall(function()
        decoded = content and content ~= "" and content
        -- 尝试简单解析（Lua无原生JSON，这里依赖平台侧file.read返回文本；
        -- 由后端转换为表的能力有限，改用简单匹配）
    end)
    -- 简易解析：从文本中抽取 "words": [...] 部分，并按逗号拆分
    local wordsBlock = string.match(content, '"words"%s*:%s*%[(.-)%]')
    if wordsBlock then
        for w in string.gmatch(wordsBlock, '"(.-)"') do
            if w and w ~= "" then table.insert(prohibitedWords, w) end
        end
    else
        -- 退化处理：如果是纯文本，每行一个
        for line in string.gmatch(content, "([^\r\n]+)") do
            local s = (line or ""):gsub("^%s+", ""):gsub("%s+$", "")
            if s ~= "" then table.insert(prohibitedWords, s) end
        end
    end
    log.info("已加载违禁词数量: " .. tostring(#prohibitedWords))
end

-- 文本是否包含违禁词（简单不区分大小写子串匹配）
local function containsProhibitedWord(message)
    if not message or message == "" then return false, nil end
    local lowerMessage = string.lower(tostring(message))
    for _, word in ipairs(prohibitedWords) do
        if word and word ~= "" then
            local lowerWord = string.lower(word)
            if string.find(lowerMessage, lowerWord, 1, true) then
                return true, word
            end
        end
    end
    return false, nil
end

-- UTF-8工具：获取从索引i开始的字符字节数
local function utf8_char_bytes(s, i)
    local c = string.byte(s, i)
    if not c then return 0 end
    if c < 0x80 then return 1
    elseif c >= 0xC2 and c <= 0xDF then return 2
    elseif c >= 0xE0 and c <= 0xEF then return 3
    elseif c >= 0xF0 and c <= 0xF4 then return 4
    else return 1 end
end

-- UTF-8工具：获取首字符子串
local function utf8_first_char(s)
    if not s or s == "" then return "" end
    local len = utf8_char_bytes(s, 1)
    return string.sub(s, 1, len)
end

-- UTF-8工具：按码点长度统计
local function utf8_len(s)
    if not s or s == "" then return 0 end
    local i, cnt, n = 1, 0, #s
    while i <= n do
        local b = utf8_char_bytes(s, i)
        if b <= 0 then break end
        i = i + b
        cnt = cnt + 1
    end
    return cnt
end

-- 掩码违禁词：仅展示首字，其他用*号代替
local function maskWord(word)
    if not word or word == "" then return "" end
    local first = utf8_first_char(word)
    local rest = utf8_len(word) - 1
    if rest < 0 then rest = 0 end
    return first .. string.rep("*", rest)
end

-- 将图片消息OCR为文字（仅用于检测，不展示）
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

-- 获取首个图片片段（用于转发图片，不包含OCR内容）
local function getFirstImageSegment(event)
    if not event.message or type(event.message) ~= "table" then
        return nil
    end
    local idx = 1
    while event.message[idx] do
        local seg = event.message[idx]
        if type(seg) == "table" then
            local t = seg.type or seg.data_type
            if t == "image" or t == "img" then
                return seg
            end
        end
        idx = idx + 1
    end
    return nil
end

-- 构造基础模板的图片消息（不包含OCR识别结果）
local function buildImageForwardMessage(event)
    local seg = getFirstImageSegment(event)
    if not seg then return nil end
    local file = seg.file
    local url = seg.url
    if seg.data and type(seg.data) == "table" then
        file = seg.data.file or file
        url = seg.data.url or url
    end
    -- 若无URL且存在文件标识，尝试通过API获取图片URL
    if (not url or url == "") and file and file ~= "" then
        local info, err = message.get_image(file)
        if not err and info and type(info) == "table" then
            if info.data then
                if type(info.data) == "table" then
                    url = info.data.url or info.data.image_url or info.data.link or url
                elseif type(info.data) == "string" then
                    url = info.data
                end
            end
            -- 兜底字段
            url = url or info.url or info.image_url or info.link or url
        end
    end
    local cq = nil
    if url and url ~= "" then
        cq = "[CQ:image,url=" .. tostring(url) .. "]"
    elseif file and file ~= "" then
        cq = "[CQ:image,file=" .. tostring(file) .. "]"
    end
    if not cq then return nil end
    -- 基础模板：简单前缀+图片，不携带OCR文本
    return "【图片】\n" .. cq
end

-- 将语音消息转文字（用于检测与转发文字内容）
local function convertVoiceToText(event)
    if not event.message_id then return nil end
    -- 检测是否包含语音片段
    local hasVoice = false
    if event.message and type(event.message) == "table" then
        local idx = 1
        while event.message[idx] do
            local seg = event.message[idx]
            if type(seg) == "table" then
                local t = seg.type or seg.data_type
                if t == "record" or t == "voice" then
                    hasVoice = true
                    break
                end
            end
            idx = idx + 1
        end
    end
    if not hasVoice then return nil end

    local result, err = message.voice_to_text(event.message_id)
    if err or not result then
        log.warn("语音转文字失败: " .. tostring(err or "未知错误"))
        return nil
    end

    local text = nil
    if type(result) == "table" then
        if result.data and type(result.data) == "table" then
            text = result.data.text or result.data.content or result.data.message
        end
        if not text then
            text = result.text or result.content or result.message
        end
    elseif type(result) == "string" then
        text = result
    end
    return text
end

-- 读取/写入DB文件
local function loadDB()
    local ok, content = pcall(function()
        local result, err = file.read(DB_FILE)
        if err then return nil end
        return result
    end)

    local now = system.now()
    local db = { date = now.date, violations = {} }
    if not ok or not content or content == "" then
        return db
    end

    -- 解析日期
    local savedDate = string.match(content, '"date"%s*:%s*"(.-)"')
    if savedDate then db.date = savedDate end

    -- 逐行解析 violations 结构（与 saveDB 输出格式兼容）
    local inViolations = false
    local inGroupBlock = false
    local currentGroup = nil
    for line in string.gmatch(content, "([^\r\n]+)") do
        -- 进入 violations 区块
        if not inViolations and string.match(line, '"violations"%s*:%s*%{') then
            inViolations = true
        elseif inViolations then
            -- 开始一个群的子对象：  "<groupId>": {
            local gid = string.match(line, '^%s*"([^"]+)"%s*:%s*%{$')
            if gid then
                currentGroup = gid
                db.violations[currentGroup] = db.violations[currentGroup] or {}
                inGroupBlock = true
            else
                -- 用户计数行：  "<userId>": <count>
                local uid, cnt = string.match(line, '^%s*"([^"]+)"%s*:%s*(%d+)')
                if inGroupBlock and uid and cnt then
                    db.violations[currentGroup][uid] = tonumber(cnt)
                else
                    -- 结束一个群或整个 violations
                    if string.match(line, '^%s*}%s*,?%s*$') then
                        if inGroupBlock then
                            inGroupBlock = false
                            currentGroup = nil
                        else
                            -- 结束 violations
                            inViolations = false
                        end
                    end
                end
            end
        end
    end

    return db
end

local function saveDB(db)
    local lines = {}
    table.insert(lines, '{')
    table.insert(lines, '  "date": "' .. tostring(db.date) .. '",')
    table.insert(lines, '  "violations": {')
    local firstGroup = true
    for gid, users in pairs(db.violations or {}) do
        if not firstGroup then table.insert(lines, ',') end
        firstGroup = false
        table.insert(lines, '    "' .. tostring(gid) .. '": {')
        local firstUser = true
        for uid, cnt in pairs(users) do
            if not firstUser then table.insert(lines, ',') end
            firstUser = false
            table.insert(lines, '      "' .. tostring(uid) .. '": ' .. tostring(cnt))
        end
        table.insert(lines, '    }')
    end
    table.insert(lines, '  }')
    table.insert(lines, '}')
    local content = table.concat(lines, "\n")
    local ok, err = file.write(DB_FILE, content)
    if not ok then log.error("写入DB失败: " .. tostring(err or "未知错误")) end
end

local function ensureDailyReset(db)
    local today = system.now().date
    if db.date ~= today then
        db.date = today
        db.violations = {}
        saveDB(db)
        log.info("已完成每日重置：清空当日违规计数")
    end
end

local function incViolation(db, groupId, userId)
    db.violations[groupId] = db.violations[groupId] or {}
    local before = db.violations[groupId][userId] or 0
    local after = before + 1
    db.violations[groupId][userId] = after
    saveDB(db)
    return after
end

-- 处罚梯度（分钟）：4->1, 5->5, 6->10, 7->20, >=8->1440
local function calcPenaltyMinutes(count)
    if count <= 3 then return 0 end
    if count == 4 then return 1 end
    if count == 5 then return 5 end
    if count == 6 then return 10 end
    if count == 7 then return 20 end
    return 1440
end

function on_init()
    log.info("违规词自动处理插件初始化...")
    -- 确保db文件存在
    if not file.exists(DB_FILE) then
        local now = system.now()
        saveDB({ date = now.date, violations = {} })
    end
    loadProhibitedWords()
    -- 读取配置
    local cfg = config.all()
    groupList = getConfigArray(cfg, "group_list")
    blacklist = getConfigArray(cfg, "black_list_user_list")
    log.info("配置-处理的群数量: " .. tostring(#groupList))
    log.info("配置-不处理的用户数量: " .. tostring(#blacklist))
    log.info("初始化完成")
end

on_message(function(event)
    -- 仅处理群消息
    if msg.get_type(event) ~= "group" then return end

    local groupId = event.group_id
    local userId = event.user_id
    local messageId = event.message_id
    local raw = msg.get_plain_text(event) or ""

    -- 允许语音/图片在无原始文本时也处理
    if not raw then raw = "" end

    -- 使用新API检查消息类型
    local hasImage = msg.has_image(event)
    local hasVoice = msg.has_voice(event)

    -- 群过滤：仅处理配置中的群（若配置为空，默认处理所有群）
    if #groupList > 0 and not isInArray(groupList, groupId) then
        return
    end

    -- 用户过滤：跳过不处理的用户
    if isInArray(blacklist, userId) then
        return
    end

    -- 违规检测：图片先 OCR 后检测；语音转文字后检测；文本直接检测
    local violated = false
    local violatedWord = nil

    -- 图片消息：仅使用 OCR 文字进行检测，避免对 CQ 码/文件名等无效文本进行检测
    if hasImage and not violated then
        local imageText = convertImageToText(event)
        log.info("图片OCR结果: " .. tostring(imageText))
        if imageText and imageText ~= "" then
            local v, w = containsProhibitedWord(imageText)
            log.info("图片违禁词检测结果: violated=" .. tostring(v) .. ", word=" .. tostring(w))
            if v then violated = true; violatedWord = w end
        end
    end

    -- 语音消息：转文字后进行检测（仅用于检测，不做转发）
    if hasVoice and not violated then
        local voiceText = convertVoiceToText(event)
        if voiceText and voiceText ~= "" then
            local v, w = containsProhibitedWord(voiceText)
            if v then violated = true; violatedWord = w end
        end
    end

    -- 纯文本消息：不包含图片或语音时，检测原始文本
    if not hasImage and not hasVoice and not violated and raw ~= "" then
        local v, w = containsProhibitedWord(raw)
        if v then violated = true; violatedWord = w end
    end

    -- 若存在违规，执行原有处罚流程
    if violated then
        -- 自动撤回
        log.info("检测到违规，准备撤回消息")
        log.info("  - 原始消息ID: " .. tostring(messageId) .. ", 类型: " .. type(messageId))
        log.info("  - 事件消息序列号: " .. tostring(event.message_seq or "nil"))
        log.info("  - 事件ID: " .. tostring(event.id or "nil"))
        
        local okDel, errDel = message.delete_msg(messageId)
        if not okDel then
            log.error("使用原始messageId撤回消息失败: " .. tostring(errDel or "未知错误"))
            
            -- 尝试不同的消息ID格式
            local retryIds = {}
            
            -- 尝试转换数字/字符串格式
            if type(messageId) == "string" and string.match(messageId, "^%-?%d+$") then
                table.insert(retryIds, tonumber(messageId))
            elseif type(messageId) == "number" then
                table.insert(retryIds, tostring(messageId))
            end
            
            -- 尝试使用message_seq（如果可用）
            if event.message_seq then
                table.insert(retryIds, event.message_seq)
                if type(event.message_seq) == "number" then
                    table.insert(retryIds, tostring(event.message_seq))
                elseif type(event.message_seq) == "string" then
                    if string.match(event.message_seq, "^%-?%d+$") then
                        table.insert(retryIds, tonumber(event.message_seq))
                    end
                end
            end
            
            -- 依次尝试不同的ID
            local success = false
            for i, retryId in ipairs(retryIds) do
                log.info("尝试备选消息ID " .. tostring(i) .. ": " .. tostring(retryId) .. " (类型: " .. type(retryId) .. ")")
                local retryOk, retryErr = message.delete_msg(retryId)
                if retryOk then
                    log.info("消息撤回成功（使用备选ID " .. tostring(i) .. "）: " .. tostring(retryId))
                    success = true
                    break
                else
                    log.error("备选ID " .. tostring(i) .. " 撤回失败: " .. tostring(retryErr))
                end
            end
            
            if not success then
                log.error("所有撤回尝试均已失败，消息未被撤回")
                -- 发送警告信息给管理员或记录
                local warnMsg = "⚠️ 检测到违规词汇 \"" .. tostring(violatedWord) .. "\"，但自动撤回失败！\n请手动处理。"
                message.send_group(groupId, warnMsg)
            end
        else
            log.info("消息撤回成功: " .. tostring(messageId))
        end

        -- 读取并重置/累计
        local db = loadDB()
        ensureDailyReset(db)
        local count = incViolation(db, tostring(groupId), tostring(userId))

        -- 计算处罚
        local minutes = calcPenaltyMinutes(count)
        local punishDesc = minutes > 0 and (tostring(minutes) .. " 分钟禁言") or "未达到处罚阈值（每日3次试错）"

        -- 禁言（按秒）
        if minutes > 0 then
            local okBan, errBan = group.set_ban(groupId, userId, minutes * 60)
            if not okBan then
                log.error("禁言失败: " .. tostring(errBan or "未知错误"))
            end
        end

        -- 警告提醒
        local at = "[CQ:at,qq=" .. tostring(userId) .. "]"
        local wordHint = violatedWord and ("违规词：" .. maskWord(violatedWord) .. "\n") or ""
        local tip = at .. " 你的消息包含违规词，已自动撤回。\n" ..
            wordHint ..
            "今日累计违规：" .. tostring(count) .. " 次。\n" ..
            "当前处理：" .. punishDesc .. "。\n" ..
            "规则：每日 3 次试错；达到4次开始处罚且逐步加重；每日24:00自动清零。"
        message.send_group(groupId, tip)
        return
    end

    -- 无违规：语音仅用于检测，不发送任何内容

    -- 若是图片，不转发，仅用于检测
    if hasImage then
        return
    end

    -- 其它类型且无违规：不处理
    return

end)

function on_destroy()
    log.info("违规词自动处理插件停止")
end

