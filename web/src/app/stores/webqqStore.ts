// WebQQ Store - 使用 Zustand 管理状态
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FriendCategory, GroupItem, RecentChatItem, ChatSession, GroupMemberItem, NotificationItem } from '../types/webqq'
import { getFriends, getGroups, getRecentChats, getGroupNotifications, getFriendRequests, getDoubtBuddyRequests } from '../services/webqqApi'

const CACHE_EXPIRY_MS = 60 * 60 * 1000
const MEMBERS_CACHE_EXPIRY_MS = 30 * 60 * 1000

const loadingMembersPromises = new Map<string, Promise<GroupMemberItem[]>>()

interface MembersCacheEntry {
  members: GroupMemberItem[]
  timestamp: number
}

interface ScrollPosition {
  msgId: string
  offset: number
}

type TabType = 'friends' | 'groups' | 'recent'
type GroupAssistantMode = 'normal' | 'assistant'

let visitedChats = new Set<string>()
let fetchedMembersGroups = new Set<string>()

export const resetVisitedChats = () => {
  visitedChats = new Set<string>()
  fetchedMembersGroups = new Set<string>()
}

export const hasVisitedChat = (chatType: number, peerId: string): boolean => {
  return visitedChats.has(`${chatType}_${peerId}`)
}

export const markChatVisited = (chatType: number, peerId: string) => {
  visitedChats.add(`${chatType}_${peerId}`)
}

export const unmarkChatVisited = (chatType: number, peerId: string) => {
  visitedChats.delete(`${chatType}_${peerId}`)
}

export const hasFetchedMembers = (groupCode: string): boolean => {
  return fetchedMembersGroups.has(groupCode)
}

export const markMembersFetched = (groupCode: string) => {
  fetchedMembersGroups.add(groupCode)
}

interface WebQQState {
  friendCategories: FriendCategory[]
  groups: GroupItem[]
  recentChats: RecentChatItem[]
  groupLastTimeMap: Record<string, number>
  groupLastMessageMap: Record<string, string>
  contactsLoading: boolean
  contactsError: string | null
  currentChat: ChatSession | null
  activeTab: TabType
  groupAssistantMode: GroupAssistantMode
  unreadCounts: Record<string, number>
  expandedCategories: number[]
  membersCache: Record<string, MembersCacheEntry>
  showMemberPanel: boolean
  notifications: NotificationItem[]
  notificationUnreadCount: number
  scrollPositions: Record<string, ScrollPosition>
  contactsCacheTimestamp: number

  setFriendCategories: (categories: FriendCategory[]) => void
  setGroups: (groups: GroupItem[]) => void
  setRecentChats: (chats: RecentChatItem[]) => void
  setContactsLoading: (loading: boolean) => void
  setContactsError: (error: string | null) => void
  setCurrentChat: (chat: ChatSession | null) => void
  setActiveTab: (tab: TabType) => void
  setGroupAssistantMode: (mode: GroupAssistantMode) => void
  enterGroupAssistant: () => void
  exitGroupAssistant: () => void
  setUnreadCount: (chatKey: string, count: number) => void
  incrementUnreadCount: (chatKey: string) => void
  clearUnreadCount: (chatKey: string) => void
  initUnreadCounts: (recentChats: RecentChatItem[]) => void
  toggleCategory: (categoryId: number) => void
  setExpandedCategories: (ids: number[]) => void
  getCachedMembers: (groupCode: string) => GroupMemberItem[] | null
  setCachedMembers: (groupCode: string, members: GroupMemberItem[]) => void
  fetchGroupMembers: (groupCode: string, forceRefresh?: boolean) => Promise<GroupMemberItem[]>
  setShowMemberPanel: (show: boolean) => void
  addNotification: (notification: NotificationItem) => void
  setNotifications: (notifications: NotificationItem[]) => void
  clearNotificationUnread: () => void
  updateNotificationStatus: (type: string, flag: string, newStatus: number) => void
  loadGroupNotifications: () => Promise<void>
  getScrollPosition: (chatType: string, peerId: string) => ScrollPosition | null
  setScrollPosition: (chatType: string, peerId: string, position: ScrollPosition) => void
  clearScrollPosition: (chatType: string, peerId: string) => void
  loadContacts: () => Promise<void>
  refreshContacts: () => Promise<void>
  updateRecentChat: (chatType: number, peerId: string, lastMessage: string, lastTime: number, peerName?: string, peerAvatar?: string) => void
  togglePinChat: (chatType: number, peerId: string) => Promise<void>
  removeRecentChat: (chatType: number, peerId: string) => void
  removeFriend: (uid: string) => void
  isContactsCacheValid: () => boolean
}

export const useWebQQStore = create<WebQQState>()(
  persist(
    (set, get) => ({
      friendCategories: [],
      groups: [],
      recentChats: [],
      groupLastTimeMap: {},
      groupLastMessageMap: {},
      contactsLoading: false,
      contactsError: null,
      currentChat: null,
      activeTab: 'recent',
      groupAssistantMode: 'normal',
      unreadCounts: {},
      expandedCategories: [],
      membersCache: {},
      showMemberPanel: false,
      notifications: [],
      notificationUnreadCount: 0,
      scrollPositions: {},
      contactsCacheTimestamp: 0,

      setFriendCategories: (categories) => set({ friendCategories: categories }),
      setGroups: (groups) => set({ groups }),
      setRecentChats: (chats) => set({ recentChats: chats }),
      setContactsLoading: (loading) => set({ contactsLoading: loading }),
      setContactsError: (error) => set({ contactsError: error }),
      setCurrentChat: (chat) => set({ currentChat: chat }),
      setActiveTab: (tab) => set({ activeTab: tab }),

      setGroupAssistantMode: (mode) => set({ groupAssistantMode: mode }),
      enterGroupAssistant: () => set({ groupAssistantMode: 'assistant' }),
      exitGroupAssistant: () => set({ groupAssistantMode: 'normal' }),

      setUnreadCount: (chatKey, count) => set((state) => ({
        unreadCounts: { ...state.unreadCounts, [chatKey]: count }
      })),

      incrementUnreadCount: (chatKey) => set((state) => ({
        unreadCounts: {
          ...state.unreadCounts,
          [chatKey]: (state.unreadCounts[chatKey] || 0) + 1
        }
      })),

      clearUnreadCount: (chatKey) => set((state) => {
        const { [chatKey]: _, ...rest } = state.unreadCounts
        return { unreadCounts: rest }
      }),

      initUnreadCounts: (recentChats) => {
        const counts: Record<string, number> = {}
        recentChats.forEach(item => {
          if (item.unreadCount > 0) {
            counts[`${item.chatType}_${item.peerId}`] = item.unreadCount
          }
        })
        set({ unreadCounts: counts })
      },

      toggleCategory: (categoryId) => set((state) => {
        const expanded = new Set(state.expandedCategories)
        if (expanded.has(categoryId)) {
          expanded.delete(categoryId)
        } else {
          expanded.add(categoryId)
        }
        return { expandedCategories: Array.from(expanded) }
      }),

      setExpandedCategories: (ids) => set({ expandedCategories: ids }),

      getCachedMembers: (groupCode) => {
        const state = get()
        const entry = state.membersCache[groupCode]

        if (entry && Date.now() - entry.timestamp < MEMBERS_CACHE_EXPIRY_MS) {
          return entry.members
        }
        return null
      },

      setCachedMembers: (groupCode, members) => set((state) => {
        const now = Date.now()
        const cleanedCache: Record<string, MembersCacheEntry> = {}
        for (const [k, v] of Object.entries(state.membersCache)) {
          if (now - v.timestamp < MEMBERS_CACHE_EXPIRY_MS) {
            cleanedCache[k] = v
          }
        }

        return {
          membersCache: {
            ...cleanedCache,
            [groupCode]: { members, timestamp: now }
          }
        }
      }),

      fetchGroupMembers: async (groupCode, forceRefresh = false) => {
        const state = get()

        if (!forceRefresh) {
          const cached = state.getCachedMembers(groupCode)
          if (cached) {
            return cached
          }
        }

        const existingPromise = loadingMembersPromises.get(groupCode)
        if (existingPromise) {
          return existingPromise
        }

        const promise = (async () => {
          const { getGroupMembers } = await import('../services/webqqApi')
          const members = await getGroupMembers(groupCode)
          get().setCachedMembers(groupCode, members)
          loadingMembersPromises.delete(groupCode)
          return members
        })().catch(err => {
          loadingMembersPromises.delete(groupCode)
          throw err
        })

        loadingMembersPromises.set(groupCode, promise)
        return promise
      },

      setShowMemberPanel: (show) => set({ showMemberPanel: show }),

      addNotification: (notification) => set((state) => {
        const isDuplicate = state.notifications.some(n => {
          if (n.type === 'group-notify' && notification.type === 'group-notify') {
            return n.data.flag === notification.data.flag
          }
          if (n.type === 'friend-request' && notification.type === 'friend-request') {
            return n.data.flag === notification.data.flag
          }
          return false
        })
        if (isDuplicate) {
          return {
            notifications: state.notifications.map(n => {
              if (n.type === notification.type) {
                if (n.type === 'group-notify' && notification.type === 'group-notify' && n.data.flag === notification.data.flag) {
                  return notification
                }
                if (n.type === 'friend-request' && notification.type === 'friend-request' && n.data.flag === notification.data.flag) {
                  return notification
                }
              }
              return n
            })
          }
        }
        return {
          notifications: [notification, ...state.notifications].slice(0, 200),
          notificationUnreadCount: state.notificationUnreadCount + 1
        }
      }),

      setNotifications: (notifications) => set({ notifications }),

      clearNotificationUnread: () => set({ notificationUnreadCount: 0 }),

      updateNotificationStatus: (type, flag, newStatus) => set((state) => ({
        notifications: state.notifications.map(n => {
          if (n.type === type) {
            if (n.type === 'group-notify' && n.data.flag === flag) {
              return { ...n, data: { ...n.data, status: newStatus } }
            }
            if (n.type === 'friend-request' && n.data.flag === flag) {
              return { ...n, data: { ...n.data, isDecide: true } }
            }
          }
          return n
        })
      })),

      loadGroupNotifications: async () => {
        try {
          const [notifies, friendReqs, doubtReqs] = await Promise.all([
            getGroupNotifications().catch(() => []),
            getFriendRequests().catch(() => []),
            getDoubtBuddyRequests().catch(() => [])
          ])
          const groupItems: NotificationItem[] = notifies.map(n => ({
            type: 'group-notify' as const,
            data: n,
            time: n.actionTime ? parseInt(n.actionTime) * 1000 : parseInt(n.seq) / 1000
          }))
          const friendItems: NotificationItem[] = friendReqs.map(r => ({
            type: 'friend-request' as const,
            data: r,
            time: r.reqTime ? parseInt(r.reqTime) * 1000 : Date.now()
          }))
          const doubtItems: NotificationItem[] = doubtReqs.map(d => ({
            type: 'doubt-buddy' as const,
            data: d,
            time: d.reqTime ? parseInt(d.reqTime) * 1000 : Date.now()
          }))
          const state = get()
          const infoNotifications = state.notifications.filter(
            n => n.type !== 'group-notify' && n.type !== 'friend-request' && n.type !== 'doubt-buddy'
          )
          const merged = [...groupItems, ...friendItems, ...doubtItems, ...infoNotifications]
            .sort((a, b) => b.time - a.time)
            .slice(0, 200)
          set({ notifications: merged })
        } catch (e) {
          console.error('加载通知失败:', e)
        }
      },

      getScrollPosition: (chatType, peerId) => {
        const state = get()
        const key = `${chatType}_${peerId}`
        return state.scrollPositions[key] || null
      },

      setScrollPosition: (chatType, peerId, position) => set((state) => ({
        scrollPositions: {
          ...state.scrollPositions,
          [`${chatType}_${peerId}`]: position
        }
      })),

      clearScrollPosition: (chatType, peerId) => set((state) => {
        const { [`${chatType}_${peerId}`]: _, ...rest } = state.scrollPositions
        return { scrollPositions: rest }
      }),

      isContactsCacheValid: () => {
        const state = get()
        return (
          state.contactsCacheTimestamp > 0 &&
          Date.now() - state.contactsCacheTimestamp < CACHE_EXPIRY_MS &&
          (state.friendCategories.length > 0 || state.groups.length > 0)
        )
      },

      loadContacts: async () => {
        const state = get()

        if (state.isContactsCacheValid()) {
          state.refreshContacts()
          return
        }

        set({ contactsLoading: true, contactsError: null })

        try {
          const [categoriesData, groupsData, recentData] = await Promise.all([
            getFriends(),
            getGroups(),
            getRecentChats()
          ])

          const validRecentData = recentData.filter(item =>
            item.peerId && item.peerId !== '0' && item.peerId !== ''
          )

          const localRecentMap = new Map<string, RecentChatItem>()
          state.recentChats.forEach(item => {
            if (item.peerId && item.peerId !== '0' && item.peerId !== '') {
              localRecentMap.set(`${item.chatType}_${item.peerId}`, item)
            }
          })

          validRecentData.forEach(item => {
            const key = `${item.chatType}_${item.peerId}`
            const local = localRecentMap.get(key)
            if (local) {
              const shouldUseRemote =
                item.lastTime > local.lastTime ||
                (item.lastTime === local.lastTime && !local.lastMessage && !!item.lastMessage)
              if (shouldUseRemote) {
                localRecentMap.set(key, item)
              }
            } else {
              localRecentMap.set(key, item)
            }
          })

          const mergedRecent = Array.from(localRecentMap.values())
            .sort((a, b) => b.lastTime - a.lastTime)

          const groupLastTimeMap: Record<string, number> = {}
          const groupLastMessageMap: Record<string, string> = {}
          validRecentData.forEach(item => {
            if (item.chatType === 2) {
              groupLastTimeMap[item.peerId] = item.lastTime
              if (item.lastMessage) {
                groupLastMessageMap[item.peerId] = item.lastMessage
              }
            }
          })

          set({
            friendCategories: categoriesData.categories || [],
            groups: groupsData,
            recentChats: mergedRecent,
            groupLastTimeMap,
            groupLastMessageMap,
            contactsCacheTimestamp: Date.now(),
            contactsLoading: false
          })

          const currentUnread = get().unreadCounts
          const newUnread = { ...currentUnread }
          validRecentData.forEach(item => {
            const key = `${item.chatType}_${item.peerId}`
            if (!(key in newUnread) && item.unreadCount > 0) {
              newUnread[key] = item.unreadCount
            }
          })
          set({ unreadCounts: newUnread })
        } catch (e: any) {
          set({
            contactsError: e.message || '加载联系人失败',
            contactsLoading: false
          })
        }
      },

      refreshContacts: async () => {
        try {
          const [categoriesData, groupsData, recentData] = await Promise.all([
            getFriends(),
            getGroups(),
            getRecentChats()
          ])

          const validRecentData = recentData.filter(item =>
            item.peerId && item.peerId !== '0' && item.peerId !== ''
          )

          const state = get()
          const localRecentMap = new Map<string, RecentChatItem>()
          state.recentChats.forEach(item => {
            if (item.peerId && item.peerId !== '0' && item.peerId !== '') {
              localRecentMap.set(`${item.chatType}_${item.peerId}`, item)
            }
          })

          validRecentData.forEach(item => {
            const key = `${item.chatType}_${item.peerId}`
            const local = localRecentMap.get(key)
            if (local) {
              const shouldUseRemote =
                item.lastTime > local.lastTime ||
                (item.lastTime === local.lastTime && !local.lastMessage && !!item.lastMessage)
              if (shouldUseRemote) {
                localRecentMap.set(key, item)
              }
            } else {
              localRecentMap.set(key, item)
            }
          })

          const mergedRecent = Array.from(localRecentMap.values())
            .sort((a, b) => b.lastTime - a.lastTime)

          const groupLastTimeMap: Record<string, number> = { ...state.groupLastTimeMap }
          const groupLastMessageMap: Record<string, string> = { ...state.groupLastMessageMap }
          validRecentData.forEach(item => {
            if (item.chatType === 2) {
              groupLastTimeMap[item.peerId] = item.lastTime
              if (item.lastMessage) {
                groupLastMessageMap[item.peerId] = item.lastMessage
              }
            }
          })

          set({
            friendCategories: categoriesData.categories || [],
            groups: groupsData,
            recentChats: mergedRecent,
            groupLastTimeMap,
            groupLastMessageMap,
            contactsCacheTimestamp: Date.now()
          })

          const currentUnread = get().unreadCounts
          const newUnread = { ...currentUnread }
          validRecentData.forEach(item => {
            const key = `${item.chatType}_${item.peerId}`
            if (!(key in newUnread) && item.unreadCount > 0) {
              newUnread[key] = item.unreadCount
            }
          })
          set({ unreadCounts: newUnread })
        } catch (e) {
          console.error('Failed to refresh contacts:', e)
        }
      },

      updateRecentChat: (chatType, peerId, lastMessage, lastTime, peerName?: string, peerAvatar?: string) => set((state) => {
        const dedupedChats = state.recentChats.filter((item, index, arr) =>
          arr.findIndex(i => i.chatType === item.chatType && i.peerId === item.peerId) === index
        )

        const existing = dedupedChats.find(
          item => item.chatType === chatType && item.peerId === peerId
        )

        const currentChat = state.currentChat
        const isCurrentChat = currentChat?.chatType === chatType && currentChat?.peerId === peerId

        const newGroupLastTimeMap = chatType === 2
          ? { ...state.groupLastTimeMap, [peerId]: lastTime }
          : state.groupLastTimeMap
        const newGroupLastMessageMap = chatType === 2
          ? { ...state.groupLastMessageMap, [peerId]: lastMessage || '[消息]' }
          : state.groupLastMessageMap

        if (existing) {
          const updated = dedupedChats.filter(
            item => !(item.chatType === chatType && item.peerId === peerId)
          )

          const updatedChat = {
            ...existing,
            lastMessage,
            lastTime,
            unreadCount: isCurrentChat ? 0 : existing.unreadCount + 1
          }

          if (existing.pinned) {
            const pinnedChats = updated.filter(item => item.pinned)
            const normalChats = updated.filter(item => !item.pinned)
            return {
              recentChats: [updatedChat, ...pinnedChats, ...normalChats],
              groupLastTimeMap: newGroupLastTimeMap,
              groupLastMessageMap: newGroupLastMessageMap
            }
          }

          const pinnedChats = updated.filter(item => item.pinned)
          const normalChats = updated.filter(item => !item.pinned)
          return {
            recentChats: [...pinnedChats, updatedChat, ...normalChats],
            groupLastTimeMap: newGroupLastTimeMap,
            groupLastMessageMap: newGroupLastMessageMap
          }
        } else {
          let name = peerName || peerId
          let avatar = peerAvatar || ''

          if (chatType === 1 || chatType === 100) {
            for (const category of state.friendCategories) {
              const friend = category.friends.find(f => f.uin === peerId)
              if (friend) {
                name = friend.remark || friend.nickname
                avatar = friend.avatar
                break
              }
            }
            if (!avatar) {
              avatar = `https://q1.qlogo.cn/g?b=qq&nk=${peerId}&s=640`
            }
          } else if (chatType === 2) {
            const group = state.groups.find(g => g.groupCode === peerId)
            if (group) {
              if (group.msgMask === 2) {
                return {
                  groupLastTimeMap: newGroupLastTimeMap,
                  groupLastMessageMap: newGroupLastMessageMap
                }
              }
              name = group.groupName
              avatar = group.avatar
            }
            if (!avatar) {
              avatar = `https://p.qlogo.cn/gh/${peerId}/${peerId}/640/`
            }
          }

          const newChat: RecentChatItem = {
            chatType: chatType as 1 | 2 | 100,
            peerId,
            peerName: name,
            peerAvatar: avatar,
            lastMessage,
            lastTime,
            unreadCount: isCurrentChat ? 0 : 1
          }

          return {
            recentChats: [newChat, ...dedupedChats],
            groupLastTimeMap: newGroupLastTimeMap,
            groupLastMessageMap: newGroupLastMessageMap
          }
        }
      }),

      togglePinChat: async (chatType, peerId) => {
        const state = get()
        const chat = state.recentChats.find(item => item.chatType === chatType && item.peerId === peerId)
        if (!chat) return

        const newPinnedState = !chat.pinned

        try {
          const { setRecentChatTop } = await import('../services/webqqApi')
          await setRecentChatTop(chatType, peerId, newPinnedState)

          set((state) => {
            const chats = state.recentChats.map(item => {
              if (item.chatType === chatType && item.peerId === peerId) {
                return { ...item, pinned: newPinnedState }
              }
              return item
            })
            chats.sort((a, b) => {
              if (a.pinned && !b.pinned) return -1
              if (!a.pinned && b.pinned) return 1
              return b.lastTime - a.lastTime
            })
            return { recentChats: chats }
          })
        } catch (error: any) {
          console.error('设置置顶失败:', error)
          throw error
        }
      },

      removeRecentChat: (chatType, peerId) => set((state) => {
        return {
          recentChats: state.recentChats.filter(
            item => !(item.chatType === chatType && item.peerId === peerId)
          )
        }
      }),

      removeFriend: (uid) => set((state) => {
        const newCategories = state.friendCategories.map(category => ({
          ...category,
          friends: category.friends.filter(f => f.uid !== uid),
          memberCount: category.friends.filter(f => f.uid !== uid).length
        }))
        return { friendCategories: newCategories }
      })
    }),
    {
      name: 'webqq-storage',
      partialize: (state) => ({
        friendCategories: state.friendCategories,
        groups: state.groups,
        recentChats: state.recentChats,
        groupLastTimeMap: state.groupLastTimeMap,
        groupLastMessageMap: state.groupLastMessageMap,
        expandedCategories: state.expandedCategories,
        membersCache: state.membersCache,
        showMemberPanel: state.showMemberPanel,
        scrollPositions: state.scrollPositions,
        contactsCacheTimestamp: state.contactsCacheTimestamp,
        unreadCounts: state.unreadCounts,
        activeTab: state.activeTab,
        currentChat: state.currentChat
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // 确保 friendCategories 是数组
          if (!Array.isArray(state.friendCategories)) {
            state.friendCategories = []
          }
          // 确保 groups 是数组
          if (!Array.isArray(state.groups)) {
            state.groups = []
          }
          // 确保 recentChats 是数组
          if (!Array.isArray(state.recentChats)) {
            state.recentChats = []
          } else {
            // 过滤无效的最近聊天
            const seen = new Set<string>()
            state.recentChats = state.recentChats.filter(item => {
              if (!item.peerId || item.peerId === '0' || item.peerId === '') {
                return false
              }
              const key = `${item.chatType}_${item.peerId}`
              if (seen.has(key)) {
                return false
              }
              seen.add(key)
              return true
            })
          }
        }
      }
    }
  )
)