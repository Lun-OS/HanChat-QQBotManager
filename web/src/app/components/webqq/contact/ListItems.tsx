import React, { useState, useEffect } from 'react'
import { Pin } from 'lucide-react'
import type { FriendItem, GroupItem } from '../../../types/webqq'
import { formatMessageTime, setGroupMsgMask, GroupMsgMask } from '../../../services/webqqApi'
import { useWebQQStore } from '../../../stores/webqqStore'
import { showToast } from '../../common/Toast'

export function useMenuPosition(initialX: number, initialY: number, menuRef: React.RefObject<HTMLDivElement | null>) {
  const [position, setPosition] = useState({ left: initialX, top: initialY, ready: false })

  useEffect(() => {
    if (!menuRef.current) {
      setPosition({ left: initialX, top: initialY, ready: true })
      return
    }

    const menu = menuRef.current
    const rect = menu.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let left = initialX
    let top = initialY

    if (initialX + rect.width > viewportWidth) {
      left = viewportWidth - rect.width - 10
    }
    if (initialY + rect.height > viewportHeight) {
      top = viewportHeight - rect.height - 10
    }

    setPosition({ left: Math.max(10, left), top: Math.max(10, top), ready: true })
  }, [initialX, initialY, menuRef])

  return position
}

interface FriendListItemProps {
  friend: FriendItem
  isSelected?: boolean
  onClick: () => void
}

export const FriendListItem: React.FC<FriendListItemProps> = ({ friend, isSelected, onClick }) => {
  const displayName = friend.remark || friend.nickname
  const isTop = !!(friend.topTime && friend.topTime !== '0')

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
        isSelected ? 'bg-pink-500/20' : isTop ? 'bg-theme-item-hover' : 'hover:bg-theme-item-hover'
      }`}
    >
      <div className="relative flex-shrink-0">
        <img
          src={friend.avatar}
          alt={displayName}
          className="w-10 h-10 rounded-full object-cover"
          onError={(e) => {
            e.currentTarget.src = `https://q1.qlogo.cn/g?b=qq&nk=${friend.uin}&s=640`
          }}
        />
        {isTop && (
          <div className="absolute -top-1 -left-1 w-4 h-4 bg-pink-500 rounded-full flex items-center justify-center">
            <Pin size={10} className="text-white" />
          </div>
        )}
        {friend.online && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-800" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-theme truncate">{displayName}</span>
        </div>
        {friend.remark && friend.remark !== friend.nickname && (
          <div className="text-xs text-theme-hint truncate">{friend.nickname}</div>
        )}
      </div>
    </div>
  )
}

interface GroupListItemProps {
  group: GroupItem
  isSelected?: boolean
  showPinnedStyle?: boolean
  onClick: () => void
  unreadCount?: number
  subtitle?: string
}

export const GroupListItem: React.FC<GroupListItemProps> = ({ group, isSelected, showPinnedStyle, onClick, unreadCount = 0, subtitle }) => {
  const displayName = group.remarkName || group.groupName

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
        isSelected ? 'bg-pink-500/20' : showPinnedStyle || group.isTop ? 'bg-theme-item-hover' : 'hover:bg-theme-item-hover'
      }`}
    >
      <div className="relative flex-shrink-0">
        <img
          src={group.avatar}
          alt={displayName}
          className="w-10 h-10 rounded-full object-cover"
          onError={(e) => {
            e.currentTarget.src = `https://p.qlogo.cn/gh/${group.groupCode}/${group.groupCode}/640/`
          }}
        />
        {unreadCount > 0 && (
          <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-xs font-medium rounded-full flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-theme truncate">{displayName}</span>
        </div>
        {subtitle ? (
          <div className="text-xs text-theme-hint truncate">{subtitle}</div>
        ) : (
          <div className="text-xs text-theme-hint truncate">{group.memberCount} 人</div>
        )}
      </div>
    </div>
  )
}

interface GroupMsgMaskMenuProps {
  groupCode: string
  onClose: () => void
}

export const GroupMsgMaskMenu: React.FC<GroupMsgMaskMenuProps> = ({ groupCode, onClose }) => {
  const [isOpen, setIsOpen] = useState(false)
  const groups = useWebQQStore(state => state.groups)
  const group = groups.find(g => g.groupCode === groupCode)
  const currentMask = group?.msgMask || 1

  const handleSelect = async (mask: GroupMsgMask) => {
    try {
      await setGroupMsgMask(groupCode, mask)
      const maskText = mask === GroupMsgMask.AllowNotify ? '正常接收' :
        mask === GroupMsgMask.BoxNotNotify ? '收进群助手' :
          mask === GroupMsgMask.NotAllow ? '屏蔽' : '开启群助手'
      showToast(`已设置为${maskText}`, 'success')
      onClose()
    } catch (e: any) {
      showToast(e.message || '设置失败', 'error')
    }
  }

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen) }}
        className="w-full px-3 py-2 text-left text-sm hover:bg-theme-item-hover flex items-center gap-2 text-theme"
      >
        <span className="flex-1">消息接收方式</span>
        <span className="text-xs text-theme-hint">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-full mt-1 w-full bg-popup backdrop-blur-sm border border-theme-divider rounded-lg shadow-lg py-1 z-50">
            <button
              onClick={() => handleSelect(GroupMsgMask.AllowNotify)}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-theme-item-hover flex items-center gap-2 ${currentMask === GroupMsgMask.AllowNotify ? 'text-pink-500' : 'text-theme'}`}
            >
              <span className="flex-1">正常接收</span>
              {currentMask === GroupMsgMask.AllowNotify && <span className="text-xs">✓</span>}
            </button>
            <button
              onClick={() => handleSelect(GroupMsgMask.BoxNotNotify)}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-theme-item-hover flex items-center gap-2 ${currentMask === GroupMsgMask.BoxNotNotify ? 'text-pink-500' : 'text-theme'}`}
            >
              <span className="flex-1">收进群助手</span>
              {currentMask === GroupMsgMask.BoxNotNotify && <span className="text-xs">✓</span>}
            </button>
            <button
              onClick={() => handleSelect(GroupMsgMask.NotAllow)}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-theme-item-hover flex items-center gap-2 ${currentMask === GroupMsgMask.NotAllow ? 'text-pink-500' : 'text-theme'}`}
            >
              <span className="flex-1">屏蔽</span>
              {currentMask === GroupMsgMask.NotAllow && <span className="text-xs">✓</span>}
            </button>
            <button
              onClick={() => handleSelect(GroupMsgMask.AllowNotNotify)}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-theme-item-hover flex items-center gap-2 ${currentMask === GroupMsgMask.AllowNotNotify ? 'text-pink-500' : 'text-theme'}`}
            >
              <span className="flex-1">开启群助手</span>
              {currentMask === GroupMsgMask.AllowNotNotify && <span className="text-xs">✓</span>}
            </button>
          </div>
        </>
      )}
    </div>
  )
}