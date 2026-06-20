import { useState, useRef, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import type { RawMessage } from '../../../types/webqq'
import { ntCall, getSelfUid } from '../../../services/webqqApi'
import { showToast } from '../../common/Toast'

interface EmojiReactionPickerProps {
  target: { message: RawMessage; x: number; y: number }
  onClose: () => void
  containerRef: React.RefObject<HTMLDivElement | null>
}

const COMMON_EMOJIS = [
  { id: 0, emoji: '👍' },
  { id: 1, emoji: '👎' },
  { id: 2, emoji: '❤️' },
  { id: 3, emoji: '🥰' },
  { id: 4, emoji: '😄' },
  { id: 5, emoji: '😢' },
  { id: 6, emoji: '😡' },
  { id: 8, emoji: '😮' },
  { id: 167, emoji: '🥳' },
  { id: 229, emoji: '🤔' },
  { id: 246, emoji: '😅' },
  { id: 281, emoji: '😭' },
  { id: 297, emoji: '😇' },
  { id: 304, emoji: '🤯' },
  { id: 359, emoji: '🥺' },
]

export function EmojiReactionPicker({ target, onClose, containerRef }: EmojiReactionPickerProps) {
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const selfUid = getSelfUid()

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        const container = containerRef.current
        if (container && container.contains(e.target as Node)) return
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose, containerRef])

  const handleEmojiClick = useCallback(async (emojiId: string, emojiType: string) => {
    setLoading(true)
    try {
      const peer = {
        chatType: target.message.chatType,
        peerUid: target.message.peerUin,
        guildId: ''
      }

      const existingList = target.message.emojiLikesList || []
      const isClicked = existingList.some(e => e.emojiId === emojiId && e.isClicked)

      await ntCall('ntMsgApi', 'setEmojiLike', [peer, target.message.msgSeq, emojiId, !isClicked])
      onClose()
    } catch (e: any) {
      showToast(e.message || '操作失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [target, onClose])

  return (
    <div
      ref={pickerRef}
      className="fixed z-50 bg-white/95 dark:bg-neutral-800/95 backdrop-blur-xl border border-theme-divider rounded-2xl shadow-2xl p-3 animate-in fade-in zoom-in-95 duration-150"
      style={{ left: target.x, top: target.y, transform: 'translate(-50%, -100%)' }}
    >
      <div className="grid grid-cols-7 gap-1">
        {COMMON_EMOJIS.map(({ id, emoji }) => (
          <button
            key={id}
            onClick={() => handleEmojiClick(String(id), parseInt(String(id)) > 999 ? '2' : '1')}
            disabled={loading}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-theme-item-hover transition-colors text-lg"
          >
            {emoji}
          </button>
        ))}
      </div>
      {loading && (
        <div className="absolute inset-0 bg-white/50 dark:bg-neutral-800/50 flex items-center justify-center rounded-2xl">
          <Loader2 size={20} className="animate-spin text-pink-500" />
        </div>
      )}
    </div>
  )
}

export default EmojiReactionPicker