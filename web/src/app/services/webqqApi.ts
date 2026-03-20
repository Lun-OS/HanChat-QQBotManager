// WebQQ API 工具函数 - 对接后端 API
import axios, { AxiosError } from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

function getToken(): string | null {
  return localStorage.getItem('auth_token')
}

function getSelfId(): string | null {
  return localStorage.getItem('current_self_id')
}

// ==================== 类型定义 ====================

export interface LoginInfo {
  uid: string
  uin: string
  nick: string
}

export interface FriendInfo {
  user_id: string
  nickname: string
  remark: string
  avatar?: string
}

export interface GroupInfo {
  group_id: string
  group_name: string
  member_count: number
}

export interface GroupMemberInfo {
  user_id: string
  nickname: string
  card: string
  role: 'owner' | 'admin' | 'member'
}

export interface Message {
  message_id: string
  user_id: string
  group_id?: string
  message: any[]
  raw_message: string
  sender: {
    user_id: string
    nickname: string
    card?: string
  }
  time: number
  message_seq?: number
}

export interface UserProfile {
  uid: string
  uin: string
  nickname: string
  remark: string
  signature: string
  sex: number
  birthday: string
  level: number
  avatar: string
}

// ==================== 登录信息 ====================

let selfUid: string | null = null
let selfUin: string | null = null

export function setSelfInfo(uid: string, uin: string) {
  selfUid = uid
  selfUin = uin
  localStorage.setItem('current_self_id', uid)
}

export function getSelfUid(): string | null {
  return selfUid
}

export function getSelfUin(): string | null {
  return selfUin
}

export function getUserAvatar(uin: string): string {
  return `https://q1.qlogo.cn/g?b=qq&nk=${uin}&s=640`
}

export function getGroupAvatar(groupCode: string): string {
  return `https://p.qlogo.cn/gh/${groupCode}/${groupCode}/640/`
}

// 账号信息接口
interface AccountInfo {
  self_id: string
  custom_name: string
  status: string
  is_online: boolean
  login_info?: {
    user_id: number
    nickname: string
  }
}

// 获取第一个在线账号
async function getFirstOnlineAccount(): Promise<AccountInfo | null> {
  try {
    const response = await apiClient.get<{ status: string; retcode: number; data?: AccountInfo[]; message?: string }>('/api/accounts')
    console.log('[WebQQ] 获取账号列表响应:', response.data)
    
    // 检查响应是否存在
    if (!response.data) {
      console.error('[WebQQ] 获取账号列表失败: 响应为空')
      return null
    }
    
    // 检查状态码，retcode 为 0 表示成功，同时检查 status 字段
    const isSuccess = response.data.retcode === 0 && (response.data.status === 'ok' || response.data.status === 'success')
    if (!isSuccess) {
      console.error('[WebQQ] 获取账号列表失败:', response.data.message || response.data)
      return null
    }
    
    if (!response.data.data || !Array.isArray(response.data.data)) {
      console.error('[WebQQ] 获取账号列表失败: 数据格式不正确', response.data)
      return null
    }
    
    const accounts = response.data.data
    // 找到第一个在线账号
    const onlineAccount = accounts.find(acc => acc.is_online)
    return onlineAccount || null
  } catch (error) {
    console.error('[WebQQ] 获取账号列表请求失败:', error)
    return null
  }
}

// 通过多账号API调用
async function callBotAPI<T = any>(apiName: string, params?: Record<string, any>): Promise<T> {
  let selfId = getSelfId() || selfUid
  
  // 如果没有 self_id，尝试获取第一个在线账号
  if (!selfId) {
    const account = await getFirstOnlineAccount()
    if (account) {
      selfId = account.self_id
      // 如果有登录信息，也设置一下
      if (account.login_info) {
        setSelfInfo(account.self_id, String(account.login_info.user_id))
      }
    }
  }
  
  if (!selfId) {
    throw new Error('未登录：缺少 self_id')
  }
  
  const url = `/api/bot/${selfId}/${apiName}`
  console.log(`[WebQQ] 调用API: ${url}`, params)
  
  try {
    const response = await apiClient.post<{ status: string; retcode: number; data?: T; message?: string }>(url, params || {})
    console.log(`[WebQQ] API响应 [${apiName}]:`, response.data)
    
    // 检查响应是否存在
    if (!response.data) {
      throw new Error(`API调用失败 [${apiName}]: 响应为空`)
    }
    
    // 检查状态码，同时支持 'ok' 和 'success' 作为成功状态
    const isSuccess = response.data.retcode === 0 && 
      (response.data.status === 'ok' || response.data.status === 'success')
    
    if (!isSuccess) {
      throw new Error(response.data.message || `API调用失败 [${apiName}]: status=${response.data.status}, retcode=${response.data.retcode}`)
    }
    
    return response.data.data as T
  } catch (error) {
    console.error(`[WebQQ] API调用失败 [${apiName}]:`, error)
    throw error
  }
}

// ==================== 登录信息 ====================

export async function getLoginInfo(): Promise<LoginInfo> {
  // 先获取账号列表找到第一个在线账号
  const account = await getFirstOnlineAccount()
  if (!account) {
    throw new Error('没有在线的账号')
  }
  
  // 使用获取到的 self_id 调用 get_login_info
  const url = `/api/bot/${account.self_id}/get_login_info`
  console.log('[WebQQ] 获取登录信息:', url)
  
  try {
    const response = await apiClient.post<{ status: string; retcode: number; data?: any; message?: string }>(url, {})
    console.log('[WebQQ] 登录信息响应:', response.data)
    
    // 检查响应是否存在
    if (!response.data) {
      throw new Error('获取登录信息失败: 响应为空')
    }
    
    // 检查状态码，同时支持 'ok' 和 'success' 作为成功状态
    const isSuccess = response.data.retcode === 0 && 
      (response.data.status === 'ok' || response.data.status === 'success')
    
    if (!isSuccess) {
      throw new Error(response.data.message || `获取登录信息失败: status=${response.data.status}, retcode=${response.data.retcode}`)
    }
    
    const data = response.data.data
    if (!data) {
      throw new Error('获取登录信息失败: 数据为空')
    }
    
    if (data.uid || data.user_id) {
      const uid = data.uid || String(data.user_id)
      const uin = data.uin || String(data.user_id)
      setSelfInfo(uid, uin)
    }
    
    return {
      uid: data.uid || String(data.user_id),
      uin: data.uin || String(data.user_id),
      nick: data.nickname || data.nick || '',
    }
  } catch (error) {
    console.error('[WebQQ] 获取登录信息失败:', error)
    throw error
  }
}

// ==================== 好友列表 ====================

export async function getFriends(): Promise<{ categories: FriendCategory[]; friends: FriendInfo[] }> {
  const data = await callBotAPI<any>('get_friends_with_category')
  // 确保返回正确的格式
  if (data && Array.isArray(data.categories) && Array.isArray(data.friends)) {
    return data
  }
  // 如果返回的是数组，尝试转换格式
  if (Array.isArray(data)) {
    return { categories: [], friends: data }
  }
  return { categories: [], friends: [] }
}

export interface FriendCategory {
  categoryId: number
  categoryName: string
  friends: FriendInfo[]
}

export async function getFriendList(): Promise<FriendInfo[]> {
  const data = await callBotAPI<any>('get_friend_list')
  // 确保返回数组
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.friends)) return data.friends
  return []
}

export async function deleteFriend(uid: string): Promise<void> {
  await callBotAPI('delete_friend', { user_id: uid })
}

export async function setFriendRemark(uid: string, remark: string): Promise<void> {
  await callBotAPI('set_friend_remark', { user_id: uid, remark })
}

export async function sendFriendPoke(uid: string): Promise<void> {
  await callBotAPI('friend_poke', { user_id: uid })
}

// ==================== 群组列表 ====================

export async function getGroups(): Promise<GroupInfo[]> {
  const data = await callBotAPI<any>('get_group_list')
  // 确保返回数组
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.groups)) return data.groups
  return []
}

export async function getGroupInfo(groupId: string): Promise<any> {
  return await callBotAPI('get_group_info', { group_id: groupId })
}

export async function getGroupMembers(groupId: string): Promise<GroupMemberInfo[]> {
  const data = await callBotAPI<any>('get_group_member_list', { group_id: groupId })
  // 确保返回数组
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.members)) return data.members
  return []
}

export async function getGroupMemberInfo(groupId: string, userId: string): Promise<GroupMemberInfo> {
  return await callBotAPI('get_group_member_info', { group_id: groupId, user_id: userId })
}

// ==================== 群管理 ====================

export async function kickGroupMember(groupId: string, uid: string, rejectForever = false): Promise<void> {
  await callBotAPI('set_group_kick', {
    group_id: groupId,
    user_id: uid,
    reject_add_request: rejectForever,
  })
}

export async function muteGroupMember(groupId: string, uid: string, duration: number): Promise<void> {
  await callBotAPI('set_group_ban', {
    group_id: groupId,
    user_id: uid,
    duration,
  })
}

export async function setGroupAdmin(groupId: string, uid: string, enable: boolean): Promise<void> {
  await callBotAPI('set_group_admin', {
    group_id: groupId,
    user_id: uid,
    enable,
  })
}

export async function setMemberTitle(groupId: string, uid: string, title: string): Promise<void> {
  await callBotAPI('set_group_special_title', {
    group_id: groupId,
    user_id: uid,
    special_title: title,
  })
}

export async function setGroupCard(groupId: string, uid: string, card: string): Promise<void> {
  await callBotAPI('set_group_card', {
    group_id: groupId,
    user_id: uid,
    card,
  })
}

export async function quitGroup(groupId: string): Promise<void> {
  await callBotAPI('set_group_leave', { group_id: groupId, dismiss: false })
}

export async function setGroupMsgMask(groupId: string, mask: number): Promise<void> {
  await callBotAPI('set_group_msg_mask', { group_id: groupId, mask })
}

export enum GroupMsgMask {
  AllowNotify = 1,
  BoxNotNotify = 2,
  NotAllow = 3,
  AllowNotNotify = 4,
}

// ==================== 消息 ====================

export async function sendPrivateMessage(userId: string, message: any[]): Promise<{ message_id: string }> {
  return await callBotAPI('send_private_msg', { user_id: userId, message })
}

export async function sendGroupMessage(groupId: string, message: any[]): Promise<{ message_id: string }> {
  return await callBotAPI('send_group_msg', { group_id: groupId, message })
}

export async function sendMessage(request: {
  chatType: number
  peerId: string
  content: { type: string; text?: string; imagePath?: string; msgId?: string; msgSeq?: string; uid?: string; uin?: string; name?: string; faceId?: number; filePath?: string; fileName?: string }[]
}): Promise<{ msgId: string }> {
  const content: any[] = []

  for (const item of request.content) {
    if (item.type === 'text' && item.text) {
      content.push({ type: 'text', text: item.text })
    } else if (item.type === 'face' && item.faceId !== undefined) {
      content.push({ type: 'face', id: item.faceId })
    } else if (item.type === 'image' && item.imagePath) {
      content.push({ type: 'image', url: item.imagePath })
    } else if (item.type === 'reply' && item.msgId) {
      content.push({ type: 'reply', id: item.msgId })
    } else if (item.type === 'at' && item.uid) {
      content.push({ type: 'at', qq: item.uid })
    }
  }

  if (content.length === 0) {
    throw new Error('消息内容为空')
  }

  if (request.chatType === 1 || request.chatType === 100) {
    return sendPrivateMessage(request.peerId, content)
  } else {
    return sendGroupMessage(request.peerId, content)
  }
}

export async function getPrivateHistory(userId: string, limit = 20): Promise<Message[]> {
  const data = await callBotAPI<any>('get_friend_history_msg', { user_id: userId, limit })
  // 确保返回数组
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.messages)) return data.messages
  return []
}

export async function getGroupHistory(groupId: string, limit = 20): Promise<Message[]> {
  const data = await callBotAPI<any>('get_group_history_msg', { group_id: groupId, limit })
  // 确保返回数组
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.messages)) return data.messages
  return []
}

export async function getMessages(
  chatType: number,
  peerId: string,
  beforeMsgSeq?: string,
  limit: number = 20
): Promise<{ messages: Message[]; hasMore: boolean }> {
  let messages: Message[] = []

  if (chatType === 1 || chatType === 100) {
    messages = await getPrivateHistory(peerId, limit)
  } else {
    messages = await getGroupHistory(peerId, limit)
  }

  return { messages, hasMore: messages.length >= limit }
}

export async function recallMessage(chatType: number, peerUid: string, msgId: string): Promise<void> {
  await callBotAPI('delete_msg', { message_id: msgId })
}

export async function setEmojiLike(msgId: string, emojiId: string): Promise<void> {
  await callBotAPI('set_msg_emoji_like', { message_id: msgId, emoji_id: emojiId })
}

// ==================== 用户资料 ====================

export async function getStrangerInfo(userId: string): Promise<any> {
  return await callBotAPI('get_stranger_info', { user_id: userId })
}

export async function getUserProfile(uid?: string, uin?: string, groupId?: string): Promise<UserProfile> {
  let targetUin = uin

  if (!targetUin && uid) {
    const stranger = await getStrangerInfo(uid)
    targetUin = stranger?.user_id || uid
  }

  if (!targetUin) {
    throw new Error('无法获取用户信息')
  }

  const profile: UserProfile = {
    uid: uid || targetUin,
    uin: targetUin,
    nickname: '',
    remark: '',
    signature: '',
    sex: 0,
    birthday: '',
    level: 0,
    avatar: getUserAvatar(targetUin),
  }

  try {
    const stranger = await getStrangerInfo(targetUin)
    if (stranger) {
      profile.nickname = stranger.nickname || stranger.user_id || ''
      profile.sex = stranger.sex || 0
    }
  } catch {
    // 忽略错误
  }

  if (groupId) {
    try {
      const memberInfo = await getGroupMemberInfo(groupId, targetUin)
      if (memberInfo) {
        profile.remark = memberInfo.card || ''
        profile.uid = memberInfo.user_id || profile.uid
      }
    } catch {
      // 忽略错误
    }
  }

  return profile
}

// ==================== 通知 ====================

export async function getFriendRequests(): Promise<any[]> {
  try {
    const data = await callBotAPI<any>('get_friend_add_request', {})
    // 确保返回数组
    if (Array.isArray(data)) return data
    if (data && Array.isArray(data.requests)) return data.requests
    return []
  } catch {
    return []
  }
}

export async function getGroupNotifications(): Promise<any[]> {
  try {
    const data = await callBotAPI<any>('get_group_system_msg', {})
    // 确保返回数组
    if (Array.isArray(data)) return data
    if (data && Array.isArray(data.notifications)) return data.notifications
    return []
  } catch {
    return []
  }
}

export async function getDoubtBuddyRequests(): Promise<any[]> {
  try {
    const data = await callBotAPI<any>('get_doubt_friends_add_request', { count: 50 })
    // 确保返回数组
    if (Array.isArray(data)) return data
    if (data && Array.isArray(data.requests)) return data.requests
    return []
  } catch {
    return []
  }
}

export async function handleFriendRequest(flag: string, action: 'approve' | 'reject', remark?: string): Promise<void> {
  await callBotAPI('set_friend_add_request', {
    flag,
    approve: action === 'approve',
    remark,
  })
}

export async function handleGroupNotification(flag: string, action: 'approve' | 'reject', reason?: string): Promise<void> {
  await callBotAPI('set_group_add_request', {
    flag,
    approve: action === 'approve',
    reason,
  })
}

export async function approveDoubtBuddy(uid: string): Promise<void> {
  await callBotAPI('set_doubt_friends_add_request', { flag: uid })
}

// ==================== 最近会话 ====================

export interface RecentChatItem {
  chatType: 1 | 2 | 100
  peerId: string
  peerName: string
  peerAvatar: string
  lastMessage: string
  lastTime: number
  unreadCount: number
  pinned?: boolean
}

export async function getRecentChats(): Promise<RecentChatItem[]> {
  return []
}

// ==================== SSE 事件流 ====================

export function createEventSource(
  onMessage: (event: any) => void,
  onError?: (error: any) => void,
  onReconnect?: () => void
): EventSource {
  const selfId = selfUid || getSelfId() || ''
  const userId = selfUin || ''

  if (!selfId || !userId) {
    console.warn('[SSE] 未登录，无法建立连接')
    const dummySource = {
      close: () => {},
      readyState: 2,
      url: '',
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
      onerror: null,
      onmessage: null,
      onopen: null,
    } as any
    return dummySource
  }

  const token = getToken()
  const url = `/api/webqq/events?self_id=${encodeURIComponent(selfId)}&user_id=${encodeURIComponent(userId)}&type=all${token ? `&token=${encodeURIComponent(token)}` : ''}`

  let eventSource: EventSource
  let reconnectAttempts = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let isClosed = false

  const connect = () => {
    eventSource = new EventSource(url)

    eventSource.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data)
        onMessage(data)
      } catch (e) {
        console.error('[SSE] 解析消息失败:', e)
      }
    })

    eventSource.addEventListener('connected', () => {
      console.log('[SSE] 连接已建立')
      reconnectAttempts = 0
    })

    eventSource.onopen = () => {
      console.log('[SSE] 连接打开')
      if (reconnectAttempts > 0) {
        console.log('[SSE] 重连成功')
        onReconnect?.()
      }
      reconnectAttempts = 0
    }

    eventSource.onerror = (error) => {
      console.error('[SSE] 连接错误:', error)

      if (isClosed) return

      eventSource.close()

      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000)
      reconnectAttempts++

      console.log(`[SSE] 将在 ${delay}ms 后尝试第 ${reconnectAttempts} 次重连...`)

      reconnectTimer = setTimeout(() => {
        if (!isClosed) {
          console.log('[SSE] 正在重连...')
          connect()
        }
      }, delay)

      onError?.(error)
    }

    return eventSource
  }

  eventSource = connect()

  const wrappedEventSource = {
    close: () => {
      isClosed = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      eventSource.close()
      console.log('[SSE] 连接已关闭')
    },
    get readyState() {
      return eventSource.readyState
    },
    get url() {
      return eventSource.url
    },
    addEventListener: eventSource.addEventListener.bind(eventSource),
    removeEventListener: eventSource.removeEventListener.bind(eventSource),
    dispatchEvent: eventSource.dispatchEvent.bind(eventSource),
    onerror: eventSource.onerror,
    onmessage: eventSource.onmessage,
    onopen: eventSource.onopen,
    CONNECTING: EventSource.CONNECTING,
    OPEN: EventSource.OPEN,
    CLOSED: EventSource.CLOSED,
    withCredentials: eventSource.withCredentials,
  } as EventSource

  return wrappedEventSource
}

// ==================== 工具函数 ====================

export function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()

  if (isToday) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()

  if (isYesterday) {
    return `昨天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  }

  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function filterGroups(groups: GroupInfo[], query: string): GroupInfo[] {
  if (!query.trim()) return groups
  return groups.filter(
    (g) => g.group_name.toLowerCase().includes(query.toLowerCase()) || g.group_id.includes(query)
  )
}

export function filterMembers(members: GroupMemberInfo[], query: string): GroupMemberInfo[] {
  if (!query.trim()) return members
  return members.filter(
    (m) =>
      m.nickname.toLowerCase().includes(query.toLowerCase()) ||
      m.card?.toLowerCase().includes(query.toLowerCase()) ||
      m.user_id.includes(query)
  )
}

export function isValidImageFormat(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop() || ''
  return ['jpg', 'jpeg', 'png', 'gif'].includes(ext)
}

export function isEmptyMessage(text: string): boolean {
  return !text || text.trim().length === 0
}

export function getAudioProxyUrl(fileUuid: string, isGroup: boolean): string {
  const token = getToken()
  return `/api/message/record-info?file=${encodeURIComponent(fileUuid)}${token ? `&token=${encodeURIComponent(token)}` : ''}`
}

// ==================== 其他API ====================

export async function ntCall<T = any>(service: string, method: string, args: any[] = []): Promise<T> {
  throw new Error(`ntCall(${service}, ${method}) 未实现，请使用实际的 OneBot API`)
}

export async function uploadImage(file: File): Promise<{ imagePath: string; filename: string }> {
  throw new Error('uploadImage 未实现')
}

export async function uploadImageByUrl(imageUrl: string): Promise<{ imagePath: string; filename: string }> {
  throw new Error('uploadImageByUrl 未实现')
}

export async function uploadFile(file: File): Promise<{ filePath: string; fileName: string; fileSize: number }> {
  throw new Error('uploadFile 未实现')
}

export async function sendPoke(chatType: number, targetUin: number, groupCode?: number): Promise<void> {
  if (chatType === 2 && groupCode) {
    await callBotAPI('group_poke', { group_id: groupCode, user_id: targetUin })
  } else {
    await sendFriendPoke(String(targetUin))
  }
}

export async function getForwardMessages(resId: string): Promise<any[]> {
  const data = await callBotAPI('get_forward_msg', { message_id: resId })
  return data || []
}

export async function setRecentChatTop(chatType: number, peerId: string, isTop: boolean): Promise<void> {
  // 后端未实现
}

export async function getGroupProfile(groupId: string): Promise<any> {
  return getGroupInfo(groupId)
}
