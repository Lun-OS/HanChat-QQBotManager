import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Minus, Maximize2, Copy, Trash2, Reply, ThumbsUp, MoreHorizontal, Loader2 } from 'lucide-react'
import type { RawMessage } from '../../../types/webqq'
import { getSelfUid, ntCall, recallMessage } from '../../../services/webqqApi'
import { showToast } from '../../common/Toast'

interface MessageContextMenuProps {
  contextMenu: { x: number; y: number; message: RawMessage; elementId?: string }
  session: { chatType: number; peerId: string } | null
  getCachedMembers: (groupCode: string) => any[] | null
  onClose: () => void
  onReply: (msg: RawMessage) => void
  onEmojiReaction: (msg: RawMessage, x: number, y: number) => void
  onRecall: (msgId: string) => void
}

export function MessageContextMenu({
  contextMenu,
  session,
  onClose,
  onReply,
  onEmojiReaction,
  onRecall
}: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const selfUid = getSelfUid()
  const isSelf = selfUid ? contextMenu.message.senderUid === selfUid : false

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  useEffect(() => {
    const menu = menuRef.current
    if (!menu) return

    const rect = menu.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let left = contextMenu.x
    let top = contextMenu.y

    if (left + rect.width > viewportWidth) {
      left = viewportWidth - rect.width - 10
    }
    if (top + rect.height > viewportHeight) {
      top = viewportHeight - rect.height - 10
    }

    menu.style.left = `${Math.max(10, left)}px`
    menu.style.top = `${Math.max(10, top)}px`
  }, [contextMenu.x, contextMenu.y])

  const handleCopy = useCallback(() => {
    const msg = contextMenu.message
    if (!msg.elements) { onClose(); return }

    const textParts: string[] = []
    for (const el of msg.elements) {
      if (el.textElement?.content) textParts.push(el.textElement.content)
    }

    const text = textParts.join('').trim()
    if (text) {
      navigator.clipboard.writeText(text).then(() => showToast('已复制', 'success')).catch(() => showToast('复制失败', 'error'))
    } else {
      showToast('无法复制', 'error')
    }
    onClose()
  }, [contextMenu.message, onClose])

  const handleReply = useCallback(() => {
    onReply(contextMenu.message)
    onClose()
  }, [contextMenu.message, onReply, onClose])

  const handleEmoji = useCallback(() => {
    const menu = menuRef.current
    if (!menu) return
    const rect = menu.getBoundingClientRect()
    onEmojiReaction(contextMenu.message, rect.left + rect.width / 2, rect.top)
    onClose()
  }, [contextMenu.message, onEmojiReaction, onClose])

  const handleRecall = useCallback(async () => {
    if (!session) { onClose(); return }
    setLoading(true)
    try {
      await recallMessage(session.chatType, session.peerId, contextMenu.message.msgId)
      showToast('已撤回', 'success')
      onRecall(contextMenu.message.msgId)
    } catch (e: any) {
      showToast(e.message || '撤回失败', 'error')
    } finally {
      setLoading(false)
      onClose()
    }
  }, [session, contextMenu.message, onRecall, onClose])

  const isRecalled = contextMenu.message.recallTime && contextMenu.message.recallTime !== '0'
  const canRecall = isSelf && !isRecalled && session?.chatType !== 100

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white/95 dark:bg-neutral-800/95 backdrop-blur-xl border border-theme-divider rounded-2xl shadow-2xl py-1 min-w-[160px] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      style={{ left: contextMenu.x, top: contextMenu.y }}
    >
      <button onClick={handleCopy} className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-theme-item-hover text-theme transition-colors">
        <Copy size={16} className="flex-shrink-0 text-theme-muted" />
        <span className="flex-1">复制</span>
      </button>
      <button onClick={handleReply} className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-theme-item-hover text-theme transition-colors">
        <Reply size={16} className="flex-shrink-0 text-theme-muted" />
        <span className="flex-1">回复</span>
      </button>
      <button onClick={handleEmoji} className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-theme-item-hover text-theme transition-colors">
        <ThumbsUp size={16} className="flex-shrink-0 text-theme-muted" />
        <span className="flex-1">表情</span>
      </button>
      {canRecall && (
        <button onClick={handleRecall} disabled={loading} className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-theme-item-hover text-red-500 transition-colors">
          {loading ? <Loader2 size={16} className="flex-shrink-0 animate-spin" /> : <Trash2 size={16} className="flex-shrink-0" />}
          <span className="flex-1">撤回</span>
        </button>
      )}
    </div>
  )
}

interface AvatarContextMenuProps {
  avatarContextMenu: {
    x: number
    y: number
    senderUid: string
    senderUin: string
    senderName: string
    chatType: number
    groupCode?: string
  }
  getCachedMembers: (groupCode: string) => any[] | null
  onClose: () => void
  onInsertAt: (uid: string, uin: string, name: string) => void
  onShowProfile: (uid: string, uin: string, x: number, y: number, groupCode?: string) => void
  onSetTitle: (uid: string, name: string, groupCode: string) => void
  onMute: (uid: string, name: string, groupCode: string) => void
  onKick: (uid: string, name: string, groupCode: string, groupName: string) => void
  onAdminChanged: () => void
  groupName?: string
}

export function AvatarContextMenu({
  avatarContextMenu,
  getCachedMembers,
  onClose,
  onInsertAt,
  onShowProfile,
  onSetTitle,
  onMute,
  onKick,
  onAdminChanged,
  groupName
}: AvatarContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [isSelf, setIsSelf] = useState(false)
  const selfUid = getSelfUid()
  const { x, y, senderUid, senderUin, senderName, chatType, groupCode } = avatarContextMenu

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  useEffect(() => {
    const menu = menuRef.current
    if (!menu) return

    const rect = menu.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let left = x
    let top = y

    if (left + rect.width > viewportWidth) {
      left = viewportWidth - rect.width - 10
    }
    if (top + rect.height > viewportHeight) {
      top = viewportHeight - rect.height - 10
    }

    menu.style.left = `${Math.max(10, left)}px`
    menu.style.top = `${Math.max(10, top)}px`
  }, [x, y])

  useEffect(() => {
    if (!groupCode || chatType !== 2) return

    setLoading(true)
    const members = getCachedMembers(groupCode)
    if (members) {
      const member = members.find(m => m.uid === senderUid || m.uin === senderUin)
      setIsAdmin(member?.role === 'admin')
      setIsOwner(member?.role === 'owner')
    }
    setIsSelf(senderUid === selfUid)
    setLoading(false)
  }, [groupCode, chatType, senderUid, senderUin, selfUid, getCachedMembers])

  const handleInsertAt = useCallback(() => {
    onInsertAt(senderUid, senderUin, senderName)
    onClose()
  }, [senderUid, senderUin, senderName, onInsertAt, onClose])

  const handleShowProfile = useCallback(() => {
    const menu = menuRef.current
    if (!menu) return
    const rect = menu.getBoundingClientRect()
    onShowProfile(senderUid, senderUin, rect.left, rect.bottom + 8, groupCode)
    onClose()
  }, [senderUid, senderUin, onShowProfile, groupCode, onClose])

  const handleSetTitle = useCallback(() => {
    if (!groupCode) return
    onSetTitle(senderUid, senderName, groupCode)
    onClose()
  }, [senderUid, senderName, groupCode, onSetTitle, onClose])

  const handleMute = useCallback(() => {
    if (!groupCode) return
    onMute(senderUid, senderName, groupCode)
    onClose()
  }, [senderUid, senderName, groupCode, onMute, onClose])

  const handleKick = useCallback(async () => {
    if (!groupCode || !groupName) return
    const confirmed = confirm(`确定要将 ${senderName} 移出群聊吗？`)
    if (!confirmed) { onClose(); return }
    onKick(senderUid, senderName, groupCode, groupName)
    onClose()
  }, [senderUid, senderName, groupCode, groupName, onKick, onClose])

  const handleSetAdmin = useCallback(async () => {
    if (!groupCode) return
    setLoading(true)
    try {
      await ntCall('ntGroupApi', 'setAdmin', [groupCode, senderUid, !isAdmin])
      showToast(isAdmin ? '已取消管理员' : '已设置为管理员', 'success')
      onAdminChanged()
    } catch (e: any) {
      showToast(e.message || '操作失败', 'error')
    } finally {
      setLoading(false)
      onClose()
    }
  }, [groupCode, senderUid, isAdmin, onAdminChanged, onClose])

  if (chatType === 2 && groupCode) {
    return (
      <div
        ref={menuRef}
        className="fixed z-50 bg-white/95 dark:bg-neutral-800/95 backdrop-blur-xl border border-theme-divider rounded-2xl shadow-2xl py-1 min-w-[160px] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        style={{ left: x, top: y }}
      >
        {isOwner || isAdmin ? (
          <button onClick={handleInsertAt} className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-theme-item-hover text-theme transition-colors">
            <Reply size={16} className="flex-shrink-0 text-theme-muted" />
            <span className="flex-1">@{senderName}</span>
          </button>
        ) : null}
        <button onClick={handleShowProfile} className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-theme-item-hover text-theme transition-colors">
          <MoreHorizontal size={16} className="flex-shrink-0 text-theme-muted" />
          <span className="flex-1">查看资料</span>
        </button>
        {!isSelf && (isOwner || isAdmin) && (
          <>
            <button onClick={handleMute} className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-theme-item-hover text-theme transition-colors">
              <Minus size={16} className="flex-shrink-0 text-theme-muted" />
              <span className="flex-1">禁言</span>
            </button>
            <button onClick={handleSetTitle} className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-theme-item-hover text-theme transition-colors">
              <Copy size={16} className="flex-shrink-0 text-theme-muted" />
              <span className="flex-1">设置头衔</span>
            </button>
            {isOwner && (
              <button onClick={handleSetAdmin} disabled={loading} className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-theme-item-hover text-theme transition-colors">
                {loading ? <Loader2 size={16} className="flex-shrink-0 animate-spin" /> : <Maximize2 size={16} className="flex-shrink-0 text-theme-muted" />}
                <span className="flex-1">{isAdmin ? '取消管理员' : '设为管理员'}</span>
              </button>
            )}
            <button onClick={handleKick} className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-theme-item-hover text-red-500 transition-colors">
              <Trash2 size={16} className="flex-shrink-0" />
              <span className="flex-1">移出群聊</span>
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white/95 dark:bg-neutral-800/95 backdrop-blur-xl border border-theme-divider rounded-2xl shadow-2xl py-1 min-w-[160px] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      style={{ left: x, top: y }}
    >
      <button onClick={handleShowProfile} className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-theme-item-hover text-theme transition-colors">
        <MoreHorizontal size={16} className="flex-shrink-0 text-theme-muted" />
        <span className="flex-1">查看资料</span>
      </button>
    </div>
  )
}