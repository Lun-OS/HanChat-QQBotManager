import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useBotStore } from '../stores/botStore';
import { userApi, groupApi, messageApi, aiVoiceApi, accountApi } from '../services/api';
import { BotStatus } from '../constants';
import { 
  Users, 
  MessageCircle, 
  Clock, 
  Send, 
  Smile, 
  Image as ImageIcon,
  ChevronLeft,
  Search,
  Copy,
  Reply,
  Trash2,
  Share2,
  CheckSquare,
  X,
  Hash,
  Volume2,
  Ban,
  Mic,
  Check,
  RefreshCw,
  Play,
  Loader2,
  AtSign,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

// ==================== 类型定义 ====================
type TabType = 'recent' | 'friends' | 'groups';
type ChatType = 'friend' | 'group';
type MessageStatus = 'sending' | 'sent' | 'error';

interface Friend {
  user_id: string;
  nickname: string;
  remark?: string;
}

interface Group {
  group_id: string;
  group_name: string;
  member_count?: number;
}

interface GroupMember {
  user_id: string;
  nickname: string;
  card?: string;
  role: 'owner' | 'admin' | 'member';
  join_time?: number;
  last_sent_time?: number;
}

interface MessageSegment {
  type: string;
  data?: Record<string, any>;
}

interface Message {
  message_id: string;
  user_id: string;
  group_id?: string;
  message: MessageSegment[];
  raw_message: string;
  sender: {
    user_id: string;
    nickname: string;
  };
  time: number;
  message_seq?: number;
  status?: MessageStatus;
  isTemp?: boolean;
}

interface ChatSession {
  id: string;
  type: ChatType;
  name: string;
  avatar: string;
  lastMessage?: string;
  lastTime?: number;
  unread?: number;
}

interface AICharacter {
  character_id: string;
  character_name: string;
}

interface SSEMessage {
  message_id: string;
  user_id: string;
  group_id?: string;
  message: MessageSegment[];
  raw_message: string;
  sender: {
    user_id: string;
    nickname: string;
  };
  time: number;
  message_seq?: number;
}

// ==================== 常量 ====================
const MESSAGES_PER_PAGE = 20;
const MAX_CACHED_MESSAGES = 100;
const SCROLL_THRESHOLD = 100;

// ==================== 工具函数 ====================
const generateUserId = (): string => {
  let userId = localStorage.getItem('webqq_user_id');
  if (!userId) {
    userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('webqq_user_id', userId);
  }
  return userId;
};

const getCachedMessages = (selfId: string, chatType: ChatType, targetId: string): Message[] => {
  const key = `webqq_messages:${selfId}:${chatType}:${targetId}`;
  try {
    const cached = localStorage.getItem(key);
    return cached ? JSON.parse(cached) : [];
  } catch {
    return [];
  }
};

const cacheMessages = (selfId: string, chatType: ChatType, targetId: string, messages: Message[]) => {
  const key = `webqq_messages:${selfId}:${chatType}:${targetId}`;
  try {
    localStorage.setItem(key, JSON.stringify(messages.slice(-MAX_CACHED_MESSAGES)));
  } catch (e) {
    console.warn('缓存消息失败:', e);
  }
};

const getCachedSessions = (): ChatSession[] => {
  try {
    const cached = localStorage.getItem('webqq_recent_sessions');
    return cached ? JSON.parse(cached) : [];
  } catch {
    return [];
  }
};

const cacheSessions = (sessions: ChatSession[]) => {
  try {
    localStorage.setItem('webqq_recent_sessions', JSON.stringify(sessions.slice(0, 50)));
  } catch (e) {
    console.warn('缓存会话失败:', e);
  }
};

const escapeHtml = (text: string): string => {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const isSafeUrl = (url: string): boolean => {
  if (!url) return false;
  return /^https?:\/\//i.test(url);
};

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isYesterday = new Date(now.getTime() - 86400000).toDateString() === date.toDateString();
  
  if (isToday) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  if (isYesterday) {
    return '昨天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) + ' ' +
         date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
};

const formatBanDuration = (seconds: number): string => {
  if (seconds === 0) return '已解除禁言';
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时`;
  return `${Math.floor(seconds / 86400)}天`;
};

// ==================== 自定义 Hooks ====================
const useSSE = (selfId: string | null, chatType: ChatType | null, targetId: string | null) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<SSEMessage | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;

  const connect = useCallback(() => {
    if (!selfId || !chatType || !targetId) return;

    const userId = generateUserId();
    const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
    // 从 localStorage 获取 token 并添加到 URL 参数中
    const token = localStorage.getItem('auth_token') || '';
    const url = `${baseUrl}/api/webqq/events?self_id=${selfId}&user_id=${userId}&type=${chatType}&target_id=${targetId}&token=${encodeURIComponent(token)}`;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SSEMessage;
        if (data.message_id) {
          setLastMessage(data);
        }
      } catch (error) {
        console.error('解析消息失败:', error);
      }
    };

    es.onerror = () => {
      setIsConnected(false);
      es.close();
      
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current++;
          connect();
        }, delay);
      }
    };
  }, [selfId, chatType, targetId]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { isConnected, lastMessage };
};

const useDebounce = <T extends (...args: any[]) => any>(fn: T, delay: number) => {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  return useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
};

// ==================== 子组件 ====================
interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  replyingTo?: Message | null;
  onCancelReply?: () => void;
}

const MessageInput: React.FC<MessageInputProps> = memo(({
  value, onChange, onSend, disabled, placeholder, replyingTo, onCancelReply
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 200);
      textarea.style.height = `${newHeight}px`;
    }
  }, [value]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }, [onSend]);

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1a]">
      {replyingTo && (
        <div className="flex items-center justify-between px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-1 h-8 bg-blue-500 rounded-full" />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                回复 {replyingTo.sender.nickname}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {replyingTo.raw_message.slice(0, 40)}
                {replyingTo.raw_message.length > 40 && '...'}
              </div>
            </div>
          </div>
          <button
            onClick={onCancelReply}
            className="p-1 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <div className="px-4 pt-2 pb-1">
        <div className="flex items-center gap-1 mb-2">
          <button className="p-2 rounded-lg transition-colors text-gray-500 hover:text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/30" title="表情">
            <Smile className="w-5 h-5" />
          </button>
          <button className="p-2 rounded-lg transition-colors text-gray-500 hover:text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/30" title="图片">
            <ImageIcon className="w-5 h-5" />
          </button>
          <button className="p-2 rounded-lg transition-colors text-gray-500 hover:text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/30" title="@某人">
            <AtSign className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="px-4 pb-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || '输入消息...'}
            disabled={disabled}
            className="flex-1 min-h-[80px] max-h-[200px] bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-3 outline-none resize-none overflow-y-auto text-gray-900 dark:text-gray-100 placeholder-gray-400"
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          />
          <button
            onClick={onSend}
            disabled={!value.trim() || disabled}
            className="p-3 bg-pink-500 text-white rounded-xl hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 transition-colors"
          >
            {disabled ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
});

MessageInput.displayName = 'MessageInput';

interface ContextMenuProps {
  x: number;
  y: number;
  msg: Message;
  onClose: () => void;
  onReply: () => void;
  onCopy: () => void;
  onForward: () => void;
  onDelete: () => void;
  onMultiSelect: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = memo(({
  x, y, onClose, onReply, onCopy, onForward, onDelete, onMultiSelect
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [onClose]);

  const adjustedX = Math.min(x, window.innerWidth - 180);
  const adjustedY = Math.min(y, window.innerHeight - 250);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]"
      style={{ left: adjustedX, top: adjustedY }}
    >
      <button onClick={onReply} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
        <Reply className="w-4 h-4" />
        回复消息
      </button>
      <button onClick={onCopy} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
        <Copy className="w-4 h-4" />
        复制消息ID
      </button>
      <button onClick={onForward} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
        <Share2 className="w-4 h-4" />
        转发消息
      </button>
      <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
      <button onClick={onDelete} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-red-500 flex items-center gap-2">
        <Trash2 className="w-4 h-4" />
        撤回消息
      </button>
      <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
      <button onClick={onMultiSelect} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
        <CheckSquare className="w-4 h-4" />
        多选消息
      </button>
    </div>
  );
});

ContextMenu.displayName = 'ContextMenu';

interface ImagePreviewProps {
  src: string;
  onClose: () => void;
}

const ImagePreview: React.FC<ImagePreviewProps> = memo(({ src, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <img 
        src={src} 
        alt="预览" 
        className="max-w-full max-h-full object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
      <button 
        onClick={onClose}
        className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/70"
      >
        <X className="w-6 h-6" />
      </button>
    </div>
  );
});

ImagePreview.displayName = 'ImagePreview';

interface MessageItemProps {
  msg: Message;
  isSelf: boolean;
  isSelected: boolean;
  multiSelectMode: boolean;
  selectedBot: string | null;
  onContextMenu: (e: React.MouseEvent, msg: Message) => void;
  onToggleSelection: (messageId: string) => void;
  onViewUserProfile: (userId: string) => void;
  onCopyMessageId: (messageId: string) => void;
  onReplyClick: (replyId: string) => void;
  findReplyMessage: (replyId: string) => Message | undefined;
  onImagePreview: (src: string) => void;
}

const MessageItem: React.FC<MessageItemProps> = memo(({
  msg, isSelf, isSelected, multiSelectMode, selectedBot,
  onContextMenu, onToggleSelection, onViewUserProfile, onCopyMessageId,
  onReplyClick, findReplyMessage, onImagePreview
}) => {
  const isError = msg.status === 'error';
  const isSending = msg.status === 'sending';
  const isTemp = msg.isTemp;
  
  const replySegment = msg.message.find((s: MessageSegment) => s.type === 'reply');
  const replyMessage = replySegment ? findReplyMessage(replySegment.data?.id) : null;

  const renderMessageContent = useCallback((message: MessageSegment[]) => {
    if (!Array.isArray(message)) {
      const safeText = escapeHtml(String(message || ''));
      return <p className="text-sm whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: safeText }} />;
    }

    return (
      <div className="space-y-1">
        {message.map((segment, index) => {
          switch (segment.type) {
            case 'text':
              const safeText = escapeHtml(segment.data?.text || '');
              return <span key={index} className="text-sm whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: safeText }} />;
            
            case 'image':
              const imgUrl = segment.data?.url || segment.data?.file;
              if (!isSafeUrl(imgUrl)) {
                return <span key={index} className="text-sm text-gray-500">[图片链接不安全]</span>;
              }
              return (
                <div key={index} className="my-1">
                  <img 
                    src={imgUrl}
                    alt="图片"
                    className="max-w-[200px] max-h-[200px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => onImagePreview(imgUrl)}
                  />
                </div>
              );
            
            case 'face':
              const faceId = String(segment.data?.id || '').replace(/[^0-9]/g, '');
              return <span key={index} className="text-sm">[表情:{faceId || '0'}]</span>;
            
            case 'at':
              const atTarget = segment.data?.qq === 'all' ? '全体成员' : String(segment.data?.qq || '').replace(/[^0-9]/g, '');
              return <span key={index} className="text-sm text-blue-500">@{atTarget}</span>;
            
            case 'reply':
              return null;
            
            case 'record':
              const audioUrl = segment.data?.url || segment.data?.file;
              if (!isSafeUrl(audioUrl)) {
                return <span key={index} className="text-sm text-gray-500">[语音链接不安全]</span>;
              }
              return (
                <div key={index} className="flex items-center gap-2 my-1">
                  <button 
                    className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-600 rounded-full hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors"
                    onClick={async () => {
                      try {
                        const audio = new Audio(audioUrl);
                        await audio.play();
                      } catch {
                        toast.error('播放语音失败');
                      }
                    }}
                  >
                    <Play className="w-4 h-4" />
                    <span className="text-sm">语音消息</span>
                  </button>
                </div>
              );
            
            case 'video':
              const videoUrl = segment.data?.url || segment.data?.file;
              if (!isSafeUrl(videoUrl)) {
                return <span key={index} className="text-sm text-gray-500">[视频链接不安全]</span>;
              }
              return (
                <div key={index} className="my-1">
                  <video src={videoUrl} controls className="max-w-[250px] max-h-[200px] rounded-lg" />
                </div>
              );
            
            case 'file':
              const fileName = escapeHtml(segment.data?.name || '文件');
              return (
                <div key={index} className="flex items-center gap-2 my-1 p-2 bg-gray-100 dark:bg-gray-600 rounded-lg">
                  <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                    <span className="text-white text-xs font-bold">FILE</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate" dangerouslySetInnerHTML={{ __html: fileName }} />
                    <div className="text-xs text-gray-500">{segment.data?.size ? `${(segment.data.size / 1024).toFixed(1)} KB` : ''}</div>
                  </div>
                </div>
              );
            
            case 'forward':
              const forwardContent = escapeHtml(segment.data?.content || '[无法查看合并消息]');
              return (
                <div key={index} className="my-1 p-2 bg-gray-100 dark:bg-gray-600 rounded-lg border-l-4 border-blue-500">
                  <div className="text-xs text-gray-500 mb-1">转发消息</div>
                  <div className="text-sm" dangerouslySetInnerHTML={{ __html: forwardContent }} />
                </div>
              );
            
            case 'json':
              try {
                const jsonData = JSON.parse(segment.data?.data || '{}');
                const jsonPrompt = escapeHtml(jsonData.prompt || '[JSON内容]');
                return (
                  <div key={index} className="my-1 p-2 bg-gray-100 dark:bg-gray-600 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">JSON消息</div>
                    <div className="text-sm truncate" dangerouslySetInnerHTML={{ __html: jsonPrompt }} />
                  </div>
                );
              } catch {
                return <span key={index} className="text-sm text-gray-500">[JSON]</span>;
              }
            
            case 'xml':
              return (
                <div key={index} className="my-1 p-2 bg-gray-100 dark:bg-gray-600 rounded-lg">
                  <div className="text-xs text-gray-500">[XML消息]</div>
                </div>
              );
            
            case 'markdown':
              const mdText = escapeHtml(segment.data?.text || '[Markdown内容]');
              return (
                <div key={index} className="my-1 p-2 bg-gray-100 dark:bg-gray-600 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Markdown</div>
                  <div className="text-sm" dangerouslySetInnerHTML={{ __html: mdText }} />
                </div>
              );
            
            case 'location':
              const locationTitle = escapeHtml(segment.data?.title || '位置信息');
              return (
                <div key={index} className="my-1 p-2 bg-gray-100 dark:bg-gray-600 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">📍 位置</div>
                  <div className="text-sm" dangerouslySetInnerHTML={{ __html: locationTitle }} />
                </div>
              );
            
            case 'music':
              const musicTitle = escapeHtml(segment.data?.title || '音乐分享');
              return (
                <div key={index} className="my-1 p-2 bg-gray-100 dark:bg-gray-600 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">🎵 音乐</div>
                  <div className="text-sm" dangerouslySetInnerHTML={{ __html: musicTitle }} />
                </div>
              );
            
            case 'poke':
              return (
                <div key={index} className="my-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-600 rounded-full inline-block">
                  <span className="text-sm">👈 戳了戳</span>
                </div>
              );
            
            case 'share':
              const shareUrl = segment.data?.url;
              const shareTitle = escapeHtml(segment.data?.title || '链接');
              if (!isSafeUrl(shareUrl)) {
                return (
                  <div key={index} className="my-1 p-2 bg-gray-100 dark:bg-gray-600 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">🔗 分享</div>
                    <span className="text-sm text-gray-500">[链接不安全]</span>
                  </div>
                );
              }
              return (
                <div key={index} className="my-1 p-2 bg-gray-100 dark:bg-gray-600 rounded-lg border border-gray-300 dark:border-gray-500">
                  <div className="text-xs text-gray-500 mb-1">🔗 分享</div>
                  <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-500 hover:underline" dangerouslySetInnerHTML={{ __html: shareTitle }} />
                </div>
              );
            
            default:
              return <span key={index} className="text-sm text-gray-500">[{segment.type}]</span>;
          }
        })}
      </div>
    );
  }, [onImagePreview]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 mb-4 ${isSelf ? 'flex-row-reverse' : ''} ${multiSelectMode ? 'cursor-pointer' : ''}`}
      onContextMenu={(e) => onContextMenu(e, msg)}
      onClick={() => multiSelectMode && onToggleSelection(msg.message_id)}
    >
      {multiSelectMode && (
        <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-2 ${
          isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-400'
        }`}>
          {isSelected && <Check className="w-3 h-3 text-white" />}
        </div>
      )}
      <img 
        src={`https://q1.qlogo.cn/g?b=qq&nk=${msg.user_id}&s=640`}
        alt={msg.sender.nickname}
        className="w-10 h-10 rounded-full object-cover flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => !multiSelectMode && onViewUserProfile(msg.user_id)}
      />
      <div className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'} max-w-[calc(100%-56px)]`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">{msg.sender.nickname}</span>
          {isSending && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
          {isError && <span className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3 h-3" />发送失败</span>}
        </div>
        
        {replyMessage && (
          <div 
            className={`mb-1 px-3 py-1.5 rounded-lg text-xs border-l-2 cursor-pointer hover:opacity-80 ${
              isSelf 
                ? 'bg-blue-400/50 border-blue-300 text-blue-100' 
                : 'bg-gray-200 dark:bg-gray-600 border-gray-400 text-gray-600 dark:text-gray-300'
            }`}
            onClick={() => onReplyClick(replyMessage.message_id)}
          >
            <div className="font-medium">{replyMessage.sender.nickname}</div>
            <div className="truncate max-w-[200px]">{replyMessage.raw_message.slice(0, 50)}</div>
          </div>
        )}
        
        <div 
          id={`msg-${msg.message_id}`}
          className={`rounded-2xl px-4 py-2.5 break-words shadow-sm ${
            isSelf 
              ? 'bg-blue-500 text-white rounded-tr-sm' 
              : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-tl-sm'
          } ${isError ? 'ring-2 ring-red-500' : ''}`}
        >
          {renderMessageContent(msg.message)}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-gray-400">{formatTime(msg.time)}</span>
          {!multiSelectMode && !isTemp && (
            <button
              onClick={() => onCopyMessageId(msg.message_id)}
              className="text-xs text-gray-400 hover:text-blue-500 flex items-center gap-0.5"
              title="点击复制消息ID"
            >
              <Hash className="w-3 h-3" />
              {msg.message_id.slice(0, 8)}...
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
});

MessageItem.displayName = 'MessageItem';

// ==================== 主组件 ====================
export function WebQQ() {
  const { bots, setBots } = useBotStore();
  const [selectedBot, setSelectedBot] = useState<string | null>(null);
  const [isLoadingBots, setIsLoadingBots] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('recent');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [recentSessions, setRecentSessions] = useState<ChatSession[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; msg: Message | null }>({ x: 0, y: 0, msg: null });
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  
  const [showMemberList, setShowMemberList] = useState(false);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  
  const [showBanDialog, setShowBanDialog] = useState(false);
  const [banTargetUser, setBanTargetUser] = useState<GroupMember | null>(null);
  const [banDuration, setBanDuration] = useState<number>(3600);
  
  const [showAIVoice, setShowAIVoice] = useState(false);
  const [aiCharacters, setAiCharacters] = useState<AICharacter[]>([]);
  const [selectedAICharacter, setSelectedAICharacter] = useState<string>('');
  const [aiVoiceText, setAiVoiceText] = useState('');
  
  const [showProfile, setShowProfile] = useState(false);
  const [profileData, setProfileData] = useState<any>(null);
  const [profileType, setProfileType] = useState<'group' | 'user'>('group');
  
  const [showForwardDialog, setShowForwardDialog] = useState(false);
  const [forwardTarget, setForwardTarget] = useState<{ type: ChatType; id: string; name: string } | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const scrollHeightBeforeLoadRef = useRef<number>(0);
  const isFirstLoadRef = useRef(true);

  const onlineBots = useMemo(() => bots.filter(bot => bot.status === BotStatus.ONLINE), [bots]);

  const { isConnected: sseConnected, lastMessage: sseMessage } = useSSE(
    selectedBot,
    selectedChat?.type || null,
    selectedChat?.id || null
  );

  // 处理 SSE 消息
  useEffect(() => {
    if (sseMessage && selectedChat && selectedBot) {
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.message_id));
        if (!existingIds.has(sseMessage.message_id)) {
          const newMessage: Message = {
            ...sseMessage,
            status: 'sent',
            isTemp: false,
          };
          // 新消息添加到数组末尾（按时间升序排列）
          const newMessages = [...prev, newMessage];
          cacheMessages(selectedBot, selectedChat.type, selectedChat.id, newMessages);
          setShouldScrollToBottom(true);
          return newMessages;
        }
        return prev;
      });
    }
  }, [sseMessage, selectedChat, selectedBot]);

  // 加载机器人列表
  const loadBots = useCallback(async () => {
    setIsLoadingBots(true);
    try {
      const response = await accountApi.getAccounts();
      if ((response.status === 'ok' || response.success) && Array.isArray(response.data)) {
        const botList = response.data.map((account: any) => ({
          self_id: account.self_id,
          nickname: account.login_info?.nickname || account.custom_name || `Bot ${account.self_id}`,
          custom_name: account.custom_name || '',
          status: account.status,
          last_connect: account.last_connected_at,
          msg_count_today: 0,
          friend_count: 0,
          group_count: 0,
          avatar: `http://q1.qlogo.cn/g?b=qq&nk=${account.self_id}&s=100`,
          version_info: account.version_info,
          bot_status: account.bot_status,
        }));
        setBots(botList);
      }
    } catch (error) {
      console.error('获取机器人列表失败:', error);
      toast.error('获取机器人列表失败');
    } finally {
      setIsLoadingBots(false);
    }
  }, [setBots]);

  // 页面加载时获取机器人列表
  useEffect(() => {
    loadBots();
  }, [loadBots]);

  // 初始化选择第一个在线机器人
  useEffect(() => {
    if (onlineBots.length > 0 && !selectedBot) {
      setSelectedBot(onlineBots[0].self_id);
    }
  }, [onlineBots, selectedBot]);

  // 加载缓存的最近会话
  useEffect(() => {
    const cached = getCachedSessions();
    if (cached.length > 0) {
      setRecentSessions(cached);
    }
  }, []);

  // 滚动到底部
  useEffect(() => {
    if (shouldScrollToBottom && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      setShouldScrollToBottom(false);
    }
  }, [shouldScrollToBottom]);

  // 加载好友列表
  const loadFriends = useCallback(async () => {
    if (!selectedBot) return;
    try {
      const response = await userApi.getFriendList(selectedBot);
      // 后端返回格式：{status: 'ok', retcode: 0, data: [...]}
      const outerStatus = response.status;
      const outerRetcode = response.retcode;
      const friendList = response.data;

      if (outerStatus === 'ok' && outerRetcode === 0 && Array.isArray(friendList)) {
        setFriends(friendList.map((f: any) => ({
          user_id: String(f.user_id),
          nickname: f.nickname,
          remark: f.remark,
        })));
      } else if (outerStatus !== 'ok' || outerRetcode !== 0) {
        console.error('加载好友列表失败:', response.message);
        toast.error('加载好友列表失败: ' + (response.message || `API错误 (${outerRetcode})`));
      }
    } catch (error) {
      toast.error('加载好友列表失败');
    }
  }, [selectedBot]);

  // 加载群组列表
  const loadGroups = useCallback(async () => {
    if (!selectedBot) return;
    try {
      const response = await groupApi.getGroupList(selectedBot);
      // 后端返回格式：{status: 'ok', retcode: 0, data: [...]}
      // response 是后端包装后的响应，response.data 是 OneBot 的原始响应（群列表数组）
      const outerStatus = response.status;
      const outerRetcode = response.retcode;
      const groupList = response.data;

      if (outerStatus === 'ok' && outerRetcode === 0 && Array.isArray(groupList)) {
        setGroups(groupList.map((g: any) => ({
          group_id: String(g.group_id),
          group_name: g.group_name,
          member_count: g.member_count,
        })));
      } else if (outerStatus !== 'ok' || outerRetcode !== 0) {
        console.error('加载群组列表失败:', response.message);
        toast.error('加载群组列表失败: ' + (response.message || `API错误 (${outerRetcode})`));
      }
    } catch (error) {
      console.error('加载群组列表失败:', error);
      toast.error('加载群组列表失败');
    }
  }, [selectedBot]);

  // 加载消息
  const loadMessages = useCallback(async (chat: ChatSession, messageSeq?: number, append: boolean = false) => {
    if (!selectedBot) return;
    try {
      if (append) {
        setLoadingMore(true);
        // 保存当前滚动高度
        const container = messagesContainerRef.current;
        if (container) {
          scrollHeightBeforeLoadRef.current = container.scrollHeight;
        }
      } else {
        setLoading(true);
        setHasMoreHistory(true);
        isFirstLoadRef.current = true;
      }
      
      if (!append) {
        const cachedMessages = getCachedMessages(selectedBot, chat.type, chat.id);
        if (cachedMessages.length > 0) {
          // 确保缓存消息按时间升序排列
          const sorted = cachedMessages.sort((a, b) => (a.time || 0) - (b.time || 0));
          setMessages(sorted);
        }
      }
      
      let response;
      if (chat.type === 'friend') {
        response = await messageApi.getFriendMsgHistory(selectedBot, chat.id, messageSeq?.toString(), MESSAGES_PER_PAGE);
      } else {
        response = await messageApi.getGroupMsgHistory(selectedBot, chat.id, messageSeq?.toString(), MESSAGES_PER_PAGE);
      }

      // 后端返回格式：{status: 'ok', retcode: 0, data: {messages: [...]}}
      // response 是后端包装后的响应，response.data 是 OneBot 的原始响应
      const outerStatus = response.status;
      const outerRetcode = response.retcode;
      const oneBotResponse = response.data;

      // 首先检查后端的 API 调用是否成功
      if (outerStatus !== 'ok' || outerRetcode !== 0) {
        console.error('加载消息历史失败:', response.message);
        toast.error('加载消息历史失败: ' + (response.message || `API错误 (${outerRetcode})`));
        return;
      }

      // 然后检查 OneBot 的响应
      if (oneBotResponse?.messages) {
        const msgs: Message[] = oneBotResponse.messages.map((m: any) => ({
          message_id: String(m.message_id),
          user_id: String(m.user_id),
          group_id: m.group_id ? String(m.group_id) : undefined,
          message: m.message || [],
          raw_message: m.raw_message || '',
          sender: {
            user_id: String(m.sender?.user_id || m.user_id),
            nickname: m.sender?.nickname || '未知',
          },
          time: m.time,
          message_seq: m.message_seq,
          status: 'sent',
          isTemp: false,
        }));
        
        // API 返回的消息是按时间倒序排列的，需要反转
        const newMessages = msgs.reverse();

        if (append) {
          // 加载更多历史消息 - 添加到数组前面
          setMessages(prev => {
            const combined = [...newMessages, ...prev];
            // 按时间升序排序，确保顺序正确
            const sorted = combined.sort((a, b) => (a.time || 0) - (b.time || 0));
            cacheMessages(selectedBot, chat.type, chat.id, sorted);
            return sorted;
          });
          if (newMessages.length < MESSAGES_PER_PAGE) {
            setHasMoreHistory(false);
          }
        } else {
          // 初始加载 - 直接设置并排序
          const sorted = newMessages.sort((a, b) => (a.time || 0) - (b.time || 0));
          setMessages(sorted);
          cacheMessages(selectedBot, chat.type, chat.id, sorted);
          setShouldScrollToBottom(true);
        }
      } else {
        if (append) {
          setHasMoreHistory(false);
        }
      }
    } catch (error) {
      toast.error('加载消息失败');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [selectedBot]);

  // 加载更多后恢复滚动位置
  useEffect(() => {
    if (!loadingMore && scrollHeightBeforeLoadRef.current > 0) {
      const container = messagesContainerRef.current;
      if (container) {
        const newScrollHeight = container.scrollHeight;
        const heightDiff = newScrollHeight - scrollHeightBeforeLoadRef.current;
        container.scrollTop = heightDiff;
      }
      scrollHeightBeforeLoadRef.current = 0;
    }
  }, [loadingMore]);

  // 防抖加载更多历史
  const debouncedLoadMore = useDebounce(async () => {
    if (!selectedBot || !selectedChat || loadingMore || !hasMoreHistory) return;
    
    const earliestMessage = messages[0];
    if (!earliestMessage?.message_seq) {
      setHasMoreHistory(false);
      return;
    }
    
    await loadMessages(selectedChat, earliestMessage.message_seq, true);
  }, 300);

  // 滚动处理
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container || loadingMore || !hasMoreHistory) return;

    if (container.scrollTop < SCROLL_THRESHOLD) {
      debouncedLoadMore();
    }
  }, [debouncedLoadMore, loadingMore, hasMoreHistory]);

  // 更新最近会话
  const updateRecentSession = useCallback((chat: ChatSession, lastMessage: string, lastTime: number) => {
    setRecentSessions(prev => {
      const existingIndex = prev.findIndex(s => s.id === chat.id && s.type === chat.type);
      let newSessions: ChatSession[];
      
      if (existingIndex >= 0) {
        newSessions = [...prev];
        newSessions[existingIndex] = {
          ...newSessions[existingIndex],
          lastMessage,
          lastTime,
        };
        const session = newSessions.splice(existingIndex, 1)[0];
        newSessions.unshift(session);
      } else {
        newSessions = [{
          ...chat,
          lastMessage,
          lastTime,
        }, ...prev];
      }
      
      const limited = newSessions.slice(0, 50);
      cacheSessions(limited);
      return limited;
    });
  }, []);

  // 选择聊天
  const handleSelectChat = useCallback((chat: ChatSession) => {
    setSelectedChat(chat);
    loadMessages(chat);
    setShowMemberList(false);
    setShowProfile(false);
    setMultiSelectMode(false);
    setSelectedMessages(new Set());
    setReplyingTo(null);
    setHasMoreHistory(true);
  }, [loadMessages]);

  // 发送消息
  const handleSendMessage = useCallback(async () => {
    if (!inputMessage.trim() || !selectedBot || !selectedChat || isSending) return;

    const content = inputMessage.trim();
    const now = Math.floor(Date.now() / 1000);
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    let messageSegment: MessageSegment[] = [{ type: 'text', data: { text: content } }];
    
    if (replyingTo) {
      messageSegment = [
        { type: 'reply', data: { id: replyingTo.message_id } },
        ...messageSegment
      ];
    }

    const tempMessage: Message = {
      message_id: tempId,
      user_id: selectedBot,
      message: messageSegment,
      raw_message: content,
      sender: {
        user_id: selectedBot,
        nickname: '我',
      },
      time: now,
      status: 'sending',
      isTemp: true,
    };

    setMessages(prev => [...prev, tempMessage]);
    setInputMessage('');
    setReplyingTo(null);
    setIsSending(true);
    setShouldScrollToBottom(true);

    try {
      let response;
      if (selectedChat.type === 'friend') {
        response = await messageApi.sendPrivateMsg(selectedBot, selectedChat.id, messageSegment);
      } else {
        response = await messageApi.sendGroupMsg(selectedBot, selectedChat.id, messageSegment);
      }

      // 后端返回格式：{status: 'ok', retcode: 0, data: {message_id: ...}}
      // response 是后端包装后的响应，response.data 是 OneBot 的原始响应
      const outerStatus = response.status;
      const outerRetcode = response.retcode;
      const oneBotResponse = response.data;

      // 首先检查后端的 API 调用是否成功
      if (outerStatus !== 'ok' || outerRetcode !== 0) {
        setMessages(prev => prev.map(m =>
          m.message_id === tempId ? { ...m, status: 'error' } : m
        ));
        toast.error('发送失败: ' + (response.message || `API调用失败 (retcode: ${outerRetcode})`));
        return;
      }

      // 然后检查 OneBot 的响应
      if (oneBotResponse?.message_id) {
        setMessages(prev => prev.map(m =>
          m.message_id === tempId
            ? { ...m, message_id: String(oneBotResponse.message_id), status: 'sent', isTemp: false }
            : m
        ));
        updateRecentSession(selectedChat, content, now);
      } else {
        setMessages(prev => prev.map(m =>
          m.message_id === tempId ? { ...m, status: 'error' } : m
        ));
        const botMessage = oneBotResponse?.message || oneBotResponse?.wording || '未知错误';
        toast.error('发送失败: ' + botMessage);
      }
    } catch (error) {
      setMessages(prev => prev.map(m =>
        m.message_id === tempId ? { ...m, status: 'error' } : m
      ));
      toast.error('发送消息失败');
    } finally {
      setIsSending(false);
    }
  }, [inputMessage, selectedBot, selectedChat, isSending, replyingTo, updateRecentSession]);

  // 右键菜单处理
  const handleMessageContextMenu = useCallback((e: React.MouseEvent, msg: Message) => {
    e.preventDefault();
    if (multiSelectMode) return;
    setContextMenu({ x: e.clientX, y: e.clientY, msg });
  }, [multiSelectMode]);

  // 复制消息ID
  const copyMessageId = useCallback((messageId: string) => {
    navigator.clipboard.writeText(messageId);
    toast.success('消息ID已复制');
    setContextMenu({ x: 0, y: 0, msg: null });
  }, []);

  // 回复消息
  const handleReply = useCallback((msg: Message) => {
    setReplyingTo(msg);
    setContextMenu({ x: 0, y: 0, msg: null });
  }, []);

  // 撤回消息
  const handleDeleteMsg = useCallback(async (msg: Message) => {
    if (!selectedBot) return;
    try {
      await messageApi.deleteMsg(selectedBot, msg.message_id);
      toast.success('消息已撤回');
      setMessages(prev => prev.filter(m => m.message_id !== msg.message_id));
    } catch (error) {
      toast.error('撤回消息失败');
    }
    setContextMenu({ x: 0, y: 0, msg: null });
  }, [selectedBot]);

  // 转发消息
  const handleForward = useCallback((msg: Message) => {
    setForwardingMessage(msg);
    setShowForwardDialog(true);
    setForwardTarget(null);
    setContextMenu({ x: 0, y: 0, msg: null });
  }, []);

  // 执行转发
  const executeForward = useCallback(async () => {
    if (!selectedBot || !forwardTarget || !forwardingMessage) {
      toast.error('缺少必要参数');
      return;
    }
    
    try {
      if (forwardTarget.type === 'friend') {
        await messageApi.forwardFriendSingleMsg(selectedBot, forwardingMessage.message_id, forwardTarget.id);
      } else {
        await messageApi.forwardGroupSingleMsg(selectedBot, forwardingMessage.message_id, forwardTarget.id);
      }
      toast.success('消息已转发');
      setShowForwardDialog(false);
      setForwardTarget(null);
      setForwardingMessage(null);
    } catch (error) {
      toast.error('转发消息失败');
    }
  }, [selectedBot, forwardTarget, forwardingMessage]);

  // 多选消息
  const toggleMultiSelect = useCallback(() => {
    setMultiSelectMode(prev => !prev);
    setSelectedMessages(new Set());
    setContextMenu({ x: 0, y: 0, msg: null });
  }, []);

  // 切换消息选择
  const toggleMessageSelection = useCallback((messageId: string) => {
    setSelectedMessages(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(messageId)) {
        newSelected.delete(messageId);
      } else {
        newSelected.add(messageId);
      }
      return newSelected;
    });
  }, []);

  // 批量撤回
  const batchDeleteMessages = useCallback(async () => {
    if (!selectedBot || selectedMessages.size === 0) return;

    let successCount = 0;
    let failCount = 0;

    const messageIdsToDelete = Array.from(selectedMessages);

    await Promise.all(messageIdsToDelete.map(async (messageId) => {
      try {
        await messageApi.deleteMsg(selectedBot, messageId);
        successCount++;
      } catch (error) {
        failCount++;
      }
    }));

    if (successCount > 0) {
      toast.success(`成功撤回 ${successCount} 条消息`);
      setMessages(prev => prev.filter(m => !selectedMessages.has(m.message_id)));
    }
    if (failCount > 0) {
      toast.error(`${failCount} 条消息撤回失败`);
    }

    setMultiSelectMode(false);
    setSelectedMessages(new Set());
  }, [selectedBot, selectedMessages]);

  // 批量转发
  const batchForwardMessages = useCallback(() => {
    if (selectedMessages.size === 0) return;
    setForwardingMessage(null); // 清空单条转发消息，表示批量转发
    setShowForwardDialog(true);
    setForwardTarget(null);
  }, [selectedMessages]);

  // 执行批量转发
  const executeBatchForward = useCallback(async () => {
    if (!selectedBot || !forwardTarget || selectedMessages.size === 0) {
      toast.error('缺少必要参数');
      return;
    }

    const selectedMsgs = messages.filter(m => selectedMessages.has(m.message_id));
    if (selectedMsgs.length === 0) {
      toast.error('未找到选中的消息');
      return;
    }

    let successCount = 0;
    let failCount = 0;

    try {
      // 构建合并转发消息节点
      const forwardNodes = selectedMsgs.map(msg => ({
        type: 'node' as const,
        data: {
          name: msg.sender.nickname,
          uin: msg.user_id,
          content: msg.message,
        }
      }));

      if (forwardTarget.type === 'friend') {
        await messageApi.sendPrivateForwardMsg(selectedBot, forwardTarget.id, forwardNodes);
      } else {
        await messageApi.sendGroupForwardMsg(selectedBot, forwardTarget.id, forwardNodes);
      }

      toast.success(`成功转发 ${selectedMsgs.length} 条消息`);
      setShowForwardDialog(false);
      setForwardTarget(null);
      setForwardingMessage(null);
      setMultiSelectMode(false);
      setSelectedMessages(new Set());
    } catch (error) {
      toast.error('批量转发消息失败');
    }
  }, [selectedBot, forwardTarget, selectedMessages, messages]);

  // 加载群成员列表
  const loadGroupMembers = useCallback(async () => {
    if (!selectedBot || !selectedChat || selectedChat.type !== 'group') return;

    setLoadingMembers(true);
    try {
      const response = await groupApi.getGroupMemberList(selectedBot, selectedChat.id);
      // 后端返回格式：{status: 'ok', retcode: 0, data: [...]}
      // response 是后端包装后的响应，response.data 是 OneBot 的原始响应（成员列表数组）
      const outerStatus = response.status;
      const outerRetcode = response.retcode;
      const memberList = response.data;

      // 首先检查后端的 API 调用是否成功
      if (outerStatus !== 'ok' || outerRetcode !== 0) {
        console.error('加载群成员失败:', response.message);
        toast.error('加载群成员失败: ' + (response.message || `API错误 (${outerRetcode})`));
        return;
      }

      // 然后处理 OneBot 的响应
      if (Array.isArray(memberList)) {
        setGroupMembers(memberList.map((m: any) => ({
          user_id: String(m.user_id),
          nickname: m.nickname,
          card: m.card,
          role: m.role,
          join_time: m.join_time,
          last_sent_time: m.last_sent_time,
        })));
      } else {
        console.warn('群成员列表格式不正确:', response);
        toast.warning('群成员列表格式不正确');
      }
    } catch (error) {
      console.error('加载群成员失败:', error);
      toast.error('加载群成员失败');
    } finally {
      setLoadingMembers(false);
    }
  }, [selectedBot, selectedChat]);

  // 执行禁言
  const executeBan = useCallback(async () => {
    if (!selectedBot || !selectedChat || !banTargetUser) return;
    try {
      await groupApi.setGroupBan(selectedBot, selectedChat.id, banTargetUser.user_id, banDuration);
      const durationText = formatBanDuration(banDuration);
      toast.success(`已禁言 ${banTargetUser.nickname || banTargetUser.user_id} ${durationText}`);
      setShowBanDialog(false);
      setBanTargetUser(null);
    } catch (error) {
      toast.error('禁言失败');
    }
  }, [selectedBot, selectedChat, banTargetUser, banDuration]);

  // 解除禁言
  const unbanGroupMember = useCallback(async (userId: string) => {
    if (!selectedBot || !selectedChat) return;
    try {
      await groupApi.setGroupBan(selectedBot, selectedChat.id, userId, 0);
      toast.success('已解除禁言');
    } catch (error) {
      toast.error('解除禁言失败');
    }
  }, [selectedBot, selectedChat]);

  // 全员禁言
  const setGroupWholeBan = useCallback(async (enable: boolean) => {
    if (!selectedBot || !selectedChat) return;
    try {
      await groupApi.setGroupWholeBan(selectedBot, selectedChat.id, enable);
      toast.success(enable ? '已开启全员禁言' : '已关闭全员禁言');
    } catch (error) {
      toast.error('操作失败');
    }
  }, [selectedBot, selectedChat]);

  // 加载AI语音角色
  const loadAICharacters = useCallback(async () => {
    if (!selectedBot || !selectedChat || selectedChat.type !== 'group') return;

    try {
      const response = await aiVoiceApi.getAICharacters(selectedBot, selectedChat.id);
      console.log('AI角色列表响应:', response);

      // 后端返回格式：{status: 'ok', retcode: 0, data: [...]}
      // response 是后端包装后的响应，response.data 是 OneBot 的原始响应
      const outerStatus = response.status;
      const outerRetcode = response.retcode;
      const oneBotResponse = response.data;

      // 首先检查后端的 API 调用是否成功
      if (outerStatus !== 'ok' || outerRetcode !== 0) {
        console.error('加载AI语音角色失败:', response.message);
        toast.error('加载失败: ' + (response.message || `API错误 (${outerRetcode})`));
        return;
      }

      // 处理 OneBot 响应数据
      let botData = null;
      if (Array.isArray(oneBotResponse)) {
        // 格式1: 直接返回数组
        botData = oneBotResponse;
      } else if (oneBotResponse?.data) {
        // 格式2: {data: [...]}
        botData = oneBotResponse.data;
      } else if (oneBotResponse?.characters) {
        // 格式3: {characters: [...]}
        botData = oneBotResponse.characters;
      }

      if (Array.isArray(botData) && botData.length > 0) {
        const allCharacters: AICharacter[] = [];
        botData.forEach((category: any) => {
          if (category && category.characters && Array.isArray(category.characters)) {
            allCharacters.push(...category.characters);
          }
        });

        if (allCharacters.length === 0) {
          // 如果上面的解析没有结果，尝试直接解析
          botData.forEach((char: any) => {
            if (char.character_id && char.character_name) {
              allCharacters.push(char);
            }
          });
        }

        setAiCharacters(allCharacters);
        if (allCharacters.length > 0) {
          setSelectedAICharacter(allCharacters[0].character_id);
          console.log(`成功加载 ${allCharacters.length} 个AI语音角色`);
        } else {
          toast.warning('未找到可用的AI语音角色');
        }
      } else {
        console.warn('AI角色列表为空或格式不正确:', response);
        toast.warning('未找到可用的AI语音角色');
      }
    } catch (error: any) {
      console.error('加载AI语音角色失败:', error);
      const errorMsg = error.message || error.data?.message || '加载AI语音角色失败';
      toast.error(`加载失败: ${errorMsg}`);
    }
  }, [selectedBot, selectedChat]);

  // 发送AI语音
  const sendAIVoice = useCallback(async () => {
    if (!selectedBot || !selectedChat || !aiVoiceText.trim() || !selectedAICharacter) {
      toast.warning('请填写完整信息');
      return;
    }
    
    try {
      console.log('发送AI语音:', {
        bot: selectedBot,
        group: selectedChat.id,
        character: selectedAICharacter,
        text: aiVoiceText.trim()
      });
      
      const response = await aiVoiceApi.sendGroupAIRecord(
        selectedBot,
        selectedChat.id,
        selectedAICharacter,
        aiVoiceText.trim()
      );

      console.log('AI语音发送响应:', response);

      // 后端返回的数据结构是:
      // { status: 'ok', retcode: 0, data: { status: 'ok', retcode: 0, data: null, message: '', wording: '' } }
      // 外层的 status/retcode 是后端 API 包装
      // 内层的 data 是 OneBot 的原始响应
      const outerStatus = response.status;
      const outerRetcode = response.retcode;
      const oneBotResponse = response.data;

      // 首先检查后端的 API 调用是否成功
      if (outerStatus !== 'ok' || outerRetcode !== 0) {
        const errorMsg = response.message || `API调用失败 (retcode: ${outerRetcode})`;
        toast.error(`发送失败: ${errorMsg}`);
        return;
      }

      // 然后检查 OneBot 的响应
      if (oneBotResponse) {
        const botStatus = oneBotResponse.status;
        const botRetcode = oneBotResponse.retcode;
        const botMessage = oneBotResponse.message || oneBotResponse.wording;

        if (botStatus === 'ok' && botRetcode === 0) {
          toast.success('AI语音已发送');
          setAiVoiceText('');
          setShowAIVoice(false);
        } else {
          const errorMsg = botMessage || `发送失败 (retcode: ${botRetcode})`;
          toast.error(`发送失败: ${errorMsg}`);
        }
      } else {
        // 如果没有 OneBot 响应数据，但后端调用成功，也算成功
        toast.success('AI语音已发送');
        setAiVoiceText('');
        setShowAIVoice(false);
      }
    } catch (error: any) {
      console.error('发送AI语音失败:', error);
      const errorMsg = error.message || error.data?.message || error.data?.wording || '发送AI语音失败';
      toast.error(`发送失败: ${errorMsg}`);
    }
  }, [selectedBot, selectedChat, aiVoiceText, selectedAICharacter]);

  // 查看群资料
  const viewGroupProfile = useCallback(async () => {
    if (!selectedBot || !selectedChat || selectedChat.type !== 'group') return;

    try {
      const response = await groupApi.getGroupInfo(selectedBot, selectedChat.id);
      // 后端返回格式：{status: 'ok', retcode: 0, data: {...}}
      // response 是后端包装后的响应，response.data 是 OneBot 的原始响应
      const outerStatus = response.status;
      const outerRetcode = response.retcode;
      const oneBotResponse = response.data;

      // 首先检查后端的 API 调用是否成功
      if (outerStatus !== 'ok' || outerRetcode !== 0) {
        console.error('获取群资料失败:', response.message);
        toast.error('获取群资料失败: ' + (response.message || `API错误 (${outerRetcode})`));
        return;
      }

      // 然后检查 OneBot 的响应
      if (oneBotResponse) {
        setProfileData(oneBotResponse);
        setProfileType('group');
        setShowProfile(true);
      } else {
        toast.error('获取群资料失败：无数据返回');
      }
    } catch (error) {
      console.error('获取群资料失败:', error);
      toast.error('获取群资料失败');
    }
  }, [selectedBot, selectedChat]);

  // 查看用户资料
  const viewUserProfile = useCallback(async (userId: string) => {
    if (!selectedBot) return;

    try {
      const response = await userApi.getStrangerInfo(selectedBot, userId);
      // 后端返回格式：{status: 'ok', data: {data: {...}, echo: ..., status: 'ok'}}
      const botData = response.data?.data;
      if (botData) {
        setProfileData(botData);
        setProfileType('user');
        setShowProfile(true);
      }
    } catch (error) {
      toast.error('获取用户资料失败');
    }
  }, [selectedBot]);

  // 查找回复的消息
  const findReplyMessage = useCallback((replyId: string): Message | undefined => {
    return messages.find(m => m.message_id === replyId);
  }, [messages]);

  // 点击回复消息滚动
  const handleReplyClick = useCallback((replyId: string) => {
    const element = document.getElementById(`msg-${replyId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('ring-2', 'ring-yellow-400');
      setTimeout(() => element.classList.remove('ring-2', 'ring-yellow-400'), 2000);
    }
  }, []);

  // 创建会话
  const createFriendSession = useCallback((friend: Friend): ChatSession => ({
    id: friend.user_id,
    type: 'friend',
    name: friend.remark || friend.nickname,
    avatar: `https://q1.qlogo.cn/g?b=qq&nk=${friend.user_id}&s=640`,
  }), []);

  const createGroupSession = useCallback((group: Group): ChatSession => ({
    id: group.group_id,
    type: 'group',
    name: group.group_name,
    avatar: `https://p.qlogo.cn/gh/${group.group_id}/${group.group_id}/640/`,
  }), []);

  // 加载数据
  useEffect(() => {
    if (selectedBot) {
      loadFriends();
      loadGroups();
    }
  }, [selectedBot, loadFriends, loadGroups]);

  // 过滤好友和群组
  const filteredFriends = useMemo(() => {
    if (!searchQuery) return friends;
    const query = searchQuery.toLowerCase();
    return friends.filter(f => 
      f.nickname.toLowerCase().includes(query) || 
      f.remark?.toLowerCase().includes(query) ||
      f.user_id.includes(query)
    );
  }, [friends, searchQuery]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery) return groups;
    const query = searchQuery.toLowerCase();
    return groups.filter(g => 
      g.group_name.toLowerCase().includes(query) || 
      g.group_id.includes(query)
    );
  }, [groups, searchQuery]);

  if (onlineBots.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-20 h-20 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">没有在线的机器人</h3>
          <p className="text-gray-500 dark:text-gray-400">请先启动一个机器人账号</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-80px)] bg-white dark:bg-[#1a1a1a] rounded-2xl overflow-hidden shadow-xl border border-gray-200 dark:border-gray-700">
      {/* 左侧列表区 */}
      <div className={`
        w-full md:w-80 border-r border-gray-200 dark:border-gray-700 flex-shrink-0
        ${selectedChat ? 'hidden md:flex' : 'flex'}
      `}>
        <div className="flex flex-col h-full">
          {/* 头部 */}
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <select
              value={selectedBot || ''}
              onChange={(e) => setSelectedBot(e.target.value)}
              className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {onlineBots.map(bot => (
                <option key={bot.self_id} value={bot.self_id}>
                  {bot.nickname}:{bot.self_id}
                </option>
              ))}
            </select>
          </div>

          {/* 搜索框 */}
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索好友或群组..."
                className="w-full pl-9 pr-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* 类型切换标签 */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 px-2 pt-2">
            {(['recent', 'friends', 'groups'] as TabType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors rounded-t-lg ${
                  activeTab === tab
                    ? 'text-pink-600 dark:text-pink-400 bg-pink-50/50 dark:bg-pink-900/30'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {tab === 'recent' && <Clock className="w-4 h-4" />}
                {tab === 'friends' && <Users className="w-4 h-4" />}
                {tab === 'groups' && <MessageCircle className="w-4 h-4" />}
                {tab === 'recent' ? '最近' : tab === 'friends' ? '好友' : '群组'}
              </button>
            ))}
          </div>

          {/* 列表内容 */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'friends' && (
              <div className="py-1">
                {filteredFriends.map(friend => (
                  <div
                    key={friend.user_id}
                    onClick={() => handleSelectChat(createFriendSession(friend))}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 ${
                      selectedChat?.id === friend.user_id && selectedChat?.type === 'friend'
                        ? 'bg-blue-50 dark:bg-blue-900/20'
                        : ''
                    }`}
                  >
                    <img
                      src={`https://q1.qlogo.cn/g?b=qq&nk=${friend.user_id}&s=640`}
                      alt={friend.nickname}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {friend.remark || friend.nickname}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {friend.user_id}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'groups' && (
              <div className="py-1">
                {filteredGroups.map(group => (
                  <div
                    key={group.group_id}
                    onClick={() => handleSelectChat(createGroupSession(group))}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 ${
                      selectedChat?.id === group.group_id && selectedChat?.type === 'group'
                        ? 'bg-blue-50 dark:bg-blue-900/20'
                        : ''
                    }`}
                  >
                    <img
                      src={`https://p.qlogo.cn/gh/${group.group_id}/${group.group_id}/640/`}
                      alt={group.group_name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {group.group_name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        群号: {group.group_id} {group.member_count && `· ${group.member_count}人`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'recent' && (
              <div className="py-1">
                {recentSessions.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>暂无最近聊天</p>
                  </div>
                ) : (
                  recentSessions.map(session => (
                    <div
                      key={`${session.type}-${session.id}`}
                      onClick={() => handleSelectChat(session)}
                      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 ${
                        selectedChat?.id === session.id && selectedChat?.type === session.type
                          ? 'bg-blue-50 dark:bg-blue-900/20'
                          : ''
                      }`}
                    >
                      <div className="relative flex-shrink-0">
                        <img
                          src={session.avatar}
                          alt={session.name}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                        {session.unread && session.unread > 0 && (
                          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                            {session.unread}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                          {session.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {session.lastMessage || '暂无消息'}
                        </div>
                      </div>
                      {session.lastTime && (
                        <div className="text-xs text-gray-400">
                          {formatTime(session.lastTime)}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 右侧内容区 */}
      <div className={`flex-1 flex flex-col min-w-0 ${!selectedChat ? 'hidden md:flex' : 'flex'}`}>
        {selectedChat ? (
          <div className="flex flex-col h-full relative">
            {/* 头部 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1a]">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedChat(null)}
                  className="md:hidden p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <img
                  src={selectedChat.avatar}
                  alt={selectedChat.name}
                  className="w-10 h-10 rounded-full object-cover cursor-pointer"
                  onClick={() => selectedChat.type === 'group' ? viewGroupProfile() : viewUserProfile(selectedChat.id)}
                />
                <div>
                  <div 
                    className="font-medium text-gray-900 dark:text-gray-100 cursor-pointer hover:text-blue-500"
                    onClick={() => selectedChat.type === 'group' ? viewGroupProfile() : viewUserProfile(selectedChat.id)}
                  >
                    {selectedChat.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                    {selectedChat.type === 'friend' ? '好友' : '群聊'} {selectedChat.id}
                    {sseConnected && (
                      <span className="flex items-center gap-1 text-green-500">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                        实时
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  className="p-2 text-gray-500 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg" 
                  title="强制刷新"
                  onClick={() => { 
                    if (selectedChat && selectedBot) {
                      localStorage.removeItem(`webqq_messages:${selectedBot}:${selectedChat.type}:${selectedChat.id}`);
                      loadMessages(selectedChat);
                      toast.success('已强制刷新');
                    }
                  }}
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
                {selectedChat.type === 'group' && (
                  <button 
                    className="p-2 text-gray-500 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg" 
                    title="AI语音"
                    onClick={() => { setShowAIVoice(true); loadAICharacters(); }}
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>
                )}
                <button 
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg" 
                  title="查看成员"
                  onClick={() => { setShowMemberList(true); loadGroupMembers(); }}
                >
                  <Users className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* 多选模式工具栏 */}
            <AnimatePresence>
              {multiSelectMode && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="flex items-center justify-between px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 overflow-hidden"
                >
                  <span className="text-sm text-blue-600 dark:text-blue-400">
                    已选择 {selectedMessages.size} 条消息
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={batchForwardMessages}
                      disabled={selectedMessages.size === 0}
                      className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      <Share2 className="w-4 h-4" />
                      批量转发
                    </button>
                    <button
                      onClick={batchDeleteMessages}
                      disabled={selectedMessages.size === 0}
                      className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      批量撤回
                    </button>
                    <button
                      onClick={() => { setMultiSelectMode(false); setSelectedMessages(new Set()); }}
                      className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 消息列表 */}
            <div 
              ref={messagesContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto overflow-x-hidden p-4 bg-gray-50 dark:bg-[#0f0f0f]"
            >
              <div className="min-h-full flex flex-col">
                {loading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
                    <div className="text-center">
                      <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>暂无消息</p>
                      <p className="text-sm mt-1">开始聊天吧</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 w-full">
                    {hasMoreHistory && (
                      <div className="text-center py-2">
                        {loadingMore ? (
                          <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm">加载更多...</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => debouncedLoadMore()}
                            className="text-sm text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                          >
                            点击加载更多历史消息
                          </button>
                        )}
                      </div>
                    )}
                    {!hasMoreHistory && messages.length > MESSAGES_PER_PAGE && (
                      <div className="text-center py-2 text-gray-400 dark:text-gray-500 text-sm">
                        没有更多历史消息了
                      </div>
                    )}
                    {messages.map((msg) => (
                      <MessageItem
                        key={msg.message_id}
                        msg={msg}
                        isSelf={msg.user_id === selectedBot}
                        isSelected={selectedMessages.has(msg.message_id)}
                        multiSelectMode={multiSelectMode}
                        selectedBot={selectedBot}
                        onContextMenu={handleMessageContextMenu}
                        onToggleSelection={toggleMessageSelection}
                        onViewUserProfile={viewUserProfile}
                        onCopyMessageId={copyMessageId}
                        onReplyClick={handleReplyClick}
                        findReplyMessage={findReplyMessage}
                        onImagePreview={setPreviewImage}
                      />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
            </div>

            {/* 输入区 */}
            <MessageInput
              value={inputMessage}
              onChange={setInputMessage}
              onSend={handleSendMessage}
              disabled={isSending}
              placeholder="输入消息..."
              replyingTo={replyingTo}
              onCancelReply={() => setReplyingTo(null)}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <MessageCircle className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg">选择一个好友或群组开始聊天</p>
              <p className="text-lg">该功能为测试版本 存在体验问题和一些未发现bug 请理解QAQ</p>
            </div>
          </div>
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu.msg && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          msg={contextMenu.msg}
          onClose={() => setContextMenu({ x: 0, y: 0, msg: null })}
          onReply={() => handleReply(contextMenu.msg!)}
          onCopy={() => copyMessageId(contextMenu.msg!.message_id)}
          onForward={() => handleForward(contextMenu.msg!)}
          onDelete={() => handleDeleteMsg(contextMenu.msg!)}
          onMultiSelect={toggleMultiSelect}
        />
      )}

      {/* 图片预览 */}
      {previewImage && (
        <ImagePreview src={previewImage} onClose={() => setPreviewImage(null)} />
      )}

      {/* 转发对话框 */}
      <AnimatePresence>
        {showForwardDialog && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-80 max-h-[80vh] flex flex-col"
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-semibold">
                  {forwardingMessage ? '转发到' : `批量转发 ${selectedMessages.size} 条消息到`}
                </h3>
                <button onClick={() => { setShowForwardDialog(false); setForwardingMessage(null); setForwardTarget(null); }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-2 px-2">好友</div>
                {friends.map(friend => (
                  <button
                    key={friend.user_id}
                    onClick={() => setForwardTarget({ type: 'friend', id: friend.user_id, name: friend.remark || friend.nickname })}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg ${
                      forwardTarget?.id === friend.user_id && forwardTarget?.type === 'friend'
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <img src={`https://q1.qlogo.cn/g?b=qq&nk=${friend.user_id}&s=640`} className="w-8 h-8 rounded-full" />
                    <span className="truncate">{friend.remark || friend.nickname}</span>
                  </button>
                ))}
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-2 mt-4 px-2">群组</div>
                {groups.map(group => (
                  <button
                    key={group.group_id}
                    onClick={() => setForwardTarget({ type: 'group', id: group.group_id, name: group.group_name })}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg ${
                      forwardTarget?.id === group.group_id && forwardTarget?.type === 'group'
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <img src={`https://p.qlogo.cn/gh/${group.group_id}/${group.group_id}/640/`} className="w-8 h-8 rounded-full" />
                    <span className="truncate">{group.group_name}</span>
                  </button>
                ))}
              </div>
              <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={forwardingMessage ? executeForward : executeBatchForward}
                  disabled={!forwardTarget}
                  className="w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {forwardingMessage ? '转发' : `批量转发 ${selectedMessages.size} 条消息`}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 群成员列表面板 */}
      <AnimatePresence>
        {showMemberList && selectedChat?.type === 'group' && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 z-40 w-80 bg-white dark:bg-gray-800 shadow-xl border-l border-gray-200 dark:border-gray-700 flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold">群成员 ({groupMembers.length})</h3>
              <button onClick={() => setShowMemberList(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-2 border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setGroupWholeBan(true)}
                className="w-full py-2 px-3 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-2 text-red-500"
              >
                <Ban className="w-4 h-4" />
                开启全员禁言
              </button>
              <button
                onClick={() => setGroupWholeBan(false)}
                className="w-full py-2 px-3 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-2 text-green-500"
              >
                <Check className="w-4 h-4" />
                关闭全员禁言
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {loadingMembers ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                </div>
              ) : (
                groupMembers.map(member => (
                  <div key={member.user_id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg group">
                    <img 
                      src={`https://q1.qlogo.cn/g?b=qq&nk=${member.user_id}&s=640`} 
                      className="w-8 h-8 rounded-full cursor-pointer"
                      onClick={() => viewUserProfile(member.user_id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{member.card || member.nickname}</div>
                      <div className="text-xs text-gray-500">{member.user_id}</div>
                    </div>
                    {member.role !== 'owner' && (
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
                        <button
                          onClick={() => { setBanTargetUser(member); setShowBanDialog(true); }}
                          className="p-1.5 text-xs bg-red-100 dark:bg-red-900/30 text-red-600 rounded hover:bg-red-200"
                          title="禁言"
                        >
                          禁言
                        </button>
                        <button
                          onClick={() => unbanGroupMember(member.user_id)}
                          className="p-1.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-600 rounded hover:bg-green-200"
                          title="解除禁言"
                        >
                          解禁
                        </button>
                      </div>
                    )}
                    {member.role === 'owner' && <span className="text-xs text-yellow-500">群主</span>}
                    {member.role === 'admin' && <span className="text-xs text-blue-500">管理</span>}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 禁言时间选择对话框 */}
      <AnimatePresence>
        {showBanDialog && banTargetUser && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-80"
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-semibold">禁言设置</h3>
                <button onClick={() => { setShowBanDialog(false); setBanTargetUser(null); }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4">
                <div className="mb-4">
                  <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">目标用户</div>
                  <div className="flex items-center gap-2">
                    <img src={`https://q1.qlogo.cn/g?b=qq&nk=${banTargetUser.user_id}&s=640`} className="w-8 h-8 rounded-full" />
                    <span className="font-medium">{banTargetUser.card || banTargetUser.nickname}</span>
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">禁言时长</label>
                  <select
                    value={banDuration}
                    onChange={(e) => setBanDuration(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm"
                  >
                    <option value={60}>1分钟</option>
                    <option value={300}>5分钟</option>
                    <option value={600}>10分钟</option>
                    <option value={1800}>30分钟</option>
                    <option value={3600}>1小时</option>
                    <option value={7200}>2小时</option>
                    <option value={21600}>6小时</option>
                    <option value={43200}>12小时</option>
                    <option value={86400}>1天</option>
                    <option value={172800}>2天</option>
                    <option value={259200}>3天</option>
                    <option value={604800}>7天</option>
                    <option value={1209600}>14天</option>
                    <option value={2505600}>29天</option>
                  </select>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  禁言时长: {formatBanDuration(banDuration)}
                </div>
                <button
                  onClick={executeBan}
                  className="w-full py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center justify-center gap-2"
                >
                  <Ban className="w-4 h-4" />
                  确认禁言
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI语音面板 */}
      <AnimatePresence>
        {showAIVoice && selectedChat?.type === 'group' && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 z-40 w-80 bg-white dark:bg-gray-800 shadow-xl border-l border-gray-200 dark:border-gray-700 flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold flex items-center gap-2">
                <Volume2 className="w-5 h-5" />
                AI语音
              </h3>
              <button onClick={() => setShowAIVoice(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">选择声色</label>
                <select
                  value={selectedAICharacter}
                  onChange={(e) => setSelectedAICharacter(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm"
                >
                  {aiCharacters.map(char => (
                    <option key={char.character_id} value={char.character_id}>
                      {char.character_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">语音文本</label>
                <textarea
                  value={aiVoiceText}
                  onChange={(e) => setAiVoiceText(e.target.value)}
                  placeholder="输入要转换为语音的文本..."
                  className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm resize-none h-32"
                />
              </div>
              <button
                onClick={sendAIVoice}
                disabled={!aiVoiceText.trim() || !selectedAICharacter}
                className="w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Mic className="w-4 h-4" />
                发送AI语音
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 资料面板 */}
      <AnimatePresence>
        {showProfile && profileData && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-96 max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-semibold">{profileType === 'group' ? '群资料' : '用户资料'}</h3>
                <button onClick={() => setShowProfile(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4">
                {profileType === 'group' ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <img 
                        src={`https://p.qlogo.cn/gh/${profileData.group_id}/${profileData.group_id}/640/`} 
                        className="w-16 h-16 rounded-full"
                      />
                      <div>
                        <div className="font-semibold text-lg">{profileData.group_name}</div>
                        <div className="text-sm text-gray-500">群号: {profileData.group_id}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded-lg">
                        <div className="text-gray-500">成员数</div>
                        <div className="font-semibold">{profileData.member_count}</div>
                      </div>
                      <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded-lg">
                        <div className="text-gray-500">最大成员数</div>
                        <div className="font-semibold">{profileData.max_member_count}</div>
                      </div>
                    </div>
                    {profileData.group_memo && (
                      <div>
                        <div className="text-sm text-gray-500 mb-1">群介绍</div>
                        <div className="text-sm bg-gray-100 dark:bg-gray-700 p-3 rounded-lg">{profileData.group_memo}</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <img 
                        src={`https://q1.qlogo.cn/g?b=qq&nk=${profileData.user_id}&s=640`} 
                        className="w-16 h-16 rounded-full"
                      />
                      <div>
                        <div className="font-semibold text-lg">{profileData.nickname}</div>
                        <div className="text-sm text-gray-500">QQ: {profileData.user_id}</div>
                      </div>
                    </div>
                    {profileData.qid && (
                      <div className="text-sm">
                        <span className="text-gray-500">QID:</span> {profileData.qid}
                      </div>
                    )}
                    {profileData.sex && (
                      <div className="text-sm">
                        <span className="text-gray-500">性别:</span> {profileData.sex === 'male' ? '男' : profileData.sex === 'female' ? '女' : '未知'}
                      </div>
                    )}
                    {profileData.age && (
                      <div className="text-sm">
                        <span className="text-gray-500">年龄:</span> {profileData.age}
                      </div>
                    )}
                    {profileData.sign && (
                      <div>
                        <div className="text-sm text-gray-500 mb-1">个性签名</div>
                        <div className="text-sm bg-gray-100 dark:bg-gray-700 p-3 rounded-lg">{profileData.sign}</div>
                      </div>
                    )}
                    {profileData.level && (
                      <div className="text-sm">
                        <span className="text-gray-500">等级:</span> {profileData.level}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
