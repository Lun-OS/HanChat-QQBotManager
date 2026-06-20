import { useState } from 'react'
import { X } from 'lucide-react'

interface MuteDialogProps {
  name: string
  onMute: (seconds: number) => void
  onClose: () => void
}

export function MuteDialog({ name, onMute, onClose }: MuteDialogProps) {
  const [duration, setDuration] = useState(30)

  const presets = [
    { label: '30分钟', value: 1800 },
    { label: '1小时', value: 3600 },
    { label: '24小时', value: 86400 },
    { label: '7天', value: 604800 },
    { label: '30天', value: 2592000 },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl w-[320px] overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-theme-divider">
          <h3 className="text-base font-medium text-theme">禁言 {name}</h3>
          <button onClick={onClose} className="p-1 text-theme-muted hover:text-theme rounded-lg hover:bg-theme-item"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {presets.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setDuration(value)}
                className={`py-2 px-3 text-sm rounded-lg border transition-colors ${
                  duration === value
                    ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/30 text-pink-600 dark:text-pink-300'
                    : 'border-theme-divider text-theme hover:border-pink-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 px-4 pb-4">
          <button onClick={() => onMute(0)} className="flex-1 py-2.5 text-sm text-red-500 border border-red-500 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
            解除禁言
          </button>
          <button onClick={() => onMute(duration)} className="flex-1 py-2.5 text-sm text-white bg-pink-500 rounded-xl hover:bg-pink-600 transition-colors">
            确认禁言
          </button>
        </div>
      </div>
    </div>
  )
}

interface KickConfirmDialogProps {
  name: string
  groupName: string
  onConfirm: () => void
  onClose: () => void
}

export function KickConfirmDialog({ name, groupName, onConfirm, onClose }: KickConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl w-[320px] overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-theme-divider">
          <h3 className="text-base font-medium text-theme">移出群聊</h3>
          <button onClick={onClose} className="p-1 text-theme-muted hover:text-theme rounded-lg hover:bg-theme-item"><X size={18} /></button>
        </div>
        <div className="p-4">
          <p className="text-sm text-theme">
            确定要将 <span className="font-medium">{name}</span> 移出群聊 <span className="font-medium">{groupName}</span> 吗？
          </p>
        </div>
        <div className="flex gap-2 px-4 pb-4">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm text-theme border border-theme-divider rounded-xl hover:bg-theme-item transition-colors">
            取消
          </button>
          <button onClick={onConfirm} className="flex-1 py-2.5 text-sm text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors">
            移出
          </button>
        </div>
      </div>
    </div>
  )
}

interface TitleDialogProps {
  name: string
  onConfirm: (title: string) => void
  onClose: () => void
}

export function TitleDialog({ name, onConfirm, onClose }: TitleDialogProps) {
  const [title, setTitle] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl w-[320px] overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-theme-divider">
          <h3 className="text-base font-medium text-theme">设置 {name} 的头衔</h3>
          <button onClick={onClose} className="p-1 text-theme-muted hover:text-theme rounded-lg hover:bg-theme-item"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-3">
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="输入头衔（留空清除）"
            maxLength={12}
            className="w-full px-3 py-2 text-sm bg-theme-input border border-theme-input rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500/50 text-theme placeholder:text-theme-hint"
            autoFocus
          />
          <p className="text-xs text-theme-hint">头衔长度不超过12个字符</p>
        </div>
        <div className="flex gap-2 px-4 pb-4">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm text-theme border border-theme-divider rounded-xl hover:bg-theme-item transition-colors">
            取消
          </button>
          <button onClick={() => onConfirm(title)} className="flex-1 py-2.5 text-sm text-white bg-pink-500 rounded-xl hover:bg-pink-600 transition-colors">
            确认
          </button>
        </div>
      </div>
    </div>
  )
}

export default { MuteDialog, KickConfirmDialog, TitleDialog }