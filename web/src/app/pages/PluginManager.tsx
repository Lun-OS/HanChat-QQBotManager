import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import Editor, { loader } from '@monaco-editor/react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import * as monaco from 'monaco-editor';
import {
  Folder,
  File,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Copy,
  Scissors,
  Edit3,
  Save,
  X,
  RefreshCw,
  Search,
  AlertTriangle,
  FolderOpen,
  FileCode,
  FileJson,
  FileText,
  ArrowLeft,
  Layers,
  Settings,
  Eye,
  Download,
  Upload,
  Check,
  FolderInput,
  FolderOutput,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  ArrowRightLeft
} from 'lucide-react';
import { pluginManagerApi, type FileNode, type AccountInfo } from '../services/api';
import { BlocklyEditor } from '../blockly';

loader.config({ monaco });

// 模式类型
type ViewMode = 'simple' | 'advanced';

// 剪贴板类型
type ClipboardAction = 'copy' | 'cut';

interface ClipboardItem {
  node: FileNode;
  action: ClipboardAction;
  sourceSide: 'left' | 'right';
}

// 文件类型图标映射
const getFileIcon = (name: string, isDirectory: boolean) => {
  if (isDirectory) return <Folder className="w-5 h-5 text-yellow-500" />;
  if (name.endsWith('.lua')) return <FileCode className="w-5 h-5 text-blue-500" />;
  if (name.endsWith('.json')) return <FileJson className="w-5 h-5 text-green-500" />;
  if (name.endsWith('.md') || name.endsWith('.txt')) return <FileText className="w-5 h-5 text-gray-500" />;
  return <File className="w-5 h-5 text-gray-400" />;
};

// 获取文件语言类型
const getFileLanguage = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'lua': return 'lua';
    case 'json': return 'json';
    case 'md': return 'markdown';
    case 'txt': return 'plaintext';
    case 'html': return 'html';
    case 'htm': return 'html';
    case 'js': return 'javascript';
    case 'jsx': return 'javascript';
    case 'ts': return 'typescript';
    case 'tsx': return 'typescript';
    case 'css': return 'css';
    case 'scss': return 'scss';
    case 'less': return 'less';
    case 'xml': return 'xml';
    case 'yaml': return 'yaml';
    case 'yml': return 'yaml';
    case 'py': return 'python';
    case 'go': return 'go';
    case 'rs': return 'rust';
    case 'java': return 'java';
    case 'c': return 'c';
    case 'cpp': return 'cpp';
    case 'h': return 'cpp';
    case 'hpp': return 'cpp';
    case 'sh': return 'shell';
    case 'bat': return 'bat';
    case 'ps1': return 'powershell';
    case 'sql': return 'sql';
    case 'dockerfile': return 'dockerfile';
    default: return 'plaintext';
  }
};

// 检查是否为二进制文件
const isBinaryFile = (filename: string): boolean => {
  const binaryExtensions = [
    // 图片
    'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'svg', 'webp', 'tiff', 'tif',
    // 音频视频
    'mp3', 'mp4', 'wav', 'avi', 'mov', 'flv', 'wmv', 'mkv', 'webm',
    // 压缩文件
    'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz',
    // 可执行文件
    'exe', 'dll', 'so', 'dylib', 'bin',
    // 文档
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    // 其他二进制
    'woff', 'woff2', 'ttf', 'otf', 'eot', 'swf', 'class', 'o', 'a', 'lib'
  ];
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? binaryExtensions.includes(ext) : false;
};

// 确认对话框组件
interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  requireConfirmText?: boolean;
  confirmPlaceholder?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  danger = false,
  requireConfirmText = false,
  confirmPlaceholder = '',
  onConfirm,
  onCancel
}) => {
  const [confirmInput, setConfirmInput] = useState('');

  useEffect(() => {
    if (isOpen) setConfirmInput('');
  }, [isOpen]);

  if (!isOpen) return null;

  const canConfirm = !requireConfirmText || confirmInput === confirmPlaceholder;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white dark:bg-[#1D2129] rounded-xl shadow-xl max-w-md w-full"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`p-2 rounded-full ${danger ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h3>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{message}</p>
          
          {requireConfirmText && (
            <div className="mb-4">
              <label className="block text-sm text-gray-500 mb-2">
                请输入 <span className="font-mono font-bold text-gray-700">{confirmPlaceholder}</span> 以确认操作
              </label>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#2A2E38] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder={`输入 "${confirmPlaceholder}"`}
              />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 p-4 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className={`px-4 py-2 rounded-lg transition-colors ${
              danger
                ? 'bg-red-500 text-white hover:bg-red-600 disabled:bg-red-300'
                : 'bg-[#165DFF] text-white hover:bg-[#0047FF] disabled:bg-blue-300'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// 新建插件对话框
interface CreatePluginDialogProps {
  isOpen: boolean;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

const CreatePluginDialog: React.FC<CreatePluginDialogProps> = ({ isOpen, onConfirm, onCancel }) => {
  const [name, setName] = useState('');

  useEffect(() => {
    if (isOpen) setName('');
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white dark:bg-[#1D2129] rounded-xl shadow-xl max-w-md w-full"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">新建插件</h3>
          <p className="text-sm text-gray-500 mb-4">将自动创建插件文件夹，并在其中生成 main.lua 和 config.json 文件</p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#2A2E38] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="请输入插件名称"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) {
                onConfirm(name.trim());
              }
            }}
          />
        </div>
        <div className="flex justify-end gap-3 p-4 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => name.trim() && onConfirm(name.trim())}
            disabled={!name.trim()}
            className="px-4 py-2 bg-[#165DFF] text-white rounded-lg hover:bg-[#0047FF] transition-colors disabled:opacity-50"
          >
            创建
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// 新建文件/文件夹对话框
interface CreateFileDialogProps {
  isOpen: boolean;
  isDirectory: boolean;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

const CreateFileDialog: React.FC<CreateFileDialogProps> = ({ isOpen, isDirectory, onConfirm, onCancel }) => {
  const [name, setName] = useState('');

  useEffect(() => {
    if (isOpen) setName('');
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white dark:bg-[#1D2129] rounded-xl shadow-xl max-w-md w-full"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            新建{isDirectory ? '文件夹' : '文件'}
          </h3>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#2A2E38] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder={`请输入${isDirectory ? '文件夹' : '文件'}名称`}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) {
                onConfirm(name.trim());
              }
            }}
          />
        </div>
        <div className="flex justify-end gap-3 p-4 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => name.trim() && onConfirm(name.trim())}
            disabled={!name.trim()}
            className="px-4 py-2 bg-[#165DFF] text-white rounded-lg hover:bg-[#0047FF] transition-colors disabled:opacity-50"
          >
            创建
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// 重命名对话框
interface RenameDialogProps {
  isOpen: boolean;
  currentName: string;
  onConfirm: (newName: string) => void;
  onCancel: () => void;
}

const RenameDialog: React.FC<RenameDialogProps> = ({ isOpen, currentName, onConfirm, onCancel }) => {
  const [name, setName] = useState(currentName);

  useEffect(() => {
    if (isOpen) setName(currentName);
  }, [isOpen, currentName]);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white dark:bg-[#1D2129] rounded-xl shadow-xl max-w-md w-full"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">重命名</h3>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#2A2E38] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="请输入新名称"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim() && name !== currentName) {
                onConfirm(name.trim());
              }
            }}
          />
        </div>
        <div className="flex justify-end gap-3 p-4 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => name.trim() && name !== currentName && onConfirm(name.trim())}
            disabled={!name.trim() || name === currentName}
            className="px-4 py-2 bg-[#165DFF] text-white rounded-lg hover:bg-[#0047FF] transition-colors disabled:opacity-50"
          >
            确认
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// 文件编辑器组件
interface FileEditorProps {
  isOpen: boolean;
  fileName: string;
  content: string;
  isReadOnly: boolean;
  onSave: (content: string) => void;
  onClose: () => void;
}

const FileEditor: React.FC<FileEditorProps> = ({
  isOpen,
  fileName,
  content,
  isReadOnly,
  onSave,
  onClose
}) => {
  const [editedContent, setEditedContent] = useState(content);
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const isMarkdown = fileName.endsWith('.md');
  const hasUnsavedChanges = editedContent !== content;
  const isBinary = isBinaryFile(fileName);

  useEffect(() => {
    setEditedContent(content);
  }, [content]);

  // 未保存更改警告
  useEffect(() => {
    if (!isOpen) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '您有未保存的更改，确定要离开吗？';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, isOpen]);

  // 关闭前检查未保存更改
  const handleClose = () => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm('您有未保存的更改，确定要关闭吗？');
      if (!confirmed) return;
    }
    onClose();
  };

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(editedContent);
    } finally {
      setIsSaving(false);
    }
  };

  const language = getFileLanguage(fileName);

  marked.setOptions({
    breaks: true,
    gfm: true,
  });

  const renderMarkdown = (md: string) => {
    if (!md) return { __html: '' };

    const rawHtml = marked.parse(md, { async: false }) as string;

    const cleanHtml = DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'del', 'code', 'pre', 'blockquote', 'li', 'ul', 'ol', 'a', 'img', 'hr', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'div', 'span'],
      ALLOWED_ATTR: ['class', 'href', 'target', 'rel', 'src', 'alt', 'title'],
      ALLOW_DATA_ATTR: false,
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    });

    return { __html: cleanHtml };
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={handleClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white dark:bg-[#1D2129] rounded-xl shadow-xl w-full max-w-6xl h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            {getFileIcon(fileName, false)}
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{fileName}</h3>
            {isReadOnly && (
              <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 rounded">
                只读
              </span>
            )}
            {hasUnsavedChanges && !isBinary && (
              <span className="px-2 py-0.5 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 rounded">
                未保存
              </span>
            )}
            {isBinary && (
              <span className="px-2 py-0.5 text-xs bg-red-100 dark:bg-red-900/30 text-red-600 rounded">
                二进制文件
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isMarkdown && !isBinary && (
              <button
                onClick={() => setShowPreview(!showPreview)}
                className={`px-3 py-2 rounded-lg transition-colors text-sm ${
                  showPreview 
                    ? 'bg-[#165DFF] text-white' 
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                }`}
              >
                {showPreview ? '编辑' : '预览'}
              </button>
            )}
            {!isReadOnly && !isBinary && (
              <button
                onClick={handleSave}
                disabled={isSaving || !hasUnsavedChanges}
                className="px-4 py-2 bg-[#165DFF] text-white rounded-lg hover:bg-[#0047FF] transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                保存
              </button>
            )}
            <button
              onClick={handleClose}
              className="p-2 text-gray-500 hover:text-gray-700 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          {isBinary ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500">
              <div className="w-24 h-24 mb-6 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <File className="w-12 h-12 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                无法预览二进制文件
              </h3>
              <p className="text-sm text-gray-400 max-w-md text-center mb-4">
                该文件类型（.{fileName.split('.').pop()?.toLowerCase() || 'unknown'}）是二进制文件，无法直接编辑或预览。
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 bg-[#165DFF] text-white rounded-lg hover:bg-[#0047FF] transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          ) : isMarkdown && showPreview ? (
            <div 
              className="h-full overflow-auto p-6 bg-[#1D2129] text-gray-300"
              dangerouslySetInnerHTML={renderMarkdown(editedContent)}
            />
          ) : (
            <Editor
              height="100%"
              language={language}
              value={editedContent}
              onChange={(value) => setEditedContent(value || '')}
              loading={
                <div className="h-full flex items-center justify-center bg-[#1D2129]">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-[#165DFF] border-t-transparent rounded-full animate-spin" />
                    <span className="text-gray-400 text-sm">正在加载编辑器...</span>
                  </div>
                </div>
              }
              options={{
                readOnly: isReadOnly,
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                roundedSelection: false,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: 'on',
              }}
              theme="vs-dark"
            />
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

// 右键菜单组件
interface ContextMenuProps {
  x: number;
  y: number;
  node: FileNode | null;
  side: 'left' | 'right';
  canWrite: boolean;
  hasClipboard: boolean;
  onClose: () => void;
  onOpen: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onRename: () => void;
  onDelete: () => void;
  onCreatePlugin: () => void;
  onCreateFolder: () => void;
  onCreateFile: () => void;
  onRefresh: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  node,
  side,
  canWrite,
  hasClipboard,
  onClose,
  onOpen,
  onCopy,
  onCut,
  onPaste,
  onRename,
  onDelete,
  onCreatePlugin,
  onCreateFolder,
  onCreateFile,
  onRefresh
}) => {
  const isDirectory = node?.isDirectory ?? true;

  return (
    <>
      <div className="fixed inset-0" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="fixed bg-white dark:bg-[#1D2129] rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 z-50 min-w-[180px]"
        style={{ left: x, top: y }}
      >
        {/* 新建操作组 - 只在有权限时显示 */}
        {canWrite && (
          <>
            <button
              onClick={() => { onCreatePlugin(); onClose(); }}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
            >
              <FolderPlus className="w-4 h-4" />
              新建插件
            </button>
            {isDirectory && (
              <>
                <button
                  onClick={() => { onCreateFolder(); onClose(); }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
                >
                  <Folder className="w-4 h-4" />
                  新建文件夹
                </button>
                <button
                  onClick={() => { onCreateFile(); onClose(); }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
                >
                  <File className="w-4 h-4" />
                  新建文件
                </button>
              </>
            )}
            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
          </>
        )}

        {/* 粘贴按钮 - 在空白区域或有权限时显示 */}
        {hasClipboard && canWrite && (
          <>
            <button
              onClick={() => { onPaste(); onClose(); }}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
            >
              <FolderInput className="w-4 h-4" />
              粘贴到此处
            </button>
            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
          </>
        )}

        {/* 文件操作组 - 只在选中节点时显示 */}
        {node && (
          <>
            {!node.isDirectory && (
              <button
                onClick={() => { onOpen(); onClose(); }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
              >
                <Edit3 className="w-4 h-4" />
                打开
              </button>
            )}
            
            <button
              onClick={() => { onCopy(); onClose(); }}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
            >
              <Copy className="w-4 h-4" />
              复制
            </button>
            
            {canWrite && (
              <button
                onClick={() => { onCut(); onClose(); }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
              >
                <Scissors className="w-4 h-4" />
                剪切
              </button>
            )}
            
            {canWrite && (
              <>
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                <button
                  onClick={() => { onRename(); onClose(); }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
                >
                  <Edit3 className="w-4 h-4" />
                  重命名
                </button>
                <button
                  onClick={() => { onDelete(); onClose(); }}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  删除
                </button>
              </>
            )}
            
            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
          </>
        )}

        {/* 通用操作 */}
        <button
          onClick={() => { onRefresh(); onClose(); }}
          className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </motion.div>
    </>
  );
};

// 文件树组件
interface FileTreeProps {
  nodes: FileNode[];
  level?: number;
  selectedPath: string;
  expandedPaths: Set<string>;
  cutPaths: Set<string>;
  onSelect: (node: FileNode) => void;
  onToggleExpand: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  onEmptyContextMenu: (e: React.MouseEvent) => void;
}

const FileTree: React.FC<FileTreeProps> = ({
  nodes,
  level = 0,
  selectedPath,
  expandedPaths,
  cutPaths,
  onSelect,
  onToggleExpand,
  onContextMenu,
  onEmptyContextMenu
}) => {
  return (
    <div className="space-y-1">
      {nodes.map((node) => {
        const isExpanded = expandedPaths.has(node.path);
        const isSelected = selectedPath === node.path;
        const isCut = cutPaths.has(node.path) || cutPaths.has(node.path + '/');

        return (
          <div key={node.path}>
            <motion.div
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                  : isCut
                    ? 'opacity-50 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
              }`}
              style={{ 
                paddingLeft: `${level * 16 + 8}px`,
              }}
              onClick={() => onSelect(node)}
              onContextMenu={(e) => onContextMenu(e, node)}
              whileHover={{ x: isCut ? 0 : 2 }}
            >
              {node.isDirectory ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleExpand(node.path);
                  }}
                  className={`p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded ${isCut ? 'opacity-50' : ''}`}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  )}
                </button>
              ) : (
                <span className={`w-5 ${isCut ? 'opacity-50' : ''}`} />
              )}
              
              <span className={isCut ? 'opacity-50' : ''}>
                {getFileIcon(node.name, node.isDirectory)}
              </span>
              
              <span className={`flex-1 truncate text-sm ${isCut ? 'opacity-50 line-through' : ''}`}>
                {node.name}
              </span>
            </motion.div>
            
            {node.isDirectory && isExpanded && node.children && (
              <FileTree
                nodes={node.children}
                level={level + 1}
                selectedPath={selectedPath}
                expandedPaths={expandedPaths}
                cutPaths={cutPaths}
                onSelect={onSelect}
                onToggleExpand={onToggleExpand}
                onContextMenu={onContextMenu}
                onEmptyContextMenu={onEmptyContextMenu}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

// 主组件
export function PluginManager() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('advanced');
  const [selfId, setSelfId] = useState<string>('');
  const [availableAccounts, setAvailableAccounts] = useState<AccountInfo[]>([]);
  
  const blocklyUnsavedRef = useRef(false);
  const [showModeSwitchDialog, setShowModeSwitchDialog] = useState(false);
  const [pendingModeSwitch, setPendingModeSwitch] = useState<ViewMode | null>(null);
  
  // 左右面板当前查看的账号
  const [leftSelfId, setLeftSelfId] = useState<string>('template');
  const [rightSelfId, setRightSelfId] = useState<string>('');
  
  // 文件树状态
  const [leftFiles, setLeftFiles] = useState<FileNode[]>([]);
  const [rightFiles, setRightFiles] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  
  // 选中和展开状态
  const [selectedLeftPath, setSelectedLeftPath] = useState<string>('');
  const [selectedRightPath, setSelectedRightPath] = useState<string>('');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  
  // 剪贴板状态
  const [clipboard, setClipboard] = useState<ClipboardItem | null>(null);
  
  // 被剪切的文件路径集合（用于显示半透明效果）
  const [cutPaths, setCutPaths] = useState<Set<string>>(new Set());
  
  // 覆盖确认弹窗状态
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const [overwriteTargetName, setOverwriteTargetName] = useState('');
  const [overwriteCallback, setOverwriteCallback] = useState<(confirmed: boolean) => void>(() => {});
  
  // 对话框状态
  const [showCreatePluginDialog, setShowCreatePluginDialog] = useState(false);
  const [showCreateFileDialog, setShowCreateFileDialog] = useState(false);
  const [createFileIsDirectory, setCreateFileIsDirectory] = useState(false);
  const [createFileSide, setCreateFileSide] = useState<'left' | 'right'>('right');
  const [createFileTargetPath, setCreateFileTargetPath] = useState<string>('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteNode, setDeleteNode] = useState<FileNode | null>(null);
  const [deleteConfirmStep, setDeleteConfirmStep] = useState(1);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameNode, setRenameNode] = useState<FileNode | null>(null);
  
  const [showEditor, setShowEditor] = useState(false);
  const [editingFile, setEditingFile] = useState<FileNode | null>(null);
  const [fileContent, setFileContent] = useState('');
  
  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: FileNode | null;
    side: 'left' | 'right';
  } | null>(null);

  // 初始化加载
  useEffect(() => {
    loadAvailableAccounts();
  }, []);

  // 当selfId改变时设置左右面板
  useEffect(() => {
    if (selfId) {
      setRightSelfId(selfId);
      if (leftSelfId === 'template') {
        loadLeftFiles('template');
      }
      loadRightFiles(selfId);
    }
  }, [selfId]);

  // 当左侧面板账号改变时加载
  useEffect(() => {
    loadLeftFiles(leftSelfId);
  }, [leftSelfId]);

  const loadAvailableAccounts = async () => {
    try {
      const res = await pluginManagerApi.getAvailableAccounts();
      if (res.success && res.data.length > 0) {
        setAvailableAccounts(res.data);
        if (!selfId) {
          const firstAccount = res.data[0];
          setSelfId(firstAccount.self_id);
          setRightSelfId(firstAccount.self_id);
        }
      }
    } catch (error) {
      toast.error('加载账号列表失败');
    }
  };

  const loadLeftFiles = async (id: string) => {
    try {
      if (id === 'template') {
        const res = await pluginManagerApi.getTemplateFiles();
        if (res.success) {
          setLeftFiles(res.data);
        }
      } else {
        const res = await pluginManagerApi.getPluginFiles(id);
        if (res.success) {
          setLeftFiles(res.data);
        }
      }
    } catch (error) {
      toast.error('加载左侧文件失败');
    }
  };

  const loadRightFiles = async (id: string) => {
    setLoading(true);
    try {
      const res = await pluginManagerApi.getPluginFiles(id);
      if (res.success) {
        setRightFiles(res.data);
      }
    } catch (error) {
      toast.error('加载右侧文件失败');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleExpand = (path: string) => {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedPaths(newExpanded);
  };

  const isPathWritable = (path: string, side: 'left' | 'right') => {
    const selfIdToCheck = side === 'left' ? leftSelfId : rightSelfId;
    return selfIdToCheck !== 'template';
  };

  const handleSelectLeft = (node: FileNode) => {
    setSelectedLeftPath(node.path);
    if (!node.isDirectory) {
      handlePreviewFile(node, !isPathWritable(node.path, 'left'));
    }
  };

  const handleSelectRight = (node: FileNode) => {
    setSelectedRightPath(node.path);
    if (!node.isDirectory) {
      handlePreviewFile(node, !isPathWritable(node.path, 'right'));
    }
  };

  const handlePreviewFile = async (node: FileNode, isReadOnly: boolean) => {
    try {
      const res = await pluginManagerApi.readFile(node.path);
      if (res.success) {
        setEditingFile(node);
        setFileContent(res.data.content);
        setShowEditor(true);
      }
    } catch (error) {
      toast.error('读取文件失败');
    }
  };

  const handleCreatePlugin = async (name: string) => {
    const parentPath = `/plugins/${rightSelfId}`;
    
    try {
      // 创建插件文件夹
      const folderRes = await pluginManagerApi.createFile(parentPath, name, 'folder');
      if (!folderRes.success) {
        toast.error(folderRes.message || '创建插件文件夹失败');
        return;
      }
      
      // 创建 main.lua
      const luaRes = await pluginManagerApi.createFile(`${parentPath}/${name}`, 'main.lua', 'file');
      if (!luaRes.success) {
        toast.error(luaRes.message || '创建 main.lua 失败');
        return;
      }
      
      // 创建 config.json
      const jsonRes = await pluginManagerApi.createFile(`${parentPath}/${name}`, 'config.json', 'file');
      if (!jsonRes.success) {
        toast.error(jsonRes.message || '创建 config.json 失败');
        return;
      }
      
      toast.success('插件创建成功');
      loadRightFiles(rightSelfId);
    } catch (error) {
      toast.error('创建插件失败');
    }
    setShowCreatePluginDialog(false);
  };

  const handleCreateFile = async (name: string) => {
    const parentPath = createFileTargetPath || `/plugins/${createFileSide === 'left' ? leftSelfId : rightSelfId}`;
    
    try {
      const res = await pluginManagerApi.createFile(parentPath, name, createFileIsDirectory ? 'folder' : 'file');
      if (res.success) {
        toast.success(`${createFileIsDirectory ? '文件夹' : '文件'}创建成功`);
        if (createFileSide === 'left') {
          loadLeftFiles(leftSelfId);
        } else {
          loadRightFiles(rightSelfId);
        }
      }
    } catch (error) {
      toast.error('创建失败');
    }
    setShowCreateFileDialog(false);
  };

  const handleDelete = (node: FileNode) => {
    setDeleteNode(node);
    setDeleteConfirmStep(1);
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteNode) return;

    if (deleteConfirmStep === 1) {
      setDeleteConfirmStep(2);
      return;
    }

    try {
      const res = await pluginManagerApi.deleteFile(deleteNode.path);
      if (res.success) {
        toast.success('删除成功');
        loadRightFiles(rightSelfId);
        loadLeftFiles(leftSelfId);
      }
    } catch (error) {
      toast.error('删除失败');
    }
    setShowDeleteDialog(false);
    setDeleteNode(null);
    setDeleteConfirmStep(1);
  };

  const handleRename = (node: FileNode) => {
    setRenameNode(node);
    setShowRenameDialog(true);
  };

  const handleRenameConfirm = async (newName: string) => {
    if (!renameNode) return;

    try {
      const res = await pluginManagerApi.renameFile(renameNode.path, newName);
      if (res.success) {
        toast.success('重命名成功');
        loadRightFiles(rightSelfId);
        loadLeftFiles(leftSelfId);
      }
    } catch (error) {
      toast.error('重命名失败');
    }
    setShowRenameDialog(false);
    setRenameNode(null);
  };

  const handleSaveFile = async (content: string) => {
    if (!editingFile) return;
    
    try {
      const res = await pluginManagerApi.writeFile(editingFile.path, content);
      if (res.success) {
        toast.success('保存成功');
        setShowEditor(false);
        setEditingFile(null);
      }
    } catch (error) {
      toast.error('保存失败');
      throw error;
    }
  };

  const handleCopy = (node: FileNode, side: 'left' | 'right') => {
    setClipboard({ node, action: 'copy', sourceSide: side });
    toast.success(`已复制: ${node.name}`);
  };

  const handleCut = (node: FileNode, side: 'left' | 'right') => {
    setClipboard({ node, action: 'cut', sourceSide: side });
    
    // 收集被剪切节点及其所有子节点的路径
    const paths = new Set<string>();
    const collectPaths = (n: FileNode) => {
      paths.add(n.path);
      if (n.children) {
        n.children.forEach(collectPaths);
      }
    };
    collectPaths(node);
    setCutPaths(paths);
    
    toast.success(`已剪切: ${node.name}`);
  };

  const handlePaste = async (targetNode: FileNode | null, side: 'left' | 'right', overwrite = false) => {
    if (!clipboard) return;

    const targetPath = targetNode?.isDirectory 
      ? targetNode.path 
      : `/plugins/${side === 'left' ? leftSelfId : rightSelfId}`;
    
    try {
      if (clipboard.action === 'copy') {
        const res = await pluginManagerApi.copyFile(clipboard.node.path, targetPath, overwrite);
        if (res.success) {
          toast.success(overwrite ? '覆盖成功' : '复制成功');
        }
      } else {
        const res = await pluginManagerApi.moveFile(clipboard.node.path, targetPath);
        if (res.success) {
          toast.success('移动成功');
        }
      }
      
      loadRightFiles(rightSelfId);
      loadLeftFiles(leftSelfId);
      setClipboard(null);
      setCutPaths(new Set()); // 清除剪切状态
    } catch (error: any) {
      // 检查是否是目标已存在的错误 (使用新的错误格式)
      if (error.isConflict) {
        const targetName = error.targetName || clipboard.node.name;
        
        // 显示自定义覆盖确认弹窗
        setOverwriteTargetName(targetName);
        setShowOverwriteDialog(true);
        
        // 设置回调函数
        setOverwriteCallback(() => async (confirmed: boolean) => {
          setShowOverwriteDialog(false);
          if (confirmed) {
            // 用户确认覆盖，重新执行粘贴操作
            await handlePaste(targetNode, side, true);
          }
        });
      } else {
        toast.error('操作失败');
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent, node: FileNode | null, side: 'left' | 'right') => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      node,
      side
    });
  };

  const handleSwapSides = () => {
    const tempSelfId = leftSelfId;
    setLeftSelfId(rightSelfId);
    setRightSelfId(tempSelfId);
    loadLeftFiles(rightSelfId);
    loadRightFiles(tempSelfId);
    toast.success('已交换左右目录');
  };

  // 工具栏按钮组件
  interface ToolbarProps {
    side: 'left' | 'right';
    selfId: string;
    onSelfIdChange: (id: string) => void;
    selectedNode: FileNode | null;
    canWrite: boolean;
  }

  const Toolbar: React.FC<ToolbarProps> = ({ side, selfId, onSelfIdChange, selectedNode, canWrite }) => {
    return (
      <div className="flex items-center gap-2 p-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-[#2A2E38]">
        {/* 账号选择 */}
        <select
          value={selfId}
          onChange={(e) => onSelfIdChange(e.target.value)}
          className="px-2 py-1 bg-white dark:bg-[#1D2129] border border-gray-200 dark:border-gray-700 rounded text-sm outline-none text-gray-900 dark:text-white"
        >
          <option value="template">模板目录</option>
          {availableAccounts.map(account => (
            <option key={account.self_id} value={account.self_id}>
              {account.nickname ? `${account.nickname}:${account.self_id}` : `机器人: ${account.self_id}`}
            </option>
          ))}
        </select>

        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />

        {/* 新建插件按钮 - 只在右侧显示 */}
        {side === 'right' && canWrite && (
          <button
            onClick={() => setShowCreatePluginDialog(true)}
            className="p-1.5 text-gray-600 hover:text-[#165DFF] hover:bg-blue-50 rounded transition-colors"
            title="新建插件"
          >
            <FolderPlus className="w-4 h-4" />
          </button>
        )}

        {/* 刷新按钮 */}
        <button
          onClick={() => side === 'left' ? loadLeftFiles(leftSelfId) : loadRightFiles(rightSelfId)}
          className="p-1.5 text-gray-600 hover:text-[#165DFF] hover:bg-blue-50 rounded transition-colors"
          title="刷新"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>

        {selectedNode && (
          <>
            <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
            
            {/* 复制按钮 */}
            <button
              onClick={() => handleCopy(selectedNode, side)}
              className="p-1.5 text-gray-600 hover:text-[#165DFF] hover:bg-blue-50 rounded transition-colors"
              title="复制"
            >
              <Copy className="w-4 h-4" />
            </button>

            {/* 剪切按钮 */}
            {canWrite && (
              <button
                onClick={() => handleCut(selectedNode, side)}
                className="p-1.5 text-gray-600 hover:text-[#165DFF] hover:bg-blue-50 rounded transition-colors"
                title="剪切"
              >
                <Scissors className="w-4 h-4" />
              </button>
            )}

            {/* 粘贴按钮 */}
            {clipboard && canWrite && (
              <button
                onClick={() => handlePaste(selectedNode, side)}
                className="p-1.5 text-gray-600 hover:text-[#165DFF] hover:bg-blue-50 rounded transition-colors"
                title="粘贴"
              >
                <FolderInput className="w-4 h-4" />
              </button>
            )}

            {/* 重命名按钮 */}
            {canWrite && (
              <button
                onClick={() => handleRename(selectedNode)}
                className="p-1.5 text-gray-600 hover:text-[#165DFF] hover:bg-blue-50 rounded transition-colors"
                title="重命名"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            )}

            {/* 删除按钮 */}
            {canWrite && (
              <button
                onClick={() => handleDelete(selectedNode)}
                className="p-1.5 text-gray-600 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                title="删除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </>
        )}
      </div>
    );
  };

  // 简易模式视图
  const SimpleModeView = () => (
    <div className="flex-1 min-h-0 overflow-visible">
      <BlocklyEditor 
        onExport={() => {
          loadRightFiles(rightSelfId);
        }}
        onUnsavedChange={(hasUnsaved) => {
          blocklyUnsavedRef.current = hasUnsaved;
        }}
        onModeSwitch={() => handleModeSwitch('advanced')}
      />
    </div>
  );

  const handleModeSwitch = (newMode: ViewMode) => {
    if (viewMode === 'simple' && blocklyUnsavedRef.current) {
      setPendingModeSwitch(newMode);
      setShowModeSwitchDialog(true);
    } else {
      setViewMode(newMode);
    }
  };

  const confirmModeSwitch = () => {
    if (pendingModeSwitch) {
      setViewMode(pendingModeSwitch);
      blocklyUnsavedRef.current = false;
    }
    setShowModeSwitchDialog(false);
    setPendingModeSwitch(null);
  };

  const getSelectedNode = (side: 'left' | 'right'): FileNode | null => {
    const path = side === 'left' ? selectedLeftPath : selectedRightPath;
    const files = side === 'left' ? leftFiles : rightFiles;
    return findNodeByPath(files, path);
  };

  // 获取当前右键菜单对应的节点
  const getContextMenuNode = (): FileNode | null => {
    if (!contextMenu) return null;
    if (contextMenu.node) return contextMenu.node;
    return null;
  };

  return (
    <div className="flex flex-col h-full">
      {viewMode === 'simple' ? (
        <SimpleModeView />
      ) : (
        <>
          {/* 头部 */}
          <motion.div
            className="flex-shrink-0 flex items-center justify-between bg-white dark:bg-[#1D2129] p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 mb-4"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-500" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">插件管理</h1>
                <p className="text-sm text-gray-500">管理机器人插件文件</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* 模式切换 */}
              <div className="flex bg-gray-100 dark:bg-[#2A2E38] rounded-lg p-1">
                <button
                  onClick={() => handleModeSwitch('simple')}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    viewMode === 'simple'
                      ? 'bg-white dark:bg-[#1D2129] text-[#165DFF] shadow-sm'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  简易模式
                </button>
                <button
                  onClick={() => handleModeSwitch('advanced')}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    viewMode === 'advanced'
                      ? 'bg-white dark:bg-[#1D2129] text-[#165DFF] shadow-sm'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  高级模式
                </button>
              </div>

              {/* 插件仓库按钮 */}
              <button
                onClick={() => toast.info('这个功能还没写呢ava')}
                className="px-4 py-2 bg-[#165DFF] text-white rounded-lg hover:bg-[#0047FF] transition-colors flex items-center gap-2"
              >
                <FolderOpen className="w-4 h-4" />
                插件仓库
              </button>
            </div>
          </motion.div>

          {/* 内容区域 */}
          <div className="flex-1 min-h-0 flex gap-4 relative">
          {/* 左侧面板 */}
          <motion.div
            className="flex-1 bg-white dark:bg-[#1D2129] rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col overflow-hidden"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-yellow-500" />
                <h2 className="font-bold text-gray-900 dark:text-white">源目录</h2>
                {leftSelfId === 'template' && (
                  <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 rounded">
                    模板
                  </span>
                )}
              </div>
            </div>
            
            <Toolbar
              side="left"
              selfId={leftSelfId}
              onSelfIdChange={setLeftSelfId}
              selectedNode={getSelectedNode('left')}
              canWrite={leftSelfId !== 'template'}
            />
            
            <div 
              className="flex-1 overflow-auto p-2 relative"
              onContextMenu={(e) => handleContextMenu(e, null, 'left')}
            >
              <FileTree
                nodes={leftFiles}
                selectedPath={selectedLeftPath}
                expandedPaths={expandedPaths}
                cutPaths={cutPaths}
                onSelect={handleSelectLeft}
                onToggleExpand={handleToggleExpand}
                onContextMenu={(e, node) => handleContextMenu(e, node, 'left')}
                onEmptyContextMenu={(e) => handleContextMenu(e, null, 'left')}
              />
              {/* 底部空白区域用于右键 */}
              <div 
                className="h-32 mt-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg flex items-center justify-center text-gray-400 text-sm"
                onContextMenu={(e) => handleContextMenu(e, null, 'left')}
              >
                {/* 可以右键哦OVO */}
              </div>
            </div>
          </motion.div>

          {/* 交换按钮 - 当两边都不是模板时显示 */}
          {leftSelfId !== 'template' && rightSelfId !== 'template' && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
              <button
                onClick={handleSwapSides}
                className="pointer-events-auto p-3 bg-white dark:bg-[#1D2129] rounded-full shadow-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                title="交换左右目录"
              >
                <ArrowRightLeft className="w-5 h-5 text-[#165DFF]" />
              </button>
            </div>
          )}

          {/* 右侧面板 */}
          <motion.div
            className="flex-1 bg-white dark:bg-[#1D2129] rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col overflow-hidden"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-blue-500" />
                <h2 className="font-bold text-gray-900 dark:text-white">目标目录</h2>
                {rightSelfId === 'template' && (
                  <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 rounded">
                    模板
                  </span>
                )}
              </div>
            </div>
            
            <Toolbar
              side="right"
              selfId={rightSelfId}
              onSelfIdChange={(id) => {
                setRightSelfId(id);
                loadRightFiles(id);
              }}
              selectedNode={getSelectedNode('right')}
              canWrite={rightSelfId !== 'template'}
            />
            
            <div 
              className="flex-1 overflow-auto p-2 relative"
              onContextMenu={(e) => handleContextMenu(e, null, 'right')}
            >
              {rightFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                  <FolderOpen className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-sm">暂无插件文件</p>
                  {rightSelfId !== 'template' && (
                    <button
                      onClick={() => setShowCreatePluginDialog(true)}
                      className="mt-4 px-4 py-2 bg-[#165DFF] text-white rounded-lg hover:bg-[#0047FF] transition-colors text-sm"
                    >
                      创建新插件
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <FileTree
                    nodes={rightFiles}
                    selectedPath={selectedRightPath}
                    expandedPaths={expandedPaths}
                    cutPaths={cutPaths}
                    onSelect={handleSelectRight}
                    onToggleExpand={handleToggleExpand}
                    onContextMenu={(e, node) => handleContextMenu(e, node, 'right')}
                    onEmptyContextMenu={(e) => handleContextMenu(e, null, 'right')}
                  />
                  {/* 底部空白区域用于右键 */}
                  <div 
                    className="h-32 mt-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg flex items-center justify-center text-gray-400 text-sm"
                    onContextMenu={(e) => handleContextMenu(e, null, 'right')}
                  >
                    可以右键哦OVO
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
        </>
      )}

      {/* 对话框 */}
      <AnimatePresence>
        {showCreatePluginDialog && (
          <CreatePluginDialog
            isOpen={showCreatePluginDialog}
            onConfirm={handleCreatePlugin}
            onCancel={() => setShowCreatePluginDialog(false)}
          />
        )}

        {showCreateFileDialog && (
          <CreateFileDialog
            isOpen={showCreateFileDialog}
            isDirectory={createFileIsDirectory}
            onConfirm={handleCreateFile}
            onCancel={() => setShowCreateFileDialog(false)}
          />
        )}

        {showDeleteDialog && deleteNode && (
          <ConfirmDialog
            isOpen={showDeleteDialog}
            title={deleteConfirmStep === 1 ? '确认删除' : '最终确认'}
            message={
              deleteConfirmStep === 1
                ? `您确定要删除 "${deleteNode.name}" 吗？此操作不可恢复。`
                : `您即将永久删除 "${deleteNode.name}"。请输入文件名以确认。`
            }
            confirmText={deleteConfirmStep === 1 ? '继续' : '永久删除'}
            danger
            requireConfirmText={deleteConfirmStep === 2}
            confirmPlaceholder={deleteNode.name}
            onConfirm={handleDeleteConfirm}
            onCancel={() => {
              setShowDeleteDialog(false);
              setDeleteNode(null);
              setDeleteConfirmStep(1);
            }}
          />
        )}

        {showRenameDialog && renameNode && (
          <RenameDialog
            isOpen={showRenameDialog}
            currentName={renameNode.name}
            onConfirm={handleRenameConfirm}
            onCancel={() => {
              setShowRenameDialog(false);
              setRenameNode(null);
            }}
          />
        )}

        {/* 覆盖确认弹窗 */}
        {showOverwriteDialog && (
          <ConfirmDialog
            isOpen={showOverwriteDialog}
            title="文件已存在"
            message={`目标位置已存在 "${overwriteTargetName}"，是否覆盖？`}
            confirmText="覆盖"
            cancelText="取消"
            danger
            onConfirm={() => overwriteCallback(true)}
            onCancel={() => overwriteCallback(false)}
          />
        )}

        {showEditor && editingFile && (
          <FileEditor
            isOpen={showEditor}
            fileName={editingFile.name}
            content={fileContent}
            isReadOnly={!isPathWritable(editingFile.path, 'right') && !isPathWritable(editingFile.path, 'left')}
            onSave={handleSaveFile}
            onClose={() => {
              setShowEditor(false);
              setEditingFile(null);
            }}
          />
        )}

        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            node={contextMenu.node}
            side={contextMenu.side}
            canWrite={isPathWritable('', contextMenu.side)}
            hasClipboard={!!clipboard}
            onClose={() => setContextMenu(null)}
            onOpen={() => {
              if (contextMenu.node && !contextMenu.node.isDirectory) {
                handlePreviewFile(contextMenu.node, !isPathWritable(contextMenu.node.path, contextMenu.side));
              }
            }}
            onCopy={() => contextMenu.node && handleCopy(contextMenu.node, contextMenu.side)}
            onCut={() => contextMenu.node && handleCut(contextMenu.node, contextMenu.side)}
            onPaste={() => handlePaste(contextMenu.node, contextMenu.side)}
            onRename={() => contextMenu.node && handleRename(contextMenu.node)}
            onDelete={() => contextMenu.node && handleDelete(contextMenu.node)}
            onCreatePlugin={() => {
              if (contextMenu.side === 'right') {
                setShowCreatePluginDialog(true);
              } else if (leftSelfId !== 'template') {
                setCreateFileSide('left');
                setCreateFileTargetPath(`/plugins/${leftSelfId}`);
                setCreateFileIsDirectory(true);
                setShowCreateFileDialog(true);
              }
            }}
            onCreateFolder={() => {
              setCreateFileSide(contextMenu.side);
              setCreateFileTargetPath(contextMenu.node?.path || `/plugins/${contextMenu.side === 'left' ? leftSelfId : rightSelfId}`);
              setCreateFileIsDirectory(true);
              setShowCreateFileDialog(true);
            }}
            onCreateFile={() => {
              setCreateFileSide(contextMenu.side);
              setCreateFileTargetPath(contextMenu.node?.path || `/plugins/${contextMenu.side === 'left' ? leftSelfId : rightSelfId}`);
              setCreateFileIsDirectory(false);
              setShowCreateFileDialog(true);
            }}
            onRefresh={() => {
              if (contextMenu.side === 'left') {
                loadLeftFiles(leftSelfId);
              } else {
                loadRightFiles(rightSelfId);
              }
            }}
          />
        )}

        {showModeSwitchDialog && (
          <ConfirmDialog
            isOpen={showModeSwitchDialog}
            title="未保存的更改"
            message="您有未保存的更改，切换模式将丢失这些更改。确定要切换吗？"
            confirmText="切换"
            cancelText="取消"
            danger
            onConfirm={confirmModeSwitch}
            onCancel={() => {
              setShowModeSwitchDialog(false);
              setPendingModeSwitch(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// 辅助函数：根据路径查找节点
function findNodeByPath(nodes: FileNode[], path: string): FileNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.children) {
      const found = findNodeByPath(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

// FolderPlus 图标组件
const FolderPlus: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    <line x1="12" y1="10" x2="12" y2="16" />
    <line x1="9" y1="13" x2="15" y2="13" />
  </svg>
);
