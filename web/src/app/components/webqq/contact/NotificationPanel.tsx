import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { NotificationItem } from '../../../types/webqq'
import { handleGroupNotification, handleFriendRequest, approveDoubtBuddy } from '../../../services/webqqApi'
import { useWebQQStore } from '../../../stores/webqqStore'
import { showToast } from '../../common/Toast'

interface NotificationPanelProps {
  onClose: () => void
}

export function NotificationPanel({ onClose }: NotificationPanelProps) {
  const notifications = useWebQQStore(state => state.notifications)
  const updateNotificationStatus = useWebQQStore(state => state.updateNotificationStatus)
  const [loadingSeq, setLoadingSeq] = useState<string | null>(null)

  const handleGroupNotify = async (flag: string, action: 'approve' | 'reject') => {
    setLoadingSeq(flag)
    try {
      await handleGroupNotification(flag, action)
      showToast(action === 'approve' ? '已同意' : '已拒绝', 'success')
    } catch (e: any) {
      showToast(e.message || '操作失败', 'error')
    } finally {
      setLoadingSeq(null)
    }
  }

  const handleFriendReq = async (flag: string, action: 'approve' | 'reject') => {
    setLoadingSeq(flag)
    try {
      await handleFriendRequest(flag, action)
      showToast(action === 'approve' ? '已添加' : '已拒绝', 'success')
    } catch (e: any) {
      showToast(e.message || '操作失败', 'error')
    } finally {
      setLoadingSeq(null)
    }
  }

  const handleDoubtBuddy = async (uid: string) => {
    setLoadingSeq(uid)
    try {
      await approveDoubtBuddy(uid)
      showToast('已添加', 'success')
    } catch (e: any) {
      showToast(e.message || '操作失败', 'error')
    } finally {
      setLoadingSeq(null)
    }
  }

  const getGroupNotifyTypeText = (type: number) => {
    switch (type) {
      case 1: return '邀请你入群'
      case 4: return '同意你入群'
      case 5: return '申请入群'
      case 7: return '申请入群'
      default: return '群通知'
    }
  }

  const getGroupNotifyText = (item: any) => {
    const type = item.notifyType
    const user1Name = item.user1?.nickName || item.user1?.uin || '某人'
    const user2Name = item.user2?.nickName || item.user2?.uin || '某人'
    const groupName = item.group?.groupName || '该群'

    switch (type) {
      case 1: return `${user1Name} 邀请 ${user2Name} 加入群聊 ${groupName}`
      case 4: return `${user2Name} 同意加入群聊 ${groupName}`
      case 5: return `${user1Name} 申请加入群聊 ${groupName}`
      case 7: return `${user1Name} 申请加入群聊 ${groupName}`
      default: return `${user1Name} 在群聊 ${groupName} 中发起了操作`
    }
  }

  if (notifications.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-theme-hint text-sm">
        暂无通知
      </div>
    )
  }

  return (
    <div className="py-2 max-h-full overflow-y-auto">
      {notifications.map((notification) => {
        if (notification.type === 'group-notify') {
          const item = notification.data
          const isLoading = loadingSeq === item.flag
          const isHandled = item.status !== 1

          return (
            <div key={item.seq} className="px-4 py-3 hover:bg-theme-item-hover transition-colors border-b border-theme-divider last:border-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-theme">{getGroupNotifyTypeText(item.notifyType)}</div>
                  <div className="text-xs text-theme-muted mt-1 truncate">{getGroupNotifyText(item)}</div>
                  {item.postscript && (
                    <div className="text-xs text-theme-hint mt-1">附言: {item.postscript}</div>
                  )}
                </div>
                {!isHandled && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleGroupNotify(item.flag, 'approve')}
                      disabled={isLoading}
                      className="px-3 py-1 text-xs bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:opacity-50"
                    >
                      {isLoading ? <Loader2 size={12} className="animate-spin" /> : '同意'}
                    </button>
                    <button
                      onClick={() => handleGroupNotify(item.flag, 'reject')}
                      disabled={isLoading}
                      className="px-3 py-1 text-xs border border-theme-divider text-theme rounded-lg hover:bg-theme-item disabled:opacity-50"
                    >
                      拒绝
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        }

        if (notification.type === 'friend-request') {
          const item = notification.data
          const isLoading = loadingSeq === item.flag
          const isHandled = item.isDecide

          return (
            <div key={item.flag} className="px-4 py-3 hover:bg-theme-item-hover transition-colors border-b border-theme-divider last:border-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img
                    src={item.friendAvatarUrl || `https://q1.qlogo.cn/g?b=qq&nk=${item.friendUin}&s=640`}
                    alt={item.friendNick}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-theme">{item.friendNick}</div>
                    <div className="text-xs text-theme-muted truncate">{item.extWords || '请求添加你为好友'}</div>
                  </div>
                </div>
                {!isHandled && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleFriendReq(item.flag, 'approve')}
                      disabled={isLoading}
                      className="px-3 py-1 text-xs bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:opacity-50"
                    >
                      {isLoading ? <Loader2 size={12} className="animate-spin" /> : '同意'}
                    </button>
                    <button
                      onClick={() => handleFriendReq(item.flag, 'reject')}
                      disabled={isLoading}
                      className="px-3 py-1 text-xs border border-theme-divider text-theme rounded-lg hover:bg-theme-item disabled:opacity-50"
                    >
                      拒绝
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        }

        if (notification.type === 'doubt-buddy') {
          const item = notification.data
          const isLoading = loadingSeq === item.uid

          return (
            <div key={item.flag} className="px-4 py-3 hover:bg-theme-item-hover transition-colors border-b border-theme-divider last:border-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img
                    src={`https://q1.qlogo.cn/g?b=qq&nk=${item.uid}&s=640`}
                    alt={item.nick}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-theme">{item.nick}</div>
                    <div className="text-xs text-theme-muted truncate">{item.reason || '来自好友申请'}</div>
                    {item.groupCode && (
                      <div className="text-xs text-theme-hint">来自群: {item.groupCode}</div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDoubtBuddy(item.uid)}
                  disabled={isLoading}
                  className="px-3 py-1 text-xs bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:opacity-50"
                >
                  {isLoading ? <Loader2 size={12} className="animate-spin" /> : '添加'}
                </button>
              </div>
            </div>
          )
        }

        if (notification.type === 'group-dismiss') {
          return (
            <div key={notification.time} className="px-4 py-3 hover:bg-theme-item-hover transition-colors border-b border-theme-divider last:border-0">
              <div className="text-sm text-theme">
                群 <span className="font-medium">{notification.data.groupName}</span> 已解散
              </div>
            </div>
          )
        }

        if (notification.type === 'group-quit') {
          return (
            <div key={notification.time} className="px-4 py-3 hover:bg-theme-item-hover transition-colors border-b border-theme-divider last:border-0">
              <div className="text-sm text-theme">
                你已退出群聊 <span className="font-medium">{notification.data.groupName}</span>
              </div>
            </div>
          )
        }

        return null
      })}
    </div>
  )
}

export default NotificationPanel