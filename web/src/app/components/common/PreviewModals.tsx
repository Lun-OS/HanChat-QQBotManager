import { memo } from 'react'
import { Loader2 } from 'lucide-react'

interface ImagePreviewModalProps {
  url: string | null
  onClose: () => void
}

export const ImagePreviewModal = memo<ImagePreviewModalProps>(({ url, onClose }) => {
  if (!url) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition-colors"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      <img
        src={url}
        alt="预览"
        className="max-w-[90vw] max-h-[90vh] object-contain"
        onClick={e => e.stopPropagation()}
      />
    </div>
  )
})

interface VideoPreviewModalProps {
  videoInfo: { chatType: number; peerUid: string; msgId: string; elementId: string } | null
  onClose: () => void
}

export const VideoPreviewModal = memo<VideoPreviewModalProps>(({ videoInfo, onClose }) => {
  if (!videoInfo) return null

  const videoUrl = `/api/webqq/video-proxy?chatType=${videoInfo.chatType}&peerUid=${videoInfo.peerUid}&msgId=${videoInfo.msgId}&elementId=${videoInfo.elementId}`

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition-colors z-10"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      <video
        src={videoUrl}
        controls
        autoPlay
        className="max-w-[90vw] max-h-[90vh] object-contain"
        onClick={e => e.stopPropagation()}
      />
    </div>
  )
})

export default { ImagePreviewModal, VideoPreviewModal }