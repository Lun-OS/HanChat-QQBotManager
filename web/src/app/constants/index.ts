// 机器人状态常量
export const BotStatus = {
  ONLINE: 'online',
  OFFLINE: 'offline',
} as const;

// 消息类型常量
export const MessageType = {
  PRIVATE: 'private',
  GROUP: 'group',
} as const;

// 日志级别常量
export const LogLevel = {
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  DEBUG: 'debug',
} as const;

// 日志类型常量
export const LogType = {
  EVENT: 'event',
  API: 'api',
  SYSTEM: 'system',
} as const;

// 本地存储键名常量
export const StorageKeys = {
  AUTH_TOKEN: 'auth_token',
  THEME: 'theme',
  LANGUAGE: 'language',
} as const;
