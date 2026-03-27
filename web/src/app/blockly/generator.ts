import * as Blockly from 'blockly';
import { GeneratedCode, PluginMetadata } from './types';
import {
  generateLuaJSONEncodeCode,
  generateLuaJSONDecodeCode,
  generateLuaTableGetCode,
  generateLuaTableSetCode,
  generatePluginHeader,
  generateRuntimeLibraries,
  BLOCKLY_CODE_SEPARATOR,
  RuntimeLibraryType,
} from './lua-json-utils';

// 生成器实例存储（按工作空间ID隔离，避免多实例冲突）
const generatorInstances = new Map<string, Blockly.Generator>();

// 数组计数器存储（按生成器实例隔离）
const arrayCounters = new WeakMap<Blockly.Generator, number>();

// 运行时库使用追踪（按生成器实例隔离）
const runtimeLibraryUsage = new WeakMap<Blockly.Generator, Set<RuntimeLibraryType>>();

/**
 * 创建新的 Lua 代码生成器实例
 * 每个工作空间应该有自己的生成器实例，避免状态冲突
 */
export function createLuaGenerator(workspaceId?: string): Blockly.Generator {
  const generator = new Blockly.Generator('Lua');
  
  // 存储实例
  if (workspaceId) {
    generatorInstances.set(workspaceId, generator);
  }
  
  // 初始化数组计数器
  arrayCounters.set(generator, 1);

  generator.PRECEDENCE = 0;
  generator.ORDER_ATOMIC = 0;
  generator.ORDER_HIGH = 1;
  generator.ORDER_EXPONENTIATION = 2;
  generator.ORDER_UNARY = 3;
  generator.ORDER_MULTIPLICATIVE = 4;
  generator.ORDER_ADDITIVE = 5;
  generator.ORDER_CONCATENATION = 6;
  generator.ORDER_RELATIONAL = 7;
  generator.ORDER_AND = 8;
  generator.ORDER_OR = 9;
  generator.ORDER_NONE = 99;

  generator.init = function(workspace: Blockly.Workspace) {
    this.definitions_ = Object.create(null);
    this.functionNames_ = Object.create(null);
    // 重置数组计数器
    arrayCounters.set(generator, 1);
    // 重置运行时库使用追踪
    runtimeLibraryUsage.set(generator, new Set());
  };

  generator.finish = function(code: string) {
    return code;
  };

  generator.scrubNakedValue = function(line: string) {
    return line + '\n';
  };

  generator.scrub_ = function(block: Blockly.Block, code: string) {
    const nextBlock = block.nextConnection?.targetBlock();
    if (nextBlock) {
      const nextCode = this.blockToCode(nextBlock);
      if (nextCode) {
        return code + '\n' + nextCode;
      }
    }
    return code;
  };

  generator.quote_ = function(string: string) {
    string = string.replace(/\\/g, '\\\\')
                   .replace(/\n/g, '\\n')
                   .replace(/\r/g, '\\r')
                   .replace(/\t/g, '\\t')
                   .replace(/"/g, '\\"');
    return '"' + string + '"';
  };

  generator.luaStringEscape = function(str: string): string {
    if (!str) return '""';
    return str.replace(/\\/g, '\\\\')
               .replace(/\n/g, '\\n')
               .replace(/\r/g, '\\r')
               .replace(/\t/g, '\\t')
               .replace(/"/g, '\\"')
               .replace(/'/g, "\\'");
  };

  // 使用更安全的变量名前缀，避免与用户变量冲突
  generator.getVariableName = function(block: Blockly.Block, name: string) {
    if (!name) return '__blc_var_i';
    const workspace = block.workspace;
    let varName = name;
    if (workspace) {
      // 使用 getVariableMap().getVariableById() 替代已弃用的 workspace.getVariableById()
      const variableMap = workspace.getVariableMap();
      let variable = variableMap.getVariableById(name);
      if (!variable) {
        variable = workspace.getVariable(name);
      }
      if (variable) {
        varName = (variable as any).name || name;
      }
    }
    varName = varName.replace(/[^a-zA-Z0-9_]/g, '_');
    if (!varName || varName === '_') {
      varName = 'i';
    }
    // 防止重复添加前缀
    if (varName.startsWith('__blc_var_')) {
      return varName;
    }
    // 使用更独特的前缀，避免冲突
    return '__blc_var_' + varName;
  };

  registerLuaGenerators(generator);

  return generator;
}

/**
 * 获取指定工作空间的生成器实例
 * @deprecated 建议使用 createLuaGenerator 创建独立实例
 */
export function initLuaGenerator(): Blockly.Generator {
  // 返回默认实例以保持兼容性
  if (!generatorInstances.has('default')) {
    generatorInstances.set('default', createLuaGenerator('default'));
  }
  return generatorInstances.get('default')!;
}

/**
 * 获取生成器实例（按工作空间ID）
 */
export function getLuaGenerator(workspaceId: string = 'default'): Blockly.Generator {
  return generatorInstances.get(workspaceId) || initLuaGenerator();
}

/**
 * 标记使用某个运行时库
 */
function markRuntimeLibraryUsed(generator: Blockly.Generator, libType: RuntimeLibraryType) {
  const usage = runtimeLibraryUsage.get(generator);
  if (usage) {
    usage.add(libType);
  }
}

/**
 * 获取已使用的运行时库集合
 */
function getUsedRuntimeLibraries(generator: Blockly.Generator): Set<RuntimeLibraryType> {
  return runtimeLibraryUsage.get(generator) || new Set();
}

/**
 * 生成 Lua 代码
 */
export function generateLuaCode(workspace: Blockly.Workspace, metadata: PluginMetadata): GeneratedCode {
  const workspaceId = workspace.id || 'default';
  let generator = generatorInstances.get(workspaceId);
  
  if (!generator) {
    generator = createLuaGenerator(workspaceId);
  }
  
  // 生成代码前重置计数器和运行时库追踪
  arrayCounters.set(generator, 1);
  runtimeLibraryUsage.set(generator, new Set());
  
  const body = generator.workspaceToCode(workspace);
  
  // 根据实际使用的积木生成必要的运行时库
  const usedLibraries = getUsedRuntimeLibraries(generator);
  const runtimeLibs = generateRuntimeLibraries(usedLibraries);
  const header = generatePluginHeader(metadata, runtimeLibs);
  
  return {
    header,
    body,
    full: header + BLOCKLY_CODE_SEPARATOR + body
  };
}

function registerLuaGenerators(generator: any) {
  const toLogString = (value: string): string => {
    if (value.startsWith('"') && value.endsWith('"')) {
      return value;
    }
    if (/^-?\d+(\.\d+)?$/.test(value) || value === 'true' || value === 'false') {
      return `tostring(${value})`;
    }
    return `tostring(${value})`;
  };

  // ========== 日志积木 ==========
  // 日志输出支持任意类型数据，后端会自动进行类型转换
  // - 表(table)类型 → JSON字符串
  // - 二进制数据 → Base64编码
  // - 其他类型 → 字符串
  generator.forBlock['log_output'] = function(block: Blockly.Block) {
    const logType = block.getFieldValue('LOG_TYPE');
    const content = generator.valueToCode(block, 'CONTENT', generator.ORDER_NONE) || '""';
    // 直接传递值，让后端进行智能类型转换
    return `log.${logType}(${content})\n`;
  };

  generator.forBlock['log_info'] = function(block: Blockly.Block) {
    const content = generator.valueToCode(block, 'CONTENT', generator.ORDER_NONE) || '""';
    return `log.info(${content})\n`;
  };

  generator.forBlock['log_warn'] = function(block: Blockly.Block) {
    const content = generator.valueToCode(block, 'CONTENT', generator.ORDER_NONE) || '""';
    return `log.warn(${content})\n`;
  };

  generator.forBlock['log_error'] = function(block: Blockly.Block) {
    const content = generator.valueToCode(block, 'CONTENT', generator.ORDER_NONE) || '""';
    return `log.error(${content})\n`;
  };

  generator.forBlock['log_debug'] = function(block: Blockly.Block) {
    const content = generator.valueToCode(block, 'CONTENT', generator.ORDER_NONE) || '""';
    return `log.debug(${content})\n`;
  };

  // ========== 消息发送积木 ==========
  generator.forBlock['message_send_group'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const content = generator.valueToCode(block, 'CONTENT', generator.ORDER_NONE) || '""';
    return `message.send_group(${groupId}, ${content})\n`;
  };

  generator.forBlock['message_send_private'] = function(block: Blockly.Block) {
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const content = generator.valueToCode(block, 'CONTENT', generator.ORDER_NONE) || '""';
    return `message.send_private(${userId}, ${content})\n`;
  };

  generator.forBlock['message_reply_private'] = function(block: Blockly.Block) {
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const messageId = generator.valueToCode(block, 'MESSAGE_ID', generator.ORDER_NONE) || '0';
    const content = generator.valueToCode(block, 'CONTENT', generator.ORDER_NONE) || '""';
    return `message.reply_private(${userId}, ${messageId}, ${content})
`;
  };

  generator.forBlock['message_reply_group'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const messageId = generator.valueToCode(block, 'MESSAGE_ID', generator.ORDER_NONE) || '0';
    const content = generator.valueToCode(block, 'CONTENT', generator.ORDER_NONE) || '""';
    return `message.reply_group(${groupId}, ${messageId}, ${content})
`;
  };

  generator.forBlock['message_send_private_with_result'] = function(block: Blockly.Block) {
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const content = generator.valueToCode(block, 'CONTENT', generator.ORDER_NONE) || '""';
    const onSuccess = generator.statementToCode(block, 'ON_SUCCESS') || '';
    const onError = generator.statementToCode(block, 'ON_ERROR') || '';

    return `local _ok, _result = pcall(message.send_private, ${userId}, ${content})
if _ok then
${onSuccess}else
${onError}end
`;
  };

  generator.forBlock['message_send_group_with_result'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const content = generator.valueToCode(block, 'CONTENT', generator.ORDER_NONE) || '""';
    const onSuccess = generator.statementToCode(block, 'ON_SUCCESS') || '';
    const onError = generator.statementToCode(block, 'ON_ERROR') || '';

    return `local _ok, _result = pcall(message.send_group, ${groupId}, ${content})
if _ok then
${onSuccess}else
${onError}end
`;
  };

  generator.forBlock['message_send_group_with_var'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const content = generator.valueToCode(block, 'CONTENT', generator.ORDER_NONE) || '""';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'result';

    // 后端统一返回表类型，包含 success 字段
    return `local ${varName} = message.send_group(${groupId}, ${content})
-- 确保返回的是表类型
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['message_send_private_with_var'] = function(block: Blockly.Block) {
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const content = generator.valueToCode(block, 'CONTENT', generator.ORDER_NONE) || '""';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'result';

    // 后端统一返回表类型，包含 success 字段
    return `local ${varName} = message.send_private(${userId}, ${content})
-- 确保返回的是表类型
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  // ========== 事件处理积木 ==========
  generator.forBlock['event_on_message'] = function(block: Blockly.Block) {
    const statements = generator.statementToCode(block, 'HANDLER');
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'blockly_v__event';
    // 事件数据直接作为Lua表传递，保存到全局变量
    return `on_message(function(${varName})
  -- 验证事件参数类型
  if type(${varName}) ~= "table" then
    ${varName} = {}
  end
  -- 保存到全局变量供其他函数使用
  _G["${varName}"] = ${varName}
${statements}end)

`;
  };

  generator.forBlock['event_on_notice'] = function(block: Blockly.Block) {
    const statements = generator.statementToCode(block, 'HANDLER');
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'blockly_v__event';
    // 添加参数类型验证，保存到全局变量供其他函数使用
    return `on_notice(function(${varName})
  -- 验证事件参数类型
  if type(${varName}) ~= "table" then
    ${varName} = {}
  end
  -- 保存到全局变量供其他函数使用
  _G["${varName}"] = ${varName}
${statements}end)

`;
  };

  generator.forBlock['event_on_request'] = function(block: Blockly.Block) {
    const statements = generator.statementToCode(block, 'HANDLER');
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'blockly_v__event';
    // 添加参数类型验证，保存到全局变量供其他函数使用
    return `on_request(function(${varName})
  -- 验证事件参数类型
  if type(${varName}) ~= "table" then
    ${varName} = {}
  end
  -- 保存到全局变量供其他函数使用
  _G["${varName}"] = ${varName}
${statements}end)

`;
  };

  generator.forBlock['event_on_init'] = function(block: Blockly.Block) {
    const statements = generator.statementToCode(block, 'HANDLER');
    return `function on_init()
${statements}end

`;
  };

  generator.forBlock['event_on_destroy'] = function(block: Blockly.Block) {
    const statements = generator.statementToCode(block, 'HANDLER');
    return `function on_destroy()
${statements}end

`;
  };

  // ========== 消息获取积木（简化版） ==========
  generator.forBlock['msg_get_simple_field'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    const field = block.getFieldValue('FIELD');
    
    // 特殊字段处理
    if (field === 'has_image') {
      return [`msg.has_image(${message})`, generator.ORDER_HIGH];
    }
    if (field === 'has_voice') {
      return [`msg.has_voice(${message})`, generator.ORDER_HIGH];
    }
    if (field === 'is_at_bot') {
      return [`msg.is_at_bot(${message})`, generator.ORDER_HIGH];
    }
    
    // 普通字段直接访问
    return [`${message}.${field}`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_get_text_content'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    console.log('[Blockly Debug] msg_get_text_content generated:', `msg.get_plain_text(${message})`);
    return [`msg.get_plain_text(${message})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_contains_text'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    const text = generator.valueToCode(block, 'TEXT', generator.ORDER_NONE) || '""';
    return [`msg.contains_keyword(${message}, ${text})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_contains_keyword'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    const keyword = generator.valueToCode(block, 'KEYWORD', generator.ORDER_NONE) || '""';
    return [`msg.contains_keyword(${message}, ${keyword})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_is_group'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    return [`msg.is_group_message(${message})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_is_private'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    return [`msg.is_private_message(${message})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_is_type'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    const type = block.getFieldValue('TYPE') || 'private';
    return [`msg.get_type(${message}) == "${type}"`, generator.ORDER_RELATIONAL];
  };

  // ========== 消息高级获取积木 ==========
  generator.forBlock['msg_get_images'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    const index = generator.valueToCode(block, 'INDEX', generator.ORDER_NONE) || '0';
    return [`msg.get_images(${message}, ${index})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_get_first_image'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    return [`msg.get_images(${message}, 1)`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_get_at_users'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    const index = generator.valueToCode(block, 'INDEX', generator.ORDER_NONE) || '0';
    return [`msg.get_at_users(${message}, ${index})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_get_reply_info'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    return [`msg.get_reply_id(${message})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_get_message_id'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    return [`${message}.message_id`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_has_image'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    return [`msg.has_image(${message})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_has_voice'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    return [`msg.has_voice(${message})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_has_video'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    return [`msg.has_video(${message})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_has_face'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    return [`msg.has_face(${message})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_is_at_bot'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    return [`msg.is_at_bot(${message})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_is_at_all'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    return [`msg.is_at_all(${message})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_get_sender_id'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    return [`msg.get_sender_id(${message})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_get_sender_nickname'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    return [`msg.get_sender_nickname(${message})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_get_group_id'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    return [`msg.get_group_id(${message})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_get_time'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    return [`msg.get_time(${message})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_get_reply_id'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    return [`msg.get_reply_id(${message})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_get_message_type'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    return [`msg.get_message_type(${message})`, generator.ORDER_HIGH];
  };

  // ========== 卡片消息判断与解析积木 ==========
  generator.forBlock['msg_has_json'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    return [`msg.has_json(${message})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_is_contact_card'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    return [`msg.is_contact_card(${message})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_is_group_card'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    return [`msg.is_group_card(${message})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_is_channel_card'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    return [`msg.is_channel_card(${message})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_get_json_data'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    return [`msg.get_json_data(${message})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_get_card_info'] = function(block: Blockly.Block) {
    const cardData = generator.valueToCode(block, 'CARD_DATA', generator.ORDER_NONE) || '{}';
    const field = block.getFieldValue('FIELD') || 'nickname';
    return [`msg.get_card_info(${cardData}, "${generator.luaStringEscape(field)}")`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_parse_card'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    return [`msg.parse_card(${message})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_json_has_app'] = function(block: Blockly.Block) {
    const jsonData = generator.valueToCode(block, 'JSON_DATA', generator.ORDER_NONE) || '{}';
    const appType = block.getFieldValue('APP_TYPE') || '';
    return [`msg.json_has_app(${jsonData}, "${generator.luaStringEscape(appType)}")`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_get_json_app_type'] = function(block: Blockly.Block) {
    const jsonData = generator.valueToCode(block, 'JSON_DATA', generator.ORDER_NONE) || '{}';
    return [`msg.get_json_app_type(${jsonData})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_get_json_field'] = function(block: Blockly.Block) {
    const jsonData = generator.valueToCode(block, 'JSON_DATA', generator.ORDER_NONE) || '{}';
    const fieldPath = block.getFieldValue('FIELD_PATH') || 'app';
    return [`msg.get_json_field(${jsonData}, "${generator.luaStringEscape(fieldPath)}")`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_parse_card_full'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'MESSAGE', generator.ORDER_NONE) || 'event';
    return [`msg.parse_card_full(${message})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_get_card_id_from_url'] = function(block: Blockly.Block) {
    const url = generator.valueToCode(block, 'URL', generator.ORDER_NONE) || '""';
    const idType = block.getFieldValue('ID_TYPE') || 'uin';
    return [`msg.get_card_id_from_url(${url}, "${idType}")`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_get_card_field'] = function(block: Blockly.Block) {
    const cardData = generator.valueToCode(block, 'CARD_DATA', generator.ORDER_NONE) || '{}';
    const field = block.getFieldValue('FIELD') || 'nickname';
    return [`msg.get_card_info(${cardData}, "${generator.luaStringEscape(field)}")`, generator.ORDER_HIGH];
  };

  // ========== 存储积木 ==========
  // 修复：添加命名空间隔离，避免不同插件间的存储冲突
  generator.forBlock['storage_set'] = function(block: Blockly.Block) {
    const key = generator.valueToCode(block, 'KEY', generator.ORDER_NONE) || '""';
    const value = generator.valueToCode(block, 'VALUE', generator.ORDER_NONE) || 'nil';
    // 使用插件名称作为命名空间前缀
    return `storage.set(plugin.name .. ":" .. ${key}, ${value})\n`;
  };

  generator.forBlock['storage_get'] = function(block: Blockly.Block) {
    const key = generator.valueToCode(block, 'KEY', generator.ORDER_NONE) || '""';
    const defaultValue = generator.valueToCode(block, 'DEFAULT', generator.ORDER_NONE) || 'nil';
    // 使用插件名称作为命名空间前缀
    return [`storage.get(plugin.name .. ":" .. ${key}, ${defaultValue})`, generator.ORDER_HIGH];
  };

  generator.forBlock['storage_delete'] = function(block: Blockly.Block) {
    const key = generator.valueToCode(block, 'KEY', generator.ORDER_NONE) || '""';
    // 使用插件名称作为命名空间前缀
    return `storage.delete(plugin.name .. ":" .. ${key})\n`;
  };

  // ========== 文本处理积木 ==========
  generator.forBlock['text'] = function(block: Blockly.Block) {
    const text = block.getFieldValue('TEXT') || '';
    return [`"${text}"`, generator.ORDER_ATOMIC];
  };

  generator.forBlock['text_join'] = function(block: Blockly.Block) {
    const itemCount = (block as any).itemCount_ || 2;
    if (itemCount === 0) {
      return ['""', generator.ORDER_ATOMIC];
    }
    const items: string[] = [];
    for (let i = 0; i < itemCount; i++) {
      const item = generator.valueToCode(block, `ADD${i}`, generator.ORDER_CONCATENATION) || '""';
      items.push(item);
    }
    if (items.length === 1) {
      return [items[0], generator.ORDER_CONCATENATION];
    }
    return [items.join(' .. '), generator.ORDER_CONCATENATION];
  };

  generator.forBlock['text_concat'] = function(block: Blockly.Block) {
    const text1 = generator.valueToCode(block, 'TEXT1', generator.ORDER_CONCATENATION) || '""';
    const text2 = generator.valueToCode(block, 'TEXT2', generator.ORDER_CONCATENATION) || '""';
    return [`${text1} .. ${text2}`, generator.ORDER_CONCATENATION];
  };

  generator.forBlock['text_substring'] = function(block: Blockly.Block) {
    const text = generator.valueToCode(block, 'TEXT', generator.ORDER_NONE) || '""';
    const start = generator.valueToCode(block, 'START', generator.ORDER_NONE) || '1';
    const end = generator.valueToCode(block, 'END', generator.ORDER_NONE) || '1';
    return [`string.sub(${text}, ${start}, ${end})`, generator.ORDER_HIGH];
  };

  generator.forBlock['text_left'] = function(block: Blockly.Block) {
    const text = generator.valueToCode(block, 'TEXT', generator.ORDER_NONE) || '""';
    const length = generator.valueToCode(block, 'LENGTH', generator.ORDER_NONE) || '1';
    return [`string.sub(${text}, 1, ${length})`, generator.ORDER_HIGH];
  };

  generator.forBlock['text_right'] = function(block: Blockly.Block) {
    const text = generator.valueToCode(block, 'TEXT', generator.ORDER_NONE) || '""';
    const length = generator.valueToCode(block, 'LENGTH', generator.ORDER_NONE) || '1';
    return [`string.sub(${text}, -${length})`, generator.ORDER_HIGH];
  };

  generator.forBlock['text_between'] = function(block: Blockly.Block) {
    const text = generator.valueToCode(block, 'TEXT', generator.ORDER_NONE) || '""';
    const startText = generator.valueToCode(block, 'START_TEXT', generator.ORDER_NONE) || '""';
    const endText = generator.valueToCode(block, 'END_TEXT', generator.ORDER_NONE) || '""';
    return [`blockly_text_utils.get_between(${text}, ${startText}, ${endText})`, generator.ORDER_HIGH];
  };

  generator.forBlock['text_index_of'] = function(block: Blockly.Block) {
    const search = generator.valueToCode(block, 'SEARCH', generator.ORDER_NONE) || '""';
    const text = generator.valueToCode(block, 'TEXT', generator.ORDER_NONE) || '""';
    const occurrence = generator.valueToCode(block, 'OCCURRENCE', generator.ORDER_NONE) || '1';
    return [`blockly_text_utils.index_of(${text}, ${search}, ${occurrence})`, generator.ORDER_HIGH];
  };

  generator.forBlock['text_count_occurrences'] = function(block: Blockly.Block) {
    const text = generator.valueToCode(block, 'TEXT', generator.ORDER_NONE) || '""';
    const search = generator.valueToCode(block, 'SEARCH', generator.ORDER_NONE) || '""';
    // 标记使用文本工具库
    markRuntimeLibraryUsed(generator, RuntimeLibraryType.TEXT_UTILS);
    return [`blockly_text_utils.count_occurrences(${text}, ${search})`, generator.ORDER_HIGH];
  };

  generator.forBlock['text_contains'] = function(block: Blockly.Block) {
    const text = generator.valueToCode(block, 'TEXT', generator.ORDER_NONE) || '""';
    const search = generator.valueToCode(block, 'SEARCH', generator.ORDER_NONE) || '""';
    return [`(string.find(${text}, ${search}, 1, true) ~= nil)`, generator.ORDER_HIGH];
  };

  generator.forBlock['text_split'] = function(block: Blockly.Block) {
    const delimiter = generator.valueToCode(block, 'DELIMITER', generator.ORDER_NONE) || '""';
    const text = generator.valueToCode(block, 'TEXT', generator.ORDER_NONE) || '""';
    return [`blockly_text_utils.split(${text}, ${delimiter})`, generator.ORDER_HIGH];
  };

  generator.forBlock['text_match'] = function(block: Blockly.Block) {
    const text = generator.valueToCode(block, 'TEXT', generator.ORDER_NONE) || '""';
    const pattern = generator.valueToCode(block, 'PATTERN', generator.ORDER_NONE) || '""';
    return [`string.match(${text}, ${pattern})`, generator.ORDER_HIGH];
  };

  generator.forBlock['text_trim'] = function(block: Blockly.Block) {
    const text = generator.valueToCode(block, 'TEXT', generator.ORDER_NONE) || '""';
    return [`blockly_text_utils.trim(${text})`, generator.ORDER_HIGH];
  };

  generator.forBlock['text_change_case'] = function(block: Blockly.Block) {
    const text = generator.valueToCode(block, 'TEXT', generator.ORDER_NONE) || '""';
    const caseType = block.getFieldValue('CASE') || 'upper';
    if (caseType === 'upper') {
      return [`string.upper(${text})`, generator.ORDER_HIGH];
    } else {
      return [`string.lower(${text})`, generator.ORDER_HIGH];
    }
  };

  generator.forBlock['text_template'] = function(block: Blockly.Block) {
    const template = generator.valueToCode(block, 'TEMPLATE', generator.ORDER_NONE) || '""';
    return [template, generator.ORDER_HIGH];
  };

  // ========== 逻辑积木 ==========
  generator.forBlock['logic_if_else'] = function(block: Blockly.Block) {
    const condition = generator.valueToCode(block, 'CONDITION', generator.ORDER_NONE) || 'false';
    const ifBranch = generator.statementToCode(block, 'IF') || '';
    const elseBranch = generator.statementToCode(block, 'ELSE') || '';
    return `if ${condition} then
${ifBranch}else
${elseBranch}end
`;
  };

  // ========== 群管理积木 ==========
  generator.forBlock['group_set_whole_ban'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const enable = block.getFieldValue('ENABLE') === 'TRUE';
    return `group.set_whole_ban(${groupId}, ${enable})\n`;
  };

  generator.forBlock['group_set_admin'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const enable = block.getFieldValue('ENABLE') === 'TRUE';
    return `group.set_admin(${groupId}, ${userId}, ${enable})\n`;
  };

  generator.forBlock['group_set_card'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const card = generator.valueToCode(block, 'CARD', generator.ORDER_NONE) || '""';
    return `group.set_card(${groupId}, ${userId}, ${card})\n`;
  };

  generator.forBlock['group_kick'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const rejectAddRequest = block.getFieldValue('REJECT') === 'TRUE';
    return `group.kick(${groupId}, ${userId}, ${rejectAddRequest})\n`;
  };

  generator.forBlock['group_set_ban'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const duration = generator.valueToCode(block, 'DURATION', generator.ORDER_NONE) || '0';
    return `group.set_ban(${groupId}, ${userId}, ${duration})\n`;
  };

  generator.forBlock['group_set_name'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const name = generator.valueToCode(block, 'NAME', generator.ORDER_NONE) || '""';
    return `group.set_name(${groupId}, ${name})\n`;
  };

  generator.forBlock['group_poke'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    return `group.poke(${groupId}, ${userId})\n`;
  };

  generator.forBlock['group_get_list'] = function(block: Blockly.Block) {
    return ['group.get_list()', generator.ORDER_HIGH];
  };

  generator.forBlock['group_get_members'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    return [`group.get_members(${groupId})`, generator.ORDER_HIGH];
  };

  // ========== 好友管理积木 ==========
  generator.forBlock['user_get_friends'] = function(block: Blockly.Block) {
    return ['user.get_friends()', generator.ORDER_HIGH];
  };

  generator.forBlock['user_set_remark'] = function(block: Blockly.Block) {
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const remark = generator.valueToCode(block, 'REMARK', generator.ORDER_NONE) || '""';
    return `user.set_remark(${userId}, ${remark})\n`;
  };

  generator.forBlock['user_poke'] = function(block: Blockly.Block) {
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    return `user.poke(${userId})\n`;
  };

  // ========== 消息操作积木 ==========
  generator.forBlock['message_delete'] = function(block: Blockly.Block) {
    const messageId = generator.valueToCode(block, 'MESSAGE_ID', generator.ORDER_NONE) || '0';
    return `message.delete_msg(${messageId})\n`;
  };

  generator.forBlock['message_set_essence'] = function(block: Blockly.Block) {
    const messageId = generator.valueToCode(block, 'MESSAGE_ID', generator.ORDER_NONE) || '0';
    return `message.set_essence(${messageId})\n`;
  };

  generator.forBlock['message_get_essence_list'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    return [`message.get_essence_list(${groupId})`, generator.ORDER_HIGH];
  };

  generator.forBlock['message_send_like'] = function(block: Blockly.Block) {
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const times = generator.valueToCode(block, 'TIMES', generator.ORDER_NONE) || '1';
    return `message.send_like(${userId}, ${times})\n`;
  };

  // ========== 文件操作积木 ==========
  generator.forBlock['file_upload_group'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const file = generator.valueToCode(block, 'FILE', generator.ORDER_NONE) || '""';
    const name = generator.valueToCode(block, 'NAME', generator.ORDER_NONE) || '""';
    return `file.upload_group(${groupId}, ${file}, ${name})\n`;
  };

  generator.forBlock['file_delete_group'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const fileId = generator.valueToCode(block, 'FILE_ID', generator.ORDER_NONE) || '""';
    const busid = generator.valueToCode(block, 'BUSID', generator.ORDER_NONE) || '0';
    return `file.delete_group_file(${groupId}, ${fileId}, ${busid})\n`;
  };

  generator.forBlock['file_get_group_system_info'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    return [`file.get_group_file_system_info(${groupId})`, generator.ORDER_HIGH];
  };

  generator.forBlock['file_get_group_root'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    return [`file.get_group_root_files(${groupId})`, generator.ORDER_HIGH];
  };

  generator.forBlock['file_read'] = function(block: Blockly.Block) {
    const path = generator.valueToCode(block, 'PATH', generator.ORDER_NONE) || '""';
    return [`file.read(${path})`, generator.ORDER_HIGH];
  };

  generator.forBlock['file_write'] = function(block: Blockly.Block) {
    const path = generator.valueToCode(block, 'PATH', generator.ORDER_NONE) || '""';
    const content = generator.valueToCode(block, 'CONTENT', generator.ORDER_NONE) || '""';
    return `file.write(${path}, ${content})\n`;
  };

  generator.forBlock['file_delete'] = function(block: Blockly.Block) {
    const path = generator.valueToCode(block, 'PATH', generator.ORDER_NONE) || '""';
    return `file.delete(${path})\n`;
  };

  generator.forBlock['file_exists'] = function(block: Blockly.Block) {
    const path = generator.valueToCode(block, 'PATH', generator.ORDER_NONE) || '""';
    return [`file.exists(${path})`, generator.ORDER_HIGH];
  };

  generator.forBlock['file_mkdir'] = function(block: Blockly.Block) {
    const path = generator.valueToCode(block, 'PATH', generator.ORDER_NONE) || '""';
    return `file.mkdir(${path})\n`;
  };

  // ========== 工具积木 ==========
  generator.forBlock['utils_url_encode'] = function(block: Blockly.Block) {
    const text = generator.valueToCode(block, 'TEXT', generator.ORDER_NONE) || '""';
    return [`utils.url_encode(${text})`, generator.ORDER_HIGH];
  };

  generator.forBlock['utils_url_decode'] = function(block: Blockly.Block) {
    const text = generator.valueToCode(block, 'TEXT', generator.ORDER_NONE) || '""';
    return [`utils.url_decode(${text})`, generator.ORDER_HIGH];
  };

  generator.forBlock['utils_base64_encode'] = function(block: Blockly.Block) {
    const text = generator.valueToCode(block, 'TEXT', generator.ORDER_NONE) || '""';
    return [`utils.base64_encode(${text})`, generator.ORDER_HIGH];
  };

  generator.forBlock['utils_base64_decode'] = function(block: Blockly.Block) {
    const text = generator.valueToCode(block, 'TEXT', generator.ORDER_NONE) || '""';
    return [`utils.base64_decode(${text})`, generator.ORDER_HIGH];
  };

  generator.forBlock['utils_html_escape'] = function(block: Blockly.Block) {
    const text = generator.valueToCode(block, 'TEXT', generator.ORDER_NONE) || '""';
    return [`utils.html_escape(${text})`, generator.ORDER_HIGH];
  };

  generator.forBlock['utils_html_unescape'] = function(block: Blockly.Block) {
    const text = generator.valueToCode(block, 'TEXT', generator.ORDER_NONE) || '""';
    return [`utils.html_unescape(${text})`, generator.ORDER_HIGH];
  };

  // ========== 数据类型判断积木 ==========
  generator.forBlock['type_is_string'] = function(block: Blockly.Block) {
    const value = generator.valueToCode(block, 'VALUE', generator.ORDER_NONE) || 'nil';
    return [`type(${value}) == "string"`, generator.ORDER_RELATIONAL];
  };

  generator.forBlock['type_is_number'] = function(block: Blockly.Block) {
    const value = generator.valueToCode(block, 'VALUE', generator.ORDER_NONE) || 'nil';
    return [`type(${value}) == "number"`, generator.ORDER_RELATIONAL];
  };

  generator.forBlock['type_is_boolean'] = function(block: Blockly.Block) {
    const value = generator.valueToCode(block, 'VALUE', generator.ORDER_NONE) || 'nil';
    return [`type(${value}) == "boolean"`, generator.ORDER_RELATIONAL];
  };

  generator.forBlock['type_is_table'] = function(block: Blockly.Block) {
    const value = generator.valueToCode(block, 'VALUE', generator.ORDER_NONE) || 'nil';
    return [`type(${value}) == "table"`, generator.ORDER_RELATIONAL];
  };

  generator.forBlock['type_is_array'] = function(block: Blockly.Block) {
    const value = generator.valueToCode(block, 'VALUE', generator.ORDER_NONE) || 'nil';
    return [`blockly_utils.is_array(${value})`, generator.ORDER_HIGH];
  };

  generator.forBlock['type_is_nil'] = function(block: Blockly.Block) {
    const value = generator.valueToCode(block, 'VALUE', generator.ORDER_NONE) || 'nil';
    return [`${value} == nil`, generator.ORDER_RELATIONAL];
  };

  generator.forBlock['type_get_type'] = function(block: Blockly.Block) {
    const value = generator.valueToCode(block, 'VALUE', generator.ORDER_NONE) || 'nil';
    return [`type(${value})`, generator.ORDER_HIGH];
  };

  // ========== 系统积木 ==========
  generator.forBlock['system_timestamp_seconds'] = function(block: Blockly.Block) {
    return ['system.get_timestamp_seconds()', generator.ORDER_HIGH];
  };

  generator.forBlock['system_timestamp_milliseconds'] = function(block: Blockly.Block) {
    return ['system.get_timestamp_milliseconds()', generator.ORDER_HIGH];
  };

  generator.forBlock['system_now'] = function(block: Blockly.Block) {
    return ['system.now()', generator.ORDER_HIGH];
  };

  generator.forBlock['system_status'] = function(block: Blockly.Block) {
    return ['system.status()', generator.ORDER_HIGH];
  };

  // ========== 循环控制积木 ==========
  generator.forBlock['controls_while'] = function(block: Blockly.Block) {
    const condition = generator.valueToCode(block, 'CONDITION', generator.ORDER_NONE) || 'false';
    const doCode = generator.statementToCode(block, 'DO') || '';
    return `while ${condition} do
${doCode}end
`;
  };

  generator.forBlock['controls_repeat_until'] = function(block: Blockly.Block) {
    const doCode = generator.statementToCode(block, 'DO') || '';
    const condition = generator.valueToCode(block, 'CONDITION', generator.ORDER_NONE) || 'false';
    return `repeat
${doCode}until ${condition}
`;
  };

  generator.forBlock['controls_break'] = function(block: Blockly.Block) {
    return 'break\n';
  };

  generator.forBlock['controls_continue'] = function(block: Blockly.Block) {
    return 'goto continue\n';
  };

  // ========== 数学运算积木 ==========
  generator.forBlock['math_random'] = function(block: Blockly.Block) {
    const min = generator.valueToCode(block, 'MIN', generator.ORDER_NONE) || '1';
    const max = generator.valueToCode(block, 'MAX', generator.ORDER_NONE) || '100';
    return [`math.random(${min}, ${max})`, generator.ORDER_HIGH];
  };

  generator.forBlock['math_random_float'] = function(block: Blockly.Block) {
    return ['math.random()', generator.ORDER_HIGH];
  };

  generator.forBlock['math_floor'] = function(block: Blockly.Block) {
    const num = generator.valueToCode(block, 'NUM', generator.ORDER_NONE) || '0';
    return [`math.floor(${num})`, generator.ORDER_HIGH];
  };

  generator.forBlock['math_ceil'] = function(block: Blockly.Block) {
    const num = generator.valueToCode(block, 'NUM', generator.ORDER_NONE) || '0';
    return [`math.ceil(${num})`, generator.ORDER_HIGH];
  };

  generator.forBlock['math_round'] = function(block: Blockly.Block) {
    const num = generator.valueToCode(block, 'NUM', generator.ORDER_NONE) || '0';
    const decimals = generator.valueToCode(block, 'DECIMALS', generator.ORDER_NONE) || '0';
    return [`blockly_math_utils.round(${num}, ${decimals})`, generator.ORDER_HIGH];
  };

  generator.forBlock['math_max'] = function(block: Blockly.Block) {
    const a = generator.valueToCode(block, 'A', generator.ORDER_NONE) || '0';
    const b = generator.valueToCode(block, 'B', generator.ORDER_NONE) || '0';
    return [`math.max(${a}, ${b})`, generator.ORDER_HIGH];
  };

  generator.forBlock['math_min'] = function(block: Blockly.Block) {
    const a = generator.valueToCode(block, 'A', generator.ORDER_NONE) || '0';
    const b = generator.valueToCode(block, 'B', generator.ORDER_NONE) || '0';
    return [`math.min(${a}, ${b})`, generator.ORDER_HIGH];
  };

  generator.forBlock['math_abs'] = function(block: Blockly.Block) {
    const num = generator.valueToCode(block, 'NUM', generator.ORDER_NONE) || '0';
    return [`math.abs(${num})`, generator.ORDER_HIGH];
  };

  generator.forBlock['math_modulo'] = function(block: Blockly.Block) {
    const dividend = generator.valueToCode(block, 'DIVIDEND', generator.ORDER_NONE) || '0';
    const divisor = generator.valueToCode(block, 'DIVISOR', generator.ORDER_NONE) || '1';
    return [`(${dividend} % ${divisor})`, generator.ORDER_MULTIPLICATIVE];
  };

  // ========== 时间日期积木 ==========
  generator.forBlock['time_format'] = function(block: Blockly.Block) {
    const timestamp = generator.valueToCode(block, 'TIMESTAMP', generator.ORDER_NONE) || '0';
    const format = generator.valueToCode(block, 'FORMAT', generator.ORDER_NONE) || '"%Y-%m-%d %H:%M:%S"';
    return [`os.date(${format}, ${timestamp})`, generator.ORDER_HIGH];
  };

  generator.forBlock['time_add'] = function(block: Blockly.Block) {
    const timestamp = generator.valueToCode(block, 'TIMESTAMP', generator.ORDER_NONE) || '0';
    const amount = generator.valueToCode(block, 'AMOUNT', generator.ORDER_NONE) || '0';
    const unit = block.getFieldValue('UNIT') || 'seconds';
    const multipliers: { [key: string]: number } = {
      'seconds': 1,
      'minutes': 60,
      'hours': 3600,
      'days': 86400
    };
    const multiplier = multipliers[unit] || 1;
    return [`(${timestamp} + (${amount} * ${multiplier}))`, generator.ORDER_ADDITIVE];
  };

  generator.forBlock['time_sleep'] = function(block: Blockly.Block) {
    const seconds = generator.valueToCode(block, 'SECONDS', generator.ORDER_NONE) || '0';
    return `os.execute("sleep " .. ${seconds})\n`;
  };

  // ========== 调试工具积木 ==========
  generator.forBlock['debug_print'] = function(block: Blockly.Block) {
    const value = generator.valueToCode(block, 'VALUE', generator.ORDER_NONE) || 'nil';
    return `print(${value})\n`;
  };

  generator.forBlock['debug_dump'] = function(block: Blockly.Block) {
    const value = generator.valueToCode(block, 'VALUE', generator.ORDER_NONE) || 'nil';
    return `blockly_utils.dump_table(${value})\n`;
  };

  // ========== 自定义Lua代码积木 ==========
  generator.forBlock['lua_code'] = function(block: Blockly.Block) {
    const code = block.getFieldValue('CODE') || '';
    return code + '\n';
  };

  generator.forBlock['lua_code_output'] = function(block: Blockly.Block) {
    const code = block.getFieldValue('CODE') || '';
    return [`(function() ${code} end)()`, generator.ORDER_HIGH];
  };

  // ========== 请求处理积木 ==========
  generator.forBlock['request_approve_friend'] = function(block: Blockly.Block) {
    const flag = generator.valueToCode(block, 'FLAG', generator.ORDER_NONE) || '""';
    const approve = block.getFieldValue('APPROVE') === 'TRUE';
    const remark = generator.valueToCode(block, 'REMARK', generator.ORDER_NONE) || '""';
    return `request.approve_friend(${flag}, ${approve}, ${remark})\n`;
  };

  generator.forBlock['request_approve_group'] = function(block: Blockly.Block) {
    const flag = generator.valueToCode(block, 'FLAG', generator.ORDER_NONE) || '""';
    const approve = block.getFieldValue('APPROVE') === 'TRUE';
    const reason = generator.valueToCode(block, 'REASON', generator.ORDER_NONE) || '""';
    return `request.approve_group(${flag}, ${approve}, ${reason})\n`;
  };

  // ========== HTTP 请求积木 ==========
  generator.forBlock['http_get'] = function(block: Blockly.Block) {
    const url = generator.valueToCode(block, 'URL', generator.ORDER_NONE) || '""';
    return [`http.request("GET", ${url})`, generator.ORDER_HIGH];
  };

  generator.forBlock['http_post'] = function(block: Blockly.Block) {
    const url = generator.valueToCode(block, 'URL', generator.ORDER_NONE) || '""';
    const body = generator.valueToCode(block, 'BODY', generator.ORDER_NONE) || '""';
    return [`http.request("POST", ${url}, nil, ${body})`, generator.ORDER_HIGH];
  };

  generator.forBlock['http_request'] = function(block: Blockly.Block) {
    const method = block.getFieldValue('METHOD') || 'GET';
    const url = generator.valueToCode(block, 'URL', generator.ORDER_NONE) || '""';
    const body = generator.valueToCode(block, 'BODY', generator.ORDER_NONE) || '""';
    return [`http.request("${method}", ${url}, nil, ${body})`, generator.ORDER_HIGH];
  };

  generator.forBlock['http_get_json'] = function(block: Blockly.Block) {
    const url = generator.valueToCode(block, 'URL', generator.ORDER_NONE) || '""';
    const field = generator.valueToCode(block, 'FIELD', generator.ORDER_NONE) || '""';
    // 标记使用 HTTP 工具库（依赖 JSON 和 TABLE_UTILS）
    markRuntimeLibraryUsed(generator, RuntimeLibraryType.HTTP_UTILS);
    markRuntimeLibraryUsed(generator, RuntimeLibraryType.JSON);
    markRuntimeLibraryUsed(generator, RuntimeLibraryType.TABLE_UTILS);
    return [`blockly_http_utils.get_json_field(${url}, ${field})`, generator.ORDER_HIGH];
  };

  generator.forBlock['http_request_with_var'] = function(block: Blockly.Block) {
    const method = block.getFieldValue('METHOD') || 'GET';
    const url = generator.valueToCode(block, 'URL', generator.ORDER_NONE) || '""';
    const body = generator.valueToCode(block, 'BODY', generator.ORDER_NONE) || 'nil';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';
    // 响应体作为 JSON 字符串存入变量
    return `local __http_response = http.request("${method}", ${url}, nil, ${body})
${varName} = __http_response and __http_response.body or ""
`;
  };

  generator.forBlock['http_download_base64'] = function(block: Blockly.Block) {
    const url = generator.valueToCode(block, 'URL', generator.ORDER_NONE) || '""';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'base64data';
    return `${varName} = http.download_base64(${url})
`;
  };

  // ========== Base64文件操作积木 ==========
  generator.forBlock['file_read_base64'] = function(block: Blockly.Block) {
    const path = generator.valueToCode(block, 'PATH', generator.ORDER_NONE) || '""';
    return [`file.read_base64(${path})`, generator.ORDER_HIGH];
  };

  generator.forBlock['file_write_base64'] = function(block: Blockly.Block) {
    const base64 = generator.valueToCode(block, 'BASE64', generator.ORDER_NONE) || '""';
    const path = generator.valueToCode(block, 'PATH', generator.ORDER_NONE) || '""';
    return `file.write_base64(${path}, ${base64})
`;
  };

  generator.forBlock['send_group_image_base64'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const base64 = generator.valueToCode(block, 'BASE64', generator.ORDER_NONE) || '""';
    return `message.send_group_image(${groupId}, ${base64})
`;
  };

  generator.forBlock['send_private_image_base64'] = function(block: Blockly.Block) {
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const base64 = generator.valueToCode(block, 'BASE64', generator.ORDER_NONE) || '""';
    return `message.send_private_image(${userId}, ${base64})
`;
  };

  generator.forBlock['data_to_base64'] = function(block: Blockly.Block) {
    const data = generator.valueToCode(block, 'DATA', generator.ORDER_NONE) || '""';
    return [`utils.base64_encode(${data})`, generator.ORDER_HIGH];
  };

  generator.forBlock['base64_to_data'] = function(block: Blockly.Block) {
    const base64 = generator.valueToCode(block, 'BASE64', generator.ORDER_NONE) || '""';
    return [`utils.base64_decode(${base64})`, generator.ORDER_HIGH];
  };

  // ========== 机器人信息积木 ==========
  generator.forBlock['bot_get_login_info'] = function(block: Blockly.Block) {
    return ['bot.get_info()', generator.ORDER_HIGH];
  };

  generator.forBlock['bot_get_status'] = function(block: Blockly.Block) {
    return ['bot.get_status()', generator.ORDER_HIGH];
  };

  generator.forBlock['bot_get_version'] = function(block: Blockly.Block) {
    return ['bot.get_version()', generator.ORDER_HIGH];
  };

  // ========== 插件控制积木 ==========
  generator.forBlock['plugin_unload_self'] = function(block: Blockly.Block) {
    return `plugin.unload_self()\n`;
  };

  generator.forBlock['plugin_stop_self'] = function(block: Blockly.Block) {
    return `plugin.stop_self()\n`;
  };

  generator.forBlock['plugin_reload_self'] = function(block: Blockly.Block) {
    return `plugin.reload_self()\n`;
  };

  // ========== 数据处理积木（简化版） ==========
  // 旧版积木兼容（已弃用）
  generator.forBlock['json_get'] = function(block: Blockly.Block) {
    const json = generator.valueToCode(block, 'JSON', generator.ORDER_NONE) || '"{}"';
    const path = generator.valueToCode(block, 'PATH', generator.ORDER_NONE) || '""';
    // 标记使用 JSON 和表操作库
    markRuntimeLibraryUsed(generator, RuntimeLibraryType.JSON);
    markRuntimeLibraryUsed(generator, RuntimeLibraryType.TABLE_UTILS);
    return [`blockly_json.get_path(${json}, ${path})`, generator.ORDER_HIGH];
  };

  generator.forBlock['json_encode'] = function(block: Blockly.Block) {
    const value = generator.valueToCode(block, 'VALUE', generator.ORDER_NONE) || '{}';
    // 标记使用 JSON 库
    markRuntimeLibraryUsed(generator, RuntimeLibraryType.JSON);
    return [`blockly_json.encode(${value})`, generator.ORDER_HIGH];
  };

  generator.forBlock['json_decode'] = function(block: Blockly.Block) {
    const json = generator.valueToCode(block, 'JSON', generator.ORDER_NONE) || '"{}"';
    // 标记使用 JSON 库
    markRuntimeLibraryUsed(generator, RuntimeLibraryType.JSON);
    return [`blockly_json.decode(${json})`, generator.ORDER_HIGH];
  };

  generator.forBlock['table_get'] = function(block: Blockly.Block) {
    const table = generator.valueToCode(block, 'TABLE', generator.ORDER_NONE) || '{}';
    const path = generator.valueToCode(block, 'PATH', generator.ORDER_NONE) || '""';
    // 标记使用表操作库
    markRuntimeLibraryUsed(generator, RuntimeLibraryType.TABLE_UTILS);
    return [`blockly_table_utils.get(${table}, ${path})`, generator.ORDER_HIGH];
  };

  generator.forBlock['table_set'] = function(block: Blockly.Block) {
    const table = generator.valueToCode(block, 'TABLE', generator.ORDER_NONE) || '{}';
    const path = generator.valueToCode(block, 'PATH', generator.ORDER_NONE) || '""';
    const value = generator.valueToCode(block, 'VALUE', generator.ORDER_NONE) || 'nil';
    // 标记使用表操作库
    markRuntimeLibraryUsed(generator, RuntimeLibraryType.TABLE_UTILS);
    return `blockly_table_utils.set(${table}, ${path}, ${value})\n`;
  };

  // 新版积木
  generator.forBlock['data_from_json'] = function(block: Blockly.Block) {
    const json = generator.valueToCode(block, 'JSON', generator.ORDER_NONE) || '"{}"';
    const pathType = block.getFieldValue('PATH_TYPE');
    // 标记使用 JSON 库
    markRuntimeLibraryUsed(generator, RuntimeLibraryType.JSON);
    
    switch (pathType) {
      case 'first':
        return [`(function() local _t = blockly_json.decode(${json}); return _t and _t[1] or nil end)()`, generator.ORDER_HIGH];
      case 'last':
        return [`(function() local _t = blockly_json.decode(${json}); return _t and _t[#_t] or nil end)()`, generator.ORDER_HIGH];
      case 'index':
        return [`blockly_json.decode(${json})`, generator.ORDER_HIGH];
      case 'field':
        return [`blockly_json.decode(${json})`, generator.ORDER_HIGH];
      default:
        return [`blockly_json.decode(${json})`, generator.ORDER_HIGH];
    }
  };

  generator.forBlock['data_get_field'] = function(block: Blockly.Block) {
    const data = generator.valueToCode(block, 'DATA', generator.ORDER_NONE) || '{}';
    const field = generator.valueToCode(block, 'FIELD', generator.ORDER_NONE) || '""';
    return [`${data}[${field}]`, generator.ORDER_HIGH];
  };

  generator.forBlock['data_get_by_index'] = function(block: Blockly.Block) {
    const data = generator.valueToCode(block, 'DATA', generator.ORDER_NONE) || '{}';
    const index = generator.valueToCode(block, 'INDEX', generator.ORDER_NONE) || '1';
    return [`${data}[${index}]`, generator.ORDER_HIGH];
  };

  generator.forBlock['data_to_json'] = function(block: Blockly.Block) {
    const data = generator.valueToCode(block, 'DATA', generator.ORDER_NONE) || '{}';
    // 标记使用 JSON 库
    markRuntimeLibraryUsed(generator, RuntimeLibraryType.JSON);
    return [`blockly_json.encode(${data})`, generator.ORDER_HIGH];
  };

  generator.forBlock['table_to_json'] = function(block: Blockly.Block) {
    const table = generator.valueToCode(block, 'TABLE', generator.ORDER_NONE) || '{}';
    // 标记使用 JSON 库
    markRuntimeLibraryUsed(generator, RuntimeLibraryType.JSON);
    return [`blockly_json.encode(${table})`, generator.ORDER_HIGH];
  };

  // ========== 文件管理积木 ==========
  generator.forBlock['file_read_safe'] = function(block: Blockly.Block) {
    const path = generator.valueToCode(block, 'PATH', generator.ORDER_NONE) || '""';
    return [`file.read_safe(${path})`, generator.ORDER_HIGH];
  };

  generator.forBlock['file_write_safe'] = function(block: Blockly.Block) {
    const path = generator.valueToCode(block, 'PATH', generator.ORDER_NONE) || '""';
    const content = generator.valueToCode(block, 'CONTENT', generator.ORDER_NONE) || '""';
    return [`file.write_safe(${path}, ${content})`, generator.ORDER_HIGH];
  };

  generator.forBlock['file_exists'] = function(block: Blockly.Block) {
    const path = generator.valueToCode(block, 'PATH', generator.ORDER_NONE) || '""';
    return [`file.exists(${path})`, generator.ORDER_HIGH];
  };

  generator.forBlock['file_filter'] = function(block: Blockly.Block) {
    const files = generator.valueToCode(block, 'FILES', generator.ORDER_NONE) || '{}';
    const pattern = generator.valueToCode(block, 'PATTERN', generator.ORDER_NONE) || '""';
    return [`file.filter_files(${files}, ${pattern})`, generator.ORDER_HIGH];
  };

  // ========== 数据库管理积木 ==========
  generator.forBlock['db_open'] = function(block: Blockly.Block) {
    const name = generator.valueToCode(block, 'NAME', generator.ORDER_NONE) || '""';
    return [`db.open(${name})`, generator.ORDER_HIGH];
  };

  generator.forBlock['db_insert'] = function(block: Blockly.Block) {
    const db = generator.valueToCode(block, 'DB', generator.ORDER_NONE) || 'nil';
    const record = generator.valueToCode(block, 'RECORD', generator.ORDER_NONE) || '{}';
    return [`${db}:insert(${record})`, generator.ORDER_HIGH];
  };

  generator.forBlock['db_query'] = function(block: Blockly.Block) {
    const db = generator.valueToCode(block, 'DB', generator.ORDER_NONE) || 'nil';
    const conditions = generator.valueToCode(block, 'CONDITIONS', generator.ORDER_NONE) || 'nil';
    return [`${db}:query(${conditions})`, generator.ORDER_HIGH];
  };

  generator.forBlock['db_query_one'] = function(block: Blockly.Block) {
    const db = generator.valueToCode(block, 'DB', generator.ORDER_NONE) || 'nil';
    const conditions = generator.valueToCode(block, 'CONDITIONS', generator.ORDER_NONE) || 'nil';
    return [`${db}:query_one(${conditions})`, generator.ORDER_HIGH];
  };

  generator.forBlock['db_update'] = function(block: Blockly.Block) {
    const db = generator.valueToCode(block, 'DB', generator.ORDER_NONE) || 'nil';
    const id = generator.valueToCode(block, 'ID', generator.ORDER_NONE) || '0';
    const data = generator.valueToCode(block, 'DATA', generator.ORDER_NONE) || '{}';
    return [`${db}:update(${id}, ${data})`, generator.ORDER_HIGH];
  };

  generator.forBlock['db_delete'] = function(block: Blockly.Block) {
    const db = generator.valueToCode(block, 'DB', generator.ORDER_NONE) || 'nil';
    const id = generator.valueToCode(block, 'ID', generator.ORDER_NONE) || '0';
    return [`${db}:delete(${id})`, generator.ORDER_HIGH];
  };

  generator.forBlock['db_backup'] = function(block: Blockly.Block) {
    const db = generator.valueToCode(block, 'DB', generator.ORDER_NONE) || 'nil';
    const backupName = generator.valueToCode(block, 'BACKUP_NAME', generator.ORDER_NONE) || '""';
    return [`${db}:backup(${backupName})`, generator.ORDER_HIGH];
  };

  generator.forBlock['db_count'] = function(block: Blockly.Block) {
    const db = generator.valueToCode(block, 'DB', generator.ORDER_NONE) || 'nil';
    return [`${db}:count()`, generator.ORDER_HIGH];
  };

  generator.forBlock['db_clear'] = function(block: Blockly.Block) {
    const db = generator.valueToCode(block, 'DB', generator.ORDER_NONE) || 'nil';
    return [`${db}:clear()`, generator.ORDER_HIGH];
  };

  // ========== 数组操作积木（简化版） ==========
  generator.forBlock['array_create'] = function(block: Blockly.Block) {
    const items = generator.statementToCode(block, 'ITEMS') || '';
    // 解析items中的add_item调用
    const itemList: string[] = [];
    const lines = items.split('\n');
    for (const line of lines) {
      const match = line.match(/_array_items\[(\d+)\]\s*=\s*(.+)/);
      if (match) {
        itemList[parseInt(match[1]) - 1] = match[2];
      }
    }
    return ['{' + itemList.join(', ') + '}', generator.ORDER_HIGH];
  };

  generator.forBlock['array_add_item'] = function(block: Blockly.Block) {
    const item = generator.valueToCode(block, 'ITEM', generator.ORDER_NONE) || 'nil';
    // 从 WeakMap 获取当前计数器值
    let counter = arrayCounters.get(generator) || 1;
    const result = `_array_items[${counter}] = ${item}\n`;
    // 递增计数器
    arrayCounters.set(generator, counter + 1);
    return result;
  };

  generator.forBlock['array_length'] = function(block: Blockly.Block) {
    const array = generator.valueToCode(block, 'ARRAY', generator.ORDER_NONE) || '{}';
    return [`#${array}`, generator.ORDER_HIGH];
  };

  generator.forBlock['array_get_first'] = function(block: Blockly.Block) {
    const array = generator.valueToCode(block, 'ARRAY', generator.ORDER_NONE) || '{}';
    return [`${array}[1]`, generator.ORDER_HIGH];
  };

  generator.forBlock['array_get_last'] = function(block: Blockly.Block) {
    const array = generator.valueToCode(block, 'ARRAY', generator.ORDER_NONE) || '{}';
    return [`${array}[#${array}]`, generator.ORDER_HIGH];
  };

  generator.forBlock['array_for_each'] = function(block: Blockly.Block) {
    const array = generator.valueToCode(block, 'ARRAY', generator.ORDER_NONE) || '{}';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'blockly_v__item';
    const statements = generator.statementToCode(block, 'DO') || '';
    
    return `for _, ${varName} in ipairs(${array}) do
${statements}end
`;
  };

  generator.forBlock['array_filter'] = function(block: Blockly.Block) {
    const array = generator.valueToCode(block, 'ARRAY', generator.ORDER_NONE) || '{}';
    const condition = generator.valueToCode(block, 'CONDITION', generator.ORDER_NONE) || 'false';
    
    return [`(function() local _r = {}; for _, _v in ipairs(${array}) do if ${condition} then table.insert(_r, _v) end end; return _r end)()`, generator.ORDER_HIGH];
  };

  // ========== 类型转换积木 ==========
  generator.forBlock['convert_to_string'] = function(block: Blockly.Block) {
    const value = generator.valueToCode(block, 'VALUE', generator.ORDER_NONE) || '""';
    return [`tostring(${value})`, generator.ORDER_HIGH];
  };

  generator.forBlock['convert_to_number'] = function(block: Blockly.Block) {
    const value = generator.valueToCode(block, 'VALUE', generator.ORDER_NONE) || '0';
    return [`tonumber(${value}) or 0`, generator.ORDER_HIGH];
  };

  generator.forBlock['is_type'] = function(block: Blockly.Block) {
    const value = generator.valueToCode(block, 'VALUE', generator.ORDER_NONE) || 'nil';
    const typeName = block.getFieldValue('TYPE');
    if (typeName === 'nil') {
      return [`${value} == nil`, generator.ORDER_RELATIONAL];
    } else if (typeName === 'boolean') {
      return [`type(${value}) == "boolean"`, generator.ORDER_RELATIONAL];
    } else if (typeName === 'array') {
      return [`(type(${value}) == "table" and #${value} > 0)`, generator.ORDER_RELATIONAL];
    } else {
      return [`type(${value}) == "${typeName}"`, generator.ORDER_RELATIONAL];
    }
  };

  generator.forBlock['safe_get'] = function(block: Blockly.Block) {
    const table = generator.valueToCode(block, 'TABLE', generator.ORDER_NONE) || '{}';
    const key = generator.valueToCode(block, 'KEY', generator.ORDER_NONE) || '""';
    const defaultValue = generator.valueToCode(block, 'DEFAULT', generator.ORDER_NONE) || 'nil';
    return [`(${table}[${key}] ~= nil and ${table}[${key}] or ${defaultValue})`, generator.ORDER_HIGH];
  };

  // ========== 注释积木 ==========
  generator.forBlock['comment_text'] = function(block: Blockly.Block) {
    const comment = block.getFieldValue('COMMENT') || '';
    return `-- ${comment}\n`;
  };

  generator.forBlock['comment_block'] = function(block: Blockly.Block) {
    const comment = block.getFieldValue('COMMENT') || '';
    const body = generator.statementToCode(block, 'BODY') || '';
    if (!body.trim()) {
      return `-- [[ ${comment} ]]` + '\n';
    }
    return `--[[ ${comment}\n${body}--]]\n`;
  };

  // ========== 换行符积木 ==========
  generator.forBlock['text_newline'] = function(block: Blockly.Block) {
    return ['"\\n"', generator.ORDER_ATOMIC];
  };

  // ========== 连接文本积木 - 三个输入 ==========
  generator.forBlock['text_concat_three'] = function(block: Blockly.Block) {
    const text1 = generator.valueToCode(block, 'TEXT1', generator.ORDER_CONCATENATION) || '""';
    const text2 = generator.valueToCode(block, 'TEXT2', generator.ORDER_CONCATENATION) || '""';
    const text3 = generator.valueToCode(block, 'TEXT3', generator.ORDER_CONCATENATION) || '""';
    return [`${text1} .. ${text2} .. ${text3}`, generator.ORDER_CONCATENATION];
  };

  // ========== 连接文本积木 - 四个输入 ==========
  generator.forBlock['text_concat_four'] = function(block: Blockly.Block) {
    const text1 = generator.valueToCode(block, 'TEXT1', generator.ORDER_CONCATENATION) || '""';
    const text2 = generator.valueToCode(block, 'TEXT2', generator.ORDER_CONCATENATION) || '""';
    const text3 = generator.valueToCode(block, 'TEXT3', generator.ORDER_CONCATENATION) || '""';
    const text4 = generator.valueToCode(block, 'TEXT4', generator.ORDER_CONCATENATION) || '""';
    return [`${text1} .. ${text2} .. ${text3} .. ${text4}`, generator.ORDER_CONCATENATION];
  };

  // ========== 高级积木 ==========
  generator.forBlock['api_call_with_result'] = function(block: Blockly.Block) {
    const apiName = generator.valueToCode(block, 'API_NAME', generator.ORDER_NONE) || '""';
    const param1 = generator.valueToCode(block, 'PARAM1', generator.ORDER_NONE) || '';
    const param2 = generator.valueToCode(block, 'PARAM2', generator.ORDER_NONE) || '';
    const onSuccess = generator.statementToCode(block, 'ON_SUCCESS') || '';
    const onError = generator.statementToCode(block, 'ON_ERROR') || '';

    const params = [param1, param2].filter(p => p).join(', ');

    return `local _ok, _result = pcall(${apiName}, ${params})
if _ok then
${onSuccess}else
${onError}end
`;
  };

  // ========== API调用带变量积木（通用） ==========
  generator.forBlock['api_call_with_var'] = function(block: Blockly.Block) {
    const apiName = generator.valueToCode(block, 'API_NAME', generator.ORDER_NONE) || '""';
    const param1 = generator.valueToCode(block, 'PARAM1', generator.ORDER_NONE) || '';
    const param2 = generator.valueToCode(block, 'PARAM2', generator.ORDER_NONE) || '';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    const params = [param1, param2].filter(p => p).join(', ');

    // 后端统一返回表类型，包含 success 字段
    return `local ${varName} = ${apiName}(${params})
-- 确保返回的是表类型
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  // ========== OneBot API 积木 - 带变量版本（群管理） ==========
  generator.forBlock['onebot_set_group_whole_ban_with_var'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const enable = block.getFieldValue('ENABLE') === 'TRUE';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = group.set_whole_ban(${groupId}, ${enable})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_set_group_admin_with_var'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const enable = block.getFieldValue('ENABLE') === 'TRUE';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = group.set_admin(${groupId}, ${userId}, ${enable})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_set_group_card_with_var'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const card = generator.valueToCode(block, 'CARD', generator.ORDER_NONE) || '""';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = group.set_card(${groupId}, ${userId}, ${card})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_set_group_kick_with_var'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const reject = block.getFieldValue('REJECT') === 'TRUE';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = group.kick(${groupId}, ${userId}, ${reject})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_set_group_ban_with_var'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const duration = generator.valueToCode(block, 'DURATION', generator.ORDER_NONE) || '0';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = group.set_ban(${groupId}, ${userId}, ${duration})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_set_group_name_with_var'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const name = generator.valueToCode(block, 'NAME', generator.ORDER_NONE) || '""';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = group.set_name(${groupId}, ${name})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  // ========== OneBot API 积木 - 带变量版本（消息） ==========
  generator.forBlock['onebot_send_group_msg_with_var'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const content = generator.valueToCode(block, 'CONTENT', generator.ORDER_NONE) || '""';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = message.send_group(${groupId}, ${content})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_send_private_msg_with_var'] = function(block: Blockly.Block) {
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const content = generator.valueToCode(block, 'CONTENT', generator.ORDER_NONE) || '""';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = message.send_private(${userId}, ${content})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_delete_msg_with_var'] = function(block: Blockly.Block) {
    const messageId = generator.valueToCode(block, 'MESSAGE_ID', generator.ORDER_NONE) || '0';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = message.delete_msg(${messageId})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_set_essence_msg_with_var'] = function(block: Blockly.Block) {
    const messageId = generator.valueToCode(block, 'MESSAGE_ID', generator.ORDER_NONE) || '0';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = message.set_essence(${messageId})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_send_like_with_var'] = function(block: Blockly.Block) {
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const times = generator.valueToCode(block, 'TIMES', generator.ORDER_NONE) || '1';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = message.send_like(${userId}, ${times})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  // ========== OneBot API 积木 - 带变量版本（好友管理） ==========
  generator.forBlock['onebot_set_friend_remark_with_var'] = function(block: Blockly.Block) {
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const remark = generator.valueToCode(block, 'REMARK', generator.ORDER_NONE) || '""';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = user.set_remark(${userId}, ${remark})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_delete_friend_with_var'] = function(block: Blockly.Block) {
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = user.delete_friend(${userId})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  // ========== OneBot API 积木 - 带变量版本（文件操作） ==========
  generator.forBlock['onebot_upload_group_file_with_var'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const file = generator.valueToCode(block, 'FILE', generator.ORDER_NONE) || '""';
    const name = generator.valueToCode(block, 'NAME', generator.ORDER_NONE) || '""';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = file.upload_group(${groupId}, ${file}, ${name})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_delete_group_file_with_var'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const fileId = generator.valueToCode(block, 'FILE_ID', generator.ORDER_NONE) || '""';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = file.delete_group_file(${groupId}, ${fileId})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  // ========== HTTP请求积木 - 带变量版本 ==========
  generator.forBlock['http_get_with_var'] = function(block: Blockly.Block) {
    const url = generator.valueToCode(block, 'URL', generator.ORDER_NONE) || '""';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = http.request("GET", ${url})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['http_post_with_var'] = function(block: Blockly.Block) {
    const url = generator.valueToCode(block, 'URL', generator.ORDER_NONE) || '""';
    const body = generator.valueToCode(block, 'BODY', generator.ORDER_NONE) || '""';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = http.request("POST", ${url}, nil, ${body})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  // ========== OneBot API 积木 - 带变量版本（消息查询） ==========
  generator.forBlock['onebot_get_msg_with_var'] = function(block: Blockly.Block) {
    const messageId = generator.valueToCode(block, 'MESSAGE_ID', generator.ORDER_NONE) || '0';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    // 后端统一返回表类型，包含 success 字段和 data 字段
    return `local ${varName} = message.get_msg(${messageId})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_get_forward_msg_with_var'] = function(block: Blockly.Block) {
    const messageId = generator.valueToCode(block, 'MESSAGE_ID', generator.ORDER_NONE) || '""';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = message.get_forward_msg(${messageId})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_get_group_msg_history_with_var'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const messageSeq = generator.valueToCode(block, 'MESSAGE_SEQ', generator.ORDER_NONE) || '""';
    const count = generator.valueToCode(block, 'COUNT', generator.ORDER_NONE) || '20';
    const reverseOrder = block.getFieldValue('REVERSE_ORDER') === 'TRUE';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = message.get_group_msg_history(${groupId}, ${messageSeq}, ${count}, ${reverseOrder})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_get_friend_msg_history_with_var'] = function(block: Blockly.Block) {
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const messageSeq = generator.valueToCode(block, 'MESSAGE_SEQ', generator.ORDER_NONE) || '""';
    const count = generator.valueToCode(block, 'COUNT', generator.ORDER_NONE) || '20';
    const reverseOrder = block.getFieldValue('REVERSE_ORDER') === 'TRUE';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = message.get_friend_msg_history(${userId}, ${messageSeq}, ${count}, ${reverseOrder})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  // ========== OneBot API 积木 - 带变量版本（消息操作） ==========
  generator.forBlock['onebot_forward_group_single_msg_with_var'] = function(block: Blockly.Block) {
    const messageId = generator.valueToCode(block, 'MESSAGE_ID', generator.ORDER_NONE) || '0';
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = message.forward_group_single_msg(${messageId}, ${groupId})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_forward_friend_single_msg_with_var'] = function(block: Blockly.Block) {
    const messageId = generator.valueToCode(block, 'MESSAGE_ID', generator.ORDER_NONE) || '0';
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = message.forward_friend_single_msg(${messageId}, ${userId})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_delete_essence_msg_with_var'] = function(block: Blockly.Block) {
    const messageId = generator.valueToCode(block, 'MESSAGE_ID', generator.ORDER_NONE) || '0';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = message.delete_essence_msg(${messageId})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_mark_msg_as_read_with_var'] = function(block: Blockly.Block) {
    const messageId = generator.valueToCode(block, 'MESSAGE_ID', generator.ORDER_NONE) || '0';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = message.mark_msg_as_read(${messageId})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_set_msg_emoji_like_with_var'] = function(block: Blockly.Block) {
    const messageId = generator.valueToCode(block, 'MESSAGE_ID', generator.ORDER_NONE) || '0';
    const emojiId = generator.valueToCode(block, 'EMOJI_ID', generator.ORDER_NONE) || '""';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = message.set_msg_emoji_like(${messageId}, ${emojiId})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_unset_msg_emoji_like_with_var'] = function(block: Blockly.Block) {
    const messageId = generator.valueToCode(block, 'MESSAGE_ID', generator.ORDER_NONE) || '0';
    const emojiId = generator.valueToCode(block, 'EMOJI_ID', generator.ORDER_NONE) || '""';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = message.unset_msg_emoji_like(${messageId}, ${emojiId})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  // ========== OneBot API 积木 - 带变量版本（群信息查询） ==========
  generator.forBlock['onebot_get_group_info_with_var'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = group.get_info(${groupId})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_get_group_member_info_with_var'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = group.get_member_info(${groupId}, ${userId})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_get_group_member_list_with_var'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = group.get_member_list(${groupId})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_get_group_list_with_var'] = function(block: Blockly.Block) {
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = group.get_list()
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  // ========== OneBot API 积木 - 带变量版本（群管理） ==========
  generator.forBlock['onebot_set_group_leave_with_var'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const dismiss = block.getFieldValue('DISMISS') === 'TRUE';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = group.set_leave(${groupId}, ${dismiss})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_set_group_special_title_with_var'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const title = generator.valueToCode(block, 'TITLE', generator.ORDER_NONE) || '""';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = group.set_special_title(${groupId}, ${userId}, ${title})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  // ========== OneBot API 积木 - 带变量版本（好友信息查询） ==========
  generator.forBlock['onebot_get_stranger_info_with_var'] = function(block: Blockly.Block) {
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = user.get_stranger_info(${userId})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_get_friend_info_with_var'] = function(block: Blockly.Block) {
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = user.get_info(${userId})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_get_friend_list_with_var'] = function(block: Blockly.Block) {
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = user.get_friends()
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  // ========== OneBot API 积木 - 带变量版本（好友操作） ==========
  generator.forBlock['onebot_friend_poke_with_var'] = function(block: Blockly.Block) {
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = user.poke(${userId})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_set_friend_category_with_var'] = function(block: Blockly.Block) {
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const categoryId = generator.valueToCode(block, 'CATEGORY_ID', generator.ORDER_NONE) || '0';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = user.set_category(${userId}, ${categoryId})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  // ========== OneBot API 积木 - 带变量版本（请求处理） ==========
  generator.forBlock['onebot_set_friend_add_request_with_var'] = function(block: Blockly.Block) {
    const flag = generator.valueToCode(block, 'FLAG', generator.ORDER_NONE) || '""';
    const approve = block.getFieldValue('APPROVE') === 'TRUE';
    const remark = generator.valueToCode(block, 'REMARK', generator.ORDER_NONE) || '""';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = request.set_friend_add(${flag}, ${approve}, ${remark})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_set_group_add_request_with_var'] = function(block: Blockly.Block) {
    const flag = generator.valueToCode(block, 'FLAG', generator.ORDER_NONE) || '""';
    const approve = block.getFieldValue('APPROVE') === 'TRUE';
    const reason = generator.valueToCode(block, 'REASON', generator.ORDER_NONE) || '""';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = request.set_group_add(${flag}, ${approve}, ${reason})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  // ========== OneBot API 积木 - 带变量版本（文件操作） ==========
  generator.forBlock['onebot_upload_private_file_with_var'] = function(block: Blockly.Block) {
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const file = generator.valueToCode(block, 'FILE', generator.ORDER_NONE) || '""';
    const name = generator.valueToCode(block, 'NAME', generator.ORDER_NONE) || '""';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = file.upload_private(${userId}, ${file}, ${name})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_delete_group_folder_with_var'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const folderId = generator.valueToCode(block, 'FOLDER_ID', generator.ORDER_NONE) || '""';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = file.delete_group_folder(${groupId}, ${folderId})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_create_group_file_folder_with_var'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const name = generator.valueToCode(block, 'NAME', generator.ORDER_NONE) || '""';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = file.create_group_folder(${groupId}, ${name})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  // ========== OneBot API 积木 - 带变量版本（系统） ==========
  generator.forBlock['onebot_get_login_info_with_var'] = function(block: Blockly.Block) {
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = system.get_login_info()
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_get_version_info_with_var'] = function(block: Blockly.Block) {
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = system.get_version_info()
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_get_status_with_var'] = function(block: Blockly.Block) {
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = system.get_status()
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_get_cookies_with_var'] = function(block: Blockly.Block) {
    const domain = generator.valueToCode(block, 'DOMAIN', generator.ORDER_NONE) || '""';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = system.get_cookies(${domain})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  generator.forBlock['onebot_set_qq_profile_with_var'] = function(block: Blockly.Block) {
    const nickname = generator.valueToCode(block, 'NICKNAME', generator.ORDER_NONE) || '""';
    const personalNote = generator.valueToCode(block, 'PERSONAL_NOTE', generator.ORDER_NONE) || '""';
    const varName = generator.getVariableName(block, block.getFieldValue('VAR')) || 'response';

    return `local ${varName} = user.set_qq_profile(${nickname}, ${personalNote})
if type(${varName}) ~= "table" then
  ${varName} = {success = false, error = tostring(${varName})}
end
`;
  };

  // ========== 函数定义与调用积木 ==========
  // 函数定义 - 生成 Lua 函数定义
  generator.forBlock['function_define'] = function(block: Blockly.Block) {
    const funcName = block.getFieldValue('NAME') || 'myFunction';
    const params = block.getFieldValue('PARAMS') || '';
    const body = generator.statementToCode(block, 'BODY') || '';
    
    // 清理函数名，确保是合法的 Lua 标识符
    const cleanFuncName = funcName.replace(/[^a-zA-Z0-9_]/g, '_');
    
    return `function ${cleanFuncName}(${params})
${body}end

`;
  };

  // 函数调用（语句形式）
  generator.forBlock['function_call'] = function(block: Blockly.Block) {
    const funcName = block.getFieldValue('NAME') || 'myFunction';
    const args = block.getFieldValue('ARGS') || '';
    
    // 清理函数名
    const cleanFuncName = funcName.replace(/[^a-zA-Z0-9_]/g, '_');
    
    return `${cleanFuncName}(${args})\n`;
  };

  // 函数调用（表达式形式，有返回值）
  generator.forBlock['function_call_output'] = function(block: Blockly.Block) {
    const funcName = block.getFieldValue('NAME') || 'myFunction';
    const args = block.getFieldValue('ARGS') || '';
    
    // 清理函数名
    const cleanFuncName = funcName.replace(/[^a-zA-Z0-9_]/g, '_');
    
    return [`${cleanFuncName}(${args})`, generator.ORDER_HIGH];
  };

  // 函数返回
  generator.forBlock['function_return'] = function(block: Blockly.Block) {
    const value = generator.valueToCode(block, 'VALUE', generator.ORDER_NONE) || 'nil';
    return `return ${value}\n`;
  };

  // ========== 简化函数定义与调用积木 ==========
  generator.forBlock['simple_function_def'] = function(block: Blockly.Block) {
    const funcName = block.getFieldValue('NAME') || '我的函数';
    const body = generator.statementToCode(block, 'BODY') || '';
    const cleanFuncName = funcName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
    return `function ${cleanFuncName}()
${body}end

`;
  };

  generator.forBlock['simple_function_call'] = function(block: Blockly.Block) {
    const funcName = block.getFieldValue('NAME') || '我的函数';
    const cleanFuncName = funcName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
    return `${cleanFuncName}()\n`;
  };

  // ========== 标准积木 ==========
  generator.forBlock['text'] = function(block: Blockly.Block) {
    const text = block.getFieldValue('TEXT');
    return [generator.quote_(text), generator.ORDER_HIGH];
  };

  generator.forBlock['math_number'] = function(block: Blockly.Block) {
    const number = block.getFieldValue('NUM');
    return [number, generator.ORDER_HIGH];
  };

  generator.forBlock['logic_boolean'] = function(block: Blockly.Block) {
    return [block.getFieldValue('BOOL') === 'TRUE' ? 'true' : 'false', generator.ORDER_HIGH];
  };

  generator.forBlock['logic_null'] = function(block: Blockly.Block) {
    return ['nil', generator.ORDER_HIGH];
  };

  generator.forBlock['variables_get'] = function(block: Blockly.Block) {
    const variable = generator.getVariableName(block, block.getFieldValue('VAR'));
    return [variable, generator.ORDER_HIGH];
  };

  generator.forBlock['variables_set'] = function(block: Blockly.Block) {
    const variable = generator.getVariableName(block, block.getFieldValue('VAR'));
    const value = generator.valueToCode(block, 'VALUE', generator.ORDER_NONE) || 'nil';
    return `${variable} = ${value}\n`;
  };

  generator.forBlock['controls_if'] = function(block: Blockly.Block) {
    let n = 0;
    let code = '';
    do {
      const condition = generator.valueToCode(block, 'IF' + n, generator.ORDER_NONE) || 'false';
      const statements = generator.statementToCode(block, 'DO' + n);
      code += (n === 0 ? 'if ' : 'elseif ') + condition + ' then\n' + statements;
      n++;
    } while (block.getInput('IF' + n));
    
    if (block.getInput('ELSE')) {
      const statements = generator.statementToCode(block, 'ELSE');
      code += 'else\n' + statements;
    }
    code += 'end\n';
    return code;
  };

  generator.forBlock['logic_compare'] = function(block: Blockly.Block) {
    const OPERATORS: Record<string, [string, number]> = {
      'EQ': ['==', generator.ORDER_RELATIONAL],
      'NEQ': ['~=', generator.ORDER_RELATIONAL],
      'LT': ['<', generator.ORDER_RELATIONAL],
      'LTE': ['<=', generator.ORDER_RELATIONAL],
      'GT': ['>', generator.ORDER_RELATIONAL],
      'GTE': ['>=', generator.ORDER_RELATIONAL],
    };
    const operator = block.getFieldValue('OP');
    const [op, order] = OPERATORS[operator];
    const left = generator.valueToCode(block, 'A', order) || '0';
    const right = generator.valueToCode(block, 'B', order) || '0';
    return [left + ' ' + op + ' ' + right, order];
  };

  generator.forBlock['logic_operation'] = function(block: Blockly.Block) {
    const operator = block.getFieldValue('OP');
    const order = operator === 'AND' ? generator.ORDER_AND : generator.ORDER_OR;
    const left = generator.valueToCode(block, 'A', order) || 'false';
    const right = generator.valueToCode(block, 'B', order) || 'false';
    return [left + ' ' + operator.toLowerCase() + ' ' + right, order];
  };

  generator.forBlock['logic_negate'] = function(block: Blockly.Block) {
    const value = generator.valueToCode(block, 'BOOL', generator.ORDER_UNARY) || 'false';
    return ['not ' + value, generator.ORDER_UNARY];
  };

  generator.forBlock['math_arithmetic'] = function(block: Blockly.Block) {
    const OPERATORS: Record<string, [string, number]> = {
      'ADD': [' + ', generator.ORDER_ADDITIVE],
      'MINUS': [' - ', generator.ORDER_ADDITIVE],
      'MULTIPLY': [' * ', generator.ORDER_MULTIPLICATIVE],
      'DIVIDE': [' / ', generator.ORDER_MULTIPLICATIVE],
      'POWER': [' ^ ', generator.ORDER_EXPONENTIATION],
    };
    const operator = block.getFieldValue('OP');
    const [op, order] = OPERATORS[operator];
    const left = generator.valueToCode(block, 'A', order) || '0';
    const right = generator.valueToCode(block, 'B', order) || '0';
    return [left + op + right, order];
  };

  generator.forBlock['controls_repeat_ext'] = function(block: Blockly.Block) {
    const times = generator.valueToCode(block, 'TIMES', generator.ORDER_NONE) || '0';
    const statements = generator.statementToCode(block, 'DO');
    return `for _i = 1, ${times} do
${statements}end
`;
  };

  generator.forBlock['controls_whileUntil'] = function(block: Blockly.Block) {
    const until = block.getFieldValue('MODE') === 'UNTIL';
    const condition = generator.valueToCode(block, 'BOOL', generator.ORDER_NONE) || 'false';
    const statements = generator.statementToCode(block, 'DO');
    const condCode = until ? 'not (' + condition + ')' : condition;
    return `while ${condCode} do
${statements}end
`;
  };

  generator.forBlock['controls_for'] = function(block: Blockly.Block) {
    const variable = generator.getVariableName(block, block.getFieldValue('VAR'));
    const from = generator.valueToCode(block, 'FROM', generator.ORDER_NONE) || '0';
    const to = generator.valueToCode(block, 'TO', generator.ORDER_NONE) || '0';
    const by = generator.valueToCode(block, 'BY', generator.ORDER_NONE) || '1';
    const statements = generator.statementToCode(block, 'DO');
    return `for ${variable} = ${from}, ${to}, ${by} do
${statements}end
`;
  };

  generator.forBlock['controls_forEach'] = function(block: Blockly.Block) {
    const variable = generator.getVariableName(block, block.getFieldValue('VAR'));
    const list = generator.valueToCode(block, 'LIST', generator.ORDER_NONE) || '{}';
    const statements = generator.statementToCode(block, 'DO');
    return `for _, ${variable} in ipairs(${list}) do
${statements}end
`;
  };

  generator.forBlock['controls_flow_statements'] = function(block: Blockly.Block) {
    const flow = block.getFieldValue('FLOW');
    if (flow === 'BREAK') {
      return 'break\n';
    } else {
      return 'return\n';
    }
  };

  // ========== 新增文本积木 ==========
  generator.forBlock['text_newline'] = function(block: Blockly.Block) {
    return ['"\\n"', generator.ORDER_ATOMIC];
  };

  generator.forBlock['text_concat3'] = function(block: Blockly.Block) {
    const text1 = generator.valueToCode(block, 'TEXT1', generator.ORDER_CONCATENATION) || '""';
    const text2 = generator.valueToCode(block, 'TEXT2', generator.ORDER_CONCATENATION) || '""';
    const text3 = generator.valueToCode(block, 'TEXT3', generator.ORDER_CONCATENATION) || '""';
    return [`${text1} .. ${text2} .. ${text3}`, generator.ORDER_CONCATENATION];
  };

  // ========== 自定义Lua代码积木 ==========
  generator.forBlock['lua_code'] = function(block: Blockly.Block) {
    const code = block.getFieldValue('CODE') || '';
    // 处理多行代码，确保每行正确缩进
    const lines = code.split('\n');
    const processedLines = lines.map(line => line.trimRight());
    return processedLines.join('\n') + '\n';
  };

  generator.forBlock['lua_code_expression'] = function(block: Blockly.Block) {
    const code = block.getFieldValue('CODE') || 'nil';
    // 移除首尾空白，但保留内部格式
    const trimmedCode = code.trim();
    return [`(${trimmedCode})`, generator.ORDER_HIGH];
  };

  // 新版自定义Lua代码积木（带多行文本输入）
  generator.forBlock['lua_custom_code'] = function(block: Blockly.Block) {
    const code = block.getFieldValue('CODE') || '';
    // 处理多行代码，确保每行正确缩进
    const lines = code.split('\n');
    const processedLines = lines.map(line => line.trimRight());
    return processedLines.join('\n') + '\n';
  };

  // JSON配置输入积木 - 生成注释形式的配置（供上传时解析）
  generator.forBlock['json_config_input'] = function(block: Blockly.Block) {
    const json = block.getFieldValue('JSON') || '{}';
    const cleanedJson = json.replace(/,\s*([}\]])/g, '$1');
    let finalJson = cleanedJson;
    try {
      JSON.parse(cleanedJson);
      finalJson = cleanedJson;
    } catch (e) {
      finalJson = json;
    }
    const escapedJson = finalJson.replace(/\n/g, ' ').replace(/\s+/g, ' ');
    return `-- [BLOCKLY_CONFIG] ${escapedJson}\n`;
  };

  // ========== OneBot API 积木 - 消息相关 ==========
  generator.forBlock['onebot_get_msg'] = function(block: Blockly.Block) {
    const messageId = generator.valueToCode(block, 'MESSAGE_ID', generator.ORDER_NONE) || '0';
    return [`message.get_msg(${messageId})`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_get_forward_msg'] = function(block: Blockly.Block) {
    const messageId = generator.valueToCode(block, 'MESSAGE_ID', generator.ORDER_NONE) || '""';
    return [`message.get_forward_msg(${messageId})`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_get_group_msg_history'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const messageSeq = generator.valueToCode(block, 'MESSAGE_SEQ', generator.ORDER_NONE) || '""';
    const count = generator.valueToCode(block, 'COUNT', generator.ORDER_NONE) || '20';
    const reverseOrder = block.getFieldValue('REVERSE_ORDER') === 'TRUE';
    return [`message.get_group_msg_history(${groupId}, ${messageSeq}, ${count}, ${reverseOrder})`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_get_friend_msg_history'] = function(block: Blockly.Block) {
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const messageSeq = generator.valueToCode(block, 'MESSAGE_SEQ', generator.ORDER_NONE) || '""';
    const count = generator.valueToCode(block, 'COUNT', generator.ORDER_NONE) || '20';
    const reverseOrder = block.getFieldValue('REVERSE_ORDER') === 'TRUE';
    return [`message.get_friend_msg_history(${userId}, ${messageSeq}, ${count}, ${reverseOrder})`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_forward_group_single_msg'] = function(block: Blockly.Block) {
    const messageId = generator.valueToCode(block, 'MESSAGE_ID', generator.ORDER_NONE) || '0';
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    return `message.forward_group_single_msg(${messageId}, ${groupId})\n`;
  };

  generator.forBlock['onebot_forward_friend_single_msg'] = function(block: Blockly.Block) {
    const messageId = generator.valueToCode(block, 'MESSAGE_ID', generator.ORDER_NONE) || '0';
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    return `message.forward_friend_single_msg(${messageId}, ${userId})\n`;
  };

  generator.forBlock['onebot_mark_msg_as_read'] = function(block: Blockly.Block) {
    const messageId = generator.valueToCode(block, 'MESSAGE_ID', generator.ORDER_NONE) || '0';
    return `message.mark_msg_as_read(${messageId})\n`;
  };

  generator.forBlock['onebot_set_msg_emoji_like'] = function(block: Blockly.Block) {
    const messageId = generator.valueToCode(block, 'MESSAGE_ID', generator.ORDER_NONE) || '0';
    const emojiId = generator.valueToCode(block, 'EMOJI_ID', generator.ORDER_NONE) || '0';
    return `message.set_msg_emoji_like(${messageId}, ${emojiId})\n`;
  };

  generator.forBlock['onebot_unset_msg_emoji_like'] = function(block: Blockly.Block) {
    const messageId = generator.valueToCode(block, 'MESSAGE_ID', generator.ORDER_NONE) || '0';
    const emojiId = generator.valueToCode(block, 'EMOJI_ID', generator.ORDER_NONE) || '0';
    return `message.unset_msg_emoji_like(${messageId}, ${emojiId})\n`;
  };

  generator.forBlock['onebot_delete_essence_msg'] = function(block: Blockly.Block) {
    const messageId = generator.valueToCode(block, 'MESSAGE_ID', generator.ORDER_NONE) || '0';
    return `message.delete_essence_msg(${messageId})\n`;
  };

  generator.forBlock['onebot_get_image'] = function(block: Blockly.Block) {
    const file = generator.valueToCode(block, 'FILE', generator.ORDER_NONE) || '""';
    return [`message.get_image(${file})`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_get_record'] = function(block: Blockly.Block) {
    const file = generator.valueToCode(block, 'FILE', generator.ORDER_NONE) || '""';
    const outFormat = generator.valueToCode(block, 'OUT_FORMAT', generator.ORDER_NONE) || '"mp3"';
    return [`message.get_record(${file}, ${outFormat})`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_get_file'] = function(block: Blockly.Block) {
    const file = generator.valueToCode(block, 'FILE', generator.ORDER_NONE) || '""';
    const download = block.getFieldValue('DOWNLOAD') === 'TRUE';
    return [`message.get_file(${file}, ${download})`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_voice_msg_to_text'] = function(block: Blockly.Block) {
    const messageId = generator.valueToCode(block, 'MESSAGE_ID', generator.ORDER_NONE) || '0';
    return [`message.voice_msg_to_text(${messageId})`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_send_group_ai_record'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const text = generator.valueToCode(block, 'TEXT', generator.ORDER_NONE) || '""';
    const character = generator.valueToCode(block, 'CHARACTER', generator.ORDER_NONE) || '""';
    const chatType = block.getFieldValue('CHAT_TYPE') || '1';
    // 生成带错误处理的代码
    return `do
  local __ai_record_result = message.send_group_ai_record(${groupId}, ${text}, ${character}, ${chatType})
  if __ai_record_result and __ai_record_result.success then
    log.debug("AI语音发送成功")
  else
    local errMsg = __ai_record_result and __ai_record_result.error or "未知错误"
    log.error("发送AI语音失败: " .. tostring(errMsg))
  end
end
`;
  };

  generator.forBlock['onebot_get_ai_characters'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const chatType = block.getFieldValue('CHAT_TYPE') || '1';
    // 生成带错误处理的代码
    return [`(function()
  local __ai_chars_result, __ai_chars_err = message.get_ai_characters(${groupId}, ${chatType})
  if __ai_chars_err then
    log.error("获取AI角色列表失败: " .. tostring(__ai_chars_err))
    return {}
  end
  return __ai_chars_result or {}
end)()`, generator.ORDER_HIGH];
  };

  // ========== OneBot API 积木 - 群组相关 ==========
  generator.forBlock['onebot_get_group_info'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    return [`group.get_info(${groupId})`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_get_group_member_info'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    return [`group.get_member_info(${groupId}, ${userId})`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_get_group_honor_info'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const type = block.getFieldValue('TYPE') || 'all';
    return [`group.get_honor_info(${groupId}, "${type}")`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_get_group_system_msg'] = function(block: Blockly.Block) {
    return [`group.get_system_msg()`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_get_group_at_all_remain'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    return [`group.get_at_all_remain(${groupId})`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_get_group_shut_list'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    return [`group.get_shut_list(${groupId})`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_get_group_ignore_add_request'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    return [`group.get_ignore_add_request(${groupId})`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_set_group_leave'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    return `group.set_leave(${groupId})\n`;
  };

  generator.forBlock['onebot_set_group_special_title'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const title = generator.valueToCode(block, 'TITLE', generator.ORDER_NONE) || '""';
    return `group.set_special_title(${groupId}, ${userId}, ${title})\n`;
  };

  generator.forBlock['onebot_set_group_remark'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const remark = generator.valueToCode(block, 'REMARK', generator.ORDER_NONE) || '""';
    // 注意：group.set_remark API当前未实现，此积木暂时不可用
    return `-- 警告：group.set_remark(${groupId}, ${remark}) API未实现\n`;
  };

  generator.forBlock['onebot_set_group_msg_mask'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const mask = generator.valueToCode(block, 'MASK', generator.ORDER_NONE) || '0';
    // 注意：group.set_msg_mask API当前未实现，此积木暂时不可用
    return `-- 警告：group.set_msg_mask(${groupId}, ${mask}) API未实现\n`;
  };

  generator.forBlock['onebot_send_group_sign'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    // 注意：group.send_sign API当前未实现，此积木暂时不可用
    return `-- 警告：group.send_sign(${groupId}) API未实现\n`;
  };

  generator.forBlock['onebot_batch_delete_group_member'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const userIds = generator.valueToCode(block, 'USER_IDS', generator.ORDER_NONE) || '{}';
    // 注意：group.batch_delete_member API当前未实现，此积木暂时不可用
    return `-- 警告：group.batch_delete_member(${groupId}, ${userIds}) API未实现\n`;
  };

  generator.forBlock['onebot_get_group_notice'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    // 注意：group.get_notice API当前未实现，此积木暂时不可用
    return [`-- 警告：group.get_notice(${groupId}) API未实现`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_send_group_notice'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const content = generator.valueToCode(block, 'CONTENT', generator.ORDER_NONE) || '""';
    const image = generator.valueToCode(block, 'IMAGE', generator.ORDER_NONE) || '""';
    const pinned = block.getFieldValue('PINNED') === 'TRUE';
    const confirm = block.getFieldValue('CONFIRM') === 'TRUE';
    // 注意：group.send_notice API当前未实现，此积木暂时不可用
    return `-- 警告：group.send_notice(${groupId}, ${content}, ${image}, ${pinned}, ${confirm}) API未实现\n`;
  };

  generator.forBlock['onebot_delete_group_notice'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const noticeId = generator.valueToCode(block, 'NOTICE_ID', generator.ORDER_NONE) || '""';
    // 注意：group.delete_notice API当前未实现，此积木暂时不可用
    return `-- 警告：group.delete_notice(${groupId}, ${noticeId}) API未实现\n`;
  };

  generator.forBlock['onebot_get_group_album_list'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    // 注意：group.get_album_list API当前未实现，此积木暂时不可用
    return [`-- 警告：group.get_album_list(${groupId}) API未实现`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_create_group_album'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const name = generator.valueToCode(block, 'NAME', generator.ORDER_NONE) || '""';
    const desc = generator.valueToCode(block, 'DESC', generator.ORDER_NONE) || '""';
    // 注意：group.create_album API当前未实现，此积木暂时不可用
    return `-- 警告：group.create_album(${groupId}, ${name}, ${desc}) API未实现\n`;
  };

  generator.forBlock['onebot_delete_group_album'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const albumId = generator.valueToCode(block, 'ALBUM_ID', generator.ORDER_NONE) || '""';
    // 注意：group.delete_album API当前未实现，此积木暂时不可用
    return `-- 警告：group.delete_album(${groupId}, ${albumId}) API未实现\n`;
  };

  generator.forBlock['onebot_upload_group_album'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const albumId = generator.valueToCode(block, 'ALBUM_ID', generator.ORDER_NONE) || '""';
    const files = generator.valueToCode(block, 'FILES', generator.ORDER_NONE) || '{}';
    // 注意：group.upload_album API当前未实现，此积木暂时不可用
    return `-- 警告：group.upload_album(${groupId}, ${albumId}, ${files}) API未实现\n`;
  };

  // ========== OneBot API 积木 - 用户相关 ==========
  generator.forBlock['onebot_get_stranger_info'] = function(block: Blockly.Block) {
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    return [`user.get_stranger_info(${userId})`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_get_friend_list'] = function(block: Blockly.Block) {
    return [`user.get_friend_list()`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_get_friends_with_category'] = function(block: Blockly.Block) {
    // 注意：user.get_friends_with_category API当前未实现，此积木暂时不可用
    return [`-- 警告：user.get_friends_with_category() API未实现`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_delete_friend'] = function(block: Blockly.Block) {
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    return `user.delete_friend(${userId})\n`;
  };

  generator.forBlock['onebot_set_friend_remark'] = function(block: Blockly.Block) {
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const remark = generator.valueToCode(block, 'REMARK', generator.ORDER_NONE) || '""';
    return `user.set_remark(${userId}, ${remark})\n`;
  };

  generator.forBlock['onebot_set_friend_category'] = function(block: Blockly.Block) {
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const categoryId = generator.valueToCode(block, 'CATEGORY_ID', generator.ORDER_NONE) || '0';
    // 注意：user.set_friend_category API当前未实现，此积木暂时不可用
    return `-- 警告：user.set_friend_category(${userId}, ${categoryId}) API未实现\n`;
  };

  generator.forBlock['onebot_get_profile_like'] = function(block: Blockly.Block) {
    const start = generator.valueToCode(block, 'START', generator.ORDER_NONE) || '0';
    const count = generator.valueToCode(block, 'COUNT', generator.ORDER_NONE) || '20';
    // 注意：user.get_profile_like API当前未实现，此积木暂时不可用
    return [`-- 警告：user.get_profile_like(${start}, ${count}) API未实现`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_get_profile_like_me'] = function(block: Blockly.Block) {
    const start = generator.valueToCode(block, 'START', generator.ORDER_NONE) || '0';
    const count = generator.valueToCode(block, 'COUNT', generator.ORDER_NONE) || '20';
    // 注意：user.get_profile_like_me API当前未实现，此积木暂时不可用
    return [`-- 警告：user.get_profile_like_me(${start}, ${count}) API未实现`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_get_qq_avatar'] = function(block: Blockly.Block) {
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    // 注意：user.get_qq_avatar API当前未实现，此积木暂时不可用
    return [`-- 警告：user.get_qq_avatar(${userId}, ${groupId}) API未实现`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_set_qq_avatar'] = function(block: Blockly.Block) {
    const file = generator.valueToCode(block, 'FILE', generator.ORDER_NONE) || '""';
    // 注意：user.set_qq_avatar API当前未实现，此积木暂时不可用
    return `-- 警告：user.set_qq_avatar(${file}) API未实现\n`;
  };

  generator.forBlock['onebot_set_qq_profile'] = function(block: Blockly.Block) {
    const nickname = generator.valueToCode(block, 'NICKNAME', generator.ORDER_NONE) || '""';
    const personalNote = generator.valueToCode(block, 'PERSONAL_NOTE', generator.ORDER_NONE) || '""';
    return `user.set_qq_profile(${nickname}, ${personalNote})\n`;
  };

  generator.forBlock['onebot_get_robot_uin_range'] = function(block: Blockly.Block) {
    // 注意：user.get_robot_uin_range API当前未实现，此积木暂时不可用
    return [`-- 警告：user.get_robot_uin_range() API未实现`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_friend_poke'] = function(block: Blockly.Block) {
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    return `user.poke(${userId})\n`;
  };

  // ========== OneBot API 积木 - 文件相关 ==========
  generator.forBlock['onebot_upload_group_file'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const file = generator.valueToCode(block, 'FILE', generator.ORDER_NONE) || '""';
    const name = generator.valueToCode(block, 'NAME', generator.ORDER_NONE) || '""';
    const folderId = generator.valueToCode(block, 'FOLDER_ID', generator.ORDER_NONE) || '""';
    return `file.upload_group(${groupId}, ${file}, ${name}, ${folderId})\n`;
  };

  generator.forBlock['onebot_upload_private_file'] = function(block: Blockly.Block) {
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    const file = generator.valueToCode(block, 'FILE', generator.ORDER_NONE) || '""';
    const name = generator.valueToCode(block, 'NAME', generator.ORDER_NONE) || '""';
    // 注意：file.upload_private API当前未实现，此积木暂时不可用
    return `-- 警告：file.upload_private(${userId}, ${file}, ${name}) API未实现\n`;
  };

  generator.forBlock['onebot_delete_group_file'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const fileId = generator.valueToCode(block, 'FILE_ID', generator.ORDER_NONE) || '""';
    return `file.delete_group_file(${groupId}, ${fileId})\n`;
  };

  generator.forBlock['onebot_delete_group_folder'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const folderId = generator.valueToCode(block, 'FOLDER_ID', generator.ORDER_NONE) || '""';
    return `file.delete_group_folder(${groupId}, ${folderId})\n`;
  };

  generator.forBlock['onebot_create_group_file_folder'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const name = generator.valueToCode(block, 'NAME', generator.ORDER_NONE) || '""';
    return `file.create_group_file_folder(${groupId}, ${name})\n`;
  };

  generator.forBlock['onebot_rename_group_file_folder'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const folderId = generator.valueToCode(block, 'FOLDER_ID', generator.ORDER_NONE) || '""';
    const newName = generator.valueToCode(block, 'NEW_NAME', generator.ORDER_NONE) || '""';
    // 注意：file.rename_group_folder API当前未实现，此积木暂时不可用
    return `-- 警告：file.rename_group_folder(${groupId}, ${folderId}, ${newName}) API未实现\n`;
  };

  generator.forBlock['onebot_move_group_file'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const fileId = generator.valueToCode(block, 'FILE_ID', generator.ORDER_NONE) || '""';
    const parentDirectory = generator.valueToCode(block, 'PARENT_DIRECTORY', generator.ORDER_NONE) || '""';
    const targetDirectory = generator.valueToCode(block, 'TARGET_DIRECTORY', generator.ORDER_NONE) || '""';
    return `file.move_group_file(${groupId}, ${fileId}, ${parentDirectory}, ${targetDirectory})\n`;
  };

  generator.forBlock['onebot_get_group_file_url'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const fileId = generator.valueToCode(block, 'FILE_ID', generator.ORDER_NONE) || '""';
    // 注意：file.get_group_file_url API当前未实现，此积木暂时不可用
    return [`-- 警告：file.get_group_file_url(${groupId}, ${fileId}) API未实现`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_get_private_file_url'] = function(block: Blockly.Block) {
    const fileId = generator.valueToCode(block, 'FILE_ID', generator.ORDER_NONE) || '""';
    // 注意：file.get_private_file_url API当前未实现，此积木暂时不可用
    return [`-- 警告：file.get_private_file_url(${fileId}) API未实现`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_set_group_file_forever'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const fileId = generator.valueToCode(block, 'FILE_ID', generator.ORDER_NONE) || '""';
    // 注意：file.set_file_forever API当前未实现，此积木暂时不可用
    return `-- 警告：file.set_file_forever(${groupId}, ${fileId}) API未实现\n`;
  };

  generator.forBlock['onebot_get_flash_file_info'] = function(block: Blockly.Block) {
    const shareLink = generator.valueToCode(block, 'SHARE_LINK', generator.ORDER_NONE) || '""';
    const fileSetId = generator.valueToCode(block, 'FILE_SET_ID', generator.ORDER_NONE) || '""';
    // 注意：file.get_flash_file_info API当前未实现，此积木暂时不可用
    return [`-- 警告：file.get_flash_file_info(${shareLink}, ${fileSetId}) API未实现`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_download_file'] = function(block: Blockly.Block) {
    const url = generator.valueToCode(block, 'URL', generator.ORDER_NONE) || '""';
    const base64 = generator.valueToCode(block, 'BASE64', generator.ORDER_NONE) || '""';
    const name = generator.valueToCode(block, 'NAME', generator.ORDER_NONE) || '""';
    const headers = generator.valueToCode(block, 'HEADERS', generator.ORDER_NONE) || '{}';
    return [`file.download_file(${url}, ${base64}, ${name}, ${headers})`, generator.ORDER_HIGH];
  };

  // ========== OneBot API 积木 - 请求处理 ==========
  generator.forBlock['onebot_set_friend_add_request'] = function(block: Blockly.Block) {
    const flag = generator.valueToCode(block, 'FLAG', generator.ORDER_NONE) || '""';
    const approve = block.getFieldValue('APPROVE') === 'TRUE';
    const remark = generator.valueToCode(block, 'REMARK', generator.ORDER_NONE) || '""';
    return `request.set_friend_add_request(${flag}, ${approve}, ${remark})\n`;
  };

  generator.forBlock['onebot_set_group_add_request'] = function(block: Blockly.Block) {
    const flag = generator.valueToCode(block, 'FLAG', generator.ORDER_NONE) || '""';
    const approve = block.getFieldValue('APPROVE') === 'TRUE';
    const reason = generator.valueToCode(block, 'REASON', generator.ORDER_NONE) || '""';
    return `request.set_group_add_request(${flag}, ${approve}, ${reason})\n`;
  };

  generator.forBlock['onebot_get_doubt_friends_add_request'] = function(block: Blockly.Block) {
    const count = generator.valueToCode(block, 'COUNT', generator.ORDER_NONE) || '50';
    return [`request.get_doubt_friends(${count})`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_set_doubt_friends_add_request'] = function(block: Blockly.Block) {
    const flag = generator.valueToCode(block, 'FLAG', generator.ORDER_NONE) || '""';
    return `request.handle_doubt_friend(${flag})\n`;
  };

  // ========== OneBot API 积木 - 系统相关 ==========
  generator.forBlock['onebot_get_login_info'] = function(block: Blockly.Block) {
    return [`system.get_login_info()`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_get_version_info'] = function(block: Blockly.Block) {
    return [`system.get_version_info()`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_get_status'] = function(block: Blockly.Block) {
    return [`system.get_status()`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_get_cookies'] = function(block: Blockly.Block) {
    const domain = generator.valueToCode(block, 'DOMAIN', generator.ORDER_NONE) || '""';
    return [`system.get_cookies(${domain})`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_set_online_status'] = function(block: Blockly.Block) {
    const status = generator.valueToCode(block, 'STATUS', generator.ORDER_NONE) || '0';
    const extStatus = generator.valueToCode(block, 'EXT_STATUS', generator.ORDER_NONE) || '0';
    const batteryStatus = generator.valueToCode(block, 'BATTERY_STATUS', generator.ORDER_NONE) || '0';
    // 注意：system.set_online_status API当前未实现，此积木暂时不可用
    return `-- 警告：system.set_online_status(${status}, ${extStatus}, ${batteryStatus}) API未实现\n`;
  };

  generator.forBlock['onebot_set_restart'] = function(block: Blockly.Block) {
    // 注意：system.set_restart API当前未实现，此积木暂时不可用
    return `-- 警告：system.set_restart() API未实现\n`;
  };

  generator.forBlock['onebot_clean_cache'] = function(block: Blockly.Block) {
    // 注意：system.clean_cache API当前未实现，此积木暂时不可用
    return `-- 警告：system.clean_cache() API未实现\n`;
  };

  generator.forBlock['onebot_scan_qrcode'] = function(block: Blockly.Block) {
    const file = generator.valueToCode(block, 'FILE', generator.ORDER_NONE) || '""';
    // 注意：system.scan_qrcode 实际上是 message.scan_qrcode
    return [`message.scan_qrcode(${file})`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_ocr_image'] = function(block: Blockly.Block) {
    const image = generator.valueToCode(block, 'IMAGE', generator.ORDER_NONE) || '""';
    // 注意：system.ocr_image 实际上是 message.ocr_image
    return [`message.ocr_image(${image})`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_get_rkey'] = function(block: Blockly.Block) {
    // 注意：system.get_rkey API当前未实现，此积木暂时不可用
    return [`-- 警告：system.get_rkey() API未实现`, generator.ORDER_HIGH];
  };

  // ========== OneBot API 积木 - 其他 ==========
  generator.forBlock['onebot_fetch_custom_face'] = function(block: Blockly.Block) {
    // 注意：system.fetch_custom_face API当前未实现，此积木暂时不可用
    return [`-- 警告：system.fetch_custom_face() API未实现`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_get_recommend_face'] = function(block: Blockly.Block) {
    const word = generator.valueToCode(block, 'WORD', generator.ORDER_NONE) || '""';
    // 注意：system.get_recommend_face API当前未实现，此积木暂时不可用
    return [`-- 警告：system.get_recommend_face(${word}) API未实现`, generator.ORDER_HIGH];
  };

  generator.forBlock['onebot_send_pb'] = function(block: Blockly.Block) {
    const cmd = generator.valueToCode(block, 'CMD', generator.ORDER_NONE) || '""';
    const hex = generator.valueToCode(block, 'HEX', generator.ORDER_NONE) || '""';
    // 注意：system.send_pb API当前未实现，此积木暂时不可用
    return `-- 警告：system.send_pb(${cmd}, ${hex}) API未实现\n`;
  };

  generator.forBlock['onebot_check_url_safely'] = function(block: Blockly.Block) {
    const url = generator.valueToCode(block, 'URL', generator.ORDER_NONE) || '""';
    // 注意：system.check_url_safely API当前未实现，此积木暂时不可用
    return [`-- 警告：system.check_url_safely(${url}) API未实现`, generator.ORDER_HIGH];
  };

  // ========== 管理员验证积木 ==========
  generator.forBlock['msg_is_group_admin'] = function(block: Blockly.Block) {
    const groupId = generator.valueToCode(block, 'GROUP_ID', generator.ORDER_NONE) || '0';
    const userId = generator.valueToCode(block, 'USER_ID', generator.ORDER_NONE) || '0';
    return [`msg.is_group_admin(${groupId}, ${userId})`, generator.ORDER_HIGH];
  };

  // ========== URL检测与提取积木 ==========
  generator.forBlock['msg_has_url'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'EVENT', generator.ORDER_NONE) || 'event';
    return [`msg.has_url(${message})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_count_urls'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'EVENT', generator.ORDER_NONE) || 'event';
    return [`msg.count_urls(${message})`, generator.ORDER_HIGH];
  };

  generator.forBlock['msg_get_urls'] = function(block: Blockly.Block) {
    const message = generator.valueToCode(block, 'EVENT', generator.ORDER_NONE) || 'event';
    const index = generator.valueToCode(block, 'INDEX', generator.ORDER_NONE) || '0';
    // 如果index为0或空，返回所有URL；否则返回指定位置的URL
    return [`msg.get_urls(${message}, ${index})`, generator.ORDER_HIGH];
  };

  // ========== URL/域名处理积木 ==========
  generator.forBlock['url_extract_domain'] = function(block: Blockly.Block) {
    const url = generator.valueToCode(block, 'URL', generator.ORDER_NONE) || '""';
    // 标记使用 URL 工具库
    markRuntimeLibraryUsed(generator, RuntimeLibraryType.URL_UTILS);
    return [`blockly_url_utils.extract_domain(${url})`, generator.ORDER_HIGH];
  };

  generator.forBlock['url_extract_tld'] = function(block: Blockly.Block) {
    const urlOrDomain = generator.valueToCode(block, 'URL_OR_DOMAIN', generator.ORDER_NONE) || '""';
    // 标记使用 URL 工具库
    markRuntimeLibraryUsed(generator, RuntimeLibraryType.URL_UTILS);
    return [`blockly_url_utils.extract_tld(${urlOrDomain})`, generator.ORDER_HIGH];
  };

  // ========== 二维码检测与解析积木 ==========
  generator.forBlock['message_image_has_qrcode'] = function(block: Blockly.Block) {
    const image = generator.valueToCode(block, 'IMAGE', generator.ORDER_NONE) || '""';
    return [`message.image_has_qrcode(${image})`, generator.ORDER_HIGH];
  };

  generator.forBlock['message_image_count_qrcodes'] = function(block: Blockly.Block) {
    const image = generator.valueToCode(block, 'IMAGE', generator.ORDER_NONE) || '""';
    return [`message.image_count_qrcodes(${image})`, generator.ORDER_HIGH];
  };

  generator.forBlock['message_image_get_qrcodes'] = function(block: Blockly.Block) {
    const image = generator.valueToCode(block, 'IMAGE', generator.ORDER_NONE) || '""';
    const index = generator.valueToCode(block, 'INDEX', generator.ORDER_NONE) || '0';
    // 如果index为0或空，返回所有二维码内容；否则返回指定位置的二维码内容
    return [`message.image_get_qrcodes(${image}, ${index})`, generator.ORDER_HIGH];
  };
}
