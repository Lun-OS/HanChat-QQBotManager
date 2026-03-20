import React, { memo, useState, useContext, useCallback } from 'react'
import { Download, Copy, Reply } from 'lucide-react'
import type { RawMessage, TextElement, PicElement, FileElement, PttElement, VideoElement, FaceElement, ReplyElement, MultiForwardMsgElement } from '../../../types/webqq'
import { getAudioProxyUrl, getForwardMessages } from '../../../services/webqqApi'
import { MessageContextMenuContext, AvatarContextMenuContext } from './MessageBubble'
import { showToast } from '../../common/Toast'

interface ImagePreviewContextValue {
  showPreview: (url: string) => void
}

interface VideoPreviewContextValue {
  showPreview: (chatType: number, peerUid: string, msgId: string, elementId: string) => void
}

interface ImageContextMenuContextValue {
  showMenu: (e: React.MouseEvent, message: RawMessage, elementId: string) => void
}

export const ImagePreviewContext = React.createContext<ImagePreviewContextValue | null>(null)
export const VideoPreviewContext = React.createContext<VideoPreviewContextValue | null>(null)
export const ImageContextMenuContext = React.createContext<ImageContextMenuContextValue | null>(null)

export function hasValidContent(element: any): boolean {
  if (!element) return false
  if (element.textElement?.content) return true
  if (element.picElement || element.imageElement) return true
  if (element.faceElement || element.marketFaceElement) return true
  if (element.fileElement) return true
  if (element.pttElement || element.voiceElement) return true
  if (element.videoElement) return true
  return false
}

export function isSystemTipMessage(message: RawMessage): boolean {
  if (!message.elements || message.elements.length === 0) return false
  return message.elements.some(el => el.grayTipElement)
}

function getImageUrl(element: PicElement): string {
  if (element.picElement?.originalInfo?.url) return element.picElement.originalInfo.url
  if (element.picElement?.md5) return `https://gchat.qpic.cn/gchatpic/${element.picElement.picId || element.picElement.md5}/0?term=2`
  if (element.picElement?.picId) return `https://gchat.qpic.cn/gchatpic/${element.picElement.picId}/0?term=2`
  return ''
}

function getProxyImageUrl(url: string): string {
  if (!url) return ''
  if (url.includes('gchat.qpic.cn') || url.includes('http')) return url
  const token = localStorage.getItem('token')
  return `/api/proxy/image?url=${encodeURIComponent(url)}${token ? `&token=${encodeURIComponent(token)}` : ''}`
}

function copyText(text: string) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('已复制', 'success')
  }).catch(() => {
    showToast('复制失败', 'error')
  })
}

const TextRenderer = memo<{ element: TextElement }>(({ element }) => {
  const content = element.textElement?.content || ''
  const segments: React.ReactNode[] = []
  const atMentions = element.textElement?.atNtUids || []

  if (atMentions.length > 0) {
    const parts = content.split(/@\d+/g)
    const atMatches = content.match(/@\d+/g) || []

    parts.forEach((part, index) => {
      if (part) {
        segments.push(<span key={`text-${index}`}>{part}</span>)
      }
      if (index < atMatches.length) {
        const uid = atMatches[index].slice(1)
        segments.push(
          <span key={`at-${index}`} className="text-blue-500">
            @{uid}
          </span>
        )
      }
    })

    return <>{segments}</>
  }

  const urlRegex = /(https?:\/\/[^\s]+)/g
  const urlMatches = content.split(urlRegex)

  urlMatches.forEach((part, index) => {
    if (index % 2 === 1) {
      segments.push(
        <a
          key={`url-${index}`}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:underline"
          onClick={e => e.stopPropagation()}
        >
          {part}
        </a>
      )
    } else if (part) {
      segments.push(<span key={`text-${index}`}>{part}</span>)
    }
  })

  return <>{segments.length > 0 ? segments : content}</>
})

const PicRenderer = memo<{ element: PicElement; message: RawMessage }>(({ element, message }) => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const showPreview = useContext(ImagePreviewContext)
  const imageContextMenuContext = useContext(ImageContextMenuContext)
  const messageContextMenu = useContext(MessageContextMenuContext)

  const rawUrl = getImageUrl(element)
  const url = getProxyImageUrl(rawUrl)

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!error && url) {
      showPreview?.showPreview(url)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    imageContextMenuContext?.showMenu(e, message, element.picElement?.picId || element.picElement?.md5 || '0')
  }

  const picInfo = element.picElement
  const width = picInfo?.originalInfo?.size?.width || picInfo?.size?.width || 200
  const height = picInfo?.originalInfo?.size?.height || picInfo?.size?.height || 200

  const displayWidth = Math.min(width, 300)
  const displayHeight = (displayWidth / width) * height

  return (
    <div className="relative inline-block">
      {loading && (
        <div className="bg-gray-200 dark:bg-gray-700 animate-pulse rounded" style={{ width: displayWidth, height: displayHeight }} />
      )}
      {error ? (
        <div className="bg-gray-100 dark:bg-gray-800 rounded flex items-center justify-center" style={{ width: displayWidth, height: displayHeight }}>
          <span className="text-gray-400 text-sm">图片加载失败</span>
        </div>
      ) : (
        <img
          src={url}
          alt="图片"
          loading="lazy"
          className={`max-w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity ${loading ? 'hidden' : ''}`}
          style={{ maxHeight: '300px', width: 'auto', height: 'auto' }}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          onLoad={() => setLoading(false)}
          onError={() => { setLoading(false); setError(true) }}
        />
      )}
    </div>
  )
})

const FileRenderer = memo<{ element: FileElement }>(({ element }) => {
  const fileInfo = element.fileElement
  if (!fileInfo) return null

  const handleDownload = async () => {
    try {
      const response = await fetch(fileInfo.fileUrl || '')
      if (!response.ok) throw new Error('下载失败')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileInfo.fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      showToast('下载失败', 'error')
    }
  }

  const size = fileInfo.fileSize
  let sizeText = '未知大小'
  if (size) {
    if (size < 1024) sizeText = `${size} B`
    else if (size < 1024 * 1024) sizeText = `${(size / 1024).toFixed(1)} KB`
    else sizeText = `${(size / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="bg-theme-item rounded-lg p-3 inline-flex items-center gap-3 min-w-[200px] max-w-[300px]">
      <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
        <span className="text-blue-500 text-lg">📁</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-theme font-medium truncate">{fileInfo.fileName}</div>
        <div className="text-xs text-theme-hint">{sizeText}</div>
      </div>
      <button onClick={handleDownload} className="p-2 text-theme-muted hover:text-blue-500 transition-colors flex-shrink-0">
        <Download size={16} />
      </button>
    </div>
  )
})

const PttRenderer = memo<{ element: PttElement; message: RawMessage }>(({ element, message }) => {
  const pttInfo = element.pttElement
  if (!pttInfo) return null

  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const audioRef = useState<HTMLAudioElement | null>(null)[0]

  const fileUuid = pttInfo.fileUuid || pttInfo.localPath || ''
  const duration = pttInfo.duration || 0
  const isGroup = message.chatType === 2

  const proxyUrl = getAudioProxyUrl(fileUuid, isGroup)

  const durationText = `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`

  return (
    <div className="bg-theme-item rounded-lg px-3 py-2 inline-flex items-center gap-2 min-w-[120px]">
      <button
        onClick={() => setPlaying(!playing)}
        className="w-8 h-8 bg-pink-500 text-white rounded-full flex items-center justify-center flex-shrink-0 hover:bg-pink-600 transition-colors"
      >
        {playing ? '⏸' : '▶'}
      </button>
      <div className="flex-1">
        <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-pink-500 rounded-full" style={{ width: `${progress}%` }} />
        </div>
        <div className="text-xs text-theme-hint mt-1">{durationText}</div>
      </div>
    </div>
  )
})

const VideoRenderer = memo<{ element: VideoElement; message: RawMessage }>(({ element, message }) => {
  const videoInfo = element.videoElement
  if (!videoInfo) return null

  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const showPreview = useContext(VideoPreviewContext)
  const messageContextMenu = useContext(MessageContextMenuContext)

  const handleClick = () => {
    showPreview?.showPreview(message.chatType, message.peerUin, message.msgId, videoInfo.fileUuid || '0')
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    messageContextMenu?.showMenu(e, message)
  }

  const width = videoInfo.videoSize?.width || 200
  const height = videoInfo.videoSize?.height || 150

  return (
    <div
      className="relative inline-block cursor-pointer hover:opacity-90 transition-opacity"
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {thumbnailUrl ? (
        <img src={thumbnailUrl} alt="视频封面" className="rounded-lg max-w-full" style={{ maxHeight: '200px' }} />
      ) : (
        <div className="bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center" style={{ width: Math.min(width, 200), height: Math.min(height, 150) }}>
          <span className="text-gray-400 text-4xl">🎬</span>
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-12 h-12 bg-black/50 rounded-full flex items-center justify-center">
          <span className="text-white text-xl">▶</span>
        </div>
      </div>
    </div>
  )
})

const FaceRenderer = memo<{ element: FaceElement }>(({ element }) => {
  const faceInfo = element.faceElement
  if (!faceInfo) return null

  const faceId = faceInfo.faceId || faceInfo.stableFaceId
  const isUnicode = faceId > 1000

  if (isUnicode) {
    const codePoint = faceId
    return <span style={{ fontSize: '1.25em' }}>{String.fromCodePoint(codePoint)}</span>
  }

  return <img src={`/face/${faceId}.png`} alt={`[表情${faceId}]`} className="inline-block w-6 h-6 align-text-bottom" />
})

const ReplyRenderer = memo<{ element: ReplyElement }>(({ element }) => {
  return null
})

const MultiForwardMsgRenderer = memo<{ element: MultiForwardMsgElement }>(({ element }) => {
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<any[]>([])

  const handleClick = async () => {
    if (element.multiForwardMsgElement?.resId) {
      try {
        const data = await getForwardMessages(element.multiForwardMsgElement.resId)
        setMessages(data)
      } catch {
        showToast('获取合并转发内容失败', 'error')
      }
    }
    setLoading(false)
  }

  return (
    <div className="bg-theme-item rounded-lg p-3 min-w-[200px] max-w-[300px]">
      <div className="text-sm text-theme-secondary mb-2">聊天记录</div>
      {loading ? (
        <div className="text-xs text-theme-hint">点击加载</div>
      ) : messages.length > 0 ? (
        <div className="space-y-2">
          {messages.slice(0, 5).map((msg, index) => (
            <div key={index} className="text-xs">
              <span className="text-blue-500">{msg.senderName}: </span>
              <span className="text-theme">{msg.segments?.[0]?.data?.text || '[消息]'}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-theme-hint">无内容</div>
      )}
    </div>
  )
})

interface MessageElementRendererProps {
  element: any
  message?: RawMessage
}

export const MessageElementRenderer = memo<MessageElementRendererProps>(({ element, message }) => {
  if (!element) return null

  if (element.textElement) return <TextRenderer element={element} />
  if (element.picElement || element.imageElement) return message ? <PicRenderer element={element} message={message} /> : null
  if (element.fileElement) return <FileRenderer element={element} />
  if (element.pttElement || element.voiceElement) return message ? <PttRenderer element={element} message={message} /> : null
  if (element.videoElement) return message ? <VideoRenderer element={element} message={message} /> : null
  if (element.faceElement) return <FaceRenderer element={element} />
  if (element.replyElement) return <ReplyRenderer element={element} />
  if (element.multiForwardMsgElement) return <MultiForwardMsgRenderer element={element} />
  if (element.grayTipElement) {
    return <div className="text-xs text-theme-hint">[系统提示]</div>
  }

  return null
})

export default MessageElementRenderer