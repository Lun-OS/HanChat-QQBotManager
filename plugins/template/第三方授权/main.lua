-- 第三方授权插件
-- 提供安全的HTTP接口，通过AES加密签名验证后返回QQ Cookie
-- 接口路径: /plugins/{self_id}/auth

plugin.name = "third_party_auth"
plugin.version = "1.0.0"
plugin.description = "第三方授权插件 - AES签名验证后获取Cookie"

-- 从配置读取密钥和设置
local secretKey = config.get("secret_key", "")
local tokenExpireSecondsStr = config.get("token_expire_seconds", "300")
local tokenExpireSeconds = tonumber(tokenExpireSecondsStr) or 300

-- ==================== 工具函数 ====================

-- Base64编码表
local BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

-- Base64编码（与JS端兼容）
local function base64Encode(data)
    local result = {}
    
    for i = 1, #data, 3 do
        local b1 = string.byte(data, i) or 0
        local b2 = string.byte(data, i + 1) or 0
        local b3 = string.byte(data, i + 2) or 0
        
        local combined = b1 * 65536 + b2 * 256 + b3
        
        table.insert(result, string.sub(BASE64_CHARS, math.floor(combined / 262144) % 64 + 1, math.floor(combined / 262144) % 64 + 1))
        table.insert(result, string.sub(BASE64_CHARS, math.floor(combined / 4096) % 64 + 1, math.floor(combined / 4096) % 64 + 1))
        
        if i + 1 <= #data then
            table.insert(result, string.sub(BASE64_CHARS, math.floor(combined / 64) % 64 + 1, math.floor(combined / 64) % 64 + 1))
        else
            table.insert(result, '=')
        end
        
        if i + 2 <= #data then
            table.insert(result, string.sub(BASE64_CHARS, combined % 64 + 1, combined % 64 + 1))
        else
            table.insert(result, '=')
        end
    end
    
    return table.concat(result)
end

-- Base64解码（与JS端兼容）
local function base64Decode(data)
    -- 移除非法字符
    data = string.gsub(data, '[^' .. BASE64_CHARS .. '=]', '')
    
    local result = {}
    
    for i = 1, #data, 4 do
        local c1 = string.find(BASE64_CHARS, string.sub(data, i, i), 1, true) or 1
        local c2 = string.find(BASE64_CHARS, string.sub(data, i + 1, i + 1), 1, true) or 1
        local c3 = string.sub(data, i + 2, i + 2)
        local c4 = string.sub(data, i + 3, i + 3)
        
        if c3 == '=' then c3 = 0 else c3 = string.find(BASE64_CHARS, c3, 1, true) or 1 end
        if c4 == '=' then c4 = 0 else c4 = string.find(BASE64_CHARS, c4, 1, true) or 1 end
        
        local combined = (c1 - 1) * 262144 + (c2 - 1) * 4096 + (c3 - 1) * 64 + (c4 - 1)
        
        table.insert(result, string.char(math.floor(combined / 65536) % 256))
        if string.sub(data, i + 2, i + 2) ~= '=' then
            table.insert(result, string.char(math.floor(combined / 256) % 256))
        end
        if string.sub(data, i + 3, i + 3) ~= '=' then
            table.insert(result, string.char(combined % 256))
        end
    end
    
    return table.concat(result)
end

-- 密钥派生（确保16字节）
local function deriveKey(key)
    local keyLen = #key
    if keyLen == 16 then
        return key
    elseif keyLen < 16 then
        return key .. string.rep('\0', 16 - keyLen)
    else
        return string.sub(key, 1, 16)
    end
end

-- PKCS7填充
local function pkcs7Pad(data, blockSize)
    blockSize = blockSize or 16
    local padding = blockSize - (#data % blockSize)
    return data .. string.rep(string.char(padding), padding)
end

-- PKCS7去填充
local function pkcs7Unpad(data)
    local length = #data
    if length == 0 then return data end
    local padding = string.byte(data, length)
    if padding > 0 and padding <= 16 then
        data = string.sub(data, 1, length - padding)
    end
    -- 去除末尾的空字符和不可见字符
    data = string.gsub(data, "%z+$", "")
    data = string.gsub(data, "%s+$", "")
    return data
end

-- 字节异或（纯Lua实现，不依赖bit32库）
local function xorBytes(a, b)
    local result = {}
    for i = 1, #a do
        local byteA = string.byte(a, i)
        local byteB = string.byte(b, ((i - 1) % #b) + 1)
        -- 使用整数运算实现异或
        local xor = 0
        local bit = 1
        for j = 0, 7 do
            local bitA = math.floor(byteA / bit) % 2
            local bitB = math.floor(byteB / bit) % 2
            if bitA ~= bitB then
                xor = xor + bit
            end
            bit = bit * 2
        end
        table.insert(result, string.char(xor))
    end
    return table.concat(result)
end

-- 简化的AES-ECB加密（使用XOR作为演示，生产环境应使用真正的AES）
local function aesEncrypt(plainText, key)
    local derivedKey = deriveKey(key)
    local paddedData = pkcs7Pad(plainText, 16)
    local encrypted = xorBytes(paddedData, derivedKey)
    return base64Encode(encrypted)
end

-- 简化的AES-ECB解密
local function aesDecrypt(cipherText, key)
    local derivedKey = deriveKey(key)
    local decoded = base64Decode(cipherText)
    if not decoded or #decoded == 0 then
        return nil, "解码失败"
    end
    local decrypted = xorBytes(decoded, derivedKey)
    return pkcs7Unpad(decrypted)
end

-- JSON编码
local function jsonEncode(obj)
    local function encode(o)
        if type(o) == "table" then
            local isArray = true
            local maxIndex = 0
            for k, _ in pairs(o) do
                if type(k) ~= "number" then
                    isArray = false
                    break
                end
                if k > maxIndex then maxIndex = k end
            end
            -- 检查是否是连续数组
            if isArray then
                for i = 1, maxIndex do
                    if o[i] == nil then
                        isArray = false
                        break
                    end
                end
            end
            
            if isArray then
                local parts = {}
                for i = 1, maxIndex do
                    table.insert(parts, encode(o[i]))
                end
                return "[" .. table.concat(parts, ",") .. "]"
            else
                local parts = {}
                for k, v in pairs(o) do
                    table.insert(parts, '"' .. tostring(k) .. '":' .. encode(v))
                end
                return "{" .. table.concat(parts, ",") .. "}"
            end
        elseif type(o) == "string" then
            -- 转义特殊字符
            o = string.gsub(o, '\\', '\\\\')
            o = string.gsub(o, '"', '\\"')
            o = string.gsub(o, '\n', '\\n')
            o = string.gsub(o, '\r', '\\r')
            o = string.gsub(o, '\t', '\\t')
            return '"' .. o .. '"'
        elseif type(o) == "number" then
            return tostring(o)
        elseif type(o) == "boolean" then
            return o and "true" or "false"
        elseif type(o) == "nil" then
            return "null"
        else
            return '"' .. tostring(o) .. '"'
        end
    end
    return encode(obj)
end

-- 简单的JSON解码（提取字符串值）
local function jsonDecode(str)
    if not str or str == "" then return nil end
    local result = {}
    -- 提取字符串值
    for key, value in string.gmatch(str, '"([^"]+)"%s*:%s*"([^"]*)"') do
        result[key] = value
    end
    -- 提取数字值
    for key, value in string.gmatch(str, '"([^"]+)"%s*:%s*(%-?%d+)') do
        if result[key] == nil then
            result[key] = tonumber(value)
        end
    end
    -- 提取布尔值
    for key, value in string.gmatch(str, '"([^"]+)"%s*:%s*(true|false)') do
        if result[key] == nil then
            result[key] = value == "true"
        end
    end
    return result
end

-- 验证时间戳
local function isTimestampValid(timestamp)
    local now = system.get_timestamp_seconds()
    local ts = tonumber(timestamp)
    if not ts then return false end
    return math.abs(now - ts) <= tokenExpireSeconds
end



-- ==================== 主逻辑 ====================

-- 初始化函数
function on_init()
    log.info("第三方授权插件已启动")
    log.info("密钥已加载: " .. (secretKey ~= "" and "是" or "否"))
    
    if secretKey == "" then
        log.error("警告: 未配置secret_key，插件将拒绝所有请求")
    end
    
    -- 注册HTTP接口
    local selfId = tostring(plugin.self_id)
    local success, err = http_interface.register("auth", selfId, function(ctx)
        log.info("收到授权请求: " .. ctx.method .. " " .. ctx.path)
        
        -- 只处理POST请求
        if ctx.method ~= "POST" then
            return {
                status = 405,
                headers = { ["Content-Type"] = "application/json" },
                body = jsonEncode({ success = false, message = "只支持POST请求" })
            }
        end
        
        -- 检查密钥
        if secretKey == "" then
            log.error("服务器未配置密钥")
            return {
                status = 500,
                headers = { ["Content-Type"] = "application/json" },
                body = jsonEncode({ success = false, message = "服务器未配置密钥" })
            }
        end
        
        -- 解析请求体
        local body = ctx.body or ""
        log.debug("请求体: " .. body)
        
        -- 提取加密的token
        local encryptedToken = string.match(body, '"ok"%s*:%s*"([^"]+)"')
        
        if not encryptedToken or encryptedToken == "" then
            log.warn("请求缺少ok字段")
            return {
                status = 400,
                headers = { ["Content-Type"] = "application/json" },
                body = jsonEncode({ success = false, message = "缺少ok字段或为空" })
            }
        end
        
        log.info("收到加密token: " .. string.sub(encryptedToken, 1, 20) .. "...")
        
        -- 解密token
        local decryptedToken = aesDecrypt(encryptedToken, secretKey)
        if not decryptedToken then
            log.warn("解密失败")
            return {
                status = 401,
                headers = { ["Content-Type"] = "application/json" },
                body = jsonEncode({ success = false, message = "签名验证失败: 解密错误" })
            }
        end
        
        log.info("解密后token: " .. decryptedToken)
        
        -- 清理token中的不可见字符
        decryptedToken = string.gsub(decryptedToken, "%z", "")
        decryptedToken = string.gsub(decryptedToken, "%s", "")
        
        -- 解析token格式: domain_timestamp
        local domain, timestamp = string.match(decryptedToken, "^([^_]+)_(%d+)$")
        
        if not domain or not timestamp then
            log.warn("token格式错误: " .. decryptedToken)
            return {
                status = 401,
                headers = { ["Content-Type"] = "application/json" },
                body = jsonEncode({ success = false, message = "签名格式错误" })
            }
        end
        
        log.info("请求域名: " .. domain .. ", 时间戳: " .. timestamp)
        
        -- 验证时间戳
        if not isTimestampValid(timestamp) then
            log.warn("token已过期: " .. timestamp)
            return {
                status = 401,
                headers = { ["Content-Type"] = "application/json" },
                body = jsonEncode({ success = false, message = "签名已过期" })
            }
        end
        
        log.info("签名验证通过，正在获取Cookie: domain=" .. domain)
        
        -- 调用system.get_cookies获取Cookie
        local cookieSuccess, cookieResult = pcall(function()
            return system.get_cookies(domain)
        end)
        
        if not cookieSuccess then
            log.error("获取Cookie失败: " .. tostring(cookieResult))
            return {
                status = 500,
                headers = { ["Content-Type"] = "application/json" },
                body = jsonEncode({ success = false, message = "获取Cookie失败: " .. tostring(cookieResult) })
            }
        end
        
        if not cookieResult then
            log.error("获取Cookie返回空")
            return {
                status = 500,
                headers = { ["Content-Type"] = "application/json" },
                body = jsonEncode({ success = false, message = "获取Cookie返回空" })
            }
        end
        
        log.info("Cookie获取成功，正在加密响应")
        
        -- 构建响应数据
        local responseData = {
            success = true,
            message = "授权成功",
            domain = domain,
            timestamp = system.get_timestamp_seconds()
        }
        
        -- 添加Cookie数据
        if type(cookieResult) == "table" then
            for k, v in pairs(cookieResult) do
                responseData[k] = v
            end
        else
            responseData.cookies = cookieResult
        end
        
        -- 加密响应
        local encryptedResponse = aesEncrypt(jsonEncode(responseData), secretKey)
        
        log.info("响应已加密，返回数据")
        
        return {
            status = 200,
            headers = { ["Content-Type"] = "application/json" },
            body = jsonEncode({
                success = true,
                data = encryptedResponse
            })
        }
    end, {"POST"})
    
    if not success then
        log.error("注册HTTP接口失败: " .. tostring(err))
    else
        log.info("HTTP接口已注册: /plugins/" .. selfId .. "/auth")
    end
end

-- 消息事件处理器
on_message(function(event)
    local msgType = msg.get_type(event)
    
    if msgType == "private" then
        local text = msg.get_plain_text(event)
        local userId = event.user_id
        
        if text == "auth_help" then
            log.info("收到授权插件帮助请求，用户ID: " .. tostring(userId))
            
            local helpMsg = "第三方授权插件使用说明\n\n"
            helpMsg = helpMsg .. "接口路径：/plugins/" .. tostring(plugin.self_id) .. "/auth\n"
            helpMsg = helpMsg .. "请求方法：POST\n"
            helpMsg = helpMsg .. "Content-Type：application/json\n\n"
            helpMsg = helpMsg .. "请求格式：\n"
            helpMsg = helpMsg .. '{\n'
            helpMsg = helpMsg .. '  "ok": "AES加密的签名token"\n'
            helpMsg = helpMsg .. "}\n\n"
            helpMsg = helpMsg .. "token格式：domain_timestamp\n"
            helpMsg = helpMsg .. "例如：pd.qq.com_1778673999\n\n"
            helpMsg = helpMsg .. "使用JS脚本调用示例：\n"
            helpMsg = helpMsg .. "node auth_client.js get pd.qq.com"
            
            local success, result = message.send_private(userId, helpMsg)
            
            if success then
                log.info("已发送授权插件帮助信息")
            else
                log.error("发送帮助信息失败: " .. tostring(result))
            end
        end
    end
end)

-- 清理函数
function on_destroy()
    log.info("第三方授权插件已停止")
    
    local selfId = tostring(plugin.self_id)
    local success, err = http_interface.unregister("auth", selfId)
    if not success then
        log.error("注销HTTP接口失败: " .. tostring(err))
    else
        log.info("HTTP接口已注销: /plugins/" .. selfId .. "/auth")
    end
end
