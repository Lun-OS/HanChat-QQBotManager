plugin.name = "auto_publish_submission"
plugin.version = "1.1.0"
plugin.description = "私聊图片+回复投稿，审核违禁词，上传并发布QQ空间说说，支持删除投稿"

local PROHIBITED_FILE = "Prohibited_words.json"
local recentPrivateEvents = {}
local recentOrder = {}
local prohibitedWords = {}
local TRIGGER = config.get("submission_trigger_word", "投稿")
local DELETE_TRIGGER = config.get("delete_trigger_word", "删除")
local SUBMISSION_FILE = "submissions.json"
local ERROR_FILE = "error.json"
local REPLY_ERROR = config.get("reply_error_message", "机器人发生错误，自动投稿失败，请联系系统管理员（1596534228）")
local REPLY_SUCCESS = config.get("reply_success_message", "自动投稿成功，您的投稿id是:")
local TALK_COPY = config.get("talk_about_copywriting", "此投稿的id是：")
local ADMIN_QQ = config.get("admin_qq", "1596534228")
local DELETE_SUCCESS = config.get("delete_success_message", "删除投稿成功")
local DELETE_NO_PERMISSION = config.get("delete_no_permission_message", "您没有权限删除此投稿")
local DELETE_NOT_FOUND = config.get("delete_not_found_message", "未找到该投稿")
local DELETE_QZONE_FAILED = config.get("delete_qzone_failed_message", "投稿本地记录已删除，但QQ空间说说删除失败")

local function pushCache(mid, ev)
    recentPrivateEvents[mid] = ev
    table.insert(recentOrder, mid)
    if #recentOrder > 200 then
        local oldest = table.remove(recentOrder, 1)
        recentPrivateEvents[oldest] = nil
    end
end

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

local function loadProhibitedWords()
    prohibitedWords = {}
    local ok, content = pcall(function()
        local result, err = file.read(PROHIBITED_FILE)
        if err then return nil end
        return result
    end)
    if not ok or not content or content == "" then
        log.warn("无法读取违禁词文件: " .. PROHIBITED_FILE .. "，使用空列表")
        return
    end
    local wordsBlock = string.match(content, '"words"%s*:%s*%[(.-)%]')
    if wordsBlock then
        for w in string.gmatch(wordsBlock, '"(.-)"') do
            if w and w ~= "" then table.insert(prohibitedWords, w) end
        end
    else
        for line in string.gmatch(content, "([^\r\n]+)") do
            local s = (line or ""):gsub("^%s+", ""):gsub("%s+$", "")
            if s ~= "" then table.insert(prohibitedWords, s) end
        end
    end
    log.info("违禁词数量: " .. tostring(#prohibitedWords))
end

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

local function utf8_char_bytes(s, i)
    local c = string.byte(s, i)
    if not c then return 0 end
    if c < 0x80 then return 1
    elseif c >= 0xC2 and c <= 0xDF then return 2
    elseif c >= 0xE0 and c <= 0xEF then return 3
    elseif c >= 0xF0 and c <= 0xF4 then return 4
    else return 1 end
end

local function utf8_first_char(s)
    if not s or s == "" then return "" end
    local len = utf8_char_bytes(s, 1)
    return string.sub(s, 1, len)
end

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

local function maskWord(word)
    if not word or word == "" then return "" end
    local first = utf8_first_char(word)
    local rest = utf8_len(word) - 1
    if rest < 0 then rest = 0 end
    return first .. string.rep("*", rest)
end

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
    log.info("开始OCR识别图片: " .. tostring(imageParam))
    local ocrResult, ocrErr = message.ocr_image(imageParam)
    if ocrErr then
        log.error("OCR失败: " .. tostring(ocrErr))
        return nil, "OCR失败: " .. tostring(ocrErr)
    end
    if not ocrResult then
        log.warn("OCR返回nil")
        return nil, "OCR返回nil"
    end
    if type(ocrResult) ~= "table" then
        log.warn("OCR类型错误: " .. type(ocrResult))
        return nil, "OCR类型错误: " .. type(ocrResult)
    end
    local text = nil
    if ocrResult.data then
        if type(ocrResult.data) == "table" then
            if ocrResult.data.texts and type(ocrResult.data.texts) == "table" then
                local texts = {}
                local tIdx = 1
                while ocrResult.data.texts[tIdx] do
                    local textItem = ocrResult.data.texts[tIdx]
                    if type(textItem) == "table" then
                        local itemText = textItem.text or textItem.content or textItem.data
                        if itemText and itemText ~= "" then
                            table.insert(texts, tostring(itemText))
                        end
                    elseif type(textItem) == "string" then
                        table.insert(texts, textItem)
                    end
                    tIdx = tIdx + 1
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
        log.info("OCR识别成功")
        return text, nil
    else
        local body = tableToString(ocrResult)
        local hint = "OCR识别结果为空"
        if string.len(body) > 0 then
            local errorMsg = string.match(body, '"message"%s*:%s*"([^"]*)"')
            if errorMsg then hint = "OCR失败: " .. errorMsg end
        end
        return nil, hint
    end
end

local function getCookieJson()
    if system and system.get_cookies then
        local result, err = system.get_cookies("qzone.qq.com")
        if err then
            log.error("system.get_cookies 错误: " .. tostring(err))
        else
            log.debug("system.get_cookies 返回类型: " .. type(result))
            if type(result) == "table" then
                local cookiesStr = nil
                if result.data then
                    if type(result.data) == "table" then
                        cookiesStr = result.data.cookies or result.data.cookie or result.cookies
                    elseif type(result.data) == "string" then
                        cookiesStr = result.data
                    end
                end
                cookiesStr = cookiesStr or result.cookies or result.cookie or result.raw
                if type(cookiesStr) == "string" and cookiesStr ~= "" then 
                    log.debug("从system.get_cookies获取到Cookie字符串")
                    return cookiesStr 
                end
                local jsonlike = tableToString(result)
                if jsonlike and jsonlike ~= "" then 
                    log.debug("从system.get_cookies获取到JSON格式Cookie")
                    return jsonlike 
                end
            elseif type(result) == "string" then
                if result ~= "" then 
                    log.debug("从system.get_cookies获取到字符串Cookie")
                    return result 
                end
            end
        end
    end
    local fallback = config.get("qzone_cookie_json", "")
    if fallback and fallback ~= "" then 
        log.debug("使用配置中的备用Cookie")
        return fallback 
    end
    return nil
end

local function parseCookiesFromJson(s)
    if not s or s == "" then return { raw = "" } end
    
    local map = {}
    local rawCookies = ""
    
    -- 如果是 JSON 格式，提取所有 Cookie 字段
    if string.sub(s, 1, 1) == "{" then
        log.debug("解析JSON格式Cookie")
        -- 从 JSON 中提取各个 Cookie 字段
        local cookies = {}
        
        -- 定义所有可能的 Cookie 字段
        local patterns = {
            "yyb_muid", "pgv_pvid", "CookieLogin", "eas_sid", "QZ_FE_WEBP_SUPPORT",
            "__Q_w_s__QZN_TodoMsgCnt", "_qimei_uuid42", "pac_uid", "_qimei_fingerprint",
            "_qimei_h38", "_qimei_q32", "_qimei_q36", "omgid", "RK", "__Q_w_s_hat_seed",
            "zzpaneluin", "zzpanelkey", "_qpsvr_localtk", "pgv_info", "Loading",
            "qz_screen", "pt4_token", "p_skey", "p_uin", "media_p_uin", "ptcz",
            "skey", "uin", "rv2", "property20", "domainid", "cpu_performance_v8", "media_p_skey"
        }
        
        for _, pattern in ipairs(patterns) do
            local value = string.match(s, '"' .. pattern .. '"%s*:%s*"([^"]*)"')
            if value then
                cookies[pattern] = value
                log.debug("提取Cookie字段: " .. pattern .. " = " .. value)
            end
        end
        
        -- 构建完整的 Cookie 字符串
        local cookieParts = {}
        for k, v in pairs(cookies) do
            if v and v ~= "" then
                table.insert(cookieParts, k .. "=" .. v)
                map[k] = v
            end
        end
        rawCookies = table.concat(cookieParts, "; ")
        
    else
        -- 原有的解析逻辑
        log.debug("解析字符串格式Cookie")
        rawCookies = s
        for item in string.gmatch(s, "([^;]+)") do
            item = item:gsub("^%s+", ""):gsub("%s+$", "")
            local k, v = string.match(item, "([^=]+)=(.*)")
            if k and v then 
                map[k] = v
                log.debug("提取Cookie字段: " .. k .. " = " .. v)
            end
        end
    end
    
    map.raw = rawCookies
    map.uin = (map.uin or ""):gsub("^o", "")
    map.p_uin = (map.p_uin or ""):gsub("^o", "")
    
    log.info("Cookie解析完成，uin=" .. tostring(map.uin))
    log.debug("完整Cookie字符串: " .. string.sub(rawCookies, 1, 200) .. "...")
    
    return map
end

local function djb_hash(s)
    if not s or s == "" then 
        log.warn("djb_hash: 输入字符串为空")
        return 0 
    end
    s = s:gsub("@", "")
    local h = 5381
    for i = 1, #s do
        h = (h * 33 + string.byte(s, i)) % (2^32)
    end
    local result = math.floor(h) % (2^31)
    log.debug("djb_hash计算: 输入=" .. s .. ", 输出=" .. tostring(result))
    return result
end

local function url_encode(str)
    str = tostring(str or "")
    str = str:gsub("\n", "\r\n")
    str = str:gsub("([^%w%-%._~])", function(c)
        return string.format("%%%02X", string.byte(c))
    end)
    return str
end

local function form_encode(tbl)
    local parts = {}
    for k, v in pairs(tbl) do
        table.insert(parts, tostring(k) .. "=" .. url_encode(tostring(v)))
    end
    return table.concat(parts, "&")
end

local function form_encode_masked(tbl)
    local mask = { skey = true, p_skey = true, pt4_token = true, qzonetoken = true, picfile = true }
    local parts = {}
    for k, v in pairs(tbl) do
        local val = tostring(v)
        if mask[k] then
            if k == "picfile" then
                val = "[BASE64 " .. tostring(#val) .. "]"
            else
                val = "[REDACTED]"
            end
        end
        table.insert(parts, tostring(k) .. "=" .. url_encode(val))
    end
    return table.concat(parts, "&")
end

local function headers_to_log(headers)
    local parts = {}
    for k, v in pairs(headers or {}) do
        local val = tostring(v)
        if string.lower(k) == "cookie" then val = "[REDACTED]" end
        table.insert(parts, tostring(k) .. ": " .. val)
    end
    return table.concat(parts, "; ")
end

local b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
local function base64_encode(data)
    local n = #data
    if n == 0 then return "" end
    local chunks = {}
    local buf = {}
    local bufCount = 0
    local i = 1
    while i <= n do
        local b1 = string.byte(data, i) or 0
        local b2 = (i + 1 <= n) and string.byte(data, i + 1) or nil
        local b3 = (i + 2 <= n) and string.byte(data, i + 2) or nil
        local triple = b1 * 65536 + (b2 or 0) * 256 + (b3 or 0)
        local c1 = math.floor(triple / 262144) % 64
        local c2 = math.floor(triple / 4096) % 64
        local c3 = math.floor(triple / 64) % 64
        local c4 = triple % 64
        local s
        if not b2 then
            s = string.sub(b64chars, c1 + 1, c1 + 1) .. string.sub(b64chars, c2 + 1, c2 + 1) .. "=="
            i = i + 1
        elseif not b3 then
            s = string.sub(b64chars, c1 + 1, c1 + 1) .. string.sub(b64chars, c2 + 1, c2 + 1) .. string.sub(b64chars, c3 + 1, c3 + 1) .. "="
            i = i + 2
        else
            s = string.sub(b64chars, c1 + 1, c1 + 1) .. string.sub(b64chars, c2 + 1, c2 + 1) .. string.sub(b64chars, c3 + 1, c3 + 1) .. string.sub(b64chars, c4 + 1, c4 + 1)
            i = i + 3
        end
        bufCount = bufCount + 1
        buf[bufCount] = s
        if bufCount >= 1024 then
            chunks[#chunks + 1] = table.concat(buf)
            buf = {}
            bufCount = 0
        end
    end
    if bufCount > 0 then
        chunks[#chunks + 1] = table.concat(buf)
    end
    return table.concat(chunks)
end

local function http_get(url, headers)
    local ok, resp = pcall(function() return http.request("GET", url, headers, "") end)
    if ok and resp then return resp end
    return nil
end

local function http_post(url, body, headers)
    local ok, resp = pcall(function() return http.request("POST", url, headers, body or "") end)
    if ok and resp then return resp end
    return nil
end

local function parse_upload_response(text)
    local body = text or ""
    local jsonPart = body
    local m = string.match(body, "callback%((.*)%)")
    if m then jsonPart = m end
    local ret = tonumber(string.match(jsonPart, '"ret"%s*:%s*(%d+)') or "-1")
    local albumid = string.match(jsonPart, '"albumid"%s*:%s*"([^"]*)"') or ""
    local lloc = string.match(jsonPart, '"lloc"%s*:%s*"([^"]*)"') or ""
    local sloc = string.match(jsonPart, '"sloc"%s*:%s*"([^"]*)"') or ""
    local height = tonumber(string.match(jsonPart, '"height"%s*:%s*(%d+)') or "0")
    local width = tonumber(string.match(jsonPart, '"width"%s*:%s*(%d+)') or "0")
    local urlField = string.match(jsonPart, '"url"%s*:%s*"([^"]*)"') or ""
    return { ret = ret, data = { albumid = albumid, lloc = lloc, sloc = sloc, height = height, width = width, url = urlField } }
end

local function string_trim(s)
    return tostring(s or ""):gsub("^%s+", ""):gsub("%s+$", "")
end

local function ends_with(s, suffix)
    if not s or not suffix then return false end
    if #suffix == 0 then return true end
    return string.sub(s, -#suffix) == suffix
end

local function json_escape(s)
    s = tostring(s or "")
    s = s:gsub("\\", "\\\\"):gsub('"','\\"'):gsub("\n","\\n"):gsub("\r","\\r")
    return s
end

local function encode_json_object(map)
    local parts = {}
    for k, v in pairs(map or {}) do
        local key = '"' .. json_escape(k) .. '"'
        local t = type(v)
        local val
        if t == "number" or t == "boolean" then
            val = tostring(v)
        else
            val = '"' .. json_escape(tostring(v)) .. '"'
        end
        parts[#parts + 1] = key .. ":" .. val
    end
    return "{" .. table.concat(parts, ",") .. "}"
end

local function safe_file_read(path)
    local ok, content = pcall(function()
        local r, err = file.read(path)
        if err then return nil end
        return r
    end)
    if not ok then return nil end
    return content
end

local function safe_file_write(path, content)
    local ok, _ = pcall(function()
        return file.write(path, content)
    end)
    return ok
end

local function append_json_array_file(path, json_entry)
    local content = safe_file_read(path) or ""
    local s = string_trim(content)
    if s == "" then
        local body = "[" .. json_entry .. "]"
        safe_file_write(path, body)
        return
    end
    if ends_with(s, "]") then
        local body = string.sub(s, 1, -2) .. "," .. json_entry .. "]"
        safe_file_write(path, body)
        return
    end
    local body = "[" .. json_entry .. "]"
    safe_file_write(path, body)
end

local function next_seq_id()
    local content = safe_file_read(SUBMISSION_FILE) or ""
    local s = string_trim(content)
    if s == "" then return 1000 end
    local max_id = nil
    for m in string.gmatch(s, '"id"%s*:%s*(%d+)') do
        local n = tonumber(m)
        if n and ((not max_id) or n > max_id) then max_id = n end
    end
    if not max_id then return 1000 end
    return max_id + 1
end

local function gen_id(uid)
    local t = os.time()
    local r = tostring(math.floor((math.random() * 899999) + 100000))
    return tostring(t) .. "-" .. tostring(uid or "0") .. "-" .. r
end

local function extract_image_url(ev)
    if not ev or type(ev) ~= "table" then return nil end
    local i = 1
    while ev.message and ev.message[i] do
        local s = ev.message[i]
        if type(s) == "table" then
            local t = s.type or s.data_type
            if t == "image" or t == "img" then
                local url = s.url
                if s.data and type(s.data) == "table" then url = s.data.url or url end
                return url
            end
        end
        i = i + 1
    end
    return nil
end

local function record_error(uid, original_mid, reason, image_url, extra)
    local id = gen_id(uid)
    local entry = {
        id = id,
        time = os.time(),
        user_id = uid or "",
        message_id = original_mid or "",
        image_url = image_url or "",
        reason = reason or "",
        detail = extra or ""
    }
    local json_entry = encode_json_object(entry)
    append_json_array_file(ERROR_FILE, json_entry)
    return id
end

local function record_submission(uid, original_mid, cmd, image_url, imgInfo, tid, given_id)
    local id = given_id or next_seq_id()
    local entry = {
        id = id,
        time = os.time(),
        user_id = uid or "",
        message_id = original_mid or "",
        cmd = cmd or "",
        image_url = image_url or "",
        qzone_image_url = (imgInfo and imgInfo.url) or "",
        albumid = (imgInfo and imgInfo.albumid) or "",
        lloc = (imgInfo and imgInfo.lloc) or "",
        sloc = (imgInfo and imgInfo.sloc) or "",
        width = (imgInfo and imgInfo.width) or 0,
        height = (imgInfo and imgInfo.height) or 0,
        shuoshuo_id = tid or ""
    }
    local json_entry = encode_json_object(entry)
    append_json_array_file(SUBMISSION_FILE, json_entry)
    return id
end

local function reply_error(uid)
    message.send_private(uid, REPLY_ERROR)
end

local function reply_success(uid, id)
    message.send_private(uid, REPLY_SUCCESS .. tostring(id))
end

local function get_qzonetoken(uin, cookiesStr)
    local url = "https://user.qzone.qq.com/" .. tostring(uin)
    local headers = {
        ["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        ["Cookie"] = cookiesStr,
        ["Referer"] = "https://user.qzone.qq.com/"
    }
    log.info("获取qzonetoken: " .. url)
    local resp = http_get(url, headers)
    if resp and resp.status == 200 and resp.body then
        -- 尝试多种匹配模式
        local token = string.match(resp.body, 'window%.g_qzonetoken%s*=%s*function%(%s*%)%s*{%s*[^}]+"([^"]+)"')
        token = token or string.match(resp.body, 'g_qzonetoken%s*=%s*"([^"]+)"')
        token = token or string.match(resp.body, '"qzonetoken"%s*:%s*"([^"]+)"')
        if token then 
            log.info("成功获取qzonetoken: " .. token)
            return token 
        else
            log.warn("在页面中未找到qzonetoken")
        end
    else
        log.error("获取qzonetoken页面失败: " .. tostring(resp and resp.status))
    end
    log.warn("无法获取qzonetoken，使用计算值")
    return ""
end

local function upload_image(imageUrl, cookies)
    local realUrl = tostring(imageUrl or ""):gsub("&amp;", "&")
    log.info("下载图片: " .. realUrl)
    local imgResp = http_get(realUrl, { ["User-Agent"] = "Mozilla/5.0" })
    if not imgResp or imgResp.status ~= 200 or not imgResp.body then
        log.error("下载图片失败")
        return nil
    end
    local imgB64 = base64_encode(imgResp.body)
    
    -- 使用正确的skey计算g_tk
    local skey_for_hash = cookies.p_skey or cookies.skey or ""
    local g_tk = djb_hash(skey_for_hash)
    
    -- 计算qzonetoken
    local qzonetoken = djb_hash(skey_for_hash)
    
    log.debug("上传图片令牌计算: skey=" .. tostring(cookies.skey) .. 
              ", p_skey=" .. tostring(cookies.p_skey) ..
              ", g_tk=" .. tostring(g_tk) .. 
              ", qzonetoken=" .. tostring(qzonetoken))
    
    local uploadUrl = "https://up.qzone.qq.com/cgi-bin/upload/cgi_upload_image?g_tk=" .. tostring(g_tk)
    local data = {
        filename = "image.jpg",
        uin = cookies.uin,
        skey = cookies.skey or "",
        zzpaneluin = cookies.uin,
        zzpanelkey = "",
        p_uin = cookies.uin,
        p_skey = cookies.p_skey or "",
        qzonetoken = tostring(qzonetoken),
        uploadtype = "1",
        albumtype = "7",
        exttype = "0",
        refer = "shuoshuo",
        output_type = "jsonhtml",
        charset = "utf-8",
        output_charset = "utf-8",
        upload_hd = "1",
        hd_width = "2048",
        hd_height = "10000",
        hd_quality = "96",
        backUrls = "http://upbak.photo.qzone.qq.com/cgi-bin/upload/cgi_upload_image,http://119.147.64.75/cgi-bin/upload/cgi_upload_image",
        url = uploadUrl,
        base64 = "1",
        jsonhtml_callback = "callback",
        picfile = imgB64,
        qzreferrer = "https://user.qzone.qq.com/" .. tostring(cookies.uin)
    }
    local headers = {
        ["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        ["Content-Type"] = "application/x-www-form-urlencoded",
        ["Origin"] = "https://user.qzone.qq.com",
        ["Referer"] = "https://user.qzone.qq.com/",
        ["Cookie"] = cookies.raw
    }
    local body = form_encode(data)
    local bodyLog = form_encode_masked(data)
    log.info("上传图片请求URL: " .. uploadUrl)
    log.debug("上传图片请求头: " .. headers_to_log(headers))
    log.debug("上传图片请求体: " .. string.sub(bodyLog, 1, 1000))
    local resp = http_post(uploadUrl, body, headers)
    if not resp then
        log.error("上传图片请求失败")
        return nil
    end
    log.info("上传图片状态码: " .. tostring(resp.status))
    log.debug("上传图片响应头: " .. headers_to_log(resp.headers or {}))
    log.debug("上传图片响应体: " .. string.sub(tostring(resp.body or ""), 1, 1500))
    local parsed = parse_upload_response(resp.body or "")
    log.debug("上传响应解析: " .. tableToString(parsed))
    if parsed and parsed.ret == 0 then
        return parsed.data
    else
        return nil
    end
end

local function publish_shuoshuo(content, img, cookies)
    -- 使用正确的skey计算g_tk
    local skey_for_hash = cookies.p_skey or cookies.skey or ""
    local gtk_p = djb_hash(skey_for_hash)
    
    -- 获取真实的qzonetoken
    local qzonetoken = get_qzonetoken(cookies.uin, cookies.raw)
    if not qzonetoken or qzonetoken == "" then
        qzonetoken = djb_hash(skey_for_hash)
        log.warn("使用计算的qzonetoken: " .. tostring(qzonetoken))
    end
    
    -- 计算bkn
    local bkn = djb_hash(cookies.skey or "")
    
    log.debug("发布令牌计算: skey=" .. tostring(cookies.skey) .. 
              ", p_skey=" .. tostring(cookies.p_skey) ..
              ", gtk_p=" .. tostring(gtk_p) .. 
              ", bkn=" .. tostring(bkn) .. 
              ", qzonetoken=" .. tostring(qzonetoken))
    
    local timestamp = tostring(os.time() * 1000)
    local baseUrl = "https://user.qzone.qq.com/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_publish_v6"
    local url = baseUrl .. "?g_tk=" .. tostring(gtk_p) .. "&qzonetoken=" .. tostring(qzonetoken) .. "&t=" .. timestamp
    
    -- 构建图片参数
    local richval = ""
    local pic_bo = ""
    if img then
        local albumid = img.albumid or ""
        local lloc = img.lloc or ""
        local sloc = img.sloc or ""
        local height = tonumber(img.height or 0) or 0
        local width = tonumber(img.width or 0) or 0
        richval = "," .. albumid .. "," .. lloc .. "," .. sloc .. ",3," .. tostring(height) .. "," .. tostring(width) .. ",," .. tostring(height) .. "," .. tostring(width)
        
        if img.url then
            local m_bo = string.match(img.url, "bo=([^&]+)")
            if m_bo then pic_bo = m_bo end
        end
    end
    
    -- 构建发布数据
    local data = {
        syn_tweet_verson = "1",
        paramstr = "1",
        who = "1",
        con = content or "用户投稿",
        feedversion = "1",
        ver = "1",
        ugc_right = "1",
        to_sign = "0",
        hostuin = cookies.uin,
        code_version = "1",
        format = "fs",
        qzreferrer = "https://user.qzone.qq.com/" .. cookies.uin
    }
    
    -- 添加图片相关参数
    if img then
        data.richtype = "1"
        data.richval = richval
        data.subrichtype = "1"
        if pic_bo ~= "" then
            data.pic_bo = pic_bo
        end
    end
    
    local headers = {
        ["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        ["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8",
        ["Referer"] = "https://user.qzone.qq.com/" .. cookies.uin,
        ["Origin"] = "https://user.qzone.qq.com",
        ["Cookie"] = cookies.raw
    }
    
    log.info("发布说说URL: " .. string.sub(url, 1, 200))
    
    local body = form_encode(data)
    local bodyLog = form_encode_masked(data)
    log.debug("发布说说请求头: " .. headers_to_log(headers))
    log.debug("发布说说请求体: " .. string.sub(bodyLog, 1, 1500))
    
    local resp = http_post(url, body, headers)
    if not resp then
        log.error("发布说说请求失败")
        return false, "请求失败"
    end
    
    log.info("发布说说状态码: " .. tostring(resp.status))
    log.debug("发布响应: " .. string.sub(tostring(resp.body or ""), 1, 500))
    
    -- 解析响应
    local code = tonumber(string.match(resp.body or "", '"code"%s*:%s*(%d+)') or "-1")
    if code == 0 then
        local tid = string.match(resp.body or "", '"tid"%s*:%s*"([^"]+)"') or ""
        log.info("发布成功，tid=" .. tostring(tid))
        return true, tid
    else
        local msg = string.match(resp.body or "", '"message"%s*:%s*"([^"]*)"') or "未知错误"
        log.warn("发布失败: code=" .. tostring(code) .. ", msg=" .. msg)
        return false, msg
    end
end

-- ==================== 删除功能相关函数 ====================

local function delete_shuoshuo(tid, cookies)
    if not tid or tid == "" then
        return false, "说说ID为空"
    end
    local skey_for_hash = cookies.p_skey or cookies.skey or ""
    local gtk_p = djb_hash(skey_for_hash)
    local qzonetoken = get_qzonetoken(cookies.uin, cookies.raw)
    if not qzonetoken or qzonetoken == "" then
        qzonetoken = djb_hash(skey_for_hash)
        log.warn("使用计算的qzonetoken: " .. tostring(qzonetoken))
    end
    local timestamp = tostring(os.time() * 1000)
    local baseUrl = "https://user.qzone.qq.com/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_delete_v6"
    local url = baseUrl .. "?g_tk=" .. tostring(gtk_p) .. "&qzonetoken=" .. tostring(qzonetoken) .. "&t=" .. timestamp

    local data = {
        tid = tid,
        hostuin = cookies.uin,
        code_version = "1",
        format = "fs",
        qzreferrer = "https://user.qzone.qq.com/" .. cookies.uin
    }

    local headers = {
        ["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        ["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8",
        ["Referer"] = "https://user.qzone.qq.com/" .. cookies.uin,
        ["Origin"] = "https://user.qzone.qq.com",
        ["Cookie"] = cookies.raw
    }

    local body = form_encode(data)
    local bodyLog = form_encode_masked(data)
    log.info("删除说说请求: tid=" .. tid)
    log.debug("删除说说请求URL: " .. string.sub(url, 1, 200))
    log.debug("删除说说请求头: " .. headers_to_log(headers))
    log.debug("删除说说请求体: " .. string.sub(bodyLog, 1, 1000))
    local resp = http_post(url, body, headers)
    if not resp then
        return false, "请求失败"
    end
    
    log.info("删除说说状态码: " .. tostring(resp.status))
    log.debug("删除响应: " .. string.sub(tostring(resp.body or ""), 1, 500))

    local code = tonumber(string.match(resp.body or "", '"code"%s*:%s*(%d+)') or string.match(resp.body or "", '"ret"%s*:%s*(%d+)') or "-1")
    if code == 0 then
        return true
    end
    local msg = string.match(resp.body or "", '"message"%s*:%s*"([^"]*)"') or "未知错误"
    return false, msg
end

local function remove_submission_from_file(submission_id)
    local content = safe_file_read(SUBMISSION_FILE) or ""
    local s = string_trim(content)
    if s == "" or s == "[]" then
        return false
    end
    
    -- 解析JSON数组
    local submissions = {}
    local found = false
    
    -- 简单的JSON解析，查找并移除指定ID的投稿
    local pattern = '({[^}]*"id"%s*:%s*' .. submission_id .. '[^}]*})'
    local newContent = string.gsub(s, pattern, "")
    
    -- 清理多余的逗号
    newContent = string.gsub(newContent, ",,", ",")
    newContent = string.gsub(newContent, ",%s*%]", "]")
    newContent = string.gsub(newContent, "%[%s*,", "[")
    
    if newContent ~= s then
        safe_file_write(SUBMISSION_FILE, newContent)
        return true
    end
    
    return false
end

local function find_submission_by_id(submission_id)
    local content = safe_file_read(SUBMISSION_FILE) or ""
    local s = string_trim(content)
    if s == "" or s == "[]" then
        return nil
    end
    
    -- 在内容中查找指定ID的投稿
    local pattern = '{"id":' .. submission_id .. '[^}]*}'
    local submissionStr = string.match(s, pattern)
    
    if submissionStr then
        -- 简单解析投稿信息
        local submission = {}
        submission.id = tonumber(string.match(submissionStr, '"id"%s*:%s*(%d+)'))
        submission.user_id = string.match(submissionStr, '"user_id"%s*:%s*"([^"]*)"')
        submission.shuoshuo_id = string.match(submissionStr, '"shuoshuo_id"%s*:%s*"([^"]*)"')
        submission.image_url = string.match(submissionStr, '"image_url"%s*:%s*"([^"]*)"')
        
        return submission
    end
    
    return nil
end

local function has_delete_permission(user_id, submission)
    if not submission then
        return false
    end
    
    -- 管理员可以删除所有投稿
    if tostring(user_id) == tostring(ADMIN_QQ) then
        return true
    end
    
    -- 用户只能删除自己的投稿
    if tostring(user_id) == tostring(submission.user_id) then
        return true
    end
    
    return false
end

local function handle_delete_command(user_id, command)
    -- 提取投稿ID
    local submission_id = string.match(command, "^" .. DELETE_TRIGGER .. "%s*(%d+)%s*$")
    if not submission_id then
        submission_id = string.match(command, "^" .. DELETE_TRIGGER .. "%s*{%s*(%d+)%s*}%s*$")
    end
    if not submission_id then
        submission_id = string.match(command, "^" .. DELETE_TRIGGER .. "[^0-9]*(%d+)")
    end
    if not submission_id then
        submission_id = string.match(command, DELETE_TRIGGER .. "[^0-9]*(%d+)")
    end
    
    if not submission_id then
        return false, "无效的命令格式，请使用：删除 投稿ID 或 删除{投稿ID}"
    end
    
    log.info("用户 " .. tostring(user_id) .. " 请求删除投稿: " .. submission_id)
    
    -- 查找投稿记录
    local submission = find_submission_by_id(submission_id)
    if not submission then
        return false, DELETE_NOT_FOUND
    end
    
    -- 检查权限
    if not has_delete_permission(user_id, submission) then
        return false, DELETE_NO_PERMISSION
    end
    
    -- 获取Cookie用于删除QQ空间说说
    local cookieJson = getCookieJson()
    if not cookieJson or cookieJson == "" then
        log.error("获取Cookie失败")
        return false, "Cookie获取失败"
    end
    
    local cookies = parseCookiesFromJson(cookieJson)
    if not cookies.uin or cookies.uin == "" then
        return false, "Cookie中无uin"
    end
    
    -- 删除QQ空间说说
    local qzone_success = true
    local qzone_message = ""
    if submission.shuoshuo_id and submission.shuoshuo_id ~= "" then
        local ok, err = delete_shuoshuo(submission.shuoshuo_id, cookies)
        if not ok then
            qzone_success = false
            qzone_message = tostring(err)
            log.warn("删除QQ空间说说失败: " .. qzone_message)
        else
            log.info("成功删除QQ空间说说: " .. submission.shuoshuo_id)
        end
    end
    
    if qzone_success then
        return true, DELETE_SUCCESS
    else
        return false, "QQ空间说说删除失败 (" .. qzone_message .. ")"
    end
end

-- ==================== 主消息处理函数 ====================

function on_init()
    log.info("自动发布投稿插件初始化 - 版本1.1.0")
    loadProhibitedWords()
end

on_message(function(event)
    local msgType = msg.get_type(event)
    if msgType ~= "private" then return end
    local uid = event.user_id
    local mid = event.message_id
    local raw = msg.get_plain_text(event) or ""
    
    -- 检查是否为删除命令
    local command = string_trim(raw)
    if DELETE_TRIGGER and string.find(command, DELETE_TRIGGER, 1, true) then
        local success, tip = handle_delete_command(uid, command)
        message.send_private(uid, tip)
        return
    end
    
    -- 原有的图片处理和投稿逻辑
    if event.message and type(event.message) == "table" then
        local hasImage = false
        local idx = 1
        while event.message[idx] do
            local seg = event.message[idx]
            if type(seg) == "table" then
                local t = seg.type or seg.data_type
                if t == "image" or t == "img" then
                    hasImage = true
                end
            end
            idx = idx + 1
        end
        if hasImage then
            pushCache(tostring(mid), event)
            log.info("缓存私聊图片消息: message_id=" .. tostring(mid))
            return
        end
    end
    
    local isReply = false
    local replyId = nil
    local textPayload = raw
    if event.message and type(event.message) == "table" then
        local idx = 1
        while event.message[idx] do
            local seg = event.message[idx]
            if type(seg) == "table" then
                local t = seg.type or seg.data_type
                if t == "reply" and seg.data and seg.data.id then
                    isReply = true
                    replyId = tostring(seg.data.id)
                elseif t == "text" and seg.data and seg.data.text then
                    textPayload = tostring(seg.data.text)
                end
            end
            idx = idx + 1
        end
    end
    if not isReply then return end
    local cmd = (textPayload or ""):gsub("^%s+",""):gsub("%s+$","")
    if cmd ~= TRIGGER and not string.find(cmd, TRIGGER, 1, true) then return end
    log.info("检测到投稿指令，reply_id=" .. tostring(replyId))
    local original = recentPrivateEvents[replyId]
    if not original then
        log.warn("未找到原始图片消息缓存: " .. tostring(replyId))
        record_error(uid, replyId, "original_not_found", "", "")
        reply_error(uid)
        return
    end
    local imageText = nil
    do
        local text, ocrErr = convertImageToText(original)
        if ocrErr then log.warn("OCR错误: " .. tostring(ocrErr)) end
        imageText = text or ""
    end
    if imageText ~= "" then
        local violated, word = containsProhibitedWord(imageText)
        log.info("违禁词检测: violated=" .. tostring(violated) .. ", word=" .. tostring(word))
        if violated then
            local img0 = extract_image_url(original) or ""
            record_error(uid, original.message_id, "prohibited_word", img0, tostring(word or ""))
            reply_error(uid)
            return
        end
    end
    local seg = nil
    do
        local i = 1
        while original.message and original.message[i] do
            local s = original.message[i]
            if type(s) == "table" then
                local t = s.type or s.data_type
                if t == "image" or t == "img" then seg = s; break end
            end
            i = i + 1
        end
    end
    if not seg then
        record_error(uid, original.message_id, "no_image_segment", "", "")
        reply_error(uid)
        return
    end
    local imgUrl = seg.url
    if seg.data and type(seg.data) == "table" then imgUrl = seg.data.url or imgUrl end
    if not imgUrl or imgUrl == "" then
        record_error(uid, original.message_id, "empty_image_url", "", "")
        reply_error(uid)
        return
    end
    local cookieJson = getCookieJson()
    if not cookieJson or cookieJson == "" then
        log.error("获取Cookie失败")
        record_error(uid, original.message_id, "cookie_missing", imgUrl, "")
        reply_error(uid)
        return
    end
    log.debug("Cookie原始: " .. string.sub(cookieJson, 1, 200))
    local cookies = parseCookiesFromJson(cookieJson)
    if not cookies.uin or cookies.uin == "" then
        record_error(uid, original.message_id, "cookie_no_uin", imgUrl, "")
        reply_error(uid)
        return
    end
    log.info("开始上传图片")
    local imgInfo = upload_image(imgUrl, cookies)
    if not imgInfo then
        record_error(uid, original.message_id, "upload_failed", imgUrl, "")
        reply_error(uid)
        return
    end
    log.info("上传成功: albumid=" .. tostring(imgInfo.albumid) .. ", lloc=" .. tostring(imgInfo.lloc) .. ", sloc=" .. tostring(imgInfo.sloc))
    local sid0 = next_seq_id()
    local content = TALK_COPY .. tostring(sid0)
    log.info("发布内容: " .. tostring(content))
    local ok, rid = publish_shuoshuo(content, imgInfo, cookies)
    if ok then
        local sid = record_submission(uid, original.message_id, content, imgUrl, imgInfo, rid, sid0)
        reply_success(uid, sid)
    else
        record_error(uid, original.message_id, "publish_failed", imgUrl, tostring(rid or ""))
        reply_error(uid)
    end
end)

function on_destroy()
    log.info("自动发布投稿插件停止")
end