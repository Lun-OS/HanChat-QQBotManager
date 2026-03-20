/**
 * Blockly Lua JSON处理工具模块
 *
 * 此模块提供纯Lua的JSON处理代码生成，将原后端接口的JSON处理逻辑
 * 迁移至Lua代码生成阶段直接处理，避免跨语言调用的兼容性问题。
 *
 * 利用Lua的动态类型特性，实现灵活的JSON数据处理。
 */

/**
 * 生成Lua原生的JSON编码代码
 * 将Lua表编码为JSON字符串，完全在Lua层面处理
 */
export function generateLuaJSONEncodeCode(valueExpr: string): string {
  return `blockly_json.encode(${valueExpr})`;
}

/**
 * 生成Lua原生的JSON解码代码
 * 将JSON字符串解析为Lua表，完全在Lua层面处理
 */
export function generateLuaJSONDecodeCode(jsonExpr: string): string {
  return `blockly_json.decode(${jsonExpr})`;
}

/**
 * 生成Lua原生的JSON路径获取代码
 * 从JSON字符串中按路径获取值，完全在Lua层面处理
 * 使用预定义的辅助函数减少代码重复
 */
export function generateLuaJSONGetCode(jsonExpr: string, pathExpr: string): string {
  return `blockly_json.get_path(${jsonExpr}, ${pathExpr})`;
}

/**
 * 生成Lua原生的JSON提取代码（支持复杂路径）
 * 从JSON字符串中提取指定路径的值
 * 使用预定义的辅助函数减少代码重复
 */
export function generateLuaJSONExtractCode(jsonExpr: string, pathExpr: string): string {
  return `blockly_json.get_path(${jsonExpr}, ${pathExpr})`;
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
 * Lua运行时JSON处理库代码
 * 这段代码会被注入到生成的Lua脚本头部，提供JSON处理能力
 */
export const BLOCKLY_JSON_RUNTIME_LIBRARY = String.raw`--[[
  Blockly JSON处理运行时库
  纯Lua实现的JSON编码/解码和表操作工具
  无需依赖后端接口，完全在Lua层面处理
]]

-- JSON处理模块
blockly_json = blockly_json or {}

-- 简单的JSON编码实现
function blockly_json.encode(value)
  if value == nil then
    return "null"
  elseif type(value) == "boolean" then
    return value and "true" or "false"
  elseif type(value) == "number" then
    return tostring(value)
  elseif type(value) == "string" then
    -- 转义特殊字符
    local result = value:gsub("\\", "\\\\")
                       :gsub('"', '\\"')
                       :gsub("\n", "\\n")
                       :gsub("\r", "\\r")
                       :gsub("\t", "\\t")
    return '"' .. result .. '"'
  elseif type(value) == "table" then
    -- 检查是否为数组
    local isArray = true
    local maxIndex = 0
    for k, v in pairs(value) do
      if type(k) ~= "number" or k < 1 or k > maxIndex + 1 then
        isArray = false
        break
      end
      maxIndex = math.max(maxIndex, k)
    end
    
    if isArray and maxIndex > 0 then
      -- 编码为JSON数组
      local parts = {}
      for i = 1, maxIndex do
        table.insert(parts, blockly_json.encode(value[i]))
      end
      return "[" .. table.concat(parts, ",") .. "]"
    else
      -- 编码为JSON对象
      local parts = {}
      for k, v in pairs(value) do
        if type(k) == "string" then
          table.insert(parts, blockly_json.encode(k) .. ":" .. blockly_json.encode(v))
        end
      end
      return "{" .. table.concat(parts, ",") .. "}"
    end
  end
  return "null"
end

-- 简单的JSON解码实现
function blockly_json.decode(jsonStr)
  if type(jsonStr) ~= "string" or jsonStr == "" then
    return nil
  end

  -- 优先使用系统json库（最可靠）
  if json and json.decode then
    return json.decode(jsonStr)
  end

  -- 尝试使用loadstring解析（兼容性处理）
  -- 注意：loadstring在Lua 5.1中可用，在Lua 5.2+中被load替代
  local loadFunc = loadstring or load
  if loadFunc then
    -- 将JSON格式转换为Lua表格式
    -- 例如：{"key": "value"} 转换为 {["key"]="value"}
    local luaStr = jsonStr:gsub('"([^"]-)":', '["%1"]=')
    local func, err = loadFunc("return " .. luaStr)
    if func then
      local ok, result = pcall(func)
      if ok then
        return result
      end
    end
  end

  return nil
end

-- 从JSON字符串或表中按路径获取值（辅助函数，减少生成代码重复）
-- 支持两种输入：JSON字符串或Lua表
function blockly_json.get_path(data, path)
  if type(data) == "table" then
    -- 如果输入是表，直接使用表路径获取
    return blockly_table_utils.get(data, path)
  elseif type(data) == "string" and data ~= "" then
    -- 如果输入是字符串，先解码再获取
    local decoded = blockly_json.decode(data)
    if decoded == nil then
      return nil
    end
    return blockly_table_utils.get(decoded, path)
  end
  return nil
end

-- 表操作工具模块
blockly_table_utils = blockly_table_utils or {}

-- 调试辅助函数：打印表结构
function blockly_table_utils.debug_print(tbl, indent)
  indent = indent or 0
  local prefix = string.rep("  ", indent)
  if type(tbl) ~= "table" then
    print(prefix .. tostring(tbl))
    return
  end
  for k, v in pairs(tbl) do
    if type(v) == "table" then
      print(prefix .. tostring(k) .. " = {")
      blockly_table_utils.debug_print(v, indent + 1)
      print(prefix .. "}")
    else
      print(prefix .. tostring(k) .. " = " .. tostring(v))
    end
  end
end

-- 解析路径，支持点号和数组索引，如 "message[0].text"
function blockly_table_utils.parse_path(path)
  if type(path) ~= "string" or path == "" then
    return {}
  end
  
  local keys = {}
  local current = ""
  local in_bracket = false
  
  for i = 1, #path do
    local ch = path:sub(i, i)
    if ch == "." and not in_bracket then
      if current ~= "" then
        table.insert(keys, current)
        current = ""
      end
    elseif ch == "[" and not in_bracket then
      if current ~= "" then
        table.insert(keys, current)
        current = ""
      end
      in_bracket = true
    elseif ch == "]" and in_bracket then
      in_bracket = false
      if current ~= "" then
        table.insert(keys, current)
        current = ""
      end
    else
      current = current .. ch
    end
  end
  
  if current ~= "" then
    table.insert(keys, current)
  end
  
  return keys
end

-- 从表中获取指定路径的值
-- 支持Lua数组索引（从1开始）和对象键
-- 自动将JSON数组索引（从0开始）转换为Lua数组索引（从1开始）
function blockly_table_utils.get(tbl, path)
  if type(tbl) ~= "table" then
    return nil
  end

  local keys = blockly_table_utils.parse_path(path)
  local current = tbl

  for _, key in ipairs(keys) do
    if type(current) ~= "table" then
      return nil
    end

    -- 尝试作为数字索引（Lua数组从1开始）
    local numKey = tonumber(key)
    if numKey then
      -- JSON数组从0开始，Lua数组从1开始，需要转换
      -- 例如：JSON的message[0]对应Lua的message[1]
      local luaIndex = numKey + 1
      current = current[luaIndex]
    else
      current = current[key]
    end

    if current == nil then
      return nil
    end
  end

  return current
end

-- 检查路径是否存在
function blockly_table_utils.has_path(tbl, path)
  return blockly_table_utils.get(tbl, path) ~= nil
end

-- 获取路径值，如果不存在返回默认值
function blockly_table_utils.get_or_default(tbl, path, defaultValue)
  local value = blockly_table_utils.get(tbl, path)
  if value == nil then
    return defaultValue
  end
  return value
end

-- 在表中设置指定路径的值
function blockly_table_utils.set(tbl, path, value)
  if type(tbl) ~= "table" then
    return false
  end
  
  local keys = blockly_table_utils.parse_path(path)
  if #keys == 0 then
    return false
  end
  
  local current = tbl
  
  -- 遍历到倒数第二个键
  for i = 1, #keys - 1 do
    local key = keys[i]
    local numKey = tonumber(key)
    local actualKey = numKey or key
    
    if type(current[actualKey]) ~= "table" then
      current[actualKey] = {}
    end
    current = current[actualKey]
  end
  
  -- 设置最终值
  local lastKey = keys[#keys]
  local numLastKey = tonumber(lastKey)
  current[numLastKey or lastKey] = value
  
  return true
end

-- 将表转换为JSON字符串（便捷函数）
function blockly_table_utils.to_json(tbl)
  return blockly_json.encode(tbl)
end

-- 从JSON字符串解析为表（便捷函数）
function blockly_table_utils.from_json(jsonStr)
  return blockly_json.decode(jsonStr)
end

-- 消息处理工具模块
blockly_msg_utils = blockly_msg_utils or {}

-- 获取消息中的所有图片URL
function blockly_msg_utils.get_images(event)
  if type(event) ~= "table" or type(event.message) ~= "table" then
    return {}
  end
  
  local images = {}
  for _, segment in ipairs(event.message) do
    if type(segment) == "table" and segment.type == "image" then
      if segment.data and segment.data.url then
        table.insert(images, segment.data.url)
      end
    end
  end
  return images
end

-- 获取消息中@的用户列表
function blockly_msg_utils.get_at_users(event)
  if type(event) ~= "table" or type(event.message) ~= "table" then
    return {}
  end
  
  local users = {}
  for _, segment in ipairs(event.message) do
    if type(segment) == "table" and segment.type == "at" then
      if segment.data and segment.data.qq then
        table.insert(users, segment.data.qq)
      end
    end
  end
  return users
end

-- HTTP请求工具模块
blockly_http_utils = blockly_http_utils or {}

-- 发送HTTP GET请求并获取指定字段
function blockly_http_utils.get_json_field(url, field)
  local response = http.request("GET", url)
  if type(response) ~= "table" or not response.body then
    return nil
  end
  
  local data = blockly_json.decode(response.body)
  if data == nil then
    return nil
  end
  
  return blockly_table_utils.get(data, field)
end

`;

/**
 * 生成分隔线注释
 */
export const BLOCKLY_CODE_SEPARATOR = `-- ============================================================================
-- ========================== Blockly 业务代码开始 =============================
-- ============================================================================
`;

/**
 * 生成完整的Lua插件头部（包含JSON运行时库）
 */
export function generatePluginHeaderWithJSONLibrary(
  metadata: { name: string; version: string; description: string }
): string {
  return `-- ${metadata.description}
plugin.name = "${metadata.name}"
plugin.version = "${metadata.version}"
plugin.description = "${metadata.description}"

${BLOCKLY_JSON_RUNTIME_LIBRARY}
${BLOCKLY_CODE_SEPARATOR}
`;
}
