import { memo, useState } from 'react'
import { Search, Loader2 } from 'lucide-react'

const EMOJI_CATEGORIES = [
  { id: 'recent', name: '最近', emojis: [] as number[] },
  { id: 'smile', name: '😄', emojis: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] },
  { id: 'person', name: '🙋', emojis: [42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61] },
  { id: 'nature', name: '🐶', emojis: [81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100] },
  { id: 'food', name: '🍔', emojis: [106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120] },
  { id: 'activity', name: '⚽', emojis: [121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134] },
  { id: 'travel', name: '🚀', emojis: [136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149] },
  { id: 'objects', name: '💡', emojis: [151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166] },
  { id: 'symbols', name: '❤️', emojis: [167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184] },
  { id: 'flags', name: '🏁', emojis: [185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199] },
]

const UNICODE_EMOJIS = [
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
  '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '🥲', '😋',
  '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐',
  '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌',
  '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧',
  '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥸', '😎', '🤓', '🧐',
  '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '😦',
  '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞',
  '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿',
  '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖',
  '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '🙈',
  '🙉', '🙊', '💋', '💌', '💘', '💝', '💖', '💗', '💓', '💞',
  '💕', '💟', '❣️', '💔', '❤️', '🧡', '💛', '💚', '💙', '💜',
]

export interface FavEmoji {
  id: string
  url: string
  key: string
}

interface EmojiPickerProps {
  onSelect: (faceId: number) => void
  onSelectEmoji: (emoji: string) => void
  onClose: () => void
}

export const EmojiPicker = memo<EmojiPickerProps>(({ onSelect, onSelectEmoji, onClose }) => {
  const [activeCategory, setActiveCategory] = useState('smile')
  const [searchQuery, setSearchQuery] = useState('')
  const [tab, setTab] = useState<'emoji' | 'unicode'>('emoji')

  const recentEmojis: number[] = []

  const getEmojiImage = (id: number) => {
    return `/face/${id}.png`
  }

  const filteredEmojis = searchQuery
    ? UNICODE_EMOJIS.filter(emoji => emoji.includes(searchQuery))
    : (activeCategory === 'recent' ? recentEmojis : EMOJI_CATEGORIES.find(c => c.id === activeCategory)?.emojis || [])

  return (
    <div className="absolute bottom-full left-0 mb-2 w-80 bg-white/95 dark:bg-neutral-800/95 backdrop-blur-xl border border-theme-divider rounded-2xl shadow-2xl overflow-hidden z-50">
      <div className="flex border-b border-theme-divider">
        <button
          onClick={() => setTab('emoji')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            tab === 'emoji' ? 'text-pink-600 border-b-2 border-pink-500' : 'text-theme-muted hover:text-theme'
          }`}
        >
          表情
        </button>
        <button
          onClick={() => setTab('unicode')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            tab === 'unicode' ? 'text-pink-600 border-b-2 border-pink-500' : 'text-theme-muted hover:text-theme'
          }`}
        >
          Emoji
        </button>
      </div>

      {tab === 'emoji' ? (
        <>
          <div className="p-2 border-b border-theme-divider">
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-theme-hint" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="搜索..."
                className="w-full pl-7 pr-2 py-1.5 text-xs bg-theme-input border border-theme-input rounded-lg focus:outline-none focus:ring-1 focus:ring-pink-500/30 text-theme placeholder:text-theme-hint"
              />
            </div>
          </div>

          {!searchQuery && (
            <div className="flex gap-1 px-2 py-1.5 border-b border-theme-divider overflow-x-auto">
              {EMOJI_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`w-7 h-7 flex items-center justify-center rounded-lg text-sm transition-colors flex-shrink-0 ${
                    activeCategory === cat.id ? 'bg-pink-100 dark:bg-pink-900/30' : 'hover:bg-theme-item-hover'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}

          <div className="p-2 max-h-48 overflow-y-auto">
            <div className="grid grid-cols-8 gap-0.5">
              {filteredEmojis.length === 0 ? (
                <div className="col-span-8 py-4 text-center text-sm text-theme-hint">
                  {searchQuery ? '无匹配表情' : '暂无最近使用'}
                </div>
              ) : (
                filteredEmojis.map(id => (
                  <button
                    key={id}
                    onClick={() => onSelect(id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-theme-item-hover transition-colors"
                  >
                    <img src={getEmojiImage(id)} alt={`表情${id}`} className="w-6 h-6" loading="lazy" />
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="p-2 max-h-64 overflow-y-auto">
          <div className="grid grid-cols-10 gap-0.5">
            {filteredEmojis.map((emoji, index) => (
              <button
                key={index}
                onClick={() => onSelectEmoji(emoji)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-theme-item-hover transition-colors text-lg"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})

interface FavEmojiPickerProps {
  onSelect: (emoji: FavEmoji) => void
  onClose: () => void
}

export const FavEmojiPicker = memo<FavEmojiPickerProps>(({ onSelect, onClose }) => {
  const [loading, setLoading] = useState(false)
  const [favEmojis, setFavEmojis] = useState<FavEmoji[]>([])
  const [loadingEmojis] = useState<string[]>([])

  return (
    <div className="absolute bottom-full left-0 mb-2 w-72 bg-white/95 dark:bg-neutral-800/95 backdrop-blur-xl border border-theme-divider rounded-2xl shadow-2xl overflow-hidden z-50">
      <div className="px-3 py-2 border-b border-theme-divider">
        <span className="text-sm font-medium text-theme">收藏表情</span>
      </div>
      <div className="p-2 max-h-48 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 size={20} className="animate-spin text-pink-500" />
          </div>
        ) : favEmojis.length === 0 ? (
          <div className="py-4 text-center text-sm text-theme-hint">
            暂无收藏表情
          </div>
        ) : (
          <div className="grid grid-cols-8 gap-0.5">
            {favEmojis.map(emoji => (
              <button
                key={emoji.id}
                onClick={() => onSelect(emoji)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-theme-item-hover transition-colors"
              >
                <img src={emoji.url} alt={emoji.key} className="w-6 h-6" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
})

export default EmojiPicker