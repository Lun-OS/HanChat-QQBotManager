import * as Blockly from 'blockly';
import 'blockly/blocks'; // 导入 Blockly 内置积木

/**
 * 积木颜色常量定义
 * 使用 HSL 色相值（0-360）
 */
const COLOR_HUE = {
  log: 160,      // 绿色系
  message: 210,  // 蓝色系
  event: 120,    // 浅绿色
  storage: 290,  // 紫色系
  text: 180,     // 青色
  logic: 65,     // 黄色
  advanced: 260, // 深紫色
  group: 200,    // 蓝色
  user: 280,     // 紫色
  file: 30,      // 橙色
  utils: 150,    // 绿色
  system: 330,   // 粉色
  request: 100,  // 黄绿色
  http: 60,      // 金黄色
  bot: 240,      // 靛蓝色
  math: 230,     // 蓝色
  comment: 0,    // 灰色（注释）
} as const;

/**
 * 帮助链接常量
 */
const HELP_URL = {
  event: '',
  block: '',
  type: '',
} as const;

/**
 * 输入类型常量
 */
const INPUT_TYPE = {
  STRING: 'String',
  NUMBER: 'Number',
  BOOLEAN: 'Boolean',
  ARRAY: 'Array',
  EVENT: 'Event',
  MIXED: ['Number', 'String'],
} as const;

/**
 * 布尔选项常量
 */
const BOOLEAN_OPTIONS = {
  YES_NO: [
    ['是', 'TRUE'],
    ['否', 'FALSE'],
  ],
  NO_YES: [
    ['否', 'FALSE'],
    ['是', 'TRUE'],
  ],
} as const;

/**
 * 创建标准输入参数的辅助函数
 */
function createInput(name: string, type: string | string[], check?: string) {
  return { type, name, check };
}

/**
 * 创建字符串输入
 */
function stringInput(name: string) {
  return { type: 'input_value', name, check: INPUT_TYPE.STRING };
}

/**
 * 创建数字输入
 */
function numberInput(name: string) {
  return { type: 'input_value', name, check: INPUT_TYPE.NUMBER };
}

/**
 * 创建混合类型输入（数字或字符串）
 */
function mixedInput(name: string) {
  return { type: 'input_value', name, check: INPUT_TYPE.MIXED };
}

/**
 * 创建下拉选项字段
 */
function dropdownField(name: string, options: Array<[string, string]>) {
  return { type: 'field_dropdown', name, options };
}

/**
 * 创建语句输入
 */
function statementInput(name: string) {
  return { type: 'input_statement', name };
}

/**
 * 创建标准语句积木的基础配置
 */
function createStatementBlock(
  type: string,
  message: string,
  args: any[],
  colour: number,
  tooltip: string
) {
  return {
    type,
    message0: message,
    args0: args,
    previousStatement: null,
    nextStatement: null,
    colour,
    tooltip,
    helpUrl: HELP_URL.block,
  };
}

/**
 * 创建标准输出积木的基础配置
 */
function createOutputBlock(
  type: string,
  message: string,
  args: any[],
  output: string | null,
  colour: number,
  tooltip: string
) {
  return {
    type,
    message0: message,
    args0: args,
    output,
    colour,
    tooltip,
    helpUrl: HELP_URL.block,
  };
}

const CUSTOM_BLOCKS = [
  {
    type: 'log_output',
    message0: '%{BKY_BLOCKLY_LOG_OUTPUT}',
    args0: [
      {
        type: 'field_dropdown',
        name: 'LOG_TYPE',
        options: [
          ['普通', 'info'],
          ['异常', 'error'],
          ['警告', 'warn'],
          ['调试', 'debug'],
        ],
      },
      { type: 'input_value', name: 'CONTENT', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.log,
    tooltip: '%{BKY_BLOCKLY_TOOLTIP_LOG_OUTPUT}',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'log_info',
    message0: '%{BKY_BLOCKLY_LOG_INFO}',
    args0: [{ type: 'input_value', name: 'CONTENT', check: 'String' }],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.log,
    tooltip: '%{BKY_BLOCKLY_TOOLTIP_LOG_INFO}',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'log_warn',
    message0: '%{BKY_BLOCKLY_LOG_WARN}',
    args0: [{ type: 'input_value', name: 'CONTENT', check: 'String' }],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.log,
    tooltip: '%{BKY_BLOCKLY_TOOLTIP_LOG_WARN}',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'log_error',
    message0: '%{BKY_BLOCKLY_LOG_ERROR}',
    args0: [{ type: 'input_value', name: 'CONTENT', check: 'String' }],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.log,
    tooltip: '%{BKY_BLOCKLY_TOOLTIP_LOG_ERROR}',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'log_debug',
    message0: '%{BKY_BLOCKLY_LOG_DEBUG}',
    args0: [{ type: 'input_value', name: 'CONTENT', check: 'String' }],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.log,
    tooltip: '%{BKY_BLOCKLY_TOOLTIP_LOG_DEBUG}',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'message_send_group',
    message0: '%{BKY_BLOCKLY_MESSAGE_SEND_GROUP}',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'CONTENT', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '%{BKY_BLOCKLY_TOOLTIP_MESSAGE_SEND_GROUP}',
    helpUrl: HELP_URL.type,
  },
  {
    type: 'message_send_private',
    message0: '%{BKY_BLOCKLY_MESSAGE_SEND_PRIVATE}',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'CONTENT', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '%{BKY_BLOCKLY_TOOLTIP_MESSAGE_SEND_PRIVATE}',
    helpUrl: HELP_URL.type,
  },
  {
    type: 'message_reply',
    message0: '%{BKY_BLOCKLY_MESSAGE_REPLY}',
    args0: [
      { type: 'input_value', name: 'EVENT', check: 'Event' },
      { type: 'input_value', name: 'CONTENT', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '%{BKY_BLOCKLY_TOOLTIP_MESSAGE_REPLY}',
    helpUrl: HELP_URL.type,
  },
  {
    type: 'message_get_type',
    message0: '%{BKY_BLOCKLY_MESSAGE_GET_TYPE}',
    args0: [{ type: 'input_value', name: 'EVENT', check: 'Event' }],
    output: 'String',
    colour: COLOR_HUE.message,
    tooltip: '%{BKY_BLOCKLY_TOOLTIP_MESSAGE_GET_TYPE}',
    helpUrl: HELP_URL.type,
  },
  {
    type: 'message_get_plain_text',
    message0: '%{BKY_BLOCKLY_MESSAGE_GET_PLAIN_TEXT}',
    args0: [{ type: 'input_value', name: 'EVENT', check: 'Event' }],
    output: 'String',
    colour: COLOR_HUE.message,
    tooltip: '%{BKY_BLOCKLY_TOOLTIP_MESSAGE_GET_PLAIN_TEXT}',
    helpUrl: HELP_URL.type,
  },
  {
    type: 'message_contains_keyword',
    message0: '%{BKY_BLOCKLY_MESSAGE_CONTAINS_KEYWORD}',
    args0: [
      { type: 'input_value', name: 'EVENT', check: 'Event' },
      { type: 'input_value', name: 'KEYWORD', check: 'String' },
    ],
    output: 'Boolean',
    colour: COLOR_HUE.message,
    tooltip: '%{BKY_BLOCKLY_TOOLTIP_MESSAGE_CONTAINS_KEYWORD}',
    helpUrl: HELP_URL.type,
  },
  {
    type: 'message_is_at_bot',
    message0: '%{BKY_BLOCKLY_MESSAGE_IS_AT_BOT}',
    args0: [{ type: 'input_value', name: 'EVENT', check: 'Event' }],
    output: 'Boolean',
    colour: COLOR_HUE.message,
    tooltip: '%{BKY_BLOCKLY_TOOLTIP_MESSAGE_IS_AT_BOT}',
    helpUrl: HELP_URL.type,
  },
  {
    type: 'message_get_sender_id',
    message0: '%{BKY_BLOCKLY_MESSAGE_GET_SENDER_ID}',
    args0: [{ type: 'input_value', name: 'EVENT', check: 'Event' }],
    output: 'Number',
    colour: COLOR_HUE.message,
    tooltip: '%{BKY_BLOCKLY_TOOLTIP_MESSAGE_GET_SENDER_ID}',
    helpUrl: HELP_URL.type,
  },
  {
    type: 'message_get_group_id',
    message0: '%{BKY_BLOCKLY_MESSAGE_GET_GROUP_ID}',
    args0: [{ type: 'input_value', name: 'EVENT', check: 'Event' }],
    output: 'Number',
    colour: COLOR_HUE.message,
    tooltip: '%{BKY_BLOCKLY_TOOLTIP_MESSAGE_GET_GROUP_ID}',
    helpUrl: HELP_URL.type,
  },
  {
    type: 'message_is_group_message',
    message0: '%{BKY_BLOCKLY_MESSAGE_IS_GROUP_MESSAGE}',
    args0: [{ type: 'input_value', name: 'EVENT', check: 'Event' }],
    output: 'Boolean',
    colour: COLOR_HUE.message,
    tooltip: '%{BKY_BLOCKLY_TOOLTIP_MESSAGE_IS_GROUP_MESSAGE}',
    helpUrl: HELP_URL.type,
  },
  {
    type: 'message_is_private_message',
    message0: '%{BKY_BLOCKLY_MESSAGE_IS_PRIVATE_MESSAGE}',
    args0: [{ type: 'input_value', name: 'EVENT', check: 'Event' }],
    output: 'Boolean',
    colour: COLOR_HUE.message,
    tooltip: '%{BKY_BLOCKLY_TOOLTIP_MESSAGE_IS_PRIVATE_MESSAGE}',
    helpUrl: HELP_URL.type,
  },
  {
    type: 'message_send_private_with_result',
    message0: '%{BKY_BLOCKLY_MESSAGE_SEND_PRIVATE_RESULT}',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'CONTENT', check: 'String' },
      { type: 'input_statement', name: 'ON_SUCCESS' },
      { type: 'input_statement', name: 'ON_ERROR' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '%{BKY_BLOCKLY_TOOLTIP_MESSAGE_SEND_PRIVATE_RESULT}',
    helpUrl: HELP_URL.type,
  },
  {
    type: 'message_send_group_with_result',
    message0: '%{BKY_BLOCKLY_MESSAGE_SEND_GROUP_RESULT}',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'CONTENT', check: 'String' },
      { type: 'input_statement', name: 'ON_SUCCESS' },
      { type: 'input_statement', name: 'ON_ERROR' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '%{BKY_BLOCKLY_TOOLTIP_MESSAGE_SEND_GROUP_RESULT}',
    helpUrl: HELP_URL.type,
  },
  {
    type: 'event_on_message',
    message0: '当收到消息时 存储到变量 %1 %2',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'event' },
      { type: 'input_statement', name: 'HANDLER' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '注册消息事件处理器，可将消息存储到指定变量',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'event_on_notice',
    message0: '当收到通知时 存储到变量 %1 %2',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'event' },
      { type: 'input_statement', name: 'HANDLER' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '注册通知事件处理器，可将通知数据存储到指定变量',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'event_on_request',
    message0: '当收到请求时 存储到变量 %1 %2',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'event' },
      { type: 'input_statement', name: 'HANDLER' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '注册请求事件处理器，可将请求数据存储到指定变量',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'event_on_init',
    message0: '插件初始化时 %1',
    args0: [{ type: 'input_statement', name: 'HANDLER' }],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '插件初始化时执行',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'event_on_destroy',
    message0: '插件卸载时 %1',
    args0: [{ type: 'input_statement', name: 'HANDLER' }],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '插件卸载时执行',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'event_get_event',
    message0: '%{BKY_BLOCKLY_EVENT_GET_CURRENT}',
    output: 'Event',
    colour: COLOR_HUE.event,
    tooltip: '%{BKY_BLOCKLY_TOOLTIP_EVENT_GET_CURRENT}',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'event_variable',
    message0: '事件变量 %1',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'event' },
    ],
    output: 'Event',
    colour: COLOR_HUE.event,
    tooltip: '获取事件变量',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'storage_set',
    message0: '%{BKY_BLOCKLY_STORAGE_SET}',
    args0: [
      { type: 'input_value', name: 'KEY', check: 'String' },
      { type: 'input_value', name: 'VALUE' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.storage,
    tooltip: '%{BKY_BLOCKLY_TOOLTIP_STORAGE_SET}',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'storage_get',
    message0: '从存储获取 %1 默认值 %2',
    args0: [
      { type: 'input_value', name: 'KEY', check: 'String' },
      { type: 'input_value', name: 'DEFAULT' },
    ],
    output: 'String',
    colour: COLOR_HUE.storage,
    tooltip: '从存储获取值',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'storage_delete',
    message0: '从存储删除 %1',
    args0: [
      { type: 'input_value', name: 'KEY', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.storage,
    tooltip: '从存储删除键',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'text_concat',
    message0: '%{BKY_BLOCKLY_TEXT_CONCAT}',
    args0: [
      { type: 'input_value', name: 'TEXT1', check: 'String' },
      { type: 'input_value', name: 'TEXT2', check: 'String' },
    ],
    output: 'String',
    colour: COLOR_HUE.text,
    tooltip: '%{BKY_BLOCKLY_TOOLTIP_TEXT_CONCAT}',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'text_template',
    message0: '%{BKY_BLOCKLY_TEXT_TEMPLATE}',
    args0: [{ type: 'input_value', name: 'TEMPLATE', check: 'String' }],
    output: 'String',
    colour: COLOR_HUE.text,
    tooltip: '%{BKY_BLOCKLY_TOOLTIP_TEXT_TEMPLATE}',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'logic_if_else',
    message0: '%{BKY_BLOCKLY_LOGIC_IF_ELSE}',
    args0: [
      { type: 'input_value', name: 'CONDITION', check: 'Boolean' },
      { type: 'input_statement', name: 'IF' },
      { type: 'input_statement', name: 'ELSE' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.logic,
    tooltip: '%{BKY_BLOCKLY_TOOLTIP_LOGIC_IF_ELSE}',
    helpUrl: HELP_URL.block,
  },
  // 6棱边紫色判断积木 - 用于相等比较
  {
    type: 'logic_compare_hex',
    message0: '%1 %2 %3',
    args0: [
      { type: 'input_value', name: 'A' },
      {
        type: 'field_dropdown',
        name: 'OP',
        options: [
          ['=', 'EQ'],
          ['≠', 'NEQ'],
          ['<', 'LT'],
          ['≤', 'LTE'],
          ['>', 'GT'],
          ['≥', 'GTE'],
        ],
      },
      { type: 'input_value', name: 'B' },
    ],
    inputsInline: true,
    output: 'Boolean',
    colour: 260,
    tooltip: '比较两个值是否相等',
    helpUrl: HELP_URL.block,
    // 使用outputShape属性设置六边形外观
    outputShape: 1, // 1 对应六边形
  },
  {
    type: 'api_call_with_result',
    message0: '%{BKY_BLOCKLY_API_CALL_WITH_RESULT}',
    args0: [
      { type: 'input_value', name: 'API_NAME', check: 'String' },
      { type: 'input_value', name: 'PARAM1' },
      { type: 'input_value', name: 'PARAM2' },
      { type: 'input_statement', name: 'ON_SUCCESS' },
      { type: 'input_statement', name: 'ON_ERROR' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.advanced,
    tooltip: '%{BKY_BLOCKLY_TOOLTIP_API_CALL_WITH_RESULT}',
    helpUrl: HELP_URL.block,
  },
  // ========== 群管理积木 ==========
  {
    type: 'group_set_whole_ban',
    message0: '设置群 %1 全员禁言 %2',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      {
        type: 'field_dropdown',
        name: 'ENABLE',
        options: [
          ['开启', 'TRUE'],
          ['关闭', 'FALSE'],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '设置群组全员禁言状态',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'group_set_admin',
    message0: '设置群 %1 用户 %2 为管理员 %3',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      {
        type: 'field_dropdown',
        name: 'ENABLE',
        options: [
          ['是', 'TRUE'],
          ['否', 'FALSE'],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '设置或取消群管理员',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'group_set_card',
    message0: '设置群 %1 用户 %2 的名片为 %3',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'CARD', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '设置群成员名片',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'group_kick',
    message0: '将群 %1 的用户 %2 踢出群 %3',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      {
        type: 'field_dropdown',
        name: 'REJECT',
        options: [
          ['并拒绝再次加群', 'TRUE'],
          ['', 'FALSE'],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '踢出群成员',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'group_set_ban',
    message0: '禁言群 %1 的用户 %2 时长 %3 秒',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'DURATION', check: 'Number' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '禁言群成员，时长0表示取消禁言',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'group_set_name',
    message0: '设置群 %1 的名称为 %2',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'NAME', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '设置群名称',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'group_poke',
    message0: '在群 %1 戳一戳用户 %2',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '群戳一戳',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'group_get_list',
    message0: '获取群列表',
    output: 'Array',
    colour: COLOR_HUE.group,
    tooltip: '获取机器人加入的所有群组',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'group_get_members',
    message0: '获取群 %1 的成员列表',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
    ],
    output: 'Array',
    colour: COLOR_HUE.group,
    tooltip: '获取群成员列表',
    helpUrl: HELP_URL.block,
  },
  // ========== 好友管理积木 ==========
  {
    type: 'user_get_friends',
    message0: '获取好友列表',
    output: 'Array',
    colour: COLOR_HUE.user,
    tooltip: '获取好友列表',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'user_set_remark',
    message0: '设置用户 %1 的备注为 %2',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'REMARK', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.user,
    tooltip: '设置好友备注',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'user_poke',
    message0: '戳一戳用户 %1',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.user,
    tooltip: '好友戳一戳',
    helpUrl: HELP_URL.block,
  },
  // ========== 消息操作积木 ==========
  {
    type: 'message_delete',
    message0: '撤回消息 %1',
    args0: [
      { type: 'input_value', name: 'MESSAGE_ID', check: ['Number', 'String'] },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '撤回指定消息',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'message_set_essence',
    message0: '设置消息 %1 为精华消息',
    args0: [
      { type: 'input_value', name: 'MESSAGE_ID', check: ['Number', 'String'] },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '设置精华消息',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'message_get_essence_list',
    message0: '获取群 %1 的精华消息列表',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
    ],
    output: 'Array',
    colour: COLOR_HUE.message,
    tooltip: '获取精华消息列表',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'message_send_like',
    message0: '给用户 %1 点赞 %2 次',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'TIMES', check: 'Number' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '发送好友赞，次数1-10',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'message_get_reply_id',
    message0: '获取事件 %1 的回复消息ID',
    args0: [
      { type: 'input_value', name: 'EVENT', check: 'Event' },
    ],
    output: ['Number', 'String'],
    colour: COLOR_HUE.message,
    tooltip: '获取回复的消息ID',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'message_has_image',
    message0: '事件 %1 包含图片',
    args0: [
      { type: 'input_value', name: 'EVENT', check: 'Event' },
    ],
    output: 'Boolean',
    colour: COLOR_HUE.message,
    tooltip: '检查消息是否包含图片',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'message_has_voice',
    message0: '事件 %1 包含语音',
    args0: [
      { type: 'input_value', name: 'EVENT', check: 'Event' },
    ],
    output: 'Boolean',
    colour: COLOR_HUE.message,
    tooltip: '检查消息是否包含语音',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'message_get_sender_nickname',
    message0: '获取事件 %1 发送者的昵称',
    args0: [
      { type: 'input_value', name: 'EVENT', check: 'Event' },
    ],
    output: 'String',
    colour: COLOR_HUE.message,
    tooltip: '获取发送者昵称',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'message_get_time',
    message0: '获取事件 %1 的时间戳',
    args0: [
      { type: 'input_value', name: 'EVENT', check: 'Event' },
    ],
    output: 'Number',
    colour: COLOR_HUE.message,
    tooltip: '获取消息时间戳',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'message_get_id',
    message0: '获取事件 %1 的消息ID',
    args0: [
      { type: 'input_value', name: 'EVENT', check: 'Event' },
    ],
    output: ['Number', 'String'],
    colour: COLOR_HUE.message,
    tooltip: '获取消息ID',
    helpUrl: HELP_URL.block,
  },
  // ========== 文件操作积木 ==========
  {
    type: 'file_upload_group',
    message0: '上传文件 %1 到群 %2 命名为 %3',
    args0: [
      { type: 'input_value', name: 'FILE', check: 'String' },
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'NAME', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.file,
    tooltip: '上传群文件',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'file_delete_group',
    message0: '删除群 %1 的文件 %2 (busid: %3)',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'FILE_ID', check: 'String' },
      { type: 'input_value', name: 'BUSID', check: 'Number' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.file,
    tooltip: '删除群文件',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'file_get_group_system_info',
    message0: '获取群 %1 的文件系统信息',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
    ],
    output: 'Object',
    colour: COLOR_HUE.file,
    tooltip: '获取群文件系统信息',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'file_get_group_root',
    message0: '获取群 %1 的根目录文件',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
    ],
    output: 'Array',
    colour: COLOR_HUE.file,
    tooltip: '获取群根目录文件列表',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'file_read',
    message0: '读取文件 %1',
    args0: [
      { type: 'input_value', name: 'PATH', check: 'String' },
    ],
    output: 'String',
    colour: COLOR_HUE.file,
    tooltip: '读取插件目录下的文件',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'file_write',
    message0: '写入内容 %1 到文件 %2',
    args0: [
      { type: 'input_value', name: 'CONTENT', check: 'String' },
      { type: 'input_value', name: 'PATH', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.file,
    tooltip: '写入文件到插件目录',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'file_delete',
    message0: '删除文件 %1',
    args0: [
      { type: 'input_value', name: 'PATH', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.file,
    tooltip: '删除插件目录下的文件',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'file_exists',
    message0: '文件 %1 存在',
    args0: [
      { type: 'input_value', name: 'PATH', check: 'String' },
    ],
    output: 'Boolean',
    colour: COLOR_HUE.file,
    tooltip: '检查文件是否存在',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'file_mkdir',
    message0: '创建目录 %1',
    args0: [
      { type: 'input_value', name: 'PATH', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.file,
    tooltip: '创建插件目录下的文件夹',
    helpUrl: HELP_URL.block,
  },
  // ========== 工具积木 ==========
  {
    type: 'utils_url_encode',
    message0: 'URL编码 %1',
    args0: [
      { type: 'input_value', name: 'TEXT', check: 'String' },
    ],
    output: 'String',
    colour: COLOR_HUE.utils,
    tooltip: 'URL编码字符串',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'utils_url_decode',
    message0: 'URL解码 %1',
    args0: [
      { type: 'input_value', name: 'TEXT', check: 'String' },
    ],
    output: 'String',
    colour: COLOR_HUE.utils,
    tooltip: 'URL解码字符串',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'utils_base64_encode',
    message0: 'Base64编码 %1',
    args0: [
      { type: 'input_value', name: 'TEXT', check: 'String' },
    ],
    output: 'String',
    colour: COLOR_HUE.utils,
    tooltip: 'Base64编码',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'utils_base64_decode',
    message0: 'Base64解码 %1',
    args0: [
      { type: 'input_value', name: 'TEXT', check: 'String' },
    ],
    output: 'String',
    colour: COLOR_HUE.utils,
    tooltip: 'Base64解码',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'utils_html_escape',
    message0: 'HTML转义 %1',
    args0: [
      { type: 'input_value', name: 'TEXT', check: 'String' },
    ],
    output: 'String',
    colour: COLOR_HUE.utils,
    tooltip: 'HTML实体转义',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'utils_html_unescape',
    message0: 'HTML反转义 %1',
    args0: [
      { type: 'input_value', name: 'TEXT', check: 'String' },
    ],
    output: 'String',
    colour: COLOR_HUE.utils,
    tooltip: 'HTML实体反转义',
    helpUrl: HELP_URL.block,
  },
  // ========== 系统积木 ==========
  {
    type: 'system_timestamp_seconds',
    message0: '获取当前时间戳(秒)',
    output: 'Number',
    colour: COLOR_HUE.system,
    tooltip: '获取Unix时间戳（秒）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'system_timestamp_milliseconds',
    message0: '获取当前时间戳(毫秒)',
    output: 'Number',
    colour: COLOR_HUE.system,
    tooltip: '获取Unix时间戳（毫秒）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'system_now',
    message0: '获取当前时间',
    output: 'Object',
    colour: COLOR_HUE.system,
    tooltip: '获取当前时间信息',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'system_status',
    message0: '获取系统状态',
    output: 'Object',
    colour: COLOR_HUE.system,
    tooltip: '获取系统和机器人状态',
    helpUrl: HELP_URL.block,
  },
  // ========== 请求处理积木 ==========
  {
    type: 'request_approve_friend',
    message0: '%1 好友请求 %2 备注 %3',
    args0: [
      {
        type: 'field_dropdown',
        name: 'APPROVE',
        options: [
          ['同意', 'TRUE'],
          ['拒绝', 'FALSE'],
        ],
      },
      { type: 'input_value', name: 'FLAG', check: 'String' },
      { type: 'input_value', name: 'REMARK', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.request,
    tooltip: '处理加好友请求',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'request_approve_group',
    message0: '%1 群请求 %2 原因 %3',
    args0: [
      {
        type: 'field_dropdown',
        name: 'APPROVE',
        options: [
          ['同意', 'TRUE'],
          ['拒绝', 'FALSE'],
        ],
      },
      { type: 'input_value', name: 'FLAG', check: 'String' },
      { type: 'input_value', name: 'REASON', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.request,
    tooltip: '处理加群请求',
    helpUrl: HELP_URL.block,
  },
  // ========== HTTP 请求积木 ==========
  {
    type: 'http_get',
    message0: 'HTTP GET 请求 %1',
    args0: [
      { type: 'input_value', name: 'URL', check: 'String' },
    ],
    output: 'Object',
    colour: COLOR_HUE.http,
    tooltip: '发送HTTP GET请求',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'http_post',
    message0: 'HTTP POST 请求 %1 内容 %2',
    args0: [
      { type: 'input_value', name: 'URL', check: 'String' },
      { type: 'input_value', name: 'BODY', check: 'String' },
    ],
    output: 'Object',
    colour: COLOR_HUE.http,
    tooltip: '发送HTTP POST请求',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'http_request',
    message0: 'HTTP %1 请求 %2 内容 %3',
    args0: [
      {
        type: 'field_dropdown',
        name: 'METHOD',
        options: [
          ['GET', 'GET'],
          ['POST', 'POST'],
          ['PUT', 'PUT'],
          ['DELETE', 'DELETE'],
        ],
      },
      { type: 'input_value', name: 'URL', check: 'String' },
      { type: 'input_value', name: 'BODY', check: 'String' },
    ],
    output: 'Object',
    colour: COLOR_HUE.http,
    tooltip: '发送HTTP请求',
    helpUrl: HELP_URL.block,
  },
  // ========== 机器人信息积木 ==========
  {
    type: 'bot_get_login_info',
    message0: '获取登录信息',
    output: 'Object',
    colour: COLOR_HUE.bot,
    tooltip: '获取机器人登录信息',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'bot_get_status',
    message0: '获取机器人状态',
    output: 'Object',
    colour: COLOR_HUE.bot,
    tooltip: '获取机器人状态',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'bot_get_version',
    message0: '获取版本信息',
    output: 'Object',
    colour: COLOR_HUE.bot,
    tooltip: '获取机器人版本信息',
    helpUrl: HELP_URL.block,
  },
  // ========== JSON解析积木 ==========
  {
    type: 'json_encode',
    message0: '将 %1 编码为JSON',
    args0: [
      { type: 'input_value', name: 'VALUE' },
    ],
    output: 'String',
    colour: COLOR_HUE.utils,
    tooltip: '将值编码为JSON字符串',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'json_decode',
    message0: '解析JSON %1',
    args0: [
      { type: 'input_value', name: 'JSON', check: 'String' },
    ],
    output: 'Object',
    colour: COLOR_HUE.utils,
    tooltip: '将JSON字符串解析为表',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'json_get',
    message0: '从JSON %1 中获取路径 %2 的值',
    args0: [
      { type: 'input_value', name: 'JSON', check: 'String' },
      { type: 'input_value', name: 'PATH', check: 'String' },
    ],
    output: 'Object',
    colour: COLOR_HUE.utils,
    tooltip: '使用点号路径从JSON中获取值，如 "data.name"',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'json_extract',
    message0: '从JSON %1 提取 %2',
    args0: [
      { type: 'input_value', name: 'JSON', check: 'String' },
      { type: 'input_value', name: 'PATH', check: 'String' },
    ],
    output: 'Object',
    colour: COLOR_HUE.utils,
    tooltip: '从JSON中提取值，路径格式: message[0].text 或 data.users[1].name',
    helpUrl: HELP_URL.block,
  },
  // ========== 表操作积木 ==========
  {
    type: 'table_get',
    message0: '从表 %1 中获取路径 %2 的值',
    args0: [
      { type: 'input_value', name: 'TABLE', check: 'Object' },
      { type: 'input_value', name: 'PATH', check: 'String' },
    ],
    output: 'Object',
    colour: COLOR_HUE.utils,
    tooltip: '使用点号路径从表中获取值，如 "user.name"',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'table_set',
    message0: '在表 %1 的路径 %2 设置值 %3',
    args0: [
      { type: 'input_value', name: 'TABLE', check: 'Object' },
      { type: 'input_value', name: 'PATH', check: 'String' },
      { type: 'input_value', name: 'VALUE' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.utils,
    tooltip: '使用点号路径在表中设置值，如 "user.name"',
    helpUrl: HELP_URL.block,
  },
  // ========== 消息处理积木（新设计） ==========
  {
    type: 'current_message',
    message0: '当前消息',
    output: 'Message',
    colour: COLOR_HUE.message,
    tooltip: '获取当前收到的完整消息对象',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_get_field',
    message0: '获取消息 %1 的 %2',
    args0: [
      { type: 'input_value', name: 'MESSAGE', check: 'Message' },
      { type: 'field_dropdown', name: 'FIELD', options: [
        ['消息类型', 'message_type'],
        ['发送者ID', 'user_id'],
        ['群ID', 'group_id'],
        ['消息ID', 'message_id'],
        ['原始消息内容', 'raw_message'],
        ['发送者昵称', 'sender.nickname'],
        ['发送者群名片', 'sender.card'],
        ['发送者角色', 'sender.role'],
        ['消息时间', 'time'],
      ]},
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '获取消息对象的指定字段值',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_parse_path',
    message0: '从消息 %1 中获取路径 %2 的值',
    args0: [
      { type: 'input_value', name: 'MESSAGE', check: 'Message' },
      { type: 'input_value', name: 'PATH', check: 'String' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '使用点号路径获取消息中的值，如 sender.nickname',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_reply_private',
    message0: '回复私聊消息 用户 %1 引用消息 %2 内容 %3',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'MESSAGE_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'CONTENT', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '回复私聊消息，可引用原消息',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_reply_group',
    message0: '回复群消息 群 %1 引用消息 %2 内容 %3',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'MESSAGE_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'CONTENT', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '回复群消息，可引用原消息',
    helpUrl: HELP_URL.block,
  },
  // ========== 类型转换积木 ==========
  {
    type: 'convert_to_string',
    message0: '将 %1 转为字符串',
    args0: [
      { type: 'input_value', name: 'VALUE' },
    ],
    output: 'String',
    colour: COLOR_HUE.utils,
    tooltip: '将任意值转换为字符串',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'convert_to_number',
    message0: '将 %1 转为数字',
    args0: [
      { type: 'input_value', name: 'VALUE' },
    ],
    output: 'Number',
    colour: COLOR_HUE.utils,
    tooltip: '将字符串或其他值转换为数字',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'table_to_json',
    message0: '将表 %1 转为JSON字符串',
    args0: [
      { type: 'input_value', name: 'TABLE', check: 'Object' },
    ],
    output: 'String',
    colour: COLOR_HUE.utils,
    tooltip: '将Lua表转换为JSON字符串，方便日志输出',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'is_type',
    message0: '%1 是 %2 类型',
    args0: [
      { type: 'input_value', name: 'VALUE' },
      { type: 'field_dropdown', name: 'TYPE', options: [
        ['字符串', 'string'],
        ['数字', 'number'],
        ['表', 'table'],
        ['布尔', 'boolean'],
        ['空值', 'nil'],
      ]},
    ],
    output: 'Boolean',
    colour: COLOR_HUE.utils,
    tooltip: '检查值的类型',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'safe_get',
    message0: '安全获取 %1 的 %2 默认值 %3',
    args0: [
      { type: 'input_value', name: 'TABLE', check: 'Object' },
      { type: 'input_value', name: 'KEY', check: 'String' },
      { type: 'input_value', name: 'DEFAULT' },
    ],
    output: null,
    colour: COLOR_HUE.utils,
    tooltip: '安全获取表的值，如果键不存在返回默认值',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'concat_strings',
    message0: '连接字符串 %1 和 %2',
    args0: [
      { type: 'input_value', name: 'A', check: 'String' },
      { type: 'input_value', name: 'B', check: 'String' },
    ],
    output: 'String',
    colour: COLOR_HUE.text,
    tooltip: '连接两个字符串',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'format_number',
    message0: '格式化数字 %1 保留 %2 位小数',
    args0: [
      { type: 'input_value', name: 'NUMBER', check: 'Number' },
      { type: 'input_value', name: 'DECIMALS', check: 'Number' },
    ],
    output: 'String',
    colour: COLOR_HUE.math,
    tooltip: '格式化数字为指定小数位数的字符串',
    helpUrl: HELP_URL.block,
  },
  // ========== 消息获取积木 ==========
  {
    type: 'msg_get_simple_field',
    message0: '获取消息 %1 的 %2',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
      {
        type: 'field_dropdown',
        name: 'FIELD',
        options: [
          ['消息类型', 'message_type'],
          ['发送者ID', 'user_id'],
          ['群ID', 'group_id'],
          ['消息ID', 'message_id'],
          ['消息内容', 'raw_message'],
          ['发送者昵称', 'sender.nickname'],
          ['发送者群名片', 'sender.card'],
          ['发送者角色', 'sender.role'],
          ['消息时间', 'time'],
          ['是否包含图片', 'has_image'],
          ['是否包含语音', 'has_voice'],
          ['是否@机器人', 'is_at_bot'],
        ],
      },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '获取消息对象的常用字段，无需了解JSON路径语法',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_get_text_content',
    message0: '获取消息 %1 的纯文本内容',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '获取消息中的纯文本（去除CQ码）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_contains_text',
    message0: '消息 %1 包含文字 %2',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
      { type: 'input_value', name: 'TEXT' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '检查消息中是否包含指定文字',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_contains_keyword',
    message0: '消息 %1 包含关键词 %2',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
      { type: 'input_value', name: 'KEYWORD' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '检查消息中是否包含指定关键词',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_is_group',
    message0: '消息 %1 是群消息',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '检查消息是否为群消息',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_is_private',
    message0: '消息 %1 是私聊消息',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '检查消息是否为私聊消息',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_is_type',
    message0: '消息 %1 的类型是 %2',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
      {
        type: 'field_dropdown',
        name: 'TYPE',
        options: [
          ['私聊', 'private'],
          ['群聊', 'group'],
          ['频道', 'channel'],
        ],
      },
    ],
    output: 'Boolean',
    colour: COLOR_HUE.message,
    tooltip: '判断消息类型是否为指定类型',
    helpUrl: HELP_URL.block,
  },
  // ========== 消息高级获取积木 ==========
  {
    type: 'msg_get_images',
    message0: '获取消息 %1 中的所有图片',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '获取消息中所有图片的URL列表',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_get_first_image',
    message0: '获取消息 %1 中的第一张图片URL',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '获取消息中第一张图片的URL，如果没有图片则返回nil',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_get_at_users',
    message0: '获取消息 %1 中@的用户列表',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '获取消息中@的所有用户ID列表',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_get_reply_info',
    message0: '获取消息 %1 回复的信息',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '获取消息回复的信息（如果被回复的消息存在）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_get_sender_id',
    message0: '获取消息 %1 的发送者ID',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '获取消息发送者的QQ号',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_get_sender_nickname',
    message0: '获取消息 %1 的发送者昵称',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '获取消息发送者的昵称',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_get_group_id',
    message0: '获取消息 %1 的群ID',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '获取群消息的群号',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_get_time',
    message0: '获取消息 %1 的时间戳',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '获取消息发送的时间戳',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_get_reply_id',
    message0: '获取消息 %1 回复的消息ID',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '获取被回复消息的消息ID',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_get_message_type',
    message0: '获取消息 %1 的消息类型',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '获取消息类型：text、image、face、at、reply、json等',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_has_image',
    message0: '消息 %1 包含图片',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '检查消息是否包含图片',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_has_voice',
    message0: '消息 %1 包含语音',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '检查消息是否包含语音',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_has_video',
    message0: '消息 %1 包含视频',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '检查消息是否包含视频',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_has_face',
    message0: '消息 %1 包含表情',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '检查消息是否包含表情',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_is_at_bot',
    message0: '消息 %1 @了机器人',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '检查消息是否@了机器人',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_is_at_all',
    message0: '消息 %1 @了所有人',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '检查消息是否@了所有人',
    helpUrl: HELP_URL.block,
  },
  // ========== HTTP下载积木 ==========
  {
    type: 'http_download_base64',
    message0: '下载文件 %1 转为Base64存入 %2',
    args0: [
      { type: 'input_value', name: 'URL', check: 'String' },
      { type: 'field_variable', name: 'VAR', variable: 'base64data' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.http,
    tooltip: '下载文件并转为Base64编码存入变量，可用于发送图片',
    helpUrl: HELP_URL.block,
  },
  // ========== 消息回复积木 ==========
  {
    type: 'message_reply_private',
    message0: '回复私聊消息 用户ID %1 引用消息ID %2 内容 %3',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'MESSAGE_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'CONTENT', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '回复私聊消息，可指定引用消息ID',
    helpUrl: HELP_URL.type,
  },
  {
    type: 'message_reply_group',
    message0: '回复群消息 群ID %1 引用消息ID %2 内容 %3',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'MESSAGE_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'CONTENT', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '回复群消息，可指定引用消息ID',
    helpUrl: HELP_URL.type,
  },
  // ========== 消息发送带变量积木 ==========
  {
    type: 'message_send_group_with_var',
    message0: '发送群消息 群号 %1 内容 %2 返回值存入 %3',
    args0: [
      { type: 'input_value', name: 'GROUP_ID' },
      { type: 'input_value', name: 'CONTENT' },
      { type: 'field_variable', name: 'VAR', variable: 'result' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '发送群消息并将API返回的JSON结果存入变量',
    helpUrl: HELP_URL.type,
  },
  {
    type: 'message_send_private_with_var',
    message0: '发送私聊消息 用户 %1 内容 %2 返回值存入 %3',
    args0: [
      { type: 'input_value', name: 'USER_ID' },
      { type: 'input_value', name: 'CONTENT' },
      { type: 'field_variable', name: 'VAR', variable: 'result' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '发送私聊消息并将API返回的JSON结果存入变量',
    helpUrl: HELP_URL.type,
  },
  // ========== Base64图片发送积木 ==========
  {
    type: 'send_group_image_base64',
    message0: '发送Base64图片到群 %1 图片数据 %2',
    args0: [
      { type: 'input_value', name: 'GROUP_ID' },
      { type: 'input_value', name: 'BASE64' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '发送Base64编码的图片到群',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'send_private_image_base64',
    message0: '发送Base64图片到用户 %1 图片数据 %2',
    args0: [
      { type: 'input_value', name: 'USER_ID' },
      { type: 'input_value', name: 'BASE64' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '发送Base64编码的图片到私聊',
    helpUrl: HELP_URL.block,
  },
  // ========== OneBot API 积木 - 消息查询 ==========
  {
    type: 'onebot_get_msg',
    message0: '获取消息详情 消息ID %1',
    args0: [
      { type: 'input_value', name: 'MESSAGE_ID', check: ['Number', 'String'] },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '获取指定消息的详细信息',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_forward_msg',
    message0: '获取转发消息详情 消息ID %1',
    args0: [
      { type: 'input_value', name: 'MESSAGE_ID', check: 'String' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '获取合并转发消息的详细内容',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_group_msg_history',
    message0: '获取群历史消息 群号 %1 数量 %2',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'COUNT', check: 'Number' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '获取群组的历史消息记录',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_friend_msg_history',
    message0: '获取好友历史消息 QQ %1 数量 %2',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'COUNT', check: 'Number' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '获取与好友的历史消息记录',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_image',
    message0: '获取图片详情 文件名 %1',
    args0: [
      { type: 'input_value', name: 'FILE', check: 'String' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '获取消息中图片的详细信息',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_record',
    message0: '获取语音详情 文件名 %1',
    args0: [
      { type: 'input_value', name: 'FILE', check: 'String' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '获取语音消息的详细信息',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_file',
    message0: '获取文件详情 文件名 %1',
    args0: [
      { type: 'input_value', name: 'FILE', check: 'String' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '获取消息中文件的详细信息',
    helpUrl: HELP_URL.block,
  },
  // ========== OneBot API 积木 - 消息操作 ==========
  {
    type: 'onebot_forward_group_single_msg',
    message0: '转发单条群消息 消息ID %1 到群 %2',
    args0: [
      { type: 'input_value', name: 'MESSAGE_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '将单条消息转发到指定群组',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_forward_friend_single_msg',
    message0: '转发单条好友消息 消息ID %1 到用户 %2',
    args0: [
      { type: 'input_value', name: 'MESSAGE_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '将单条消息转发给指定好友',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_mark_msg_as_read',
    message0: '标记消息已读 消息ID %1',
    args0: [
      { type: 'input_value', name: 'MESSAGE_ID', check: ['Number', 'String'] },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '将指定消息标记为已读',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_set_msg_emoji_like',
    message0: '表情回应消息 消息ID %1 表情ID %2',
    args0: [
      { type: 'input_value', name: 'MESSAGE_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'EMOJI_ID', check: 'Number' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '对消息进行表情回应',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_unset_msg_emoji_like',
    message0: '取消表情回应 消息ID %1 表情ID %2',
    args0: [
      { type: 'input_value', name: 'MESSAGE_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'EMOJI_ID', check: 'Number' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '取消对消息的表情回应',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_delete_essence_msg',
    message0: '删除精华消息 消息ID %1',
    args0: [
      { type: 'input_value', name: 'MESSAGE_ID', check: ['Number', 'String'] },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '从群精华消息中删除指定消息',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_voice_msg_to_text',
    message0: '语音转文字 消息ID %1',
    args0: [
      { type: 'input_value', name: 'MESSAGE_ID', check: ['Number', 'String'] },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '将语音消息转换为文字',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_send_group_ai_record',
    message0: '发送群AI语音 群号 %1 文本 %2 角色 %3',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'TEXT', check: 'String' },
      { type: 'input_value', name: 'CHARACTER', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '使用AI语音发送群消息',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_ai_characters',
    message0: '获取AI语音角色列表 群号 %1',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '获取群AI语音可用的角色列表',
    helpUrl: HELP_URL.block,
  },
  // ========== OneBot API 积木 - 群组信息 ==========
  {
    type: 'onebot_get_group_info',
    message0: '获取群信息 群号 %1',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
    ],
    output: null,
    colour: COLOR_HUE.group,
    tooltip: '获取群组的详细信息',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_group_member_info',
    message0: '获取群成员信息 群号 %1 QQ %2',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
    ],
    output: null,
    colour: COLOR_HUE.group,
    tooltip: '获取群成员的详细信息',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_group_honor_info',
    message0: '获取群荣誉信息 群号 %1 类型 %2',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'field_dropdown', name: 'TYPE', options: [['全部', 'all'], ['龙王', 'talkative'], ['群聊之火', 'performer'], ['群聊炽焰', 'legend'], ['冒尖小春笋', 'strong_newbie'], ['快乐之源', 'emotion']] },
    ],
    output: null,
    colour: COLOR_HUE.group,
    tooltip: '获取群荣誉信息',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_group_system_msg',
    message0: '获取群系统消息',
    output: null,
    colour: COLOR_HUE.group,
    tooltip: '获取群系统消息列表',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_group_at_all_remain',
    message0: '获取群@全体成员剩余次数 群号 %1',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
    ],
    output: null,
    colour: COLOR_HUE.group,
    tooltip: '获取群组中@全体成员的剩余次数',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_group_shut_list',
    message0: '获取群禁言列表 群号 %1',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
    ],
    output: null,
    colour: COLOR_HUE.group,
    tooltip: '获取群组中被禁言的成员列表',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_group_ignore_add_request',
    message0: '获取已过滤的加群通知 群号 %1',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
    ],
    output: null,
    colour: COLOR_HUE.group,
    tooltip: '获取已被过滤的加群请求通知',
    helpUrl: HELP_URL.block,
  },
  // ========== OneBot API 积木 - 群管理 ==========
  {
    type: 'onebot_set_group_leave',
    message0: '退出群 群号 %1',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '退出指定群组',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_set_group_special_title',
    message0: '设置群头衔 群号 %1 QQ %2 头衔 %3',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'SPECIAL_TITLE', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '设置群成员的专属头衔',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_set_group_remark',
    message0: '设置群备注 群号 %1 备注 %2',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'REMARK', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '设置群备注名称',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_set_group_msg_mask',
    message0: '设置群消息接收方式 群号 %1 方式 %2',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'MASK', check: 'Number' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '设置群组消息接收方式',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_send_group_sign',
    message0: '群打卡 群号 %1',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '在群组中发送打卡',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_batch_delete_group_member',
    message0: '批量踢出群成员 群号 %1 QQ列表 %2',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'USER_IDS', check: 'Array' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '批量踢出群成员',
    helpUrl: HELP_URL.block,
  },
  // ========== OneBot API 积木 - 群公告 ==========
  {
    type: 'onebot_get_group_notice',
    message0: '获取群公告 群号 %1',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
    ],
    output: null,
    colour: COLOR_HUE.group,
    tooltip: '获取群公告列表',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_send_group_notice',
    message0: '发送群公告 群号 %1 内容 %2 图片 %3 置顶 %4 需确认 %5',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'CONTENT', check: 'String' },
      { type: 'input_value', name: 'IMAGE', check: 'String' },
      { type: 'field_dropdown', name: 'PINNED', options: [['否', 'FALSE'], ['是', 'TRUE']] },
      { type: 'field_dropdown', name: 'CONFIRM_REQUIRED', options: [['是', 'TRUE'], ['否', 'FALSE']] },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '发送群公告',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_delete_group_notice',
    message0: '删除群公告 群号 %1 公告ID %2',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'NOTICE_ID', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '删除指定的群公告',
    helpUrl: HELP_URL.block,
  },
  // ========== OneBot API 积木 - 群相册 ==========
  {
    type: 'onebot_get_group_album_list',
    message0: '获取群相册列表 群号 %1',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
    ],
    output: null,
    colour: COLOR_HUE.group,
    tooltip: '获取群相册列表',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_create_group_album',
    message0: '创建群相册 群号 %1 名称 %2 描述 %3',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'NAME', check: 'String' },
      { type: 'input_value', name: 'DESC', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '创建新的群相册',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_delete_group_album',
    message0: '删除群相册 群号 %1 相册ID %2',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'ALBUM_ID', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '删除指定的群相册',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_upload_group_album',
    message0: '上传群相册 群号 %1 相册ID %2 文件列表 %3',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'ALBUM_ID', check: 'String' },
      { type: 'input_value', name: 'FILES', check: 'Array' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '上传图片到群相册',
    helpUrl: HELP_URL.block,
  },
  // ========== OneBot API 积木 - 好友管理 ==========
  {
    type: 'onebot_get_stranger_info',
    message0: '获取陌生人信息 QQ %1',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
    ],
    output: null,
    colour: COLOR_HUE.user,
    tooltip: '获取陌生人的详细信息',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_friend_list',
    message0: '获取好友列表',
    output: null,
    colour: COLOR_HUE.user,
    tooltip: '获取好友列表',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_friends_with_category',
    message0: '获取好友列表(带分组)',
    output: null,
    colour: COLOR_HUE.user,
    tooltip: '获取带分组信息的好友列表',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_delete_friend',
    message0: '删除好友 QQ %1',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.user,
    tooltip: '删除指定好友',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_set_friend_remark',
    message0: '设置好友备注 QQ %1 备注 %2',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'REMARK', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.user,
    tooltip: '设置好友备注名称',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_set_friend_category',
    message0: '移动好友分组 QQ %1 分组ID %2',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'CATEGORY_ID', check: 'Number' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.user,
    tooltip: '将好友移动到指定分组',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_profile_like',
    message0: '获取我赞过的列表 起始 %1 数量 %2',
    args0: [
      { type: 'input_value', name: 'START', check: 'Number' },
      { type: 'input_value', name: 'COUNT', check: 'Number' },
    ],
    output: null,
    colour: COLOR_HUE.user,
    tooltip: '获取我赞过谁的用户列表',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_profile_like_me',
    message0: '获取赞过我的列表 起始 %1 数量 %2',
    args0: [
      { type: 'input_value', name: 'START', check: 'Number' },
      { type: 'input_value', name: 'COUNT', check: 'Number' },
    ],
    output: null,
    colour: COLOR_HUE.user,
    tooltip: '获取谁赞过我的用户列表',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_qq_avatar',
    message0: '获取头像 QQ %1 群号 %2',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
    ],
    output: null,
    colour: COLOR_HUE.user,
    tooltip: '获取QQ用户或QQ群的头像URL',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_set_qq_avatar',
    message0: '设置个人头像 文件 %1',
    args0: [
      { type: 'input_value', name: 'FILE', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.user,
    tooltip: '设置当前登录号的头像',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_set_qq_profile',
    message0: '设置个人资料 昵称 %1 说明 %2',
    args0: [
      { type: 'input_value', name: 'NICKNAME', check: 'String' },
      { type: 'input_value', name: 'PERSONAL_NOTE', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.user,
    tooltip: '设置登录号的个人资料',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_robot_uin_range',
    message0: '获取官方机器人QQ号范围',
    output: null,
    colour: COLOR_HUE.user,
    tooltip: '获取官方机器人QQ号的范围',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_friend_poke',
    message0: '好友戳一戳 QQ %1',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.user,
    tooltip: '双击好友头像戳一戳',
    helpUrl: HELP_URL.block,
  },
  // ========== OneBot API 积木 - 请求处理 ==========
  {
    type: 'onebot_set_friend_add_request',
    message0: '处理好友请求 Flag %1 同意 %2 备注 %3',
    args0: [
      { type: 'input_value', name: 'FLAG', check: 'String' },
      { type: 'field_dropdown', name: 'APPROVE', options: [['是', 'TRUE'], ['否', 'FALSE']] },
      { type: 'input_value', name: 'REMARK', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.request,
    tooltip: '处理加好友请求',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_set_group_add_request',
    message0: '处理加群请求 Flag %1 同意 %2 原因 %3',
    args0: [
      { type: 'input_value', name: 'FLAG', check: 'String' },
      { type: 'field_dropdown', name: 'APPROVE', options: [['是', 'TRUE'], ['否', 'FALSE']] },
      { type: 'input_value', name: 'REASON', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.request,
    tooltip: '处理加群请求',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_doubt_friends_add_request',
    message0: '获取被过滤好友请求 数量 %1',
    args0: [
      { type: 'input_value', name: 'COUNT', check: 'Number' },
    ],
    output: null,
    colour: COLOR_HUE.request,
    tooltip: '获取被系统过滤的好友请求',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_set_doubt_friends_add_request',
    message0: '处理被过滤好友请求 Flag %1',
    args0: [
      { type: 'input_value', name: 'FLAG', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.request,
    tooltip: '处理被过滤的好友请求',
    helpUrl: HELP_URL.block,
  },
  // ========== OneBot API 积木 - 文件操作 ==========
  {
    type: 'onebot_upload_group_file',
    message0: '上传群文件 群号 %1 文件 %2 名称 %3 文件夹ID %4',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'FILE', check: 'String' },
      { type: 'input_value', name: 'NAME', check: 'String' },
      { type: 'input_value', name: 'FOLDER_ID', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.file,
    tooltip: '上传文件到群文件',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_upload_private_file',
    message0: '上传私聊文件 QQ %1 文件 %2 名称 %3',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'FILE', check: 'String' },
      { type: 'input_value', name: 'NAME', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.file,
    tooltip: '上传文件到私聊',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_delete_group_file',
    message0: '删除群文件 群号 %1 文件ID %2',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'FILE_ID', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.file,
    tooltip: '删除群文件',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_delete_group_folder',
    message0: '删除群文件夹 群号 %1 文件夹ID %2',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'FOLDER_ID', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.file,
    tooltip: '删除群文件夹',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_create_group_file_folder',
    message0: '创建群文件夹 群号 %1 名称 %2',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'NAME', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.file,
    tooltip: '在群文件中创建文件夹',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_rename_group_file_folder',
    message0: '重命名群文件夹 群号 %1 文件夹ID %2 新名称 %3',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'FOLDER_ID', check: 'String' },
      { type: 'input_value', name: 'NEW_FOLDER_NAME', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.file,
    tooltip: '重命名群文件夹',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_move_group_file',
    message0: '移动群文件 群号 %1 文件ID %2 目标目录 %3',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'FILE_ID', check: 'String' },
      { type: 'input_value', name: 'TARGET_DIRECTORY', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.file,
    tooltip: '移动群文件到指定目录',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_set_group_file_forever',
    message0: '群文件转永久 群号 %1 文件ID %2',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'FILE_ID', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.file,
    tooltip: '将临时群文件转为永久文件',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_group_file_url',
    message0: '获取群文件链接 群号 %1 文件ID %2',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'FILE_ID', check: 'String' },
    ],
    output: null,
    colour: COLOR_HUE.file,
    tooltip: '获取群文件的下载链接',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_private_file_url',
    message0: '获取私聊文件链接 文件ID %1',
    args0: [
      { type: 'input_value', name: 'FILE_ID', check: 'String' },
    ],
    output: null,
    colour: COLOR_HUE.file,
    tooltip: '获取私聊文件的下载链接',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_flash_file_info',
    message0: '获取闪传文件信息 分享链接 %1 文件集ID %2',
    args0: [
      { type: 'input_value', name: 'SHARE_LINK', check: 'String' },
      { type: 'input_value', name: 'FILE_SET_ID', check: 'String' },
    ],
    output: null,
    colour: COLOR_HUE.file,
    tooltip: '获取闪传文件的详细信息',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_download_file',
    message0: '下载文件 链接 %1 名称 %2',
    args0: [
      { type: 'input_value', name: 'URL', check: 'String' },
      { type: 'input_value', name: 'NAME', check: 'String' },
    ],
    output: null,
    colour: COLOR_HUE.file,
    tooltip: '下载文件到缓存目录',
    helpUrl: HELP_URL.block,
  },
  // ========== OneBot API 积木 - 系统 ==========
  {
    type: 'onebot_get_login_info',
    message0: '获取登录信息',
    output: null,
    colour: COLOR_HUE.system,
    tooltip: '获取当前登录号的信息',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_version_info',
    message0: '获取版本信息',
    output: null,
    colour: COLOR_HUE.system,
    tooltip: '获取OneBot实现的版本信息',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_status',
    message0: '获取运行状态',
    output: null,
    colour: COLOR_HUE.system,
    tooltip: '获取机器人的运行状态',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_cookies',
    message0: '获取Cookies 域名 %1',
    args0: [
      { type: 'input_value', name: 'DOMAIN', check: 'String' },
    ],
    output: null,
    colour: COLOR_HUE.system,
    tooltip: '获取指定域名的Cookies',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_rkey',
    message0: '获取图片RKey',
    output: null,
    colour: COLOR_HUE.system,
    tooltip: '获取图片RKey',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_set_online_status',
    message0: '设置在线状态 状态 %1 扩展状态 %2 电量 %3',
    args0: [
      { type: 'input_value', name: 'STATUS', check: 'Number' },
      { type: 'input_value', name: 'EXT_STATUS', check: 'Number' },
      { type: 'input_value', name: 'BATTERY_STATUS', check: 'Number' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.system,
    tooltip: '设置机器人的在线状态',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_set_restart',
    message0: '重启OneBot',
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.system,
    tooltip: '重启OneBot服务',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_clean_cache',
    message0: '清理缓存',
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.system,
    tooltip: '清理缓存数据',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_scan_qrcode',
    message0: '扫描二维码 文件 %1',
    args0: [
      { type: 'input_value', name: 'FILE', check: 'String' },
    ],
    output: null,
    colour: COLOR_HUE.system,
    tooltip: '扫描图片中的二维码',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_ocr_image',
    message0: '图片OCR 图片 %1',
    args0: [
      { type: 'input_value', name: 'IMAGE', check: 'String' },
    ],
    output: null,
    colour: COLOR_HUE.system,
    tooltip: '对图片进行OCR文字识别',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_fetch_custom_face',
    message0: '获取收藏表情',
    output: null,
    colour: COLOR_HUE.system,
    tooltip: '获取收藏的表情列表',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_recommend_face',
    message0: '获取推荐表情 关键词 %1',
    args0: [
      { type: 'input_value', name: 'WORD', check: 'String' },
    ],
    output: null,
    colour: COLOR_HUE.system,
    tooltip: '根据关键词获取推荐表情',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_send_pb',
    message0: '发送Protobuf 命令 %1 数据 %2',
    args0: [
      { type: 'input_value', name: 'CMD', check: 'String' },
      { type: 'input_value', name: 'HEX', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.system,
    tooltip: '发送自定义Protobuf数据包',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_check_url_safely',
    message0: '检查链接安全 链接 %1',
    args0: [
      { type: 'input_value', name: 'URL', check: 'String' },
    ],
    output: null,
    colour: COLOR_HUE.system,
    tooltip: '检查URL链接的安全性',
    helpUrl: HELP_URL.block,
  },
  // ========== 注释积木 ==========
  {
    type: 'comment_text',
    message0: '-- %1',
    args0: [
      {
        type: 'field_input',
        name: 'COMMENT',
        text: '注释内容',
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.comment,
    tooltip: '文本注释，不会执行任何代码',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'comment_block',
    message0: '注释块 %1 %2',
    args0: [
      {
        type: 'field_input',
        name: 'COMMENT',
        text: '注释说明',
      },
      {
        type: 'input_statement',
        name: 'BODY',
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.comment,
    tooltip: '将一段代码块注释掉（不会执行）',
    helpUrl: HELP_URL.block,
  },
  // ========== 换行符积木 ==========
  {
    type: 'text_newline',
    message0: '换行符',
    output: 'String',
    colour: COLOR_HUE.text,
    tooltip: '换行符\\n，用于在文本中插入换行',
    helpUrl: HELP_URL.block,
  },
  // ========== 连接文本积木 - 三个输入 ==========
  {
    type: 'text_concat_three',
    message0: '连接文本 %1 %2 %3',
    args0: [
      { type: 'input_value', name: 'TEXT1', check: 'String' },
      { type: 'input_value', name: 'TEXT2', check: 'String' },
      { type: 'input_value', name: 'TEXT3', check: 'String' },
    ],
    inputsInline: true,
    output: 'String',
    colour: COLOR_HUE.text,
    tooltip: '将三个文本连接成一个文本',
    helpUrl: HELP_URL.block,
  },
  // ========== 连接文本积木 - 四个输入 ==========
  {
    type: 'text_concat_four',
    message0: '连接文本 %1 %2 %3 %4',
    args0: [
      { type: 'input_value', name: 'TEXT1', check: 'String' },
      { type: 'input_value', name: 'TEXT2', check: 'String' },
      { type: 'input_value', name: 'TEXT3', check: 'String' },
      { type: 'input_value', name: 'TEXT4', check: 'String' },
    ],
    inputsInline: true,
    output: 'String',
    colour: COLOR_HUE.text,
    tooltip: '将四个文本连接成一个文本',
    helpUrl: HELP_URL.block,
  },
  // ========== 多行文本输入积木 ==========
  // {
  //   type: 'text_multiline',
  //   message0: '多行文本 %1',
  //   args0: [
  //     {
  //       type: 'field_multilinetext',
  //       name: 'TEXT',
  //       text: '在此输入多行文本\\n支持换行',
  //     },
  //   ],
  //   output: 'String',
  //   colour: COLOR_HUE.text,
  //   tooltip: '多行文本输入，支持直接输入换行',
  //   helpUrl: HELP_URL.block,
  // },
];

let registered = false;

export function defineCustomBlocks(): void {
  if (registered) {
    return;
  }
  Blockly.common.defineBlocksWithJsonArray(CUSTOM_BLOCKS);
  
  // 为 logic_compare_hex 设置6棱边形状
  const hexBlock = Blockly.Blocks['logic_compare_hex'];
  if (hexBlock) {
    const originalInit = hexBlock.init;
    hexBlock.init = function() {
      originalInit.call(this);
      // 设置输出形状为六边形 (使用Blockly的常量)
      this.setOutput(true, 'Boolean');
    };
  }
  
  registered = true;
}
