/**
 * Blockly Lua JSON处理工具模块
 *
 * 此模块提供纯Lua的JSON处理代码生成，将原后端接口的JSON处理逻辑
 * 迁移至Lua代码生成阶段直接处理，避免跨语言调用的兼容性问题。
 *
 * 利用Lua的动态类型特性，实现灵活的JSON数据处理。
 * 支持按需引入，只生成实际使用的运行时库代码。
 */

/**
 * 运行时库类型枚举
 */
export enum RuntimeLibraryType {
  JSON = 'json',           // JSON编码/解码
  TABLE_UTILS = 'table',   // 表操作工具
  MSG_UTILS = 'msg',       // 消息处理工具
  HTTP_UTILS = 'http',     // HTTP请求工具
  URL_UTILS = 'url',       // URL处理工具
  TEXT_UTILS = 'text',     // 文本处理工具
  TIME_UTILS = 'time',     // 时间处理工具
}

/**
 * 生成Lua原生的JSON编码代码
 * 将Lua表编码为JSON字符串，直接使用后端提供的 json 库
 */
export function generateLuaJSONEncodeCode(valueExpr: string): string {
  return `json.encode(${valueExpr})`;
}

/**
 * 生成Lua原生的JSON解码代码
 * 将JSON字符串解析为Lua表，直接使用后端提供的 json 库
 */
export function generateLuaJSONDecodeCode(jsonExpr: string): string {
  return `json.decode(${jsonExpr})`;
}

/**
 * 生成Lua原生的JSON路径获取代码
 * 从JSON字符串中按路径获取值，直接使用后端提供的 json 库
 */
export function generateLuaJSONGetCode(jsonExpr: string, pathExpr: string): string {
  return `json.get(${jsonExpr}, ${pathExpr})`;
}

/**
 * 生成Lua原生的JSON提取代码（支持复杂路径）
 * 从JSON字符串中提取指定路径的值，直接使用后端提供的 json 库
 */
export function generateLuaJSONExtractCode(jsonExpr: string, pathExpr: string): string {
  return `json.get(${jsonExpr}, ${pathExpr})`;
}

/**
 * 生成Lua原生的表路径获取代码
 * 从Lua表中按路径获取值
 */
export function generateLuaTableGetCode(tableExpr: string, pathExpr: string): string {
  return `blockly_table_utils.get(${tableExpr}, ${pathExpr})`;
}

/**
 * 生成Lua原生的表路径设置代码
 * 在Lua表中按路径设置值
 */
export function generateLuaTableSetCode(tableExpr: string, pathExpr: string, valueExpr: string): string {
  return `blockly_table_utils.set(${tableExpr}, ${pathExpr}, ${valueExpr})`;
}

/**
 * 各个运行时库的独立代码模块
 * 按需引入，只生成实际使用的代码
 */

// JSON处理模块代码
const JSON_RUNTIME_CODE = String.raw`-- JSON处理模块
blockly_json = blockly_json or {}

-- 简单的JSON编码实现（带循环引用检测）
function blockly_json.encode(value, visited)
  visited = visited or {}
  if value == nil then return "null"
  elseif type(value) == "boolean" then return value and "true" or "false"
  elseif type(value) == "number" then
    if value ~= value then return "null"
    elseif value == math.huge then return "null"
    elseif value == -math.huge then return "null"
    else return tostring(value) end
  elseif type(value) == "string" then
    local result = value:gsub("\\", "\\\\"):gsub('"', '\\"'):gsub("\n", "\\n"):gsub("\r", "\\r"):gsub("\t", "\\t")
    return '"' .. result .. '"'
  elseif type(value) == "table" then
    if visited[value] then return '"<circular_reference>"' end
    visited[value] = true
    local isArray = true
    local maxIndex = 0
    local keyCount = 0
    for k, v in pairs(value) do
      keyCount = keyCount + 1
      if type(k) ~= "number" or k < 1 or math.floor(k) ~= k then isArray = false
      else maxIndex = math.max(maxIndex, k) end
    end
    if keyCount == 0 then isArray = false end
    if isArray then
      local parts = {}
      for i = 1, maxIndex do table.insert(parts, blockly_json.encode(value[i], visited)) end
      visited[value] = nil
      return "[" .. table.concat(parts, ",") .. "]"
    else
      local parts = {}
      for k, v in pairs(value) do
        if type(k) == "string" then table.insert(parts, blockly_json.encode(k, visited) .. ":" .. blockly_json.encode(v, visited))
        elseif type(k) == "number" then table.insert(parts, '"' .. tostring(k) .. '":' .. blockly_json.encode(v, visited)) end
      end
      visited[value] = nil
      return "{" .. table.concat(parts, ",") .. "}"
    end
  end
  return "null"
end

-- 简单的JSON解码实现
function blockly_json.decode(jsonStr)
  if type(jsonStr) ~= "string" or jsonStr == "" then return nil end
  if json and json.decode then return json.decode(jsonStr) end
  local loadFunc = loadstring or load
  if loadFunc then
    local luaStr = jsonStr:gsub('"([^"]-)":', '["%1"]=')
    local func, err = loadFunc("return " .. luaStr)
    if func then
      local ok, result = pcall(func)
      if ok then return result end
    end
  end
  return nil
end

-- 从JSON字符串或表中按路径获取值
function blockly_json.get_path(data, path)
  if type(data) == "table" then return blockly_table_utils.get(data, path)
  elseif type(data) == "string" and data ~= "" then
    local decoded = blockly_json.decode(data)
    if decoded == nil then return nil end
    return blockly_table_utils.get(decoded, path)
  end
  return nil
end`;

// 表操作工具模块代码
const TABLE_UTILS_RUNTIME_CODE = String.raw`-- 表操作工具模块
blockly_table_utils = blockly_table_utils or {}

-- 解析路径，支持点号和数组索引，如 "message[0].text"
function blockly_table_utils.parse_path(path)
  if type(path) ~= "string" or path == "" then return {} end
  local keys = {}
  local current = ""
  local in_bracket = false
  for i = 1, #path do
    local ch = path:sub(i, i)
    if ch == "." and not in_bracket then
      if current ~= "" then table.insert(keys, current); current = "" end
    elseif ch == "[" and not in_bracket then
      if current ~= "" then table.insert(keys, current); current = "" end
      in_bracket = true
    elseif ch == "]" and in_bracket then
      in_bracket = false
      if current ~= "" then table.insert(keys, current); current = "" end
    else current = current .. ch end
  end
  if current ~= "" then table.insert(keys, current) end
  return keys
end

-- 从表中获取指定路径的值
function blockly_table_utils.get(tbl, path)
  if type(tbl) ~= "table" then return nil end
  local keys = blockly_table_utils.parse_path(path)
  local current = tbl
  for _, key in ipairs(keys) do
    if type(current) ~= "table" then return nil end
    local numKey = tonumber(key)
    if numKey then
      -- 统一处理：非负数字索引转换为Lua 1-based索引
      if numKey >= 0 then
        current = current[numKey + 1]
      else
        current = current[key]
      end
    else
      current = current[key]
    end
    if current == nil then return nil end
  end
  return current
end

-- 在表中设置指定路径的值
function blockly_table_utils.set(tbl, path, value)
  if type(tbl) ~= "table" then return false end
  local keys = blockly_table_utils.parse_path(path)
  if #keys == 0 then return false end
  local current = tbl
  for i = 1, #keys - 1 do
    local key = keys[i]
    local numKey = tonumber(key)
    -- 统一处理：非负数字索引转换为Lua 1-based索引
    local actualKey = numKey
    if numKey and numKey >= 0 then
      actualKey = numKey + 1
    else
      actualKey = key
    end
    if type(current[actualKey]) ~= "table" then current[actualKey] = {} end
    current = current[actualKey]
  end
  local lastKey = keys[#keys]
  local numLastKey = tonumber(lastKey)
  -- 统一处理：非负数字索引转换为Lua 1-based索引
  if numLastKey and numLastKey >= 0 then
    current[numLastKey + 1] = value
  else
    current[lastKey] = value
  end
  return true
end

-- 将表转换为JSON字符串（便捷函数）
function blockly_table_utils.to_json(tbl) return blockly_json.encode(tbl) end

-- 从JSON字符串解析为表（便捷函数）
function blockly_table_utils.from_json(jsonStr) return blockly_json.decode(jsonStr) end`;

// 消息处理工具模块代码
const MSG_UTILS_RUNTIME_CODE = String.raw`-- 消息处理工具模块
blockly_msg_utils = blockly_msg_utils or {}

-- 获取消息中的所有图片URL
function blockly_msg_utils.get_images(event)
  if type(event) ~= "table" or type(event.message) ~= "table" then return {} end
  local images = {}
  for _, segment in ipairs(event.message) do
    if type(segment) == "table" and segment.type == "image" then
      if segment.data and segment.data.url then table.insert(images, segment.data.url) end
    end
  end
  return images
end

-- 获取消息中@的用户列表
function blockly_msg_utils.get_at_users(event)
  if type(event) ~= "table" or type(event.message) ~= "table" then return {} end
  local users = {}
  for _, segment in ipairs(event.message) do
    if type(segment) == "table" and segment.type == "at" then
      if segment.data and segment.data.qq then table.insert(users, segment.data.qq) end
    end
  end
  return users
end`;

// HTTP请求工具模块代码
const HTTP_UTILS_RUNTIME_CODE = String.raw`-- HTTP请求工具模块
blockly_http_utils = blockly_http_utils or {}

-- 发送HTTP GET请求并获取指定字段
function blockly_http_utils.get_json_field(url, field, timeout)
  timeout = timeout or 30
  local ok, response = pcall(function()
    if http.request then return http.request("GET", url, nil, timeout)
    else return http.request("GET", url) end
  end)
  if not ok then return nil end
  if type(response) ~= "table" or not response.body then return nil end
  local data = blockly_json.decode(response.body)
  if data == nil then return nil end
  return blockly_table_utils.get(data, field)
end`;

// URL处理工具模块代码
const URL_UTILS_RUNTIME_CODE = String.raw`-- URL处理工具模块
blockly_url_utils = blockly_url_utils or {}

-- 从URL中提取域名
function blockly_url_utils.extract_domain(url)
  if type(url) ~= "string" or url == "" then return "" end
  -- 移除协议头 (http://, https://, etc.)
  local domain = url:gsub("^[%w+.-]+://", "")
  -- 移除路径部分
  domain = domain:gsub("/.*", "")
  -- 移除端口号
  domain = domain:gsub(":%d+$", "")
  -- 移除用户名密码部分
  domain = domain:gsub("^[^@]+@", "")
  return domain
end

-- 从URL或域名中提取域名后缀(TLD)
function blockly_url_utils.extract_tld(url_or_domain)
  if type(url_or_domain) ~= "string" or url_or_domain == "" then return "" end
  -- 先提取域名
  local domain = blockly_url_utils.extract_domain(url_or_domain)
  if domain == "" then domain = url_or_domain end

  -- 分割域名为各部分
  local parts = {}
  for part in domain:gmatch("[^%.]+") do
    table.insert(parts, part)
  end

  local n = #parts
  if n < 2 then return "" end

  -- 常见双后缀列表 (如 co.uk, com.cn, etc.)
  local double_tlds = {
    ["co"]=true, ["com"]=true, ["org"]=true, ["net"]=true, ["gov"]=true,
    ["edu"]=true, ["ac"]=true, ["mil"]=true
  }

  -- 检查是否是双后缀
  if n >= 3 and double_tlds[parts[n-1]] then
    return parts[n-1] .. "." .. parts[n]
  else
    return parts[n]
  end
end`;

// 时间处理工具模块代码
const TIME_UTILS_RUNTIME_CODE = String.raw`-- 时间处理工具模块
blockly_time = blockly_time or {}

-- 将日期字符串转换为Unix时间戳（秒）
-- 支持格式：2026-03-31、2026/03/31、2026-03-31 15:30:45、2026/03/31 15:30:45
function blockly_time.date_to_timestamp(date_str)
  if type(date_str) ~= "string" or date_str == "" then
    return 0
  end
  -- 解析日期：使用最简单可靠的字符串操作
  local s = date_str
  -- 去除首尾空格
  local function trim(str)
    local i = 1
    while i <= #str and str:sub(i, i) == " " do i = i + 1 end
    local j = #str
    while j >= i and str:sub(j, j) == " " do j = j - 1 end
    return str:sub(i, j)
  end
  s = trim(s)
  if s == "" then return 0 end
  -- 查找空格分隔日期和时间
  local space_idx = 0
  for i = 1, #s do
    if s:sub(i, i) == " " then
      space_idx = i
      break
    end
  end
  local date_s, time_s
  if space_idx > 0 then
    date_s = s:sub(1, space_idx - 1)
    time_s = s:sub(space_idx + 1)
  else
    date_s = s
    time_s = ""
  end
  -- 解析日期 YYYY-MM-DD 或 YYYY/MM/DD
  local year, month, day = 0, 1, 1
  local hyphen_idx = date_s:find("-", 1, true)
  local slash_idx = date_s:find("/", 1, true)
  local sep_idx = 0
  local sep_char = "-"
  if hyphen_idx and (not slash_idx or hyphen_idx < slash_idx) then
    sep_idx = hyphen_idx
    sep_char = "-"
  elseif slash_idx then
    sep_idx = slash_idx
    sep_char = "/"
  end
  if sep_idx > 0 then
    year = tonumber(date_s:sub(1, sep_idx - 1)) or 0
    local rest = date_s:sub(sep_idx + 1)
    local sep_idx2 = rest:find(sep_char, 1, true)
    if sep_idx2 then
      month = tonumber(rest:sub(1, sep_idx2 - 1)) or 1
      day = tonumber(rest:sub(sep_idx2 + 1)) or 1
    end
  end
  -- 解析时间 HH:MM:SS
  local hour, min, sec = 0, 0, 0
  if time_s ~= "" then
    local colon1 = time_s:find(":", 1, true)
    if colon1 then
      hour = tonumber(time_s:sub(1, colon1 - 1)) or 0
      local rest = time_s:sub(colon1 + 1)
      local colon2 = rest:find(":", 1, true)
      if colon2 then
        min = tonumber(rest:sub(1, colon2 - 1)) or 0
        sec = tonumber(rest:sub(colon2 + 1)) or 0
      else
        min = tonumber(rest) or 0
      end
    end
  end
  if year < 1970 then return 0 end
  -- 手动计算时间戳，避免 os.time 的月份 bug
  -- 计算距离 1970-01-01 的天数
  local days = 0
  local y = 1970
  while y < year do
    if (y % 4 == 0 and y % 100 ~= 0) or (y % 400 == 0) then
      days = days + 366
    else
      days = days + 365
    end
    y = y + 1
  end
  local month_days = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31}
  if (year % 4 == 0 and year % 100 ~= 0) or (year % 400 == 0) then
    month_days[2] = 29
  end
  local m = 1
  while m < month do
    days = days + month_days[m]
    m = m + 1
  end
  days = days + day - 1
  -- 返回时间戳
  return days * 86400 + hour * 3600 + min * 60 + sec
end

-- 时间加减运算
function blockly_time.add_unit(timestamp, operation, amount, unit)
  timestamp = tonumber(timestamp) or 0
  amount = tonumber(amount) or 0
  local multipliers = {
    second = 1,
    minute = 60,
    hour = 3600,
    day = 86400,
    week = 604800,
    month = 2592000,
    year = 31536000
  }
  local mult = multipliers[unit] or 1
  if operation == "add" then
    return timestamp + (amount * mult)
  else
    return timestamp - (amount * mult)
  end
end

-- 判断是否闰年
function blockly_time.is_leap_year(year)
  year = tonumber(year) or 0
  return (year % 4 == 0 and year % 100 ~= 0) or (year % 400 == 0)
end

-- 获取月份天数
function blockly_time.days_in_month(year, month)
  year = tonumber(year) or 0
  month = tonumber(month) or 1
  local days_in_months = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31}
  if month == 2 and blockly_time.is_leap_year(year) then
    return 29
  end
  if month < 1 or month > 12 then return 0 end
  return days_in_months[month] or 0
end

-- 获取一天开始的时间戳（00:00:00）
function blockly_time.start_of_day(timestamp)
  timestamp = tonumber(timestamp) or 0
  local t = os.date("*t", timestamp)
  return os.time({year=t.year, month=t.month, day=t.day, hour=0, min=0, sec=0})
end

-- 获取一天结束的时间戳（23:59:59）
function blockly_time.end_of_day(timestamp)
  timestamp = tonumber(timestamp) or 0
  local t = os.date("*t", timestamp)
  return os.time({year=t.year, month=t.month, day=t.day, hour=23, min=59, sec=59})
end`;

// 文本处理工具模块代码
const TEXT_UTILS_RUNTIME_CODE = String.raw`-- 文本处理工具模块
blockly_text_utils = blockly_text_utils or {}

-- 计算子串在文本中出现的次数
function blockly_text_utils.count_occurrences(text, search)
  if type(text) ~= "string" or type(search) ~= "string" or search == "" then
    return 0
  end
  local count = 0
  local start_pos = 1
  while true do
    local pos = string.find(text, search, start_pos, true)
    if not pos then break end
    count = count + 1
    start_pos = pos + #search
  end
  return count
end

-- 替换文本中的子串
function blockly_text_utils.replace(text, search, replace)
  if type(text) ~= "string" or type(search) ~= "string" then
    return text
  end
  if search == "" then
    return text
  end
  replace = replace or ""
  local result = ""
  local start_pos = 1
  while true do
    local pos = string.find(text, search, start_pos, true)
    if not pos then
      result = result .. string.sub(text, start_pos)
      break
    end
    result = result .. string.sub(text, start_pos, pos - 1) .. replace
    start_pos = pos + #search
  end
  return result
end

-- 查找子串在文本中的位置（语义：查找 search 在 text 中）
function blockly_text_utils.index_of(search, text, occurrence)
  if type(text) ~= "string" or type(search) ~= "string" or search == "" then
    return -1
  end
  occurrence = tonumber(occurrence) or 1
  if occurrence < 1 then occurrence = 1 end
  local start_pos = 1
  local found_count = 0
  while start_pos <= #text do
    local pos = string.find(text, search, start_pos, true)
    if not pos then break end
    found_count = found_count + 1
    if found_count == occurrence then
      return pos
    end
    start_pos = pos + 1
  end
  return -1
end

-- 分割文本为数组
function blockly_text_utils.split(text, delimiter)
  if type(text) ~= "string" then return {} end
  if type(delimiter) ~= "string" or delimiter == "" then
    return {text}
  end
  local result = {}
  local start_pos = 1
  while true do
    local pos = string.find(text, delimiter, start_pos, true)
    if not pos then break end
    table.insert(result, text:sub(start_pos, pos - 1))
    start_pos = pos + #delimiter
  end
  table.insert(result, text:sub(start_pos))
  return result
end

-- 统计文本行数
function blockly_text_utils.count_lines(text)
  if type(text) ~= "string" then return 0 end
  if text == "" then return 0 end
  local count = 1
  for i = 1, #text do
    if text:sub(i, i) == "\n" then
      count = count + 1
    end
  end
  return count
end

-- 去除文本首尾空格
function blockly_text_utils.trim(text)
  if type(text) ~= "string" then return "" end
  return text:match("^%s*(.-)%s*$") or ""
end

-- 获取两个文本之间的内容
function blockly_text_utils.get_between(text, startText, endText)
  if type(text) ~= "string" then return "" end
  if type(startText) ~= "string" or type(endText) ~= "string" then
    startText = startText or ""
    endText = endText or ""
  end
  local start_pos = 1
  local end_pos = #text
  if startText ~= "" then
    local s = string.find(text, startText, 1, true)
    if s then start_pos = s + #startText else return "" end
  end
  if endText ~= "" then
    local e = string.find(text, endText, start_pos, true)
    if e then end_pos = e - 1 else return "" end
  end
  if start_pos > end_pos then return "" end
  return text:sub(start_pos, end_pos)
end`;

/**
 * 根据使用的库类型生成运行时代码
 */
export function generateRuntimeLibraries(usedLibraries: Set<RuntimeLibraryType>): string {
  const parts: string[] = [];

  // 按依赖顺序添加：table_utils 被 json 依赖
  if (usedLibraries.has(RuntimeLibraryType.TABLE_UTILS) || usedLibraries.has(RuntimeLibraryType.JSON)) {
    parts.push(TABLE_UTILS_RUNTIME_CODE);
  }

  if (usedLibraries.has(RuntimeLibraryType.JSON)) {
    parts.push(JSON_RUNTIME_CODE);
  }

  if (usedLibraries.has(RuntimeLibraryType.MSG_UTILS)) {
    parts.push(MSG_UTILS_RUNTIME_CODE);
  }

  if (usedLibraries.has(RuntimeLibraryType.HTTP_UTILS)) {
    parts.push(HTTP_UTILS_RUNTIME_CODE);
  }

  if (usedLibraries.has(RuntimeLibraryType.URL_UTILS)) {
    parts.push(URL_UTILS_RUNTIME_CODE);
  }

  if (usedLibraries.has(RuntimeLibraryType.TEXT_UTILS)) {
    parts.push(TEXT_UTILS_RUNTIME_CODE);
  }

  if (usedLibraries.has(RuntimeLibraryType.TIME_UTILS)) {
    parts.push(TIME_UTILS_RUNTIME_CODE);
  }

  return parts.join('\n\n');
}

/**
 * 生成分隔线注释
 */
export const BLOCKLY_CODE_SEPARATOR = `-- ============================================================================
-- ========================== Blockly 业务代码开始 =============================
-- ============================================================================
`;

/**
 * 生成Lua插件头部（按需包含运行时库）
 */
export function generatePluginHeader(
  metadata: { name: string; version: string; description: string },
  runtimeLibraries: string
): string {
  const runtimeSection = runtimeLibraries ? `\n${runtimeLibraries}\n` : '';
  return `-- ${metadata.description}
plugin.name = "${metadata.name}"
plugin.version = "${metadata.version}"
plugin.description = "${metadata.description}"${runtimeSection}
${BLOCKLY_CODE_SEPARATOR}
`;
}

/**
 * 完整的JSON运行时库代码（向后兼容）
 * @deprecated 使用 generateRuntimeLibraries 按需生成
 */
export const BLOCKLY_JSON_RUNTIME_LIBRARY = generateRuntimeLibraries(new Set([
  RuntimeLibraryType.JSON,
  RuntimeLibraryType.TABLE_UTILS,
]));

/**
 * 生成包含JSON库的插件头部（向后兼容）
 * @deprecated 使用 generatePluginHeader 和 generateRuntimeLibraries
 */
export function generatePluginHeaderWithJSONLibrary(
  metadata: { name: string; version: string; description: string }
): string {
  return generatePluginHeader(metadata, BLOCKLY_JSON_RUNTIME_LIBRARY);
}
