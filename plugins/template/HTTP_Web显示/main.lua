-- HTTP Web显示插件
-- 提供类似Nginx的静态文件服务功能
-- 访问路径: /plugins/{selfid}/web

plugin.name = "http_web_display"
plugin.version = "1.0.0"
plugin.description = "HTTP Web显示插件 - 提供静态文件服务，类似Nginx功能"

-- MIME类型映射表
local mime_types = {
    [".html"] = "text/html; charset=utf-8",
    [".htm"] = "text/html; charset=utf-8",
    [".css"] = "text/css; charset=utf-8",
    [".js"] = "application/javascript; charset=utf-8",
    [".json"] = "application/json; charset=utf-8",
    [".png"] = "image/png",
    [".jpg"] = "image/jpeg",
    [".jpeg"] = "image/jpeg",
    [".gif"] = "image/gif",
    [".svg"] = "image/svg+xml",
    [".ico"] = "image/x-icon",
    [".woff"] = "font/woff",
    [".woff2"] = "font/woff2",
    [".ttf"] = "font/ttf",
    [".otf"] = "font/otf",
    [".eot"] = "application/vnd.ms-fontobject",
    [".txt"] = "text/plain; charset=utf-8",
    [".xml"] = "application/xml",
    [".pdf"] = "application/pdf",
    [".zip"] = "application/zip",
    [".mp4"] = "video/mp4",
    [".webm"] = "video/webm",
    [".mp3"] = "audio/mpeg",
    [".wav"] = "audio/wav",
}

-- 获取文件扩展名
local function get_extension(filename)
    return string.match(filename, "%.[^%.]+$") or ""
end

-- 获取MIME类型
local function get_mime_type(filename)
    local ext = get_extension(filename):lower()
    return mime_types[ext] or "application/octet-stream"
end

-- URL解码
local function url_decode(str)
    if not str then return nil end
    str = string.gsub(str, "+", " ")
    str = string.gsub(str, "%%(%x%x)", function(h)
        return string.char(tonumber(h, 16))
    end)
    return str
end

-- 安全的文件路径处理（防止目录遍历攻击）
local function sanitize_path(path)
    if not path then return "index.html" end
    
    -- URL解码
    path = url_decode(path)
    
    -- 移除开头的 /
    path = string.gsub(path, "^/+", "")
    
    -- 防止目录遍历攻击
    -- 移除 ../ 和 ..\\ 等危险路径
    path = string.gsub(path, "%.%./", "")
    path = string.gsub(path, "%.%.\\", "")
    path = string.gsub(path, "%.%.$", "")
    
    -- 如果路径为空或只有 /，返回 index.html
    if path == "" or path == "/" then
        return "index.html"
    end
    
    return path
end

-- 读取文件内容为二进制（返回base64编码）
local function read_file_binary(filepath)
    -- 使用 file.read 读取文件
    local content, err = file.read(filepath)
    if not content then
        return nil, err
    end
    
    -- 返回原始内容，让系统处理编码
    return content, nil
end

-- 检查是否是文本文件
local function is_text_file(filename)
    local text_exts = {
        [".html"] = true,
        [".htm"] = true,
        [".css"] = true,
        [".js"] = true,
        [".json"] = true,
        [".txt"] = true,
        [".xml"] = true,
        [".svg"] = true,
    }
    local ext = get_extension(filename):lower()
    return text_exts[ext] or false
end

-- 存储 self_id 的全局变量
local self_id = nil

-- 初始化函数
function on_init()
    log.info("HTTP Web显示插件已启动")
    
    -- 获取机器人ID - 使用 plugin.self_id
    self_id = tostring(plugin.self_id)
    log.info("当前账号ID: " .. tostring(self_id))
    
    -- 注册HTTP接口（局部接口，带selfID）
    -- 接口路径: /plugins/{selfid}/web
    local success, err = http_interface.register("web", tostring(self_id), function(ctx)
        log.info("收到HTTP请求: " .. ctx.method .. " " .. ctx.path)
        
        -- 只处理GET和HEAD请求
        if ctx.method ~= "GET" and ctx.method ~= "HEAD" then
            return {
                status = 405,
                headers = { ["Content-Type"] = "text/plain; charset=utf-8" },
                body = "Method Not Allowed"
            }
        end
        
        -- 解析请求路径
        -- ctx.path 格式: /plugins/{selfid}/web/xxx
        local request_path = ctx.path or "/"
        
        -- 提取相对路径（去掉 /plugins/{selfid}/web 前缀）
        local web_prefix = "/plugins/" .. self_id .. "/web"
        local relative_path = string.gsub(request_path, "^" .. web_prefix, "")
        
        -- 如果访问的是 /plugins/{selfid}/web (不带斜杠)，重定向到带斜杠的版本
        -- 这样浏览器的相对路径才能正确解析
        if relative_path == "" then
            return {
                status = 302,
                headers = {
                    ["Location"] = web_prefix .. "/",
                    ["Content-Type"] = "text/plain"
                },
                body = "Redirecting..."
            }
        end
        
        -- 处理路径
        local file_path = sanitize_path(relative_path)
        
        log.info("请求文件: " .. file_path)
        
        -- 检查文件是否存在
        if not file.exists(file_path) then
            log.warn("文件不存在: " .. file_path)
            return {
                status = 404,
                headers = { ["Content-Type"] = "text/html; charset=utf-8" },
                body = [[
<!DOCTYPE html>
<html>
<head>
    <title>404 Not Found</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        h1 { color: #e74c3c; }
        p { color: #666; }
    </style>
</head>
<body>
    <h1>404 Not Found</h1>
    <p>请求的文件不存在: ]] .. file_path .. [[</p>
</body>
</html>]]
            }
        end
        
        -- 如果是目录，尝试返回 index.html
        -- 注意：Lua插件中无法直接判断是否是目录，通过尝试读取 index.html 来处理
        local is_directory = false
        if string.sub(file_path, -1) == "/" then
            is_directory = true
            file_path = file_path .. "index.html"
        else
            -- 尝试检查是否是目录（通过检查 file_path/index.html 是否存在）
            local index_in_dir = file_path .. "/index.html"
            if file.exists(index_in_dir) then
                file_path = index_in_dir
            end
        end
        
        -- 再次检查文件是否存在（处理目录情况）
        if not file.exists(file_path) then
            return {
                status = 404,
                headers = { ["Content-Type"] = "text/html; charset=utf-8" },
                body = [[
<!DOCTYPE html>
<html>
<head>
    <title>404 Not Found</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        h1 { color: #e74c3c; }
        p { color: #666; }
    </style>
</head>
<body>
    <h1>404 Not Found</h1>
    <p>请求的文件不存在: ]] .. file_path .. [[</p>
</body>
</html>]]
            }
        end
        
        -- 读取文件内容
        local content, read_err = file.read(file_path)
        if not content then
            log.error("读取文件失败: " .. tostring(read_err))
            return {
                status = 500,
                headers = { ["Content-Type"] = "text/html; charset=utf-8" },
                body = [[
<!DOCTYPE html>
<html>
<head>
    <title>500 Internal Server Error</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        h1 { color: #e74c3c; }
        p { color: #666; }
    </style>
</head>
<body>
    <h1>500 Internal Server Error</h1>
    <p>无法读取文件: ]] .. tostring(read_err) .. [[</p>
</body>
</html>]]
            }
        end
        
        -- 获取MIME类型
        local mime_type = get_mime_type(file_path)
        
        log.info("成功读取文件: " .. file_path .. " (" .. mime_type .. ")")
        
        -- 返回响应
        return {
            status = 200,
            headers = {
                ["Content-Type"] = mime_type,
                ["Cache-Control"] = "public, max-age=3600",
            },
            body = content
        }
    end, {"GET", "HEAD"})
    
    if not success then
        log.error("注册HTTP接口失败: " .. tostring(err))
    else
        log.info("HTTP接口已注册: /plugins/" .. tostring(self_id) .. "/web")
        log.info("请将静态文件放在插件目录的 web/ 子目录中")
    end
end

-- 注册消息事件处理器（可选，用于测试）
on_message(function(event)
    local msg_type = msg.get_type(event)
    local text = msg.get_plain_text(event)
    
    -- 私聊发送 "web_test" 获取访问地址
    if msg_type == "private" and text == "web_test" then
        local web_url = "/plugins/" .. tostring(self_id) .. "/web"
        
        local response = "HTTP Web显示插件已就绪！\n\n"
        response = response .. "访问地址: " .. web_url .. "\n"
        response = response .. "请将静态文件放在插件目录的 web/ 子目录中\n\n"
        response = response .. "支持的文件类型:\n"
        response = response .. "- HTML/CSS/JS\n"
        response = response .. "- 图片 (PNG, JPG, GIF, SVG, ICO)\n"
        response = response .. "- 字体 (WOFF, WOFF2, TTF, OTF)\n"
        response = response .. "- 其他静态资源\n\n"
        response = response .. "默认首页: index.html"
        
        local success, result = message.send_private(msg.get_sender_id(event), response)
        if not success then
            log.error("发送消息失败: " .. tostring(result))
        end
    end
end)

-- 清理函数
function on_destroy()
    log.info("HTTP Web显示插件已停止")
    
    -- 注销HTTP接口
    if self_id then
        local success, err = http_interface.unregister("web", self_id)
        if not success then
            log.error("注销HTTP接口失败: " .. tostring(err))
        else
            log.info("HTTP接口已注销: /plugins/" .. self_id .. "/web")
        end
    else
        log.warn("self_id为空，跳过注销HTTP接口")
    end
end
