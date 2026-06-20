/**
 * Blockly 项目类型定义
 */

/**
 * Blockly 项目接口
 * 表示一个完整的积木编程项目
 */
export interface BlocklyProject {
  /** 项目唯一标识 */
  id: string;
  /** 项目名称（1-50字符，不能包含特殊字符） */
  name: string;
  /** 项目描述（最多200字符） */
  description: string;
  /** 版本号（语义化版本格式，如 1.0.0） */
  version: string;
  /** 工作空间的 XML 内容 */
  xmlContent: string;
  /** 创建时间（ISO 8601 格式） */
  createdAt: string;
  /** 最后更新时间（ISO 8601 格式） */
  updatedAt: string;
  /** 项目文件路径（可选，加载后设置） */
  path?: string;
}

/**
 * 插件元数据接口
 * 用于导出插件时的配置信息
 */
export interface PluginMetadata {
  /** 插件名称（必填） */
  name: string;
  /** 版本号（默认 1.0.0） */
  version: string;
  /** 插件描述（可选） */
  description: string;
}

/**
 * 导出选项接口
 * @deprecated 使用 PluginMetadata 替代
 */
export interface ExportOptions {
  /** 目标账号ID */
  targetAccountId: string;
  /** 插件名称 */
  pluginName: string;
  /** 插件版本 */
  pluginVersion: string;
  /** 插件描述 */
  pluginDescription: string;
}

/**
 * 生成的代码结构
 */
export interface GeneratedCode {
  /** 代码头部（包含库导入和工具函数） */
  header: string;
  /** 代码主体（用户逻辑） */
  body: string;
  /** 完整代码 */
  full: string;
}

/**
 * 项目文件信息（列表展示用）
 */
export interface BlocklyProjectFile {
  /** 项目名称 */
  name: string;
  /** 项目路径 */
  path: string;
  /** 最后更新时间 */
  updatedAt: string;
}

/** 日志类型 */
export type LogType = 'info' | 'warn' | 'error' | 'debug';

/** 消息类型 */
export type MessageType = 'group' | 'private';

/** 事件类型 */
export type EventType = 'message' | 'notice' | 'request' | 'message_sent';

/**
 * 积木定义接口
 * 用于定义自定义积木的结构
 */
export interface BlockDefinition {
  /** 积木类型标识 */
  type: string;
  /** 积木显示的消息模板 */
  message0: string;
  /** 参数定义 */
  args0?: Array<{
    type: string;
    name: string;
    check?: string | string[];
    options?: Array<[string, string]>;
    variable?: string;
    value?: string | number | boolean;
  }>;
  /** 前一个连接类型（null 表示语句开头） */
  previousStatement?: string | null;
  /** 下一个连接类型（null 表示语句结尾） */
  nextStatement?: string | null;
  /** 输出类型（null 表示无输出） */
  output?: string | null;
  /** 积木颜色（0-360 的色相值） */
  colour?: number;
  /** 提示文本 */
  tooltip?: string;
  /** 帮助链接 */
  helpUrl?: string;
  /** 是否内联显示 */
  inputsInline?: boolean;
  /** 变形器名称 */
  mutator?: string;
  /** 扩展插件 */
  extensions?: string[];
}

/**
 * 代码生成器函数类型
 */
export interface CodeGenerator {
  (block: any, generator: any): [string, number] | string;
}

/**
 * 项目操作结果接口
 */
export interface ProjectOperationResult {
  /** 操作是否成功 */
  success: boolean;
  /** 错误消息（失败时） */
  message?: string;
  /** 项目是否已存在（创建时） */
  exists?: boolean;
}

/**
 * 文件验证结果接口
 */
export interface FileValidationResult {
  /** 验证是否通过 */
  valid: boolean;
  /** 错误消息（验证失败时） */
  error?: string;
}

/**
 * Lua 代码分析问题接口
 */
export interface LuaIssue {
  /** 问题类型 */
  type: 'warning' | 'error';
  /** 问题描述 */
  message: string;
  /** 所在行号（可选） */
  line?: number;
  /** 修复建议（可选） */
  suggestion?: string;
}

/**
 * Lua 代码分析结果接口
 */
export interface LuaAnalysisResult {
  /** 是否存在问题 */
  hasIssues: boolean;
  /** 是否存在语法错误 */
  hasSyntaxErrors: boolean;
  /** 问题列表 */
  issues: LuaIssue[];
}
