import axios, { AxiosInstance, AxiosError } from 'axios';
import { toast } from 'sonner';

// API基础配置 - 类型声明在 vite-env.d.ts 中

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// 创建axios实例
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器 - 添加token
apiClient.interceptors.request.use(
  (config) => {
    // 从 localStorage 获取 token（登录时临时存储）
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 统一错误处理
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error: AxiosError) => {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as any;

      // 构建详细错误信息对象
      const detailedError = {
        status,
        message: data?.message || data?.wording || '请求失败',
        data: data,
        originalError: error,
        isApiError: true
      };

      // 记录详细错误日志
      console.error('API请求失败:', {
        url: error.config?.url,
        method: error.config?.method,
        status,
        responseData: data,
        errorMessage: detailedError.message
      });

      switch (status) {
        case 400:
          // 400 Bad Request - 让调用方通过 catch 处理业务逻辑
          // 业务错误（如账号容器不存在、插件未运行等）不应显示toast
          return Promise.reject(detailedError);
        case 401:
          toast.error('登录已过期，请重新登录');
          localStorage.removeItem('auth_token');
          window.location.href = '/login';
          break;
        case 403:
          toast.error(detailedError.message || '权限不足');
          break;
        case 404:
          toast.error('请求的资源不存在');
          break;
        case 409:
          // 409 Conflict - 资源已存在，统一错误处理
          // 让调用方通过 catch 处理业务逻辑
          return Promise.reject({
            ...detailedError,
            isConflict: true
          });
        case 502:
          toast.error('网关错误：无法连接到机器人服务，请检查机器人是否在线');
          break;
        case 503:
          toast.error('服务暂时不可用，请稍后重试');
          break;
        case 504:
          toast.error('网关超时：机器人服务响应超时');
          break;
        default:
          // 显示后端返回的具体错误信息
          toast.error(detailedError.message || `请求失败 (${status})`);
      }

      return Promise.reject(detailedError);
    } else if (error.request) {
      // 请求已发送但没有收到响应
      const networkError = {
        message: '网络连接失败，请检查网络',
        isNetworkError: true,
        originalError: error
      };
      toast.error(networkError.message);
      console.error('网络错误:', error.request);
      return Promise.reject(networkError);
    } else {
      // 请求配置错误
      const configError = {
        message: '请求配置错误: ' + error.message,
        isConfigError: true,
        originalError: error
      };
      toast.error(configError.message);
      console.error('请求配置错误:', error.message);
      return Promise.reject(configError);
    }
  }
);

// 登录相关API
export const authApi = {
  // 登录
  login: async (username: string, password: string, topo: string) => {
    const response = await apiClient.post('/api/auth/login', {
      username,
      password,
      topo,
    });
    return response.data;
  },

  // 登出
  logout: async () => {
    const response = await apiClient.post('/api/auth/logout');
    return response.data;
  },

  // 验证token
  verifyToken: async () => {
    const response = await apiClient.post('/api/auth/verify');
    return response.data;
  },
};

// 账号数据类型定义
export interface AccountData {
  self_id: string;
  custom_name: string;
  status: 'online' | 'offline';
  created_at: string;
  last_connected_at: string;
  is_online: boolean;
  login_info?: {
    user_id: number;
    nickname: string;
  };
  version_info?: {
    app_name: string;
    protocol_version: string;
    app_version: string;
  };
  bot_status?: {
    online: boolean;
    good: boolean;
    stat?: {
      message_received: number;
      message_sent: number;
      last_message_time: number;
      startup_time: number;
    };
  };
}

// 账号管理API
export const accountApi = {
  // 获取账号列表
  getAccounts: async () => {
    const response = await apiClient.get('/api/accounts');
    return response.data;
  },

  // 获取指定账号状态
  getAccountStatus: async (selfId: string) => {
    const response = await apiClient.get(`/api/accounts/${selfId}/status`);
    return response.data;
  },
};

// 机器人API调用
export const botApi = {
  // 通用API调用
  callApi: async (selfId: string, apiName: string, params?: any) => {
    const response = await apiClient.post(`/api/bot/${selfId}/${apiName}`, params || {});
    return response.data;
  },

  // 获取登录信息
  getLoginInfo: async (selfId: string) => {
    return botApi.callApi(selfId, 'get_login_info');
  },

  // 获取好友列表
  getFriendList: async (selfId: string) => {
    return botApi.callApi(selfId, 'get_friend_list');
  },

  // 获取群列表
  getGroupList: async (selfId: string) => {
    return botApi.callApi(selfId, 'get_group_list');
  },

  // 发送私聊消息
  sendPrivateMsg: async (selfId: string, userId: string, message: any) => {
    return botApi.callApi(selfId, 'send_private_msg', {
      user_id: userId,
      message,
    });
  },

  // 发送群消息
  sendGroupMsg: async (selfId: string, groupId: string, message: any) => {
    return botApi.callApi(selfId, 'send_group_msg', {
      group_id: groupId,
      message,
    });
  },

  // 获取消息
  getMsg: async (selfId: string, messageId: string) => {
    return botApi.callApi(selfId, 'get_msg', {
      message_id: messageId,
    });
  },

  // 撤回消息
  deleteMsg: async (selfId: string, messageId: string) => {
    return botApi.callApi(selfId, 'delete_msg', {
      message_id: messageId,
    });
  },

  // 获取群信息
  getGroupInfo: async (selfId: string, groupId: string) => {
    return botApi.callApi(selfId, 'get_group_info', {
      group_id: groupId,
    });
  },

  // 获取群成员列表
  getGroupMemberList: async (selfId: string, groupId: string) => {
    return botApi.callApi(selfId, 'get_group_member_list', {
      group_id: groupId,
    });
  },

  // 设置群禁言
  setGroupBan: async (selfId: string, groupId: string, userId: string, duration: number) => {
    return botApi.callApi(selfId, 'set_group_ban', {
      group_id: groupId,
      user_id: userId,
      duration,
    });
  },

  // 设置群名片
  setGroupCard: async (selfId: string, groupId: string, userId: string, card: string) => {
    return botApi.callApi(selfId, 'set_group_card', {
      group_id: groupId,
      user_id: userId,
      card,
    });
  },

  // 群踢人
  setGroupKick: async (selfId: string, groupId: string, userId: string, rejectAddRequest: boolean = false) => {
    return botApi.callApi(selfId, 'set_group_kick', {
      group_id: groupId,
      user_id: userId,
      reject_add_request: rejectAddRequest,
    });
  },
};

// 系统API
export const systemApi = {
  // 健康检查
  healthCheck: async () => {
    const response = await apiClient.get('/health');
    return response.data;
  },

  // 获取版本信息
  getVersion: async () => {
    const response = await apiClient.get('/api/system/version');
    return response.data;
  },

  // 获取Bot状态
  getStatus: async (selfId: string) => {
    const response = await apiClient.post(`/api/bot/${selfId}/get_status`, {});
    return response.data;
  },

  // 获取版本信息 (OneBot)
  getVersionInfo: async (selfId: string) => {
    const response = await apiClient.post(`/api/bot/${selfId}/get_version_info`, {});
    return response.data;
  },

  // 获取服务器状态
  getServerStatus: async () => {
    const response = await apiClient.get('/api/system/server-status');
    return response.data;
  },

  // 获取系统信息（包含后端版本）
  getSystemInfo: async (): Promise<{ success: boolean; data: { version: string } }> => {
    const response = await apiClient.get('/api/system/info');
    return response.data;
  },

  // 清理缓存
  cleanCache: async (selfId: string) => {
    const response = await apiClient.post(`/api/bot/${selfId}/clean_cache`, {});
    return response.data;
  },

  // 重启
  setRestart: async (selfId: string) => {
    const response = await apiClient.post(`/api/bot/${selfId}/set_restart`, {});
    return response.data;
  },

  // 获取图片rkey
  getRkey: async (selfId: string) => {
    const response = await apiClient.post(`/api/bot/${selfId}/get_rkey`, {});
    return response.data;
  },

  // 图片OCR
  ocrImage: async (selfId: string, image: string) => {
    const response = await apiClient.post(`/api/bot/${selfId}/ocr_image`, { image });
    return response.data;
  },

  // 扫描二维码
  scanQRCode: async (selfId: string, file: string) => {
    const response = await apiClient.post(`/api/bot/${selfId}/scan_qrcode`, { file });
    return response.data;
  },

  // 发送Protobuf数据包
  sendPb: async (selfId: string, cmd: string, hex: string) => {
    const response = await apiClient.post(`/api/bot/${selfId}/send_pb`, { cmd, hex });
    return response.data;
  },
};

// 插件API
export interface PluginInfo {
  name: string;
  self_id: string;
  lang: string;
  entry: string;
  path: string;
  config: Record<string, any>;
  running: boolean;
  enabled: boolean;
  version?: string;
  remark?: string;
}

export interface PluginStatus {
  name: string;
  self_id: string;
  running: boolean;
  startTime?: string;
  eventCount?: number;
  errorCount?: number;
  lastEventTime?: string;
}

export const pluginApi = {
  // 获取插件列表（支持指定账号）
  getPluginList: async (selfId?: string): Promise<{ success: boolean; data: PluginInfo[] }> => {
    const params = selfId ? { self_id: selfId } : {};
    const response = await apiClient.get('/api/plugins/list', { params });
    return response.data;
  },

  // 加载插件到指定账号
  loadPlugin: async (selfId: string, name: string) => {
    const response = await apiClient.post('/api/plugins/load', { self_id: selfId, name });
    return response.data;
  },

  // 卸载指定账号的插件
  unloadPlugin: async (selfId: string, name: string) => {
    const response = await apiClient.post('/api/plugins/unload', { self_id: selfId, name });
    return response.data;
  },

  // 获取插件状态（需要指定账号）
  getPluginStatus: async (selfId: string, name: string): Promise<{ success: boolean; data: PluginStatus }> => {
    const response = await apiClient.get(`/api/plugins/status/${selfId}/${name}`);
    return response.data;
  },

  // 获取运行中的插件（需要指定账号）
  getRunningPlugins: async (selfId: string): Promise<{ success: boolean; data: string[] }> => {
    const response = await apiClient.get('/api/plugins/running', { params: { self_id: selfId } });
    return response.data;
  },

  // 获取插件日志（需要指定账号）
  getPluginLogs: async (selfId: string, name: string, limit?: number): Promise<{ success: boolean; data: string[] }> => {
    const params: any = {};
    if (limit) params.limit = limit;
    const response = await apiClient.get(`/api/plugins/logs/${selfId}/${encodeURIComponent(name)}`, { params });
    return response.data;
  },

  // 获取插件配置（需要指定账号）
  getPluginConfig: async (selfId: string, name: string): Promise<{ success: boolean; data: Record<string, any> }> => {
    const response = await apiClient.get(`/api/plugins/config/${selfId}/${name}`);
    return response.data;
  },

  // 保存插件配置（需要指定账号）
  savePluginConfig: async (selfId: string, name: string, config: Record<string, any>) => {
    const response = await apiClient.post(`/api/plugins/config/${selfId}/${name}`, { config });
    return response.data;
  },

  // 删除插件配置（需要指定账号）
  deletePluginConfig: async (selfId: string, name: string) => {
    const response = await apiClient.delete(`/api/plugins/config/${selfId}/${name}`);
    return response.data;
  },

  // 获取所有账号容器信息
  getAccountContainers: async (): Promise<{ success: boolean; data: Array<{ self_id: string; plugin_count: number }> }> => {
    const response = await apiClient.get('/api/plugins/containers');
    return response.data;
  },

  // 手动检查插件文件是否存在（刷新）
  checkPluginFiles: async (): Promise<{ success: boolean; message: string; data: { removed_count: number } }> => {
    const response = await apiClient.post('/api/plugins/check-files');
    return response.data;
  },
};

// 日志相关类型
export interface LogEntry {
  self_id: string;
  level: string;
  message: string;
  source: string;
  time: string;
  data?: Record<string, any>;
}

// 设置API
export interface SystemLog {
  id: number;
  level: string;
  message: string;
  source: string;
  created_at: string;
}

export interface AdminOperation {
  id: number;
  admin_id: number;
  action: string;
  target: string;
  details: string;
  created_at: string;
}

export const settingsApi = {
  // 获取系统日志
  getSystemLogs: async (page: number = 1, pageSize: number = 50, level?: string) => {
    const params: any = { page, pageSize };
    if (level) params.level = level;
    const response = await apiClient.get('/api/settings/logs', { params });
    return response.data;
  },

  // 获取管理员列表
  getAdmins: async () => {
    const response = await apiClient.get('/api/settings/admins');
    return response.data;
  },

  // 获取操作记录
  getOperations: async (page: number = 1, pageSize: number = 50) => {
    const response = await apiClient.get('/api/settings/operations', { params: { page, pageSize } });
    return response.data;
  },

  // 获取系统设置
  getSettings: async (): Promise<{ success: boolean; data: { ws_token?: string; websocket_authorization?: string } }> => {
    const response = await apiClient.get('/api/settings');
    return response.data;
  },

  // 保存系统设置
  saveSettings: async (settings: { ws_token?: string; websocket_authorization?: string }): Promise<{ success: boolean; message?: string }> => {
    const response = await apiClient.post('/api/settings', settings);
    return response.data;
  },
};

// 日志 API
export const logApi = {
  // 获取 WebSocket 日志
  getWSLogs: async (selfId: string, limit?: number): Promise<{ status: string; retcode: number; data: { self_id: string; logs: string[]; total: number } }> => {
    const params: any = { self_id: selfId };
    if (limit) params.limit = limit;
    const response = await apiClient.get('/api/logs/ws', { params });
    return response.data;
  },
  // 获取插件日志
  getPluginLogs: async (selfId: string, pluginName: string, limit?: number): Promise<{ status: string; retcode: number; data: { self_id: string; plugin_name: string; logs: string[]; total: number } }> => {
    const params: any = { self_id: selfId, plugin_name: pluginName };
    if (limit) params.limit = limit;
    const response = await apiClient.get('/api/logs/plugin', { params });
    return response.data;
  },
};

// 用户相关类型
export interface FriendCategory {
  category_id: number;
  category_name: string;
  friend_count: number;
  friends: Array<{
    user_id: string;
    nickname: string;
    remark: string;
  }>;
}

// 用户相关API
export const userApi = {
  // 获取登录号信息
  getLoginInfo: async (selfId: string) => {
    const response = await apiClient.post(`/api/${selfId}/get_login_info`, {});
    return response.data;
  },

  // 获取好友列表
  getFriendList: async (selfId: string) => {
    const response = await apiClient.post(`/api/${selfId}/get_friend_list`, {});
    return response.data;
  },

  // 获取好友列表（带分组）
  getFriendsWithCategory: async (selfId: string) => {
    const response = await apiClient.post(`/api/${selfId}/get_friends_with_category`, {});
    return response.data;
  },

  // 获取陌生人信息
  getStrangerInfo: async (selfId: string, userId: string) => {
    const response = await apiClient.post(`/api/${selfId}/get_stranger_info`, { user_id: parseInt(userId) });
    return response.data;
  },

  // 删除好友
  deleteFriend: async (selfId: string, userId: string) => {
    const response = await apiClient.post(`/api/${selfId}/delete_friend`, { user_id: parseInt(userId) });
    return response.data;
  },

  // 设置好友备注
  setFriendRemark: async (selfId: string, userId: string, remark: string) => {
    const response = await apiClient.post(`/api/${selfId}/set_friend_remark`, {
      user_id: parseInt(userId),
      remark,
    });
    return response.data;
  },

  // 移动好友分组
  setFriendCategory: async (selfId: string, userId: string, categoryId: number) => {
    const response = await apiClient.post(`/api/${selfId}/set_friend_category`, {
      user_id: parseInt(userId),
      category_id: categoryId,
    });
    return response.data;
  },

  // 处理好友申请
  setFriendAddRequest: async (selfId: string, flag: string, approve: boolean, remark: string = '') => {
    const response = await apiClient.post(`/api/${selfId}/set_friend_add_request`, {
      flag,
      approve,
      remark,
    });
    return response.data;
  },

  // 获取被过滤好友请求
  getDoubtFriendsAddRequest: async (selfId: string, count: number = 50) => {
    const response = await apiClient.post(`/api/${selfId}/get_doubt_friends_add_request`, { count });
    return response.data;
  },

  // 处理被过滤好友请求
  setDoubtFriendsAddRequest: async (selfId: string, flag: string) => {
    const response = await apiClient.post(`/api/${selfId}/set_doubt_friends_add_request`, { flag });
    return response.data;
  },

  // 好友戳一戳
  friendPoke: async (selfId: string, userId: string) => {
    const response = await apiClient.post(`/api/${selfId}/friend_poke`, { user_id: parseInt(userId) });
    return response.data;
  },

  // 点赞
  sendLike: async (selfId: string, userId: string, times: number = 1) => {
    const response = await apiClient.post(`/api/${selfId}/send_like`, {
      user_id: parseInt(userId),
      times,
    });
    return response.data;
  },

  // 获取我赞过谁列表
  getProfileLike: async (selfId: string, start: number = 0, count: number = 20) => {
    const response = await apiClient.post(`/api/${selfId}/get_profile_like`, { start, count });
    return response.data;
  },

  // 获取谁赞过我列表
  getProfileLikeMe: async (selfId: string, start: number = 0, count: number = 20) => {
    const response = await apiClient.post(`/api/${selfId}/get_profile_like_me`, { start, count });
    return response.data;
  },

  // 获取QQ或QQ群头像
  getQQAvatar: async (selfId: string, userId?: string, groupId?: string) => {
    const params: any = {};
    if (userId) params.user_id = parseInt(userId);
    if (groupId) params.group_id = parseInt(groupId);
    const response = await apiClient.post(`/api/${selfId}/get_qq_avatar`, params);
    return response.data;
  },

  // 设置个人头像
  setQQAvatar: async (selfId: string, file: string) => {
    const response = await apiClient.post(`/api/${selfId}/set_qq_avatar`, { file });
    return response.data;
  },

  // 设置登录号资料
  setQQProfile: async (selfId: string, nickname?: string, personalNote?: string) => {
    const params: any = {};
    if (nickname) params.nickname = nickname;
    if (personalNote) params.personal_note = personalNote;
    const response = await apiClient.post(`/api/${selfId}/set_qq_profile`, params);
    return response.data;
  },

  // 设置在线状态
  setOnlineStatus: async (selfId: string, status: number, extStatus: number = 0, batteryStatus: number = 0) => {
    const response = await apiClient.post(`/api/${selfId}/set_online_status`, {
      status,
      ext_status: extStatus,
      battery_status: batteryStatus,
    });
    return response.data;
  },

  // 获取cookies
  getCookies: async (selfId: string, domain: string) => {
    const response = await apiClient.post(`/api/${selfId}/get_cookies`, { domain });
    return response.data;
  },

  // 获取官方机器人QQ号范围
  getRobotUinRange: async (selfId: string) => {
    const response = await apiClient.post(`/api/${selfId}/get_robot_uin_range`, {});
    return response.data;
  },
};

// 群组相关类型
export interface GroupHonorInfo {
  group_id: string;
  current_talkative?: {
    user_id: string;
    nickname: string;
    avatar: string;
    day_count: number;
  };
  talkative_list?: Array<{ user_id: string; nickname: string; avatar: string; description: string }>;
  performer_list?: Array<{ user_id: string; nickname: string; avatar: string; description: string }>;
  legend_list?: Array<{ user_id: string; nickname: string; avatar: string; description: string }>;
  strong_newbie_list?: Array<{ user_id: string; nickname: string; avatar: string; description: string }>;
  emotion_list?: Array<{ user_id: string; nickname: string; avatar: string; description: string }>;
}

// 群组相关API
export const groupApi = {
  // 获取群列表
  getGroupList: async (selfId: string, noCache: boolean = false) => {
    const response = await apiClient.post(`/api/${selfId}/get_group_list`, { no_cache: noCache });
    return response.data;
  },

  // 获取群信息
  getGroupInfo: async (selfId: string, groupId: string, noCache: boolean = false) => {
    const response = await apiClient.post(`/api/${selfId}/get_group_info`, { group_id: parseInt(groupId), no_cache: noCache });
    return response.data;
  },

  // 获取群成员列表
  getGroupMemberList: async (selfId: string, groupId: string, noCache: boolean = false) => {
    const response = await apiClient.post(`/api/${selfId}/get_group_member_list`, { group_id: parseInt(groupId), no_cache: noCache });
    return response.data;
  },

  // 获取群成员信息
  getGroupMemberInfo: async (selfId: string, groupId: string, userId: string, noCache: boolean = false) => {
    const response = await apiClient.post(`/api/${selfId}/get_group_member_info`, {
      group_id: parseInt(groupId),
      user_id: parseInt(userId),
      no_cache: noCache,
    });
    return response.data;
  },

  // 设置群名片
  setGroupCard: async (selfId: string, groupId: string, userId: string, card: string) => {
    const response = await apiClient.post(`/api/${selfId}/set_group_card`, {
      group_id: parseInt(groupId),
      user_id: parseInt(userId),
      card,
    });
    return response.data;
  },

  // 群禁言
  setGroupBan: async (selfId: string, groupId: string, userId: string, duration: number) => {
    const response = await apiClient.post(`/api/${selfId}/set_group_ban`, {
      group_id: parseInt(groupId),
      user_id: parseInt(userId),
      duration,
    });
    return response.data;
  },

  // 踢出群成员
  setGroupKick: async (selfId: string, groupId: string, userId: string, rejectAddRequest: boolean = false) => {
    const response = await apiClient.post(`/api/${selfId}/set_group_kick`, {
      group_id: parseInt(groupId),
      user_id: parseInt(userId),
      reject_add_request: rejectAddRequest,
    });
    return response.data;
  },

  // 批量踢出群成员
  batchDeleteGroupMember: async (selfId: string, groupId: string, userIds: string[]) => {
    const response = await apiClient.post(`/api/${selfId}/batch_delete_group_member`, {
      group_id: parseInt(groupId),
      user_ids: userIds.map(id => parseInt(id)),
    });
    return response.data;
  },

  // 退出群
  setGroupLeave: async (selfId: string, groupId: string) => {
    const response = await apiClient.post(`/api/${selfId}/set_group_leave`, { group_id: parseInt(groupId) });
    return response.data;
  },

  // 设置群管理员
  setGroupAdmin: async (selfId: string, groupId: string, userId: string, enable: boolean) => {
    const response = await apiClient.post(`/api/${selfId}/set_group_admin`, {
      group_id: parseInt(groupId),
      user_id: parseInt(userId),
      enable,
    });
    return response.data;
  },

  // 全员禁言
  setGroupWholeBan: async (selfId: string, groupId: string, enable: boolean) => {
    const response = await apiClient.post(`/api/${selfId}/set_group_whole_ban`, {
      group_id: parseInt(groupId),
      enable,
    });
    return response.data;
  },

  // 设置群名
  setGroupName: async (selfId: string, groupId: string, groupName: string) => {
    const response = await apiClient.post(`/api/${selfId}/set_group_name`, {
      group_id: parseInt(groupId),
      group_name: groupName,
    });
    return response.data;
  },

  // 设置群备注
  setGroupRemark: async (selfId: string, groupId: string, remark: string) => {
    const response = await apiClient.post(`/api/${selfId}/set_group_remark`, {
      group_id: parseInt(groupId),
      remark,
    });
    return response.data;
  },

  // 设置群头衔
  setGroupSpecialTitle: async (selfId: string, groupId: string, userId: string, specialTitle: string) => {
    const response = await apiClient.post(`/api/${selfId}/set_group_special_title`, {
      group_id: parseInt(groupId),
      user_id: parseInt(userId),
      special_title: specialTitle,
    });
    return response.data;
  },

  // 获取群荣誉信息
  getGroupHonorInfo: async (selfId: string, groupId: string, type: string = 'all') => {
    const response = await apiClient.post(`/api/${selfId}/get_group_honor_info`, {
      group_id: parseInt(groupId),
      type,
    });
    return response.data;
  },

  // 获取群公告
  getGroupNotice: async (selfId: string, groupId: string) => {
    const response = await apiClient.post(`/api/${selfId}/_get_group_notice`, { group_id: parseInt(groupId) });
    return response.data;
  },

  // 发送群公告
  sendGroupNotice: async (selfId: string, groupId: string, content: string, image?: string, pinned: boolean = false, confirmRequired: boolean = true) => {
    const response = await apiClient.post(`/api/${selfId}/_send_group_notice`, {
      group_id: parseInt(groupId),
      content,
      image,
      pinned,
      confirm_required: confirmRequired,
    });
    return response.data;
  },

  // 删除群公告
  deleteGroupNotice: async (selfId: string, groupId: string, noticeId: string) => {
    const response = await apiClient.post(`/api/${selfId}/_delete_group_notice`, {
      group_id: parseInt(groupId),
      notice_id: noticeId,
    });
    return response.data;
  },

  // 获取群系统消息
  getGroupSystemMsg: async (selfId: string) => {
    const response = await apiClient.post(`/api/${selfId}/get_group_system_msg`, {});
    return response.data;
  },

  // 获取已过滤的加群通知
  getGroupIgnoreAddRequest: async (selfId: string, groupId: string) => {
    const response = await apiClient.post(`/api/${selfId}/get_group_ignore_add_request`, {
      group_id: parseInt(groupId),
    });
    return response.data;
  },

  // 处理加群请求
  setGroupAddRequest: async (selfId: string, flag: string, approve: boolean = true, reason: string = '') => {
    const response = await apiClient.post(`/api/${selfId}/set_group_add_request`, {
      flag,
      approve,
      reason,
    });
    return response.data;
  },

  // 获取群 @全体成员 剩余次数
  getGroupAtAllRemain: async (selfId: string, groupId: string) => {
    const response = await apiClient.post(`/api/${selfId}/get_group_at_all_remain`, {
      group_id: parseInt(groupId),
    });
    return response.data;
  },

  // 获取被禁言群员列表
  getGroupShutList: async (selfId: string, groupId: string) => {
    const response = await apiClient.post(`/api/${selfId}/get_group_shut_list`, {
      group_id: parseInt(groupId),
    });
    return response.data;
  },

  // 设置群消息接收方式
  setGroupMsgMask: async (selfId: string, groupId: string, mask: number) => {
    const response = await apiClient.post(`/api/${selfId}/set_group_msg_mask`, {
      group_id: parseInt(groupId),
      mask,
    });
    return response.data;
  },

  // 群打卡
  sendGroupSign: async (selfId: string, groupId: string) => {
    const response = await apiClient.post(`/api/${selfId}/send_group_sign`, {
      group_id: parseInt(groupId),
    });
    return response.data;
  },

  // 群戳一戳
  groupPoke: async (selfId: string, groupId: string, userId: string) => {
    const response = await apiClient.post(`/api/${selfId}/group_poke`, {
      group_id: parseInt(groupId),
      user_id: parseInt(userId),
    });
    return response.data;
  },

  // 获取群精华消息
  getEssenceMsgList: async (selfId: string, groupId: string) => {
    const response = await apiClient.post(`/api/${selfId}/get_essence_msg_list`, {
      group_id: parseInt(groupId),
    });
    return response.data;
  },

  // 设置群精华消息
  setEssenceMsg: async (selfId: string, messageId: string | number) => {
    const response = await apiClient.post(`/api/${selfId}/set_essence_msg`, {
      message_id: parseInt(messageId as string),
    });
    return response.data;
  },

  // 删除群精华消息
  deleteEssenceMsg: async (selfId: string, messageId: string | number) => {
    const response = await apiClient.post(`/api/${selfId}/delete_essence_msg`, {
      message_id: parseInt(messageId as string),
    });
    return response.data;
  },

  // 获取群相册列表
  getGroupAlbumList: async (selfId: string, groupId: string) => {
    const response = await apiClient.post(`/api/${selfId}/get_group_album_list`, {
      group_id: parseInt(groupId),
    });
    return response.data;
  },

  // 创建群相册
  createGroupAlbum: async (selfId: string, groupId: string, name: string, desc?: string) => {
    const response = await apiClient.post(`/api/${selfId}/create_group_album`, {
      group_id: parseInt(groupId),
      name,
      desc,
    });
    return response.data;
  },

  // 删除群相册
  deleteGroupAlbum: async (selfId: string, groupId: string, albumId: string) => {
    const response = await apiClient.post(`/api/${selfId}/delete_group_album`, {
      group_id: parseInt(groupId),
      album_id: albumId,
    });
    return response.data;
  },

  // 上传群相册
  uploadGroupAlbum: async (selfId: string, groupId: string, albumId: string, files: string[]) => {
    const response = await apiClient.post(`/api/${selfId}/upload_group_album`, {
      group_id: parseInt(groupId),
      album_id: albumId,
      files,
    });
    return response.data;
  },
};

// 消息相关类型
export interface MessageSegment {
  type: string;
  data?: Record<string, any>;
}

export interface ForwardMessageNode {
  type: 'node';
  data: {
    id?: string;
    name?: string;
    uin?: string;
    content?: MessageSegment[] | string;
  };
}

// 消息相关API
export const messageApi = {
  // 发送私聊消息
  sendPrivateMsg: async (selfId: string, userId: string, message: MessageSegment[]) => {
    const response = await apiClient.post(`/api/${selfId}/send_private_msg`, { user_id: parseInt(userId), message });
    return response.data;
  },

  // 发送群消息
  sendGroupMsg: async (selfId: string, groupId: string, message: MessageSegment[]) => {
    const response = await apiClient.post(`/api/${selfId}/send_group_msg`, { group_id: parseInt(groupId), message });
    return response.data;
  },

  // 获取消息
  getMsg: async (selfId: string, messageId: string | number) => {
    const response = await apiClient.post(`/api/${selfId}/get_msg`, { message_id: parseInt(messageId as string) });
    return response.data;
  },

  // 撤回消息
  deleteMsg: async (selfId: string, messageId: string | number) => {
    const response = await apiClient.post(`/api/${selfId}/delete_msg`, { message_id: parseInt(messageId as string) });
    return response.data;
  },

  // 获取历史消息
  getHistoryMsg: async (selfId: string, messageType: 'friend' | 'group', id: string, messageSeq?: number) => {
    const apiName = messageType === 'friend' ? 'get_friend_msg_history' : 'get_group_msg_history';
    const params: any = messageType === 'friend' ? { user_id: parseInt(id) } : { group_id: id };
    if (messageSeq) params.message_seq = messageSeq;
    const response = await apiClient.post(`/api/${selfId}/${apiName}`, params);
    return response.data;
  },

  // 获取好友历史消息
  getFriendMsgHistory: async (selfId: string, userId: string, messageSeq?: number | string, count: number = 20) => {
    const response = await apiClient.post(`/api/${selfId}/get_friend_msg_history`, {
      user_id: parseInt(userId),
      message_seq: messageSeq || 0,
      count,
    });
    return response.data;
  },

  // 获取群历史消息
  getGroupMsgHistory: async (selfId: string, groupId: string, messageSeq?: string, count: number = 20) => {
    const response = await apiClient.post(`/api/${selfId}/get_group_msg_history`, {
      group_id: groupId,
      message_seq: messageSeq || '',
      count,
    });
    return response.data;
  },

  // 标记消息已读
  markMsgAsRead: async (selfId: string, messageId: string | number) => {
    const response = await apiClient.post(`/api/${selfId}/mark_msg_as_read`, { message_id: parseInt(messageId as string) });
    return response.data;
  },

  // 转发单条好友消息
  forwardFriendSingleMsg: async (selfId: string, messageId: string | number, userId: string) => {
    const response = await apiClient.post(`/api/${selfId}/forward_friend_single_msg`, {
      message_id: parseInt(messageId as string),
      user_id: parseInt(userId),
    });
    return response.data;
  },

  // 转发单条群消息
  forwardGroupSingleMsg: async (selfId: string, messageId: string | number, groupId: string) => {
    const response = await apiClient.post(`/api/${selfId}/forward_group_single_msg`, {
      message_id: parseInt(messageId as string),
      group_id: parseInt(groupId),
    });
    return response.data;
  },

  // 发送私聊合并转发消息
  sendPrivateForwardMsg: async (selfId: string, userId: string, messages: ForwardMessageNode[]) => {
    const response = await apiClient.post(`/api/${selfId}/send_private_forward_msg`, {
      user_id: parseInt(userId),
      messages,
    });
    return response.data;
  },

  // 发送群聊合并转发消息
  sendGroupForwardMsg: async (selfId: string, groupId: string, messages: ForwardMessageNode[]) => {
    const response = await apiClient.post(`/api/${selfId}/send_group_forward_msg`, {
      group_id: parseInt(groupId),
      messages,
    });
    return response.data;
  },

  // 获取转发消息详情
  getForwardMsg: async (selfId: string, messageId: string) => {
    const response = await apiClient.post(`/api/${selfId}/get_forward_msg`, { message_id: messageId });
    return response.data;
  },

  // 表情回应消息
  setMsgEmojiLike: async (selfId: string, messageId: string | number, emojiId: number) => {
    const response = await apiClient.post(`/api/${selfId}/set_msg_emoji_like`, {
      message_id: parseInt(messageId as string),
      emoji_id: emojiId,
    });
    return response.data;
  },

  // 取消消息表情回应
  unsetMsgEmojiLike: async (selfId: string, messageId: string | number, emojiId: number) => {
    const response = await apiClient.post(`/api/${selfId}/unset_msg_emoji_like`, {
      message_id: parseInt(messageId as string),
      emoji_id: emojiId,
    });
    return response.data;
  },

  // 获取消息图片详情
  getImage: async (selfId: string, file: string) => {
    const response = await apiClient.post(`/api/${selfId}/get_image`, { file });
    return response.data;
  },

  // 获取消息语音详情
  getRecord: async (selfId: string, file: string, outFormat: string = 'mp3') => {
    const response = await apiClient.post(`/api/${selfId}/get_record`, { file, out_format: outFormat });
    return response.data;
  },

  // 获取消息文件详情
  getFile: async (selfId: string, file: string, download: boolean = true) => {
    const response = await apiClient.post(`/api/${selfId}/get_file`, { file, download });
    return response.data;
  },

  // 语音消息转文字
  voiceMsgToText: async (selfId: string, messageId: string | number) => {
    const response = await apiClient.post(`/api/${selfId}/voice_msg_to_text`, { message_id: parseInt(messageId as string) });
    return response.data;
  },

  // 轮询获取新消息（用于替代SSE）
  pollMessages: async (selfId: string, chatType: 'friend' | 'group', targetId: string, lastSeq?: number, limit: number = 20) => {
    const params: any = {
      limit,
    };
    if (lastSeq) params.last_seq = lastSeq;

    const endpoint = chatType === 'friend'
      ? `/api/${selfId}/get_friend_msg_history`
      : `/api/${selfId}/get_group_msg_history`;

    const response = await apiClient.post(endpoint, {
      [chatType === 'friend' ? 'user_id' : 'group_id']: targetId,
      ...params,
    });
    return response.data;
  },
};

// AI语音相关类型
export interface AICharacter {
  character_id: string;
  character_name: string;
  preview_url: string;
}

// AI语音相关API
export const aiVoiceApi = {
  // 获取群AI语音可用声色列表
  getAICharacters: async (selfId: string, groupId: string, chatType: number = 1) => {
    const response = await apiClient.post(`/api/${selfId}/get_ai_characters`, {
      group_id: parseInt(groupId),
      chat_type: chatType,
    });
    return response.data;
  },

  // 发送群AI语音
  sendGroupAIRecord: async (selfId: string, groupId: string, character: string, text: string, chatType: number = 1) => {
    const response = await apiClient.post(`/api/${selfId}/send_group_ai_record`, {
      group_id: parseInt(groupId),
      character,
      text,
      chat_type: chatType,
    });
    return response.data;
  },
};

// 文件相关类型
export interface GroupFile {
  file_id: string;
  file_name: string;
  busid: number;
  file_size: number;
  upload_time: number;
  dead_time: number;
  modify_time: number;
  download_times: number;
  uploader: number;
  uploader_name: string;
}

export interface GroupFolder {
  folder_id: string;
  folder_name: string;
  create_time: number;
  creator: number;
  creator_name: string;
  total_file_count: number;
}

// 文件相关API
export const fileApi = {
  // 获取群文件系统信息
  getGroupFileSystemInfo: async (selfId: string, groupId: string) => {
    const response = await apiClient.post(`/api/${selfId}/get_group_file_system_info`, {
      group_id: parseInt(groupId),
    });
    return response.data;
  },

  // 获取群根目录文件列表
  getGroupRootFiles: async (selfId: string, groupId: string) => {
    const response = await apiClient.post(`/api/${selfId}/get_group_root_files`, {
      group_id: parseInt(groupId),
    });
    return response.data;
  },

  // 获取群子目录文件列表
  getGroupFilesByFolder: async (selfId: string, groupId: string, folderId: string) => {
    const response = await apiClient.post(`/api/${selfId}/get_group_files_by_folder`, {
      group_id: parseInt(groupId),
      folder_id: folderId,
    });
    return response.data;
  },

  // 上传群文件
  uploadGroupFile: async (selfId: string, groupId: string, file: string, name?: string, folderId?: string) => {
    const params: any = { group_id: parseInt(groupId), file };
    if (name) params.name = name;
    if (folderId) params.folder_id = folderId;
    const response = await apiClient.post(`/api/${selfId}/upload_group_file`, params);
    return response.data;
  },

  // 删除群文件
  deleteGroupFile: async (selfId: string, groupId: string, fileId: string) => {
    const response = await apiClient.post(`/api/${selfId}/delete_group_file`, {
      group_id: parseInt(groupId),
      file_id: fileId,
    });
    return response.data;
  },

  // 创建群文件文件夹
  createGroupFileFolder: async (selfId: string, groupId: string, name: string) => {
    const response = await apiClient.post(`/api/${selfId}/create_group_file_folder`, {
      group_id: parseInt(groupId),
      name,
    });
    return response.data;
  },

  // 删除群文件文件夹
  deleteGroupFolder: async (selfId: string, groupId: string, folderId: string) => {
    const response = await apiClient.post(`/api/${selfId}/delete_group_folder`, {
      group_id: parseInt(groupId),
      folder_id: folderId,
    });
    return response.data;
  },

  // 重命名群文件文件夹
  renameGroupFileFolder: async (selfId: string, groupId: string, folderId: string, newFolderName: string) => {
    const response = await apiClient.post(`/api/${selfId}/rename_group_file_folder`, {
      group_id: parseInt(groupId),
      folder_id: folderId,
      new_folder_name: newFolderName,
    });
    return response.data;
  },

  // 移动群文件
  moveGroupFile: async (selfId: string, groupId: string, fileId: string, parentDirectory: string, targetDirectory: string) => {
    const response = await apiClient.post(`/api/${selfId}/move_group_file`, {
      group_id: parseInt(groupId),
      file_id: fileId,
      parent_directory: parentDirectory,
      target_directory: targetDirectory,
    });
    return response.data;
  },

  // 获取群文件URL
  getGroupFileUrl: async (selfId: string, groupId: string, fileId: string) => {
    const response = await apiClient.post(`/api/${selfId}/get_group_file_url`, {
      group_id: parseInt(groupId),
      file_id: fileId,
    });
    return response.data;
  },

  // 群文件转永久
  setGroupFileForever: async (selfId: string, groupId: string, fileId: string) => {
    const response = await apiClient.post(`/api/${selfId}/set_group_file_forever`, {
      group_id: parseInt(groupId),
      file_id: fileId,
    });
    return response.data;
  },

  // 上传私聊文件
  uploadPrivateFile: async (selfId: string, userId: string, file: string, name?: string) => {
    const params: any = { user_id: parseInt(userId), file };
    if (name) params.name = name;
    const response = await apiClient.post(`/api/${selfId}/upload_private_file`, params);
    return response.data;
  },

  // 获取私聊文件资源链接
  getPrivateFileUrl: async (selfId: string, fileId: string) => {
    const response = await apiClient.post(`/api/${selfId}/get_private_file_url`, { file_id: fileId });
    return response.data;
  },

  // 下载文件到缓存目录
  downloadFile: async (selfId: string, options: { url?: string; base64?: string; name?: string; headers?: string[] }) => {
    const response = await apiClient.post(`/api/${selfId}/download_file`, options);
    return response.data;
  },

  // 获取闪传文件详情
  getFlashFileInfo: async (selfId: string, shareLink?: string, fileSetId?: string) => {
    const params: any = {};
    if (shareLink) params.share_link = shareLink;
    if (fileSetId) params.file_set_id = fileSetId;
    const response = await apiClient.post(`/api/${selfId}/get_flash_file_info`, params);
    return response.data;
  },
};

// 插件管理相关类型
export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modifiedTime?: string;
  children?: FileNode[];
}

export interface PluginDirectoryInfo {
  selfId: string;
  path: string;
  files: FileNode[];
}

// 账号信息接口
export interface AccountInfo {
  self_id: string;
  nickname: string;
  online: boolean;
}

// 其他实用API
export const otherApi = {
  // 获取收藏表情
  fetchCustomFace: async (selfId: string) => {
    const response = await apiClient.post(`/api/${selfId}/fetch_custom_face`, {});
    return response.data;
  },

  // 获取推荐表情
  getRecommendFace: async (selfId: string, word: string) => {
    const response = await apiClient.post(`/api/${selfId}/get_recommend_face`, { word });
    return response.data;
  },
};

// 插件管理API
export const pluginManagerApi = {
  // 获取可用账号列表（包含昵称和在线状态）
  getAvailableAccounts: async (): Promise<{ success: boolean; data: AccountInfo[] }> => {
    const response = await apiClient.get('/api/plugin-manager/accounts');
    return response.data;
  },

  // 获取模板文件列表
  getTemplateFiles: async (): Promise<{ success: boolean; data: FileNode[] }> => {
    const response = await apiClient.get('/api/plugin-manager/template-files');
    return response.data;
  },

  // 获取指定账号的插件文件列表
  getPluginFiles: async (selfId: string): Promise<{ success: boolean; data: FileNode[] }> => {
    const response = await apiClient.get(`/api/plugin-manager/plugin-files/${selfId}`);
    return response.data;
  },

  // 读取文件内容
  readFile: async (path: string): Promise<{ success: boolean; data: { content: string } }> => {
    const response = await apiClient.get('/api/plugin-manager/file', { params: { path } });
    return response.data;
  },

  // 写入文件内容
  writeFile: async (path: string, content: string): Promise<{ success: boolean; message?: string }> => {
    const response = await apiClient.post('/api/plugin-manager/file', { path, content });
    return response.data;
  },

  // 创建文件或文件夹
  createFile: async (parentPath: string, name: string, type: 'file' | 'folder'): Promise<{ success: boolean; message?: string }> => {
    const response = await apiClient.post('/api/plugin-manager/create', { parentPath, name, type });
    return response.data;
  },

  // 删除文件或文件夹
  deleteFile: async (path: string): Promise<{ success: boolean; message?: string }> => {
    const response = await apiClient.delete('/api/plugin-manager/file', { params: { path } });
    return response.data;
  },

  // 复制文件或文件夹
  copyFile: async (sourcePath: string, targetPath: string, overwrite?: boolean): Promise<{ success: boolean; message?: string; code?: string; data?: { targetName: string } }> => {
    const response = await apiClient.post('/api/plugin-manager/copy', { sourcePath, targetPath, overwrite });
    return response.data;
  },

  // 移动文件或文件夹
  moveFile: async (sourcePath: string, targetPath: string): Promise<{ success: boolean; message?: string }> => {
    const response = await apiClient.post('/api/plugin-manager/move', { sourcePath, targetPath });
    return response.data;
  },

  // 重命名文件或文件夹
  renameFile: async (path: string, newName: string): Promise<{ success: boolean; message?: string }> => {
    const response = await apiClient.post('/api/plugin-manager/rename', { path, newName });
    return response.data;
  },
};

export default apiClient;
