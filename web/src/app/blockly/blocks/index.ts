import * as Blockly from 'blockly';
import 'blockly/blocks';
import { multilineEditorBridge } from '../multilineEditorBridge';

class FieldMultilineText extends Blockly.FieldTextInput {
  static CUSTOM_FIELD = true;

  constructor(opt_value?: string, opt_validator?: any) {
    super(opt_value, opt_validator);
  }

  static fromJson(options: any): FieldMultilineText {
    return new FieldMultilineText(options['text']);
  }

  showEditor_(): void {
    const value = this.getValue() || '';
    multilineEditorBridge.openEditor(value, this, 'lua');
  }

  protected doClassValidation_(newValue: any): string | null {
    if (newValue === null) {
      return null;
    }
    return String(newValue);
  }

  protected updateText_(): void {
    const text = this.getText();
    let displayText = text;
    if (text) {
      const lines = text.split('\n');
      if (lines.length > 1) {
        displayText = lines[0] + '...';
      }
      if (displayText.length > 30) {
        displayText = displayText.substring(0, 30) + '...';
      }
    }
    this.setText_?.(displayText || '(点击编辑)');
  }
}

Blockly.fieldRegistry.register('field_multilinetext', FieldMultilineText);

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
  database: 75,  // 绿色系（数据库）
  time: 120,     // 浅绿色（时间）
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
    message0: '输出 %1 日志 %2',
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
      { type: 'input_value', name: 'CONTENT', check: null },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.log,
    tooltip: '介绍：输出日志信息到控制台，支持普通、异常、警告、调试四种级别\n输入：内容 - 任意类型数据（字符串、数字、布尔值、表/JSON、二进制数据等），表类型自动转为JSON字符串，二进制自动转为Base64编码\n输出：无',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'log_info',
    message0: '输出普通日志 %1',
    args0: [{ type: 'input_value', name: 'CONTENT', check: null }],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.log,
    tooltip: '介绍：输出普通级别日志（log.info）\n输入：内容 - 任意类型数据（字符串、数字、布尔值、表/JSON、二进制数据等），表类型自动转为JSON字符串，二进制自动转为Base64编码\n输出：无',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'log_warn',
    message0: '输出警告日志 %1',
    args0: [{ type: 'input_value', name: 'CONTENT', check: null }],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.log,
    tooltip: '介绍：输出警告级别日志（log.warn）\n输入：内容 - 任意类型数据（字符串、数字、布尔值、表/JSON、二进制数据等），表类型自动转为JSON字符串，二进制自动转为Base64编码\n输出：无',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'log_error',
    message0: '输出异常日志 %1',
    args0: [{ type: 'input_value', name: 'CONTENT', check: null }],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.log,
    tooltip: '介绍：输出错误级别日志（log.error）\n输入：内容 - 任意类型数据（字符串、数字、布尔值、表/JSON、二进制数据等），表类型自动转为JSON字符串，二进制自动转为Base64编码\n输出：无',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'log_debug',
    message0: '输出调试日志 %1',
    args0: [{ type: 'input_value', name: 'CONTENT', check: null }],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.log,
    tooltip: '介绍：输出调试级别日志（log.debug）\n输入：内容 - 任意类型数据（字符串、数字、布尔值、表/JSON、二进制数据等），表类型自动转为JSON字符串，二进制自动转为Base64编码\n输出：无',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'message_send_group',
    message0: '发送群消息 群号 %1 内容 %2',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'CONTENT', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：发送群聊消息到指定群组\n输入：群号 - 数字或字符串；内容 - 字符串\n输出：无',
    helpUrl: HELP_URL.type,
  },
  {
    type: 'message_send_private',
    message0: '发送私聊消息 用户 %1 内容 %2',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'CONTENT', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：发送私聊消息给指定用户\n输入：用户ID - 数字或字符串；内容 - 字符串\n输出：无',
    helpUrl: HELP_URL.type,
  },
  {
    type: 'message_reply',
    message0: '回复消息 事件 %1 内容 %2',
    args0: [
      { type: 'input_value', name: 'EVENT', check: 'Event' },
      { type: 'input_value', name: 'CONTENT', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：根据事件自动回复群聊或私聊\n输入：事件 - 事件对象；内容 - 字符串\n输出：无',
    helpUrl: HELP_URL.type,
  },
  {
    type: 'message_get_type',
    message0: '获取消息类型 %1',
    args0: [{ type: 'input_value', name: 'EVENT', check: 'Event' }],
    output: 'String',
    colour: COLOR_HUE.message,
    tooltip: '介绍：获取消息的类型\n输入：事件 - 事件对象\n输出：字符串（消息类型，如 private、group 等）',
    helpUrl: HELP_URL.type,
  },
  {
    type: 'message_get_plain_text',
    message0: '获取消息纯文本 %1',
    args0: [{ type: 'input_value', name: 'EVENT', check: 'Event' }],
    output: 'String',
    colour: COLOR_HUE.message,
    tooltip: '介绍：获取消息去除CQ码后的纯文本内容\n输入：事件 - 事件对象\n输出：字符串（纯文本内容）',
    helpUrl: HELP_URL.type,
  },
  {
    type: 'message_contains_keyword',
    message0: '消息 %1 包含关键词 %2',
    args0: [
      { type: 'input_value', name: 'EVENT', check: 'Event' },
      { type: 'input_value', name: 'KEYWORD', check: 'String' },
    ],
    output: 'Boolean',
    colour: COLOR_HUE.message,
    tooltip: '介绍：检查消息是否包含指定关键词\n输入：事件 - 事件对象；关键词 - 字符串\n输出：布尔值（true/false）',
    helpUrl: HELP_URL.type,
  },
  {
    type: 'message_is_at_bot',
    message0: '消息 %1 @了机器人',
    args0: [{ type: 'input_value', name: 'EVENT', check: 'Event' }],
    output: 'Boolean',
    colour: COLOR_HUE.message,
    tooltip: '介绍：检查消息是否@了机器人\n输入：事件 - 事件对象\n输出：布尔值（true/false）',
    helpUrl: HELP_URL.type,
  },
  {
    type: 'message_get_sender_id',
    message0: '获取发送者ID %1',
    args0: [{ type: 'input_value', name: 'EVENT', check: 'Event' }],
    output: 'Number',
    colour: COLOR_HUE.message,
    tooltip: '介绍：获取消息发送者的QQ号\n输入：事件 - 事件对象\n输出：数字（发送者的QQ号）',
    helpUrl: HELP_URL.type,
  },
  {
    type: 'message_get_group_id',
    message0: '获取群ID %1',
    args0: [{ type: 'input_value', name: 'EVENT', check: 'Event' }],
    output: 'Number',
    colour: COLOR_HUE.message,
    tooltip: '介绍：获取消息所在群的群号\n输入：事件 - 事件对象\n输出：数字（群号，私聊消息返回0）',
    helpUrl: HELP_URL.type,
  },
  {
    type: 'message_is_group_message',
    message0: '是群消息 %1',
    args0: [{ type: 'input_value', name: 'EVENT', check: 'Event' }],
    output: 'Boolean',
    colour: COLOR_HUE.message,
    tooltip: '介绍：判断消息是否为群消息\n输入：事件 - 事件对象\n输出：布尔值（true/false）',
    helpUrl: HELP_URL.type,
  },
  {
    type: 'message_is_private_message',
    message0: '是私聊消息 %1',
    args0: [{ type: 'input_value', name: 'EVENT', check: 'Event' }],
    output: 'Boolean',
    colour: COLOR_HUE.message,
    tooltip: '介绍：判断消息是否为私聊消息\n输入：事件 - 事件对象\n输出：布尔值（true/false）',
    helpUrl: HELP_URL.type,
  },
  {
    type: 'message_send_private_with_result',
    message0: '发送私聊消息带结果 用户 %1 内容 %2 成功 %3 失败 %4',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'CONTENT', check: 'String' },
      { type: 'input_statement', name: 'ON_SUCCESS' },
      { type: 'input_statement', name: 'ON_ERROR' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：发送私聊消息并通过分支处理成功或失败结果\n输入：用户ID - 数字或字符串；内容 - 字符串\n输出：无（通过成功/失败分支处理结果）',
    helpUrl: HELP_URL.type,
  },
  {
    type: 'message_send_group_with_result',
    message0: '发送群消息带结果 群号 %1 内容 %2 成功 %3 失败 %4',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'CONTENT', check: 'String' },
      { type: 'input_statement', name: 'ON_SUCCESS' },
      { type: 'input_statement', name: 'ON_ERROR' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：发送群消息并通过分支处理成功或失败结果\n输入：群号 - 数字或字符串；内容 - 字符串\n输出：无（通过成功/失败分支处理结果）',
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
    tooltip: '介绍：注册消息事件处理器，当收到消息时执行\n输入：变量名 - 用于存储事件数据的变量\n输出：事件对象（包含完整的消息事件数据）',
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
    tooltip: '介绍：注册通知事件处理器，当收到通知时执行\n输入：变量名 - 用于存储通知数据的变量\n输出：事件对象（包含完整的通知事件数据）',
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
    tooltip: '介绍：注册请求事件处理器，当收到请求时执行\n输入：变量名 - 用于存储请求数据的变量\n输出：事件对象（包含完整的请求事件数据）',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'event_on_init',
    message0: '插件初始化时 %1',
    args0: [{ type: 'input_statement', name: 'HANDLER' }],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '介绍：插件初始化时执行一次\n输入：无\n输出：无',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'event_on_destroy',
    message0: '插件卸载时 %1',
    args0: [{ type: 'input_statement', name: 'HANDLER' }],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '介绍：插件卸载或停止前执行一次\n输入：无\n输出：无',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'event_get_event',
    message0: '%{BKY_BLOCKLY_EVENT_GET_CURRENT}',
    output: 'Event',
    colour: COLOR_HUE.event,
    tooltip: '介绍：获取当前处理中的事件对象\n输入：无\n输出：事件对象',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'event_on_group_admin',
    message0: '%{BKY_BLOCKLY_EVENT_ON_GROUP_ADMIN}',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'event' },
      {
        type: 'field_dropdown',
        name: 'SUB_TYPE',
        options: [
          ['设置管理员', 'set'],
          ['取消管理员', 'unset'],
        ],
      },
      { type: 'input_statement', name: 'HANDLER' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '介绍：注册群管理员变动事件处理器，当群成员被设置或取消管理员时执行\n输入：变量名 - 用于存储事件数据的变量；子类型 - 设置管理员/取消管理员\n输出：事件对象（包含群号、用户ID、操作类型等）',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'event_on_group_member_increase',
    message0: '%{BKY_BLOCKLY_EVENT_ON_GROUP_MEMBER_INCREASE}',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'event' },
      {
        type: 'field_dropdown',
        name: 'SUB_TYPE',
        options: [
          ['同意入群', 'approve'],
          ['邀请入群', 'invite'],
        ],
      },
      { type: 'input_statement', name: 'HANDLER' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '介绍：注册群成员增加事件处理器，当有新成员加入群时执行\n输入：变量名 - 用于存储事件数据的变量；子类型 - 同意入群/邀请入群\n输出：事件对象（包含群号、用户ID、操作者ID等）',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'event_on_group_member_decrease',
    message0: '%{BKY_BLOCKLY_EVENT_ON_GROUP_MEMBER_DECREASE}',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'event' },
      {
        type: 'field_dropdown',
        name: 'SUB_TYPE',
        options: [
          ['主动退群', 'leave'],
          ['被踢出群', 'kick'],
          ['机器人被踢', 'kick_me'],
        ],
      },
      { type: 'input_statement', name: 'HANDLER' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '介绍：注册群成员减少事件处理器，当有成员离开或被踢出群时执行\n输入：变量名 - 用于存储事件数据的变量；子类型 - 主动退群/被踢出群/机器人被踢\n输出：事件对象（包含群号、用户ID、操作者ID等）',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'event_on_group_ban',
    message0: '%{BKY_BLOCKLY_EVENT_ON_GROUP_BAN}',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'event' },
      {
        type: 'field_dropdown',
        name: 'SUB_TYPE',
        options: [
          ['禁言', 'ban'],
          ['解除禁言', 'lift_ban'],
        ],
      },
      { type: 'input_statement', name: 'HANDLER' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '介绍：注册群禁言事件处理器，当群成员被禁言或解除禁言时执行\n输入：变量名 - 用于存储事件数据的变量；子类型 - 禁言/解除禁言\n输出：事件对象（包含群号、用户ID、操作者ID、禁言时长等）',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'event_on_group_recall',
    message0: '%{BKY_BLOCKLY_EVENT_ON_GROUP_RECALL}',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'event' },
      { type: 'input_statement', name: 'HANDLER' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '介绍：注册群消息撤回事件处理器，当群成员撤回消息时执行\n输入：变量名 - 用于存储事件数据的变量\n输出：事件对象（包含群号、用户ID、操作者ID、消息ID等）',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'event_on_friend_recall',
    message0: '%{BKY_BLOCKLY_EVENT_ON_FRIEND_RECALL}',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'event' },
      { type: 'input_statement', name: 'HANDLER' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '介绍：注册好友消息撤回事件处理器，当好友撤回消息时执行\n输入：变量名 - 用于存储事件数据的变量\n输出：事件对象（包含用户ID、消息ID等）',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'event_on_poke',
    message0: '%{BKY_BLOCKLY_EVENT_ON_POKE}',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'event' },
      { type: 'input_statement', name: 'HANDLER' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '介绍：注册戳一戳事件处理器，当收到戳一戳消息时执行\n输入：变量名 - 用于存储事件数据的变量\n输出：事件对象（包含发送者ID、接收者ID等）',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'event_on_essence',
    message0: '%{BKY_BLOCKLY_EVENT_ON_ESSENCE}',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'event' },
      {
        type: 'field_dropdown',
        name: 'SUB_TYPE',
        options: [
          ['添加精华', 'add'],
          ['删除精华', 'delete'],
        ],
      },
      { type: 'input_statement', name: 'HANDLER' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '介绍：注册精华消息变动事件处理器，当消息被设为精华或取消精华时执行\n输入：变量名 - 用于存储事件数据的变量；子类型 - 添加精华/删除精华\n输出：事件对象（包含群号、消息ID、操作者ID等）',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'event_on_friend_add',
    message0: '%{BKY_BLOCKLY_EVENT_ON_FRIEND_ADD}',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'event' },
      { type: 'input_statement', name: 'HANDLER' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '介绍：注册好友添加事件处理器，当有新好友添加成功时执行\n输入：变量名 - 用于存储事件数据的变量\n输出：事件对象（包含用户ID等）',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'event_on_group_card',
    message0: '%{BKY_BLOCKLY_EVENT_ON_GROUP_CARD}',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'event' },
      { type: 'input_statement', name: 'HANDLER' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '介绍：注册群名片变动事件处理器，当群成员的名片被修改时执行\n输入：变量名 - 用于存储事件数据的变量\n输出：事件对象（包含群号、用户ID、新名片、旧名片等）',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'event_on_group_title',
    message0: '%{BKY_BLOCKLY_EVENT_ON_GROUP_TITLE}',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'event' },
      { type: 'input_statement', name: 'HANDLER' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '介绍：注册群头衔变动事件处理器，当群成员获得或修改专属头衔时执行\n输入：变量名 - 用于存储事件数据的变量\n输出：事件对象（包含群号、用户ID、头衔等）',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'event_on_group_msg_emoji_like',
    message0: '%{BKY_BLOCKLY_EVENT_ON_GROUP_MSG_EMOJI_LIKE}',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'event' },
      { type: 'input_statement', name: 'HANDLER' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '介绍：注册群消息表情点赞事件处理器，当群消息被添加或取消表情点赞时执行\n输入：变量名 - 用于存储事件数据的变量\n输出：事件对象（包含群号、消息ID、用户ID、表情列表等）',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'event_on_group_upload',
    message0: '%{BKY_BLOCKLY_EVENT_ON_GROUP_UPLOAD}',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'event' },
      { type: 'input_statement', name: 'HANDLER' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '介绍：注册群文件上传事件处理器，当群成员上传文件时执行\n输入：变量名 - 用于存储事件数据的变量\n输出：事件对象（包含群号、用户ID、文件信息等）',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'event_on_group_request',
    message0: '%{BKY_BLOCKLY_EVENT_ON_GROUP_REQUEST}',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'event' },
      {
        type: 'field_dropdown',
        name: 'SUB_TYPE',
        options: [
          ['加群请求', 'add'],
          ['邀请机器人入群', 'invite'],
        ],
      },
      { type: 'input_statement', name: 'HANDLER' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '介绍：注册群请求事件处理器，当收到加群请求或邀请时执行\n输入：变量名 - 用于存储事件数据的变量；子类型 - 加群请求/邀请入群\n输出：事件对象（包含群号、用户ID、请求标识等）',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'event_on_friend_request',
    message0: '%{BKY_BLOCKLY_EVENT_ON_FRIEND_REQUEST}',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'event' },
      { type: 'input_statement', name: 'HANDLER' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '介绍：注册好友请求事件处理器，当收到好友申请时执行\n输入：变量名 - 用于存储事件数据的变量\n输出：事件对象（包含用户ID、请求消息、请求标识等）',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'event_on_bot_status',
    message0: '%{BKY_BLOCKLY_EVENT_ON_BOT_STATUS}',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'event' },
      { type: 'input_statement', name: 'HANDLER' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '介绍：注册机器人状态变化事件处理器，当机器人上线或下线时执行\n输入：变量名 - 用于存储事件数据的变量\n输出：事件对象（包含状态信息等）',
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
    tooltip: '介绍：获取事件变量的值\n输入：变量 - 事件变量\n输出：事件对象',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'storage_set',
    message0: '存储设置 键 %1 值 %2',
    args0: [
      { type: 'input_value', name: 'KEY', check: 'String' },
      { type: 'input_value', name: 'VALUE' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.storage,
    tooltip: '介绍：写入键值数据到插件持久化存储\n输入：键 - 字符串；值 - 任意类型（自动转为字符串存储）\n输出：无',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'storage_get',
    message0: '从存储获取 键 %1 默认值 %2',
    args0: [
      { type: 'input_value', name: 'KEY', check: 'String' },
      { type: 'input_value', name: 'DEFAULT' },
    ],
    output: 'String',
    colour: COLOR_HUE.storage,
    tooltip: '介绍：读取键值数据，支持默认值\n输入：键 - 字符串；默认值 - 任意类型（当键不存在时返回）\n输出：字符串（存储的值或默认值）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'storage_delete',
    message0: '从存储删除 键 %1',
    args0: [
      { type: 'input_value', name: 'KEY', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.storage,
    tooltip: '介绍：从存储中删除指定键值\n输入：键 - 字符串\n输出：无',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'text_concat',
    message0: '连接文本 %1 和 %2',
    args0: [
      { type: 'input_value', name: 'TEXT1', check: 'String' },
      { type: 'input_value', name: 'TEXT2', check: 'String' },
    ],
    output: 'String',
    colour: COLOR_HUE.text,
    tooltip: '介绍：连接两个文本字符串\n输入：文本1 - 字符串；文本2 - 字符串\n输出：字符串（连接后的文本）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'text_template',
    message0: '文本模板 %1',
    args0: [{ type: 'input_value', name: 'TEMPLATE', check: 'String' }],
    output: 'String',
    colour: COLOR_HUE.text,
    tooltip: '介绍：文本模板表达式，支持变量插值\n输入：模板 - 字符串（支持变量插值格式）\n输出：字符串（处理后的文本）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'text_substring',
    message0: '提取文本 %1 从第 %2 位到第 %3 位',
    args0: [
      { type: 'input_value', name: 'TEXT', check: 'String' },
      { type: 'input_value', name: 'START', check: 'Number' },
      { type: 'input_value', name: 'END', check: 'Number' },
    ],
    output: 'String',
    colour: COLOR_HUE.text,
    tooltip: '介绍：从文本中提取指定范围的子串\n输入：文本 - 字符串；开始位置 - 数字；结束位置 - 数字\n输出：字符串（提取的子串）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'text_count_occurrences',
    message0: '文本 %1 包含 %2 的个数',
    args0: [
      { type: 'input_value', name: 'TEXT', check: 'String' },
      { type: 'input_value', name: 'SEARCH', check: 'String' },
    ],
    output: 'Number',
    colour: COLOR_HUE.text,
    tooltip: '介绍：统计文本中指定内容出现的次数\n输入：文本 - 字符串；查找内容 - 字符串\n输出：数字（子串出现的次数）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'text_replace_custom',
    message0: '将文本 %1 中的 %2 替换为 %3',
    args0: [
      { type: 'input_value', name: 'TEXT', check: 'String' },
      { type: 'input_value', name: 'SEARCH', check: 'String' },
      { type: 'input_value', name: 'REPLACE', check: 'String' },
    ],
    output: 'String',
    colour: COLOR_HUE.text,
    tooltip: '介绍：替换文本中的指定内容\n输入：文本 - 原字符串；查找内容 - 要替换的子串；替换内容 - 替换后的字符串\n输出：字符串（替换后的文本）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'text_contains',
    message0: '文本 %1 包含 %2',
    args0: [
      { type: 'input_value', name: 'TEXT', check: 'String' },
      { type: 'input_value', name: 'SEARCH', check: 'String' },
    ],
    output: 'Boolean',
    colour: COLOR_HUE.text,
    tooltip: '介绍：检查文本是否包含指定子串\n输入：文本 - 字符串；查找内容 - 字符串\n输出：布尔值（是否包含子串）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'logic_if_else',
    message0: '如果 %1 那么 %2 否则 %3',
    args0: [
      { type: 'input_value', name: 'CONDITION', check: 'Boolean' },
      { type: 'input_statement', name: 'IF' },
      { type: 'input_statement', name: 'ELSE' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.logic,
    tooltip: '介绍：条件分支语句，根据条件执行不同分支\n输入：条件 - 布尔值\n输出：无（根据条件执行不同分支）',
    helpUrl: HELP_URL.block,
  },
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
    tooltip: '介绍：比较两个值的大小关系\n输入：值A - 任意类型；值B - 任意类型\n输出：布尔值（比较结果）',
    helpUrl: HELP_URL.block,
    outputShape: 1,
  },
  {
    type: 'api_call_with_result',
    message0: '调用API %1 参数1 %2 参数2 %3 成功 %4 失败 %5',
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
    tooltip: '介绍：调用API并通过分支处理成功或失败结果\n输入：API名称 - 字符串；参数1 - 任意类型；参数2 - 任意类型\n输出：无（通过成功/失败分支处理结果）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'api_get_retcode',
    message0: '%{BKY_BLOCKLY_API_GET_RETCODE}',
    args0: [
      { type: 'input_value', name: 'RESPONSE' },
    ],
    output: 'Number',
    colour: COLOR_HUE.advanced,
    tooltip: '介绍：从API响应中获取retcode状态码\n输入：响应 - API调用返回的响应对象\n输出：数字（retcode值，0表示成功，非0表示失败）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'api_is_success',
    message0: '%{BKY_BLOCKLY_API_IS_SUCCESS}',
    args0: [
      { type: 'input_value', name: 'RESPONSE' },
    ],
    output: 'Boolean',
    colour: COLOR_HUE.logic,
    tooltip: '介绍：判断API操作是否成功\n输入：响应 - API调用返回的响应对象\n输出：布尔值（retcode为0且status为ok时返回true）',
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
    tooltip: '介绍：设置群组全员禁言状态\n输入：群号 - 数字或字符串；状态 - 布尔值（开启/关闭）\n输出：无',
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
    tooltip: '介绍：设置或取消群成员的管理员身份\n输入：群号 - 数字或字符串；用户ID - 数字或字符串；状态 - 布尔值（是/否）\n输出：无',
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
    tooltip: '介绍：设置群成员在群中的名片（群昵称）\n输入：群号 - 数字或字符串；用户ID - 数字或字符串；名片 - 字符串\n输出：无',
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
    tooltip: '介绍：将群成员踢出群组\n输入：群号 - 数字或字符串；用户ID - 数字或字符串；拒绝 - 布尔值（是否拒绝再次加群）\n输出：无',
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
    tooltip: '介绍：禁言群组中的指定成员\n输入：群号 - 数字或字符串；用户ID - 数字或字符串；时长 - 数字（秒，0表示取消禁言）\n输出：无',
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
    tooltip: '介绍：修改群组的名称\n输入：群号 - 数字或字符串；名称 - 字符串\n输出：无',
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
    tooltip: '介绍：在群组中对指定成员发送戳一戳\n输入：群号 - 数字或字符串；用户ID - 数字或字符串\n输出：无',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'group_get_list',
    message0: '获取群列表',
    output: 'Array',
    colour: COLOR_HUE.group,
    tooltip: '介绍：获取机器人所在的所有群组列表\n输入：无\n输出：数组（包含所有群信息的数组）',
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
    tooltip: '介绍：获取群组的成员列表\n输入：群号 - 数字或字符串\n输出：数组（包含群成员信息的数组）',
    helpUrl: HELP_URL.block,
  },
  // ========== 好友管理积木 ==========
  {
    type: 'user_get_friends',
    message0: '获取好友列表',
    output: 'Array',
    colour: COLOR_HUE.user,
    tooltip: '介绍：获取机器人的所有好友列表\n输入：无\n输出：数组（包含所有好友信息的数组）',
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
    tooltip: '介绍：设置好友的备注名称\n输入：用户ID - 数字或字符串；备注 - 字符串\n输出：无',
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
    tooltip: '介绍：对好友发送戳一戳\n输入：用户ID - 数字或字符串\n输出：无',
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
    tooltip: '介绍：撤回指定的消息\n输入：消息ID - 数字或字符串\n输出：无',
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
    tooltip: '介绍：将指定消息设为精华消息\n输入：消息ID - 数字或字符串\n输出：无',
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
    tooltip: '介绍：获取群组的精华消息列表\n输入：群号 - 数字或字符串\n输出：数组（精华消息列表）',
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
    tooltip: '介绍：给好友发送赞\n输入：用户ID - 数字或字符串；次数 - 数字（1-10）\n输出：无',
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
    tooltip: '介绍：获取事件中被回复的消息ID\n输入：事件 - 事件对象\n输出：数字或字符串（回复的消息ID）',
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
    tooltip: '介绍：检查消息是否包含图片\n输入：事件 - 事件对象\n输出：布尔值（是否包含图片）',
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
    tooltip: '介绍：检查消息是否包含语音\n输入：事件 - 事件对象\n输出：布尔值（是否包含语音）',
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
    tooltip: '介绍：获取消息发送者的昵称\n输入：事件 - 事件对象\n输出：字符串（发送者昵称）',
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
    tooltip: '介绍：获取消息发送的时间戳\n输入：事件 - 事件对象\n输出：数字（时间戳）',
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
    tooltip: '介绍：获取消息的唯一ID\n输入：事件 - 事件对象\n输出：数字或字符串（消息ID）',
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
    tooltip: '介绍：上传文件到群组文件区\n输入：文件 - 字符串（文件路径）；群号 - 数字或字符串；名称 - 字符串\n输出：无',
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
    tooltip: '介绍：删除群组文件区中的文件\n输入：群号 - 数字或字符串；文件ID - 字符串；busid - 数字\n输出：无',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'file_get_group_system_info',
    message0: '获取群 %1 的文件系统信息',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
    ],
    output: null,
    colour: COLOR_HUE.file,
    tooltip: '介绍：获取群组文件系统的容量信息\n输入：群号 - 数字或字符串\n输出：对象（文件系统信息）',
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
    tooltip: '介绍：获取群组根目录的文件列表\n输入：群号 - 数字或字符串\n输出：数组（文件列表）',
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
    tooltip: '介绍：读取插件目录下的文件内容\n输入：路径 - 字符串（相对于插件目录的文件路径）\n输出：字符串（文件内容）',
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
    tooltip: '介绍：将内容写入插件目录下的文件\n输入：内容 - 字符串；路径 - 字符串（相对于插件目录的文件路径）\n输出：无',
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
    tooltip: '介绍：删除插件目录下的文件\n输入：路径 - 字符串（相对于插件目录的文件路径）\n输出：无',
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
    tooltip: '介绍：检查插件目录下文件是否存在\n输入：路径 - 字符串（相对于插件目录的文件路径）\n输出：布尔值（文件是否存在）',
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
    tooltip: '介绍：在插件目录下创建文件夹\n输入：路径 - 字符串（相对于插件目录的目录路径）\n输出：无',
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
    tooltip: '介绍：对字符串进行URL编码\n输入：文本 - 字符串\n输出：字符串（URL编码后的文本）',
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
    tooltip: '介绍：对URL编码的字符串进行解码\n输入：文本 - 字符串（URL编码后的文本）\n输出：字符串（解码后的原始文本）',
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
    tooltip: '介绍：对字符串进行Base64编码\n输入：文本 - 字符串\n输出：字符串（Base64编码后的文本）',
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
    tooltip: '介绍：对Base64编码的字符串进行解码\n输入：文本 - 字符串（Base64编码后的文本）\n输出：字符串（解码后的原始文本）',
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
    tooltip: '介绍：对字符串进行HTML实体转义\n输入：文本 - 字符串\n输出：字符串（HTML转义后的文本）',
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
    tooltip: '介绍：对HTML实体进行反转义\n输入：文本 - 字符串（HTML实体）\n输出：字符串（反转义后的文本）',
    helpUrl: HELP_URL.block,
  },
  // ========== 系统积木 ==========
  {
    type: 'system_timestamp_seconds',
    message0: '获取当前时间戳(秒)',
    output: 'Number',
    colour: COLOR_HUE.system,
    tooltip: '介绍：获取当前Unix时间戳（秒）\n输入：无\n输出：数字（Unix时间戳，单位为秒）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'system_timestamp_milliseconds',
    message0: '获取当前时间戳(毫秒)',
    output: 'Number',
    colour: COLOR_HUE.system,
    tooltip: '介绍：获取当前Unix时间戳（毫秒）\n输入：无\n输出：数字（Unix时间戳，单位为毫秒）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'system_now',
    message0: '获取当前时间',
    output: null,
    colour: COLOR_HUE.system,
    tooltip: '介绍：获取当前日期和时间信息\n输入：无\n输出：对象（包含年、月、日、时、分、秒等时间信息）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'system_status',
    message0: '获取系统状态',
    output: null,
    colour: COLOR_HUE.system,
    tooltip: '介绍：获取系统和机器人的运行状态\n输入：无\n输出：对象（包含系统状态信息）',
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
    tooltip: '介绍：处理加好友请求\n输入：操作 - 下拉选择（同意/拒绝）；Flag - 字符串（请求标识）；备注 - 字符串\n输出：无',
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
    tooltip: '介绍：处理加群请求\n输入：操作 - 下拉选择（同意/拒绝）；Flag - 字符串（请求标识）；原因 - 字符串\n输出：无',
    helpUrl: HELP_URL.block,
  },
  // ========== HTTP 请求积木 ==========
  {
    type: 'http_get',
    message0: 'HTTP GET 请求 %1',
    args0: [
      { type: 'input_value', name: 'URL', check: 'String' },
    ],
    output: null,
    colour: COLOR_HUE.http,
    tooltip: '介绍：发送HTTP GET请求\n输入：URL - 字符串（请求地址）\n输出：对象（包含响应数据的对象）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'http_post',
    message0: 'HTTP POST 请求 %1 内容 %2',
    args0: [
      { type: 'input_value', name: 'URL', check: 'String' },
      { type: 'input_value', name: 'BODY', check: 'String' },
    ],
    output: null,
    colour: COLOR_HUE.http,
    tooltip: '介绍：发送HTTP POST请求\n输入：URL - 字符串（请求地址）；内容 - 字符串（请求体）\n输出：对象（包含响应数据的对象）',
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
    output: null,
    colour: COLOR_HUE.http,
    tooltip: '介绍：发送HTTP请求（支持GET/POST/PUT/DELETE方法）\n输入：方法 - 下拉选择；URL - 字符串；内容 - 字符串（请求体）\n输出：对象（包含响应数据的对象）',
    helpUrl: HELP_URL.block,
  },
  // ========== 机器人信息积木 ==========
  {
    type: 'bot_get_login_info',
    message0: '获取登录信息',
    output: null,
    colour: COLOR_HUE.bot,
    tooltip: '介绍：获取机器人登录账号的信息\n输入：无\n输出：对象（包含登录账号信息）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'bot_get_status',
    message0: '获取机器人状态',
    output: null,
    colour: COLOR_HUE.bot,
    tooltip: '介绍：获取机器人的当前状态\n输入：无\n输出：对象（包含机器人状态信息）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'bot_get_version',
    message0: '获取版本信息',
    output: null,
    colour: COLOR_HUE.bot,
    tooltip: '介绍：获取机器人的版本信息\n输入：无\n输出：对象（包含版本信息）',
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
    tooltip: '介绍：将值编码为JSON字符串\n输入：值 - 任意类型\n输出：字符串（JSON格式的字符串）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'json_decode',
    message0: '解析JSON %1',
    args0: [
      { type: 'input_value', name: 'JSON', check: 'String' },
    ],
    output: null,
    colour: COLOR_HUE.utils,
    tooltip: '介绍：将JSON字符串解析为表\n输入：JSON - 字符串（JSON格式的字符串）\n输出：对象（解析后的表）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'json_get',
    message0: '从JSON %1 中获取路径 %2 的值',
    args0: [
      { type: 'input_value', name: 'JSON' },
      { type: 'input_value', name: 'PATH', check: 'String' },
    ],
    output: null,
    colour: COLOR_HUE.utils,
    tooltip: '介绍：使用点号路径从JSON中获取值\n输入：JSON - 字符串；路径 - 字符串（如 "data.name"）\n输出：对象（路径对应的值）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'json_extract',
    message0: '从JSON %1 提取 %2',
    args0: [
      { type: 'input_value', name: 'JSON' },
      { type: 'input_value', name: 'PATH', check: 'String' },
    ],
    output: null,
    colour: COLOR_HUE.utils,
    tooltip: '介绍：从JSON中提取指定路径的值\n输入：JSON - 字符串；路径 - 字符串（如 message[0].text）\n输出：对象（路径对应的值）',
    helpUrl: HELP_URL.block,
  },
  // ========== 表操作积木 ==========
  {
    type: 'table_get',
    message0: '从表 %1 中获取路径 %2 的值',
    args0: [
      { type: 'input_value', name: 'TABLE' },
      { type: 'input_value', name: 'PATH', check: 'String' },
    ],
    output: null,
    colour: COLOR_HUE.utils,
    tooltip: '介绍：使用点号路径从表中获取值\n输入：表 - 对象；路径 - 字符串（如 user.name）\n输出：对象（路径对应的值）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'table_set',
    message0: '在表 %1 的路径 %2 设置值 %3',
    args0: [
      { type: 'input_value', name: 'TABLE' },
      { type: 'input_value', name: 'PATH', check: 'String' },
      { type: 'input_value', name: 'VALUE' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.utils,
    tooltip: '介绍：使用点号路径在表中设置值\n输入：表 - 对象；路径 - 字符串（如 user.name）；值 - 任意类型\n输出：无',
    helpUrl: HELP_URL.block,
  },
  // ========== 消息处理积木（新设计） ==========
  {
    type: 'current_message',
    message0: '当前消息',
    output: 'Message',
    colour: COLOR_HUE.message,
    tooltip: '介绍：获取当前收到的完整消息对象\n输入：无\n输出：消息对象',
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
    tooltip: '介绍：获取消息对象的指定字段值\n输入：消息 - 消息对象；字段 - 下拉选择\n输出：字段对应的值',
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
    tooltip: '介绍：使用点号路径获取消息中的值\n输入：消息 - 消息对象；路径 - 字符串（如 sender.nickname）\n输出：路径对应的值',
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
    tooltip: '介绍：回复私聊消息，可引用原消息\n输入：用户ID - 数字或字符串；引用消息ID - 数字或字符串；内容 - 字符串\n输出：无',
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
    tooltip: '介绍：回复群消息，可引用原消息\n输入：群ID - 数字或字符串；引用消息ID - 数字或字符串；内容 - 字符串\n输出：无',
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
    tooltip: '介绍：将任意值转换为字符串\n输入：值 - 任意类型\n输出：字符串',
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
    tooltip: '介绍：将字符串或其他值转换为数字\n输入：值 - 任意类型\n输出：数字（转换失败返回nil）',
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
    tooltip: '介绍：将Lua表转换为JSON字符串\n输入：表 - 对象\n输出：字符串（JSON格式的字符串）',
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
    tooltip: '介绍：检查值的类型\n输入：值 - 任意类型；类型 - 下拉选择\n输出：布尔值（是否匹配指定类型）',
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
    tooltip: '介绍：安全获取表的值，如果键不存在返回默认值\n输入：表 - 对象；键 - 字符串；默认值 - 任意类型\n输出：值或默认值',
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
    tooltip: '介绍：连接两个字符串\n输入：字符串A - 字符串；字符串B - 字符串\n输出：字符串（连接后的结果）',
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
    tooltip: '介绍：格式化数字为指定小数位数的字符串\n输入：数字 - 数字；小数位数 - 数字\n输出：字符串（格式化后的数字）',
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
    tooltip: '介绍：获取消息对象的常用字段\n输入：消息 - 消息对象；字段 - 下拉选择\n输出：字段对应的值',
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
    tooltip: '介绍：获取消息去除CQ码后的纯文本内容\n输入：消息 - 消息对象\n输出：字符串（纯文本内容）',
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
    tooltip: '介绍：检查消息中是否包含指定文字\n输入：消息 - 消息对象；文字 - 字符串\n输出：布尔值',
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
    tooltip: '介绍：检查消息中是否包含指定关键词\n输入：消息 - 消息对象；关键词 - 字符串\n输出：布尔值',
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
    tooltip: '介绍：判断消息是否为群消息\n输入：消息 - 消息对象\n输出：布尔值',
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
    tooltip: '介绍：判断消息是否为私聊消息\n输入：消息 - 消息对象\n输出：布尔值',
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
    tooltip: '介绍：判断消息类型是否为指定类型\n输入：消息 - 消息对象；类型 - 下拉选择\n输出：布尔值',
    helpUrl: HELP_URL.block,
  },
  // ========== 消息高级获取积木 ==========
  {
    type: 'msg_get_images',
    message0: '获取消息 %1 中的图片 第 %2 张',
    args0: [
      { type: 'input_value', name: 'MESSAGE', check: 'Event' },
      { type: 'input_value', name: 'INDEX', check: 'Number' },
    ],
    output: 'String',
    colour: COLOR_HUE.message,
    tooltip: '介绍：获取消息中的图片URL\n输入：事件 - 事件对象；索引 - 数字（从1开始，不填则返回所有图片URL组成的表）\n输出：字符串（指定位置的图片URL）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_get_first_image',
    message0: '获取消息 %1 中的第一张图片URL',
    args0: [
      { type: 'input_value', name: 'MESSAGE', check: 'Event' },
    ],
    output: 'String',
    colour: COLOR_HUE.message,
    tooltip: '介绍：获取消息中第一张图片的URL\n输入：事件 - 事件对象\n输出：字符串（第一张图片的URL，如果没有图片则返回nil）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_get_at_users',
    message0: '获取消息 %1 中@的用户 第 %2 个',
    args0: [
      { type: 'input_value', name: 'MESSAGE', check: 'Event' },
      { type: 'input_value', name: 'INDEX', check: 'Number' },
    ],
    output: 'String',
    colour: COLOR_HUE.message,
    tooltip: '介绍：获取消息中被@的用户ID\n输入：事件 - 事件对象；索引 - 数字（从1开始，不填则返回所有@用户ID组成的表）\n输出：字符串（指定位置的用户ID）',
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
    tooltip: '介绍：获取消息的回复信息\n输入：消息 - 消息对象\n输出：对象（被回复的消息信息）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_get_message_id',
    message0: '获取消息 %1 的消息ID',
    args0: [
      { type: 'input_value', name: 'MESSAGE', check: 'Event' },
    ],
    output: 'Number',
    colour: COLOR_HUE.message,
    tooltip: '介绍：获取消息的唯一ID\n输入：事件 - 事件对象\n输出：数字（消息ID）',
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
    tooltip: '介绍：获取消息发送者的QQ号\n输入：消息 - 消息对象\n输出：数字或字符串（发送者ID）',
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
    tooltip: '介绍：获取消息发送者的昵称\n输入：消息 - 消息对象\n输出：字符串（发送者昵称）',
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
    tooltip: '介绍：获取群消息的群号\n输入：消息 - 消息对象\n输出：数字或字符串（群号）',
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
    tooltip: '介绍：获取消息发送的时间戳\n输入：消息 - 消息对象\n输出：数字（时间戳）',
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
    tooltip: '介绍：获取被回复消息的消息ID\n输入：消息 - 消息对象\n输出：数字或字符串（被回复的消息ID）',
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
    tooltip: '介绍：获取消息的类型\n输入：消息 - 消息对象\n输出：字符串（消息类型：text、image、face、at、reply、json等）',
    helpUrl: HELP_URL.block,
  },
  // ========== 卡片消息判断与解析积木 ==========
  {
    type: 'msg_has_json',
    message0: '消息 %1 包含JSON卡片',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
    ],
    output: 'Boolean',
    colour: COLOR_HUE.message,
    tooltip: '介绍：检查消息是否包含JSON格式的卡片内容\n输入：消息 - 消息对象\n输出：布尔值',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_is_contact_card',
    message0: '消息 %1 是联系人名片',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
    ],
    output: 'Boolean',
    colour: COLOR_HUE.message,
    tooltip: '介绍：检查消息是否为联系人分享名片\n输入：消息 - 消息对象\n输出：布尔值（好友名片/群名片/频道名片等）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_is_group_card',
    message0: '消息 %1 是群名片',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
    ],
    output: 'Boolean',
    colour: COLOR_HUE.message,
    tooltip: '介绍：检查消息是否为群名片分享\n输入：消息 - 消息对象\n输出：布尔值',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_is_channel_card',
    message0: '消息 %1 是频道名片',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
    ],
    output: 'Boolean',
    colour: COLOR_HUE.message,
    tooltip: '介绍：检查消息是否为腾讯频道名片分享\n输入：消息 - 消息对象\n输出：布尔值',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_get_json_data',
    message0: '获取消息 %1 的JSON数据',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：获取消息中的JSON卡片数据\n输入：消息 - 消息对象\n输出：对象（解析后的JSON数据）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_get_card_info',
    message0: '获取名片 %1 的 %2',
    args0: [
      { type: 'input_value', name: 'CARD_DATA' },
      {
        type: 'field_dropdown',
        name: 'FIELD',
        options: [
          ['类型标签(tag)', 'tag'],
          ['昵称/名称(nickname)', 'nickname'],
          ['头像URL(avatar)', 'avatar'],
          ['联系信息(contact)', 'contact'],
          ['跳转链接(jumpUrl)', 'jumpUrl'],
          ['来源标签(source)', 'source'],
          ['群号(groupUin)', 'groupUin'],
          ['用户QQ号(uin)', 'uin'],
          ['频道ID(guildId)', 'guildId'],
        ],
      },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：从名片数据中提取指定字段\n输入：名片数据 - 对象；字段 - 下拉选择\n输出：字段对应的值',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_parse_card',
    message0: '解析消息 %1 中的名片',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：解析消息中的名片数据\n输入：消息 - 消息对象\n输出：对象（名片信息，包含 nickname、avatar、contact 等）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_parse_card_full',
    message0: '完整解析消息 %1 的卡片',
    args0: [
      { type: 'input_value', name: 'MESSAGE' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：完整解析卡片信息\n输入：消息 - 消息对象\n输出：对象（包含 nickname、uin、avatar、location 等所有字段）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_get_card_id_from_url',
    message0: '从URL %1 提取 %2',
    args0: [
      { type: 'input_value', name: 'URL' },
      {
        type: 'field_dropdown',
        name: 'ID_TYPE',
        options: [
          ['QQ号(uin)', 'uin'],
          ['群号(groupUin)', 'group'],
          ['频道ID(guildId)', 'guild'],
          ['邀请码(inviteCode)', 'inviteCode'],
        ],
      },
    ],
    output: 'String',
    colour: COLOR_HUE.message,
    tooltip: '介绍：从卡片URL中提取ID\n输入：URL - 字符串；ID类型 - 下拉选择\n输出：字符串（QQ号、群号、频道ID或邀请码）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_get_card_field',
    message0: '获取名片 %1 的 %2',
    args0: [
      { type: 'input_value', name: 'CARD_DATA', check: 'Object' },
      {
        type: 'field_dropdown',
        name: 'FIELD',
        options: [
          ['来源(source)', 'source'],
          ['名称(name)', 'name'],
          ['昵称(nickname)', 'nickname'],
          ['头像(avatar)', 'avatar'],
          ['标签(tag)', 'tag'],
          ['联系信息(contactInfo)', 'contactInfo'],
          ['跳转链接(jumpUrl)', 'jumpUrl'],
          ['PC跳转链接(pcJumpUrl)', 'pcJumpUrl'],
          ['QQ号(uin)', 'uin'],
          ['名片类型(cardType)', 'cardType'],
          ['提示文本(prompt)', 'prompt'],
          ['标题(title)', 'title'],
          ['描述(description)', 'description'],
          ['文章链接(articleUrl)', 'articleUrl'],
          ['预览图(previewImage)', 'previewImage'],
          ['位置名称(locationName)', 'locationName'],
          ['地址(address)', 'address'],
          ['纬度(latitude)', 'latitude'],
          ['经度(longitude)', 'longitude'],
        ],
      },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：从完整解析的卡片数据中获取指定字段\n输入：名片数据 - 对象；字段 - 下拉选择\n输出：字段对应的值',
    helpUrl: HELP_URL.block,
  },
  // ========== 通用卡片内容解析 ==========
  {
    type: 'msg_json_has_app',
    message0: 'JSON卡片 %1 来源是 %2',
    args0: [
      { type: 'input_value', name: 'JSON_DATA', check: 'Object' },
      {
        type: 'field_dropdown',
        name: 'APP_TYPE',
        options: [
          ['好友推荐卡片', 'cardshare.cardshare'],
          ['群聊名片', 'qun.share'],
          ['频道名片', 'pindao.home'],
          ['QQ收藏', 'favorites.note'],
          ['图文链接', 'qqconnect.sdkshare'],
          ['QQ空间', 'qzone.shuoshuoshareonlytext'],
          ['小程序卡片', 'miniapp'],
        ],
      },
    ],
    output: 'Boolean',
    colour: COLOR_HUE.message,
    tooltip: '根据bizsrc来源判断卡片类型',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_get_json_app_type',
    message0: '获取JSON卡片 %1 的应用类型',
    args0: [
      { type: 'input_value', name: 'JSON_DATA', check: 'Object' },
    ],
    output: 'String',
    colour: COLOR_HUE.message,
    tooltip: '获取JSON卡片中的app字段值',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_get_json_field',
    message0: '从JSON卡片 %1 获取字段 %2',
    args0: [
      { type: 'input_value', name: 'JSON_DATA', check: 'Object' },
      {
        type: 'field_dropdown',
        name: 'FIELD_PATH',
        options: [
          ['应用类型(app)', 'app'],
          ['应用ID(appid)', 'extra.appid'],
          ['视图类型(view)', 'view'],
          ['提示文本(prompt)', 'prompt'],
          ['标题(title)', 'meta.news.title'],
          ['描述(desc)', 'meta.news.desc'],
          ['跳转链接(jumpUrl)', 'meta.news.jumpUrl'],
          ['预览图片(preview)', 'meta.news.preview'],
          ['地图名称(name)', 'meta.Location.Search.name'],
          ['地图地址(address)', 'meta.Location.Search.address'],
          ['纬度(lat)', 'meta.Location.Search.lat'],
          ['经度(lng)', 'meta.Location.Search.lng'],
          ['名片昵称(nickname)', 'meta.contact.nickname'],
          ['名片头像(avatar)', 'meta.contact.avatar'],
          ['名片联系信息(contact)', 'meta.contact.contact'],
          ['名片来源标签(tag)', 'meta.contact.tag'],
          ['名片跳转链接(jumpUrl)', 'meta.contact.jumpUrl'],
          ['卡片来源(bizsrc)', 'bizsrc'],
          ['创建时间(ctime)', 'config.ctime'],
        ],
      },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '使用点号路径从JSON卡片中获取值，可连接到任意类型输入',
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
    tooltip: '介绍：检查消息是否包含视频\n输入：消息 - 消息对象\n输出：布尔值',
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
    tooltip: '介绍：检查消息是否包含表情\n输入：消息 - 消息对象\n输出：布尔值',
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
    tooltip: '介绍：检查消息是否@了机器人\n输入：消息 - 消息对象\n输出：布尔值',
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
    tooltip: '介绍：检查消息是否@了所有人\n输入：消息 - 消息对象\n输出：布尔值',
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
    tooltip: '介绍：下载文件并转为Base64编码存入变量\n输入：URL - 字符串；变量 - 用于存储结果的变量\n输出：无（结果存入变量）',
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
    tooltip: '介绍：回复私聊消息，可指定引用消息ID\n输入：用户ID - 数字或字符串；引用消息ID - 数字或字符串；内容 - 字符串\n输出：无',
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
    tooltip: '介绍：回复群消息，可指定引用消息ID\n输入：群ID - 数字或字符串；引用消息ID - 数字或字符串；内容 - 字符串\n输出：无',
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
    tooltip: '介绍：发送群消息并将API响应存入变量\n输入：群号 - 数字或字符串；内容 - 字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
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
    tooltip: '介绍：发送私聊消息并将API响应存入变量\n输入：用户ID - 数字或字符串；内容 - 字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
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
    tooltip: '介绍：发送Base64编码的图片到群\n输入：群ID - 数字或字符串；图片数据 - Base64编码的字符串\n输出：无',
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
    tooltip: '介绍：发送Base64编码的图片到私聊\n输入：用户ID - 数字或字符串；图片数据 - Base64编码的字符串\n输出：无',
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
    tooltip: '介绍：获取指定消息的详细信息\n输入：消息ID - 数字或字符串\n输出：对象（消息详情）',
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
    tooltip: '介绍：获取合并转发消息的详细内容\n输入：消息ID - 字符串\n输出：对象（转发消息详情）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_group_msg_history',
    message0: '获取群历史消息 群号 %1 起始序号 %2 数量 %3 倒序 %4',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'MESSAGE_SEQ', check: ['Number', 'String'] },
      { type: 'input_value', name: 'COUNT', check: 'Number' },
      { type: 'field_dropdown', name: 'REVERSE_ORDER', options: [['否', 'FALSE'], ['是', 'TRUE']] },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：获取群组的历史消息记录\n输入：群号 - 数字或字符串；起始序号 - 数字（填0表示从最新开始）；数量 - 数字；倒序 - 下拉选择\n输出：对象（消息列表）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_friend_msg_history',
    message0: '获取好友历史消息 QQ %1 起始序号 %2 数量 %3 倒序 %4',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'MESSAGE_SEQ', check: ['Number', 'String'] },
      { type: 'input_value', name: 'COUNT', check: 'Number' },
      { type: 'field_dropdown', name: 'REVERSE_ORDER', options: [['否', 'FALSE'], ['是', 'TRUE']] },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：获取与好友的历史消息记录\n输入：QQ - 数字或字符串；起始序号 - 数字（填0表示从最新开始）；数量 - 数字；倒序 - 下拉选择\n输出：对象（消息列表）',
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
    tooltip: '介绍：获取消息中图片的详细信息\n输入：文件名 - 字符串\n输出：对象（图片详情）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_record',
    message0: '获取语音详情 文件名 %1 输出格式 %2',
    args0: [
      { type: 'input_value', name: 'FILE', check: 'String' },
      { type: 'input_value', name: 'OUT_FORMAT', check: 'String' },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：获取语音消息的详细信息\n输入：文件名 - 字符串；输出格式 - 字符串（mp3, amr, wma, m4a, spx, ogg, wav, flac）\n输出：对象（语音详情）',
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
    tooltip: '介绍：获取消息中文件的详细信息\n输入：文件名 - 字符串\n输出：对象（文件详情）',
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
    tooltip: '介绍：将单条消息转发到指定群组\n输入：消息ID - 数字或字符串；群ID - 数字或字符串\n输出：无',
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
    tooltip: '介绍：将单条消息转发给指定好友\n输入：消息ID - 数字或字符串；用户ID - 数字或字符串\n输出：无',
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
    tooltip: '介绍：将指定消息标记为已读\n输入：消息ID - 数字或字符串\n输出：无',
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
    tooltip: '介绍：对消息进行表情回应\n输入：消息ID - 数字或字符串；表情ID - 数字\n输出：无',
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
    tooltip: '介绍：取消对消息的表情回应\n输入：消息ID - 数字或字符串；表情ID - 数字\n输出：无',
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
    tooltip: '介绍：从群精华消息中删除指定消息\n输入：消息ID - 数字或字符串\n输出：无',
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
    tooltip: '介绍：将语音消息转换为文字\n输入：消息ID - 数字或字符串\n输出：字符串（转换后的文字）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_send_group_ai_record',
    message0: '发送群AI语音 群号 %1 文本 %2 角色 %3 语音类型 %4',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'TEXT', check: 'String' },
      { type: 'input_value', name: 'CHARACTER', check: 'String' },
      { type: 'field_dropdown', name: 'CHAT_TYPE', options: [['普通', '1'], ['变声', '2']] },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：使用AI语音发送群消息\n输入：群号 - 数字或字符串；文本 - 字符串；角色 - 字符串；语音类型 - 下拉选择（普通/变声）\n输出：无',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_ai_characters',
    message0: '获取AI语音角色列表 群号 %1 语音类型 %2',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'field_dropdown', name: 'CHAT_TYPE', options: [['普通', '1'], ['变声', '2']] },
    ],
    output: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：获取群AI语音可用的角色列表\n输入：群号 - 数字或字符串；语音类型 - 下拉选择（普通/变声）\n输出：对象（角色列表）',
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
    tooltip: '介绍：获取群组中被禁言的成员列表\n输入：群号 - 数字或字符串\n输出：对象（禁言列表）',
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
    tooltip: '介绍：获取已被过滤的加群请求通知\n输入：群号 - 数字或字符串\n输出：对象（已过滤的加群通知）',
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
    tooltip: '介绍：退出指定群组\n输入：群号 - 数字或字符串\n输出：无',
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
    tooltip: '介绍：设置群成员的专属头衔\n输入：群号 - 数字或字符串；QQ - 数字或字符串；头衔 - 字符串\n输出：无',
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
    tooltip: '介绍：设置群备注名称\n输入：群号 - 数字或字符串；备注 - 字符串\n输出：无',
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
    tooltip: '介绍：设置群组消息接收方式\n输入：群号 - 数字或字符串；方式 - 数字\n输出：无',
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
    tooltip: '介绍：在群组中发送打卡\n输入：群号 - 数字或字符串\n输出：无',
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
    tooltip: '介绍：批量踢出群成员\n输入：群号 - 数字或字符串；QQ列表 - 数组\n输出：无',
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
    tooltip: '介绍：获取群公告列表\n输入：群号 - 数字或字符串\n输出：对象（公告列表）',
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
    tooltip: '介绍：发送群公告\n输入：群号 - 数字或字符串；内容 - 字符串；图片 - 字符串；置顶 - 下拉选择；需确认 - 下拉选择\n输出：无',
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
    tooltip: '介绍：删除指定的群公告\n输入：群号 - 数字或字符串；公告ID - 字符串\n输出：无',
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
    tooltip: '介绍：获取群相册列表\n输入：群号 - 数字或字符串\n输出：对象（相册列表）',
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
    tooltip: '介绍：创建新的群相册\n输入：群号 - 数字或字符串；名称 - 字符串；描述 - 字符串\n输出：无',
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
    tooltip: '介绍：删除指定的群相册\n输入：群号 - 数字或字符串；相册ID - 字符串\n输出：无',
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
    tooltip: '介绍：上传图片到群相册\n输入：群号 - 数字或字符串；相册ID - 字符串；文件列表 - 数组\n输出：无',
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
    tooltip: '介绍：获取陌生人的详细信息\n输入：QQ - 数字或字符串\n输出：对象（陌生人信息）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_friend_list',
    message0: '获取好友列表',
    output: null,
    colour: COLOR_HUE.user,
    tooltip: '介绍：获取好友列表\n输入：无\n输出：对象（好友列表）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_friends_with_category',
    message0: '获取好友列表(带分组)',
    output: null,
    colour: COLOR_HUE.user,
    tooltip: '介绍：获取带分组信息的好友列表\n输入：无\n输出：对象（带分组的好友列表）',
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
    tooltip: '介绍：删除指定好友\n输入：QQ - 数字或字符串\n输出：无',
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
    tooltip: '介绍：设置好友备注名称\n输入：QQ - 数字或字符串；备注 - 字符串\n输出：无',
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
    tooltip: '介绍：将好友移动到指定分组\n输入：QQ - 数字或字符串；分组ID - 数字\n输出：无',
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
    tooltip: '介绍：获取我赞过谁的用户列表\n输入：起始 - 数字；数量 - 数字\n输出：对象（赞过列表）',
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
    tooltip: '介绍：获取谁赞过我的用户列表\n输入：起始 - 数字；数量 - 数字\n输出：对象（被赞列表）',
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
    tooltip: '介绍：获取QQ用户或QQ群的头像URL\n输入：QQ - 数字或字符串；群号 - 数字或字符串\n输出：字符串（头像URL）',
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
    tooltip: '介绍：设置当前登录号的头像\n输入：文件 - 字符串\n输出：无',
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
    tooltip: '介绍：设置登录号的个人资料\n输入：昵称 - 字符串；说明 - 字符串\n输出：无',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_robot_uin_range',
    message0: '获取官方机器人QQ号范围',
    output: null,
    colour: COLOR_HUE.user,
    tooltip: '介绍：获取官方机器人QQ号的范围\n输入：无\n输出：对象（QQ号范围）',
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
    tooltip: '介绍：双击好友头像戳一戳\n输入：QQ - 数字或字符串\n输出：无',
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
    tooltip: '介绍：处理加好友请求\n输入：Flag - 字符串；同意 - 下拉选择；备注 - 字符串\n输出：无',
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
    tooltip: '介绍：处理加群请求\n输入：Flag - 字符串；同意 - 下拉选择；原因 - 字符串\n输出：无',
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
    tooltip: '介绍：获取被系统过滤的好友请求\n输入：数量 - 数字\n输出：对象（被过滤的好友请求）',
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
    tooltip: '介绍：处理被过滤的好友请求\n输入：Flag - 字符串\n输出：无',
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
    tooltip: '介绍：上传文件到群文件区\n输入：群号 - 数字或字符串；文件 - 字符串；名称 - 字符串；文件夹ID - 字符串\n输出：无',
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
    tooltip: '介绍：上传文件到私聊\n输入：QQ - 数字或字符串；文件 - 字符串；名称 - 字符串\n输出：无',
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
    tooltip: '介绍：删除群文件\n输入：群号 - 数字或字符串；文件ID - 字符串\n输出：无',
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
    tooltip: '介绍：删除群文件夹\n输入：群号 - 数字或字符串；文件夹ID - 字符串\n输出：无',
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
    tooltip: '介绍：在群文件中创建文件夹\n输入：群号 - 数字或字符串；名称 - 字符串\n输出：无',
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
    tooltip: '介绍：重命名群文件夹\n输入：群号 - 数字或字符串；文件夹ID - 字符串；新名称 - 字符串\n输出：无',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_move_group_file',
    message0: '移动群文件 群号 %1 文件ID %2 当前目录 %3 目标目录 %4',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'FILE_ID', check: 'String' },
      { type: 'input_value', name: 'PARENT_DIRECTORY', check: 'String' },
      { type: 'input_value', name: 'TARGET_DIRECTORY', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.file,
    tooltip: '介绍：移动群文件到指定目录\n输入：群号 - 数字或字符串；文件ID - 字符串；当前目录 - 字符串（空表示根目录）；目标目录 - 字符串\n输出：无',
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
    tooltip: '介绍：将临时群文件转为永久文件\n输入：群号 - 数字或字符串；文件ID - 字符串\n输出：无',
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
    tooltip: '介绍：获取群文件的下载链接\n输入：群号 - 数字或字符串；文件ID - 字符串\n输出：对象（文件下载链接）',
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
    tooltip: '介绍：获取私聊文件的下载链接\n输入：文件ID - 字符串\n输出：对象（文件下载链接）',
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
    tooltip: '介绍：获取闪传文件的详细信息\n输入：分享链接 - 字符串；文件集ID - 字符串\n输出：对象（文件信息）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_download_file',
    message0: '下载文件 链接 %1 Base64 %2 名称 %3 请求头 %4',
    args0: [
      { type: 'input_value', name: 'URL', check: 'String' },
      { type: 'input_value', name: 'BASE64', check: 'String' },
      { type: 'input_value', name: 'NAME', check: 'String' },
      { type: 'input_value', name: 'HEADERS', check: 'Array' },
    ],
    output: null,
    colour: COLOR_HUE.file,
    tooltip: '介绍：下载文件到缓存目录\n输入：链接 - 字符串；Base64 - 字符串（二选一）；名称 - 字符串；请求头 - 数组\n输出：对象（下载结果）',
    helpUrl: HELP_URL.block,
  },
  // ========== OneBot API 积木 - 系统 ==========
  {
    type: 'onebot_get_login_info',
    message0: '获取登录信息',
    output: null,
    colour: COLOR_HUE.system,
    tooltip: '介绍：获取当前登录号的信息\n输入：无\n输出：对象（登录信息）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_version_info',
    message0: '获取版本信息',
    output: null,
    colour: COLOR_HUE.system,
    tooltip: '介绍：获取OneBot实现的版本信息\n输入：无\n输出：对象（版本信息）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_status',
    message0: '获取运行状态',
    output: null,
    colour: COLOR_HUE.system,
    tooltip: '介绍：获取机器人的运行状态\n输入：无\n输出：对象（运行状态）',
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
    tooltip: '介绍：获取指定域名的Cookies\n输入：域名 - 字符串\n输出：字符串（Cookies）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_rkey',
    message0: '获取图片RKey',
    output: null,
    colour: COLOR_HUE.system,
    tooltip: '介绍：获取图片RKey\n输入：无\n输出：字符串（RKey）',
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
    tooltip: '介绍：设置机器人的在线状态\n输入：状态 - 数字；扩展状态 - 数字；电量 - 数字\n输出：无',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_set_restart',
    message0: '重启OneBot',
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.system,
    tooltip: '介绍：重启OneBot服务\n输入：无\n输出：无',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_clean_cache',
    message0: '清理缓存',
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.system,
    tooltip: '介绍：清理缓存数据\n输入：无\n输出：无',
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
    tooltip: '介绍：扫描图片中的二维码\n输入：文件 - 字符串\n输出：对象（二维码内容）',
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
    tooltip: '介绍：对图片进行OCR文字识别\n输入：图片 - 字符串\n输出：对象（识别出的文字）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_fetch_custom_face',
    message0: '获取收藏表情',
    output: null,
    colour: COLOR_HUE.system,
    tooltip: '介绍：获取收藏的表情列表\n输入：无\n输出：对象（收藏表情列表）',
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
    tooltip: '介绍：根据关键词获取推荐表情\n输入：关键词 - 字符串\n输出：对象（推荐表情列表）',
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
    tooltip: '介绍：发送自定义Protobuf数据包\n输入：命令 - 字符串；数据 - 字符串（十六进制）\n输出：无',
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
    tooltip: '介绍：检查URL链接的安全性\n输入：链接 - 字符串\n输出：对象（安全检查结果）',
    helpUrl: HELP_URL.block,
  },
  // ========== 自定义Lua代码积木 ==========
  {
    type: 'lua_custom_code',
    message0: '自定义Lua代码 %1',
    args0: [
      {
        type: 'field_multilinetext',
        name: 'CODE',
        text: '',
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.advanced,
    tooltip: '介绍：直接输入Lua原生代码，会原样输出到生成的代码中\n输入：代码 - 多行文本\n输出：无（直接输出代码）',
    helpUrl: HELP_URL.block,
  },
  // ========== JSON配置积木 ==========
  {
    type: 'json_config_input',
    message0: 'JSON配置 %1',
    args0: [
      {
        type: 'field_multilinetext',
        name: 'JSON',
        text: '{}',
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.advanced,
    tooltip: '介绍：输入JSON格式的配置内容，用于插件配置\n输入：JSON - 多行文本（JSON格式）\n输出：无（作为配置使用）',
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
    tooltip: '介绍：单行注释，不会执行任何代码\n输入：注释内容 - 字符串\n输出：无',
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
    tooltip: '介绍：将一段代码块注释掉，不会执行\n输入：注释说明 - 字符串；代码块 - 语句输入\n输出：无',
    helpUrl: HELP_URL.block,
  },
  // ========== 换行符积木 ==========
  {
    type: 'text_newline',
    message0: '换行符',
    output: 'String',
    colour: COLOR_HUE.text,
    tooltip: '介绍：换行符\\n，用于在文本中插入换行\n输入：无\n输出：字符串（换行符）',
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
    tooltip: '介绍：将三个文本连接成一个文本\n输入：文本1 - 字符串；文本2 - 字符串；文本3 - 字符串\n输出：字符串（连接后的文本）',
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
    tooltip: '介绍：将四个文本连接成一个文本\n输入：文本1 - 字符串；文本2 - 字符串；文本3 - 字符串；文本4 - 字符串\n输出：字符串（连接后的文本）',
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
  // ========== API调用带变量积木（通用） ==========
  {
    type: 'api_call_with_var',
    message0: '调用API %1 参数1 %2 参数2 %3 响应存入 %4',
    args0: [
      { type: 'field_input', name: 'API_NAME', text: '' },
      { type: 'input_value', name: 'PARAM1' },
      { type: 'input_value', name: 'PARAM2' },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.advanced,
    tooltip: '介绍：调用任意API并将JSON响应存入变量\n输入：API名称 - 字符串；参数1 - 任意类型；参数2 - 任意类型\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  // ========== OneBot API 积木 - 带变量版本（群管理） ==========
  {
    type: 'onebot_set_group_whole_ban_with_var',
    message0: '设置群 %1 全员禁言 %2 响应存入 %3',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'field_dropdown', name: 'ENABLE', options: [['开启', 'TRUE'], ['关闭', 'FALSE']] },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '介绍：设置全员禁言并将API响应存入变量\n输入：群号 - 数字或字符串；状态 - 下拉选择；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_set_group_admin_with_var',
    message0: '设置群 %1 成员 %2 管理员 %3 响应存入 %4',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'field_dropdown', name: 'ENABLE', options: [['是', 'TRUE'], ['否', 'FALSE']] },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '介绍：设置群管理员并将API响应存入变量\n输入：群号 - 数字或字符串；用户ID - 数字或字符串；状态 - 下拉选择；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_set_group_card_with_var',
    message0: '设置群 %1 成员 %2 名片 %3 响应存入 %4',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'CARD', check: 'String' },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '介绍：设置群成员名片并将API响应存入变量\n输入：群号 - 数字或字符串；用户ID - 数字或字符串；名片 - 字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_set_group_kick_with_var',
    message0: '踢出群 %1 成员 %2 拒绝加群 %3 响应存入 %4',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'field_dropdown', name: 'REJECT', options: [['是', 'TRUE'], ['否', 'FALSE']] },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '介绍：踢出群成员并将API响应存入变量\n输入：群号 - 数字或字符串；用户ID - 数字或字符串；拒绝 - 下拉选择；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_set_group_ban_with_var',
    message0: '禁言群 %1 成员 %2 时长 %3 秒 响应存入 %4',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'DURATION', check: 'Number' },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '介绍：禁言群成员并将API响应存入变量\n输入：群号 - 数字或字符串；用户ID - 数字或字符串；时长 - 数字（秒）；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_set_group_name_with_var',
    message0: '设置群 %1 名称为 %2 响应存入 %3',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'NAME', check: 'String' },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '介绍：设置群名称并将API响应存入变量\n输入：群号 - 数字或字符串；名称 - 字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_send_group_msg_with_var',
    message0: '发送群消息 群号 %1 内容 %2 响应存入 %3',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'CONTENT', check: 'String' },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：发送群消息并将API响应存入变量\n输入：群号 - 数字或字符串；内容 - 字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_send_private_msg_with_var',
    message0: '发送私聊消息 QQ %1 内容 %2 响应存入 %3',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'CONTENT', check: 'String' },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：发送私聊消息并将API响应存入变量\n输入：QQ - 数字或字符串；内容 - 字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_delete_msg_with_var',
    message0: '撤回消息 %1 响应存入 %2',
    args0: [
      { type: 'input_value', name: 'MESSAGE_ID', check: ['Number', 'String'] },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：撤回消息并将API响应存入变量\n输入：消息ID - 数字或字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_set_essence_msg_with_var',
    message0: '设置精华消息 %1 响应存入 %2',
    args0: [
      { type: 'input_value', name: 'MESSAGE_ID', check: ['Number', 'String'] },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：设置精华消息并将API响应存入变量\n输入：消息ID - 数字或字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_send_like_with_var',
    message0: '给 %1 点赞 %2 次 响应存入 %3',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'TIMES', check: 'Number' },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：发送好友赞并将API响应存入变量\n输入：用户ID - 数字或字符串；次数 - 数字；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  // ========== OneBot API 积木 - 带变量版本（好友管理） ==========
  {
    type: 'onebot_set_friend_remark_with_var',
    message0: '设置好友备注 QQ %1 备注 %2 响应存入 %3',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'REMARK', check: 'String' },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.user,
    tooltip: '介绍：设置好友备注并将API响应存入变量\n输入：QQ - 数字或字符串；备注 - 字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_delete_friend_with_var',
    message0: '删除好友 QQ %1 响应存入 %2',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.user,
    tooltip: '介绍：删除好友并将API响应存入变量\n输入：QQ - 数字或字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  // ========== OneBot API 积木 - 带变量版本（文件操作） ==========
  {
    type: 'onebot_upload_group_file_with_var',
    message0: '上传群文件 群号 %1 文件 %2 名称 %3 响应存入 %4',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'FILE', check: 'String' },
      { type: 'input_value', name: 'NAME', check: 'String' },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.file,
    tooltip: '介绍：上传群文件并将API响应存入变量\n输入：群号 - 数字或字符串；文件 - 字符串；名称 - 字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_delete_group_file_with_var',
    message0: '删除群文件 群号 %1 文件ID %2 响应存入 %3',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'FILE_ID', check: 'String' },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.file,
    tooltip: '介绍：删除群文件并将API响应存入变量\n输入：群号 - 数字或字符串；文件ID - 字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  // ========== HTTP请求积木 - 带变量版本 ==========
  {
    type: 'http_get_with_var',
    message0: 'HTTP GET 请求 %1 响应存入 %2',
    args0: [
      { type: 'input_value', name: 'URL', check: 'String' },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.http,
    tooltip: '介绍：发送HTTP GET请求并将响应存入变量\n输入：URL - 字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'http_post_with_var',
    message0: 'HTTP POST 请求 %1 内容 %2 响应存入 %3',
    args0: [
      { type: 'input_value', name: 'URL', check: 'String' },
      { type: 'input_value', name: 'BODY', check: 'String' },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.http,
    tooltip: '介绍：发送HTTP POST请求并将响应存入变量\n输入：URL - 字符串；内容 - 字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  // ========== OneBot API 积木 - 带变量版本（消息查询） ==========
  {
    type: 'onebot_get_msg_with_var',
    message0: '获取消息详情 消息ID %1 响应存入 %2',
    args0: [
      { type: 'input_value', name: 'MESSAGE_ID', check: ['Number', 'String'] },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：获取消息详情并将响应存入变量\n输入：消息ID - 数字或字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_forward_msg_with_var',
    message0: '获取转发消息 消息ID %1 响应存入 %2',
    args0: [
      { type: 'input_value', name: 'MESSAGE_ID', check: 'String' },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：获取转发消息并将响应存入变量\n输入：消息ID - 字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_group_msg_history_with_var',
    message0: '获取群历史消息 群号 %1 起始序号 %2 数量 %3 倒序 %4 响应存入 %5',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'MESSAGE_SEQ', check: ['Number', 'String'] },
      { type: 'input_value', name: 'COUNT', check: 'Number' },
      { type: 'field_dropdown', name: 'REVERSE_ORDER', options: [['否', 'FALSE'], ['是', 'TRUE']] },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：获取群历史消息并将响应存入变量\n输入：群号 - 数字或字符串；起始序号 - 数字（填0表示从最新开始）；数量 - 数字；倒序 - 下拉选择；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_friend_msg_history_with_var',
    message0: '获取好友历史消息 QQ %1 起始序号 %2 数量 %3 倒序 %4 响应存入 %5',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'MESSAGE_SEQ', check: ['Number', 'String'] },
      { type: 'input_value', name: 'COUNT', check: 'Number' },
      { type: 'field_dropdown', name: 'REVERSE_ORDER', options: [['否', 'FALSE'], ['是', 'TRUE']] },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：获取好友历史消息并将响应存入变量\n输入：QQ - 数字或字符串；起始序号 - 数字（填0表示从最新开始）；数量 - 数字；倒序 - 下拉选择；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  // ========== OneBot API 积木 - 带变量版本（消息操作） ==========
  {
    type: 'onebot_forward_group_single_msg_with_var',
    message0: '转发群消息 消息ID %1 到群 %2 响应存入 %3',
    args0: [
      { type: 'input_value', name: 'MESSAGE_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：转发群消息并将响应存入变量\n输入：消息ID - 数字或字符串；群ID - 数字或字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_forward_friend_single_msg_with_var',
    message0: '转发好友消息 消息ID %1 到用户 %2 响应存入 %3',
    args0: [
      { type: 'input_value', name: 'MESSAGE_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：转发好友消息并将响应存入变量\n输入：消息ID - 数字或字符串；用户ID - 数字或字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_delete_essence_msg_with_var',
    message0: '取消精华消息 消息ID %1 响应存入 %2',
    args0: [
      { type: 'input_value', name: 'MESSAGE_ID', check: ['Number', 'String'] },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：取消精华消息并将响应存入变量\n输入：消息ID - 数字或字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_mark_msg_as_read_with_var',
    message0: '标记消息已读 消息ID %1 响应存入 %2',
    args0: [
      { type: 'input_value', name: 'MESSAGE_ID', check: ['Number', 'String'] },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：标记消息已读并将响应存入变量\n输入：消息ID - 数字或字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_set_msg_emoji_like_with_var',
    message0: '设置消息表情点赞 消息ID %1 表情ID %2 响应存入 %3',
    args0: [
      { type: 'input_value', name: 'MESSAGE_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'EMOJI_ID', check: 'String' },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：设置消息表情点赞并将响应存入变量\n输入：消息ID - 数字或字符串；表情ID - 字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_unset_msg_emoji_like_with_var',
    message0: '取消消息表情点赞 消息ID %1 表情ID %2 响应存入 %3',
    args0: [
      { type: 'input_value', name: 'MESSAGE_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'EMOJI_ID', check: 'String' },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.message,
    tooltip: '介绍：取消消息表情点赞并将响应存入变量\n输入：消息ID - 数字或字符串；表情ID - 字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  // ========== OneBot API 积木 - 带变量版本（群信息查询） ==========
  {
    type: 'onebot_get_group_info_with_var',
    message0: '获取群信息 群号 %1 响应存入 %2',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '介绍：获取群信息并将响应存入变量\n输入：群号 - 数字或字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_group_member_info_with_var',
    message0: '获取群成员信息 群号 %1 QQ %2 响应存入 %3',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '介绍：获取群成员信息并将响应存入变量\n输入：群号 - 数字或字符串；QQ - 数字或字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_group_member_list_with_var',
    message0: '获取群成员列表 群号 %1 响应存入 %2',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '介绍：获取群成员列表并将响应存入变量\n输入：群号 - 数字或字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_group_list_with_var',
    message0: '获取群列表 响应存入 %1',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '介绍：获取群列表并将响应存入变量\n输入：变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  // ========== OneBot API 积木 - 带变量版本（群管理） ==========
  {
    type: 'onebot_set_group_leave_with_var',
    message0: '退出群 群号 %1 解散 %2 响应存入 %3',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'field_dropdown', name: 'DISMISS', options: [['否', 'FALSE'], ['是', 'TRUE']] },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '介绍：退出群并将响应存入变量\n输入：群号 - 数字或字符串；解散 - 下拉选择；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_set_group_special_title_with_var',
    message0: '设置群头衔 群号 %1 QQ %2 头衔 %3 响应存入 %4',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'TITLE', check: 'String' },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.group,
    tooltip: '介绍：设置群头衔并将响应存入变量\n输入：群号 - 数字或字符串；QQ - 数字或字符串；头衔 - 字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  // ========== OneBot API 积木 - 带变量版本（好友信息查询） ==========
  {
    type: 'onebot_get_stranger_info_with_var',
    message0: '获取陌生人信息 QQ %1 响应存入 %2',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.user,
    tooltip: '介绍：获取陌生人信息并将响应存入变量\n输入：QQ - 数字或字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_friend_info_with_var',
    message0: '获取好友信息 QQ %1 响应存入 %2',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.user,
    tooltip: '介绍：获取好友信息并将响应存入变量\n输入：QQ - 数字或字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_friend_list_with_var',
    message0: '获取好友列表 响应存入 %1',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.user,
    tooltip: '介绍：获取好友列表并将响应存入变量\n输入：变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  // ========== OneBot API 积木 - 带变量版本（好友操作） ==========
  {
    type: 'onebot_friend_poke_with_var',
    message0: '好友戳一戳 QQ %1 响应存入 %2',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.user,
    tooltip: '介绍：好友戳一戳并将响应存入变量\n输入：QQ - 数字或字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_set_friend_category_with_var',
    message0: '设置好友分组 QQ %1 分组ID %2 响应存入 %3',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'CATEGORY_ID', check: 'Number' },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.user,
    tooltip: '介绍：设置好友分组并将响应存入变量\n输入：QQ - 数字或字符串；分组ID - 数字；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  // ========== OneBot API 积木 - 带变量版本（请求处理） ==========
  {
    type: 'onebot_set_friend_add_request_with_var',
    message0: '处理好友请求 Flag %1 同意 %2 备注 %3 响应存入 %4',
    args0: [
      { type: 'input_value', name: 'FLAG', check: 'String' },
      { type: 'field_dropdown', name: 'APPROVE', options: [['是', 'TRUE'], ['否', 'FALSE']] },
      { type: 'input_value', name: 'REMARK', check: 'String' },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.request,
    tooltip: '介绍：处理好友请求并将响应存入变量\n输入：Flag - 字符串；同意 - 下拉选择；备注 - 字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_set_group_add_request_with_var',
    message0: '处理加群请求 Flag %1 同意 %2 原因 %3 响应存入 %4',
    args0: [
      { type: 'input_value', name: 'FLAG', check: 'String' },
      { type: 'field_dropdown', name: 'APPROVE', options: [['是', 'TRUE'], ['否', 'FALSE']] },
      { type: 'input_value', name: 'REASON', check: 'String' },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.request,
    tooltip: '介绍：处理加群请求并将响应存入变量\n输入：Flag - 字符串；同意 - 下拉选择；原因 - 字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  // ========== OneBot API 积木 - 带变量版本（文件操作） ==========
  {
    type: 'onebot_upload_private_file_with_var',
    message0: '上传私聊文件 QQ %1 文件 %2 名称 %3 响应存入 %4',
    args0: [
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'FILE', check: 'String' },
      { type: 'input_value', name: 'NAME', check: 'String' },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.file,
    tooltip: '介绍：上传私聊文件并将响应存入变量\n输入：QQ - 数字或字符串；文件 - 字符串；名称 - 字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_delete_group_folder_with_var',
    message0: '删除群文件夹 群号 %1 文件夹ID %2 响应存入 %3',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'FOLDER_ID', check: 'String' },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.file,
    tooltip: '介绍：删除群文件夹并将响应存入变量\n输入：群号 - 数字或字符串；文件夹ID - 字符串；变量 - 用于存储响应的变量\n输出：无（响应存入变量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_create_group_file_folder_with_var',
    message0: '创建群文件夹 群号 %1 名称 %2 响应存入 %3',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'NAME', check: 'String' },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.file,
    tooltip: '创建群文件夹并将响应存入变量',
    helpUrl: HELP_URL.block,
  },
  // ========== OneBot API 积木 - 带变量版本（系统） ==========
  {
    type: 'onebot_get_login_info_with_var',
    message0: '获取登录信息 响应存入 %1',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.system,
    tooltip: '获取登录信息并将响应存入变量',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_version_info_with_var',
    message0: '获取版本信息 响应存入 %1',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.system,
    tooltip: '获取版本信息并将响应存入变量',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_status_with_var',
    message0: '获取运行状态 响应存入 %1',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.system,
    tooltip: '获取运行状态并将响应存入变量',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_get_cookies_with_var',
    message0: '获取Cookies 域名 %1 响应存入 %2',
    args0: [
      { type: 'input_value', name: 'DOMAIN', check: 'String' },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.system,
    tooltip: '获取Cookies并将响应存入变量',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'onebot_set_qq_profile_with_var',
    message0: '设置个人资料 昵称 %1 说明 %2 响应存入 %3',
    args0: [
      { type: 'input_value', name: 'NICKNAME', check: 'String' },
      { type: 'input_value', name: 'PERSONAL_NOTE', check: 'String' },
      { type: 'field_variable', name: 'VAR', variable: 'response' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.user,
    tooltip: '设置个人资料并将响应存入变量',
    helpUrl: HELP_URL.block,
  },
  // ========== 管理员验证积木 ==========
  {
    type: 'msg_is_group_admin',
    message0: '群 %1 用户 %2 是管理员',
    args0: [
      { type: 'input_value', name: 'GROUP_ID', check: ['Number', 'String'] },
      { type: 'input_value', name: 'USER_ID', check: ['Number', 'String'] },
    ],
    output: 'Boolean',
    colour: COLOR_HUE.group,
    tooltip: '【输入】群号: 数字或字符串；用户ID: 数字或字符串\n【输出】布尔值（是否为群主或管理员）',
    helpUrl: HELP_URL.block,
  },
  // ========== URL检测与提取积木 ==========
  {
    type: 'msg_has_url',
    message0: '消息 %1 包含URL链接',
    args0: [
      { type: 'input_value', name: 'EVENT', check: 'Event' },
    ],
    output: 'Boolean',
    colour: COLOR_HUE.message,
    tooltip: '【输入】事件: 事件对象\n【输出】布尔值（消息中是否包含URL链接）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_count_urls',
    message0: '消息 %1 中URL链接的数量',
    args0: [
      { type: 'input_value', name: 'EVENT', check: 'Event' },
    ],
    output: 'Number',
    colour: COLOR_HUE.message,
    tooltip: '【输入】事件: 事件对象\n【输出】数字（消息中URL链接的数量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'msg_get_urls',
    message0: '获取消息 %1 中的URL链接 第 %2 个',
    args0: [
      { type: 'input_value', name: 'EVENT', check: 'Event' },
      { type: 'input_value', name: 'INDEX', check: 'Number' },
    ],
    output: 'String',
    colour: COLOR_HUE.message,
    tooltip: '【输入】事件: 事件对象；索引: 数字（从1开始）\n【输出】字符串（指定位置的URL，不填索引则返回所有URL组成的表）',
    helpUrl: HELP_URL.block,
  },
  // ========== URL/域名处理积木 ==========
  {
    type: 'url_extract_domain',
    message0: '从URL %1 提取域名',
    args0: [
      { type: 'input_value', name: 'URL', check: 'String' },
    ],
    output: 'String',
    colour: COLOR_HUE.utils,
    tooltip: '【输入】URL字符串\n【输出】域名（如 https://www.example.com/path → www.example.com）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'url_extract_tld',
    message0: '从 %1 提取域名后缀',
    args0: [
      { type: 'input_value', name: 'URL_OR_DOMAIN', check: 'String' },
    ],
    output: 'String',
    colour: COLOR_HUE.utils,
    tooltip: '【输入】URL或域名字符串\n【输出】域名后缀（如 https://www.example.com → com，test.example.co.uk → co.uk）',
    helpUrl: HELP_URL.block,
  },
  // ========== 二维码检测与解析积木 ==========
  {
    type: 'message_image_has_qrcode',
    message0: '图片 %1 包含二维码',
    args0: [
      { type: 'input_value', name: 'IMAGE', check: 'String' },
    ],
    output: 'Boolean',
    colour: COLOR_HUE.message,
    tooltip: '【输入】图片: 字符串（图片URL或base64）\n【输出】布尔值（图片中是否包含二维码）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'message_image_count_qrcodes',
    message0: '图片 %1 中二维码的数量',
    args0: [
      { type: 'input_value', name: 'IMAGE', check: 'String' },
    ],
    output: 'Number',
    colour: COLOR_HUE.message,
    tooltip: '【输入】图片: 字符串（图片URL或base64）\n【输出】数字（图片中二维码的数量）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'message_image_get_qrcodes',
    message0: '获取图片 %1 中的二维码内容 第 %2 个',
    args0: [
      { type: 'input_value', name: 'IMAGE', check: 'String' },
      { type: 'input_value', name: 'INDEX', check: 'Number' },
    ],
    output: 'String',
    colour: COLOR_HUE.message,
    tooltip: '【输入】图片: 字符串（图片URL或base64）；索引: 数字（从1开始）\n【输出】字符串（指定位置的二维码内容，不填索引则返回所有二维码内容组成的表）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'simple_function_def',
    message0: '定义函数 函数名 %1',
    args0: [
      { type: 'field_input', name: 'NAME', text: '我的函数' },
    ],
    message1: '当执行函数时',
    args1: [],
    message2: '%1',
    args2: [
      { type: 'input_statement', name: 'BODY' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '介绍：定义一个简单的函数，函数名用于识别和调用\n使用：拖入其他积木到"当执行函数时"中定义函数内容，使用"执行函数"积木来调用',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'simple_function_call',
    message0: '执行函数 函数名 %1',
    args0: [
      { type: 'field_input', name: 'NAME', text: '我的函数' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '介绍：执行指定的函数\n输入：函数名 - 与定义函数时的名称对应\n输出：无（执行完毕后自动继续执行后续积木）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'schedule_interval_seconds',
    message0: '每 %1 秒执行一次',
    args0: [
      { type: 'field_number', name: 'SECONDS', value: 60, min: 1, max: 86400, precision: 1 },
    ],
    message1: '%1',
    args1: [
      { type: 'input_statement', name: 'HANDLER' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '介绍：创建一个每隔指定秒数执行一次的定时任务\n输入：秒数 - 1到86400之间的整数，表示每次执行的间隔秒数\n输出：无（自动重复执行）',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'schedule_interval_minutes',
    message0: '每 %1 分钟执行一次',
    args0: [
      { type: 'field_number', name: 'MINUTES', value: 1, min: 1, max: 1440, precision: 1 },
    ],
    message1: '%1',
    args1: [
      { type: 'input_statement', name: 'HANDLER' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '介绍：创建一个每隔指定分钟数执行一次的定时任务\n输入：分钟数 - 1到1440之间的整数，表示每次执行的间隔分钟数\n输出：无（自动重复执行）',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'schedule_interval_hours',
    message0: '每 %1 小时执行一次',
    args0: [
      { type: 'field_number', name: 'HOURS', value: 1, min: 1, max: 168, precision: 1 },
    ],
    message1: '%1',
    args1: [
      { type: 'input_statement', name: 'HANDLER' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '介绍：创建一个每隔指定小时数执行一次的定时任务\n输入：小时数 - 1到168之间的整数，表示每次执行的间隔小时数\n输出：无（自动重复执行）',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'schedule_weekly',
    message0: '每周 %1 的 %2 时 %3 分 %4 秒执行',
    args0: [
      {
        type: 'field_dropdown',
        name: 'WEEKDAY',
        options: [
          ['星期一', '1'],
          ['星期二', '2'],
          ['星期三', '3'],
          ['星期四', '4'],
          ['星期五', '5'],
          ['星期六', '6'],
          ['星期日', '0'],
        ],
      },
      { type: 'field_number', name: 'HOUR', value: 0, min: 0, max: 23, precision: 1 },
      { type: 'field_number', name: 'MINUTE', value: 0, min: 0, max: 59, precision: 1 },
      { type: 'field_number', name: 'SECOND', value: 0, min: 0, max: 59, precision: 1 },
    ],
    message1: '%1',
    args1: [
      { type: 'input_statement', name: 'HANDLER' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '介绍：创建一个在指定星期和时间执行的定时任务\n输入：星期 - 选择周一到周日；时/分/秒 - 0-23时，0-59分，0-59秒\n输出：无（在指定时间自动执行一次）',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'schedule_monthly',
    message0: '每月 %1 日的 %2 时 %3 分 %4 秒执行',
    args0: [
      { type: 'field_number', name: 'DAY', value: 1, min: 1, max: 31, precision: 1 },
      { type: 'field_number', name: 'HOUR', value: 0, min: 0, max: 23, precision: 1 },
      { type: 'field_number', name: 'MINUTE', value: 0, min: 0, max: 59, precision: 1 },
      { type: 'field_number', name: 'SECOND', value: 0, min: 0, max: 59, precision: 1 },
    ],
    message1: '%1',
    args1: [
      { type: 'input_statement', name: 'HANDLER' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '介绍：创建一个在每月指定日期和时间执行的定时任务\n输入：日期 - 1-31日（注意：部分月份不足31天会自动调整为最后一天）；时/分/秒 - 0-23时，0-59分，0-59秒\n输出：无（在指定时间自动执行一次）',
    helpUrl: HELP_URL.event,
  },
  {
    type: 'schedule_daily',
    message0: '每天 %1 时 %2 分 %3 秒执行',
    args0: [
      { type: 'field_number', name: 'HOUR', value: 0, min: 0, max: 23, precision: 1 },
      { type: 'field_number', name: 'MINUTE', value: 0, min: 0, max: 59, precision: 1 },
      { type: 'field_number', name: 'SECOND', value: 0, min: 0, max: 59, precision: 1 },
    ],
    message1: '%1',
    args1: [
      { type: 'input_statement', name: 'HANDLER' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.event,
    tooltip: '介绍：创建一个在每天指定时间执行的定时任务\n输入：时/分/秒 - 0-23时，0-59分，0-59秒\n输出：无（每天在指定时间自动执行一次）',
    helpUrl: HELP_URL.event,
  },

  // ========== 简化数据库积木（键值存储） ==========
  {
    type: 'simple_db_set',
    message0: '数据库存储 数据库 %1 键 %2 值 %3',
    args0: [
      { type: 'input_value', name: 'DB_NAME', check: 'String' },
      { type: 'input_value', name: 'KEY', check: 'String' },
      { type: 'input_value', name: 'VALUE' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.database,
    tooltip: '介绍：将值存储到数据库的指定键\n输入：数据库名 - 文件名；键 - 查找用的key；值 - 要存储的数据\n输出：无',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'simple_db_get',
    message0: '数据库读取 数据库 %1 键 %2 默认值 %3',
    args0: [
      { type: 'input_value', name: 'DB_NAME', check: 'String' },
      { type: 'input_value', name: 'KEY', check: 'String' },
      { type: 'input_value', name: 'DEFAULT' },
    ],
    output: 'String',
    colour: COLOR_HUE.database,
    tooltip: '介绍：从数据库读取指定键的值\n输入：数据库名 - 文件名；键 - 查找用的key；默认值 - 键不存在时返回\n输出：存储的值或默认值',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'simple_db_delete',
    message0: '数据库删除 数据库 %1 键 %2',
    args0: [
      { type: 'input_value', name: 'DB_NAME', check: 'String' },
      { type: 'input_value', name: 'KEY', check: 'String' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_HUE.database,
    tooltip: '介绍：从数据库删除指定键\n输入：数据库名 - 文件名；键 - 要删除的key\n输出：无',
    helpUrl: HELP_URL.block,
  },

  // ========== 增强时间积木 ==========
  // 获取单独时间单位
  {
    type: 'time_get_year',
    message0: '获取当前年份',
    output: 'Number',
    colour: COLOR_HUE.time,
    tooltip: '介绍：获取当前年份\n输入：无\n输出：数字（当前年份，如 2026）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'time_get_month',
    message0: '获取当前月份',
    output: 'Number',
    colour: COLOR_HUE.time,
    tooltip: '介绍：获取当前月份\n输入：无\n输出：数字（当前月份，1-12）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'time_get_day',
    message0: '获取当前日期',
    output: 'Number',
    colour: COLOR_HUE.time,
    tooltip: '介绍：获取当前日期（几号）\n输入：无\n输出：数字（当前日期，1-31）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'time_get_hour',
    message0: '获取当前小时',
    output: 'Number',
    colour: COLOR_HUE.time,
    tooltip: '介绍：获取当前小时\n输入：无\n输出：数字（当前小时，0-23）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'time_get_minute',
    message0: '获取当前分钟',
    output: 'Number',
    colour: COLOR_HUE.time,
    tooltip: '介绍：获取当前分钟\n输入：无\n输出：数字（当前分钟，0-59）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'time_get_second',
    message0: '获取当前秒数',
    output: 'Number',
    colour: COLOR_HUE.time,
    tooltip: '介绍：获取当前秒数\n输入：无\n输出：数字（当前秒数，0-59）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'time_get_weekday',
    message0: '获取当前星期',
    output: 'Number',
    colour: COLOR_HUE.time,
    tooltip: '介绍：获取当前星期几\n输入：无\n输出：数字（0=周日，1=周一，...，6=周六）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'time_get_weekday_name',
    message0: '获取当前星期名称',
    output: 'String',
    colour: COLOR_HUE.time,
    tooltip: '介绍：获取当前星期几的中文名称\n输入：无\n输出：字符串（如：星期一、星期二等）',
    helpUrl: HELP_URL.block,
  },
  // 格式化日期字符串
  {
    type: 'time_format_date',
    message0: '获取当前日期 %1',
    args0: [
      {
        type: 'field_dropdown',
        name: 'FORMAT',
        options: [
          ['YYYY-MM-DD', 'ymd-dash'],
          ['YYYY/MM/DD', 'ymd-slash'],
          ['YYYY年MM月DD日', 'ymd-chinese'],
          ['MM-DD-YYYY', 'mdy-dash'],
          ['MM/DD/YYYY', 'mdy-slash'],
          ['DD-MM-YYYY', 'dmy-dash'],
          ['DD/MM/YYYY', 'dmy-slash'],
        ],
      },
    ],
    output: 'String',
    colour: COLOR_HUE.time,
    tooltip: '介绍：获取当前日期字符串\n输入：格式 - 下拉选择日期格式\n输出：字符串（格式化后的日期）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'time_format_time',
    message0: '获取当前时间 %1',
    args0: [
      {
        type: 'field_dropdown',
        name: 'FORMAT',
        options: [
          ['HH:MM:SS', 'hms-colon'],
          ['HH时MM分SS秒', 'hms-chinese'],
          ['HH:MM', 'hm-colon'],
          ['HH时MM分', 'hm-chinese'],
        ],
      },
    ],
    output: 'String',
    colour: COLOR_HUE.time,
    tooltip: '介绍：获取当前时间字符串\n输入：格式 - 下拉选择时间格式\n输出：字符串（格式化后的时间）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'time_format_datetime',
    message0: '获取当前日期时间 %1',
    args0: [
      {
        type: 'field_dropdown',
        name: 'FORMAT',
        options: [
          ['YYYY-MM-DD HH:MM:SS', 'full-dash'],
          ['YYYY/MM/DD HH:MM:SS', 'full-slash'],
          ['YYYY年MM月DD日 HH时MM分SS秒', 'full-chinese'],
          ['YYYY-MM-DD HH:MM', 'no-sec-dash'],
          ['YYYY/MM/DD HH:MM', 'no-sec-slash'],
        ],
      },
    ],
    output: 'String',
    colour: COLOR_HUE.time,
    tooltip: '介绍：获取当前日期时间字符串\n输入：格式 - 下拉选择日期时间格式\n输出：字符串（格式化后的日期时间）',
    helpUrl: HELP_URL.block,
  },
  // 时间戳转换
  {
    type: 'time_timestamp_to_date',
    message0: '时间戳 %1 转日期 %2',
    args0: [
      { type: 'input_value', name: 'TIMESTAMP', check: 'Number' },
      {
        type: 'field_dropdown',
        name: 'FORMAT',
        options: [
          ['YYYY-MM-DD HH:MM:SS', 'full-dash'],
          ['YYYY/MM/DD HH:MM:SS', 'full-slash'],
          ['YYYY年MM月DD日 HH时MM分SS秒', 'full-chinese'],
          ['YYYY-MM-DD', 'date-dash'],
          ['YYYY/MM/DD', 'date-slash'],
          ['HH:MM:SS', 'time-colon'],
        ],
      },
    ],
    output: 'String',
    colour: COLOR_HUE.time,
    tooltip: '介绍：将Unix时间戳转换为日期字符串\n输入：时间戳 - 数字（Unix时间戳，秒或毫秒）；格式 - 下拉选择输出格式\n输出：字符串（格式化后的日期时间）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'time_date_to_timestamp',
    message0: '日期 %1 转时间戳',
    args0: [
      { type: 'input_value', name: 'DATE', check: 'String' },
    ],
    output: 'Number',
    colour: COLOR_HUE.time,
    tooltip: '介绍：将日期字符串转换为Unix时间戳\n输入：日期 - 字符串（支持多种格式，如 2026-03-31 或 2026/03/31 15:30:00）\n输出：数字（Unix时间戳，单位为秒）',
    helpUrl: HELP_URL.block,
  },
  // 时间计算
  {
    type: 'time_add_unit',
    message0: '时间 %1 %2 %3 %4',
    args0: [
      { type: 'input_value', name: 'TIMESTAMP', check: 'Number' },
      {
        type: 'field_dropdown',
        name: 'OPERATION',
        options: [
          ['加上', 'add'],
          ['减去', 'sub'],
        ],
      },
      { type: 'input_value', name: 'AMOUNT', check: 'Number' },
      {
        type: 'field_dropdown',
        name: 'UNIT',
        options: [
          ['秒', 'seconds'],
          ['分钟', 'minutes'],
          ['小时', 'hours'],
          ['天', 'days'],
          ['周', 'weeks'],
          ['月', 'months'],
          ['年', 'years'],
        ],
      },
    ],
    output: 'Number',
    colour: COLOR_HUE.time,
    tooltip: '介绍：对时间进行加减运算\n输入：时间戳 - 数字；操作 - 加/减；数量 - 数字；单位 - 秒/分钟/小时/天/周/月/年\n输出：数字（计算后的时间戳）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'time_diff',
    message0: '计算时间差 %1 - %2 单位 %3',
    args0: [
      { type: 'input_value', name: 'TIMESTAMP1', check: 'Number' },
      { type: 'input_value', name: 'TIMESTAMP2', check: 'Number' },
      {
        type: 'field_dropdown',
        name: 'UNIT',
        options: [
          ['秒', 'seconds'],
          ['分钟', 'minutes'],
          ['小时', 'hours'],
          ['天', 'days'],
        ],
      },
    ],
    output: 'Number',
    colour: COLOR_HUE.time,
    tooltip: '介绍：计算两个时间戳之间的差值\n输入：时间戳1、时间戳2 - 数字；单位 - 秒/分钟/小时/天\n输出：数字（时间差，可能为负数）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'time_is_leap_year',
    message0: '年份 %1 是闰年',
    args0: [
      { type: 'input_value', name: 'YEAR', check: 'Number' },
    ],
    output: 'Boolean',
    colour: COLOR_HUE.time,
    tooltip: '介绍：判断指定年份是否为闰年\n输入：年份 - 数字\n输出：布尔值（true=闰年，false=平年）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'time_days_in_month',
    message0: '年份 %1 月份 %2 的天数',
    args0: [
      { type: 'input_value', name: 'YEAR', check: 'Number' },
      { type: 'input_value', name: 'MONTH', check: 'Number' },
    ],
    output: 'Number',
    colour: COLOR_HUE.time,
    tooltip: '介绍：获取指定年月的天数\n输入：年份 - 数字；月份 - 数字（1-12）\n输出：数字（该月的天数，28-31）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'time_start_of_day',
    message0: '时间戳 %1 当天开始',
    args0: [
      { type: 'input_value', name: 'TIMESTAMP', check: 'Number' },
    ],
    output: 'Number',
    colour: COLOR_HUE.time,
    tooltip: '介绍：获取指定时间戳当天0点0分0秒的时间戳\n输入：时间戳 - 数字\n输出：数字（当天开始的时间戳）',
    helpUrl: HELP_URL.block,
  },
  {
    type: 'time_end_of_day',
    message0: '时间戳 %1 当天结束',
    args0: [
      { type: 'input_value', name: 'TIMESTAMP', check: 'Number' },
    ],
    output: 'Number',
    colour: COLOR_HUE.time,
    tooltip: '介绍：获取指定时间戳当天23点59分59秒的时间戳\n输入：时间戳 - 数字\n输出：数字（当天结束的时间戳）',
    helpUrl: HELP_URL.block,
  },
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
