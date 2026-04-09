import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Save, Github, FileText, HelpCircle, Shield, Clock, Trash2, Globe, Info, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { settingsApi, systemApi } from '../services/api';

// 前端版本号（从环境变量读取，默认为v4.8）
const FRONTEND_VERSION = import.meta.env.VITE_APP_VERSION || 'v4.8';

export function Settings() {
  const [websocketAuthorization, setWebsocketAuthorization] = useState('');
  const [backendVersion, setBackendVersion] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showWebsocketAuth, setShowWebsocketAuth] = useState(false);

  // 获取后端版本和当前设置
  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      // 获取系统信息（包含后端版本）
      const versionRes = await systemApi.getSystemInfo();
      if (versionRes.success && versionRes.data) {
        setBackendVersion(versionRes.data.version || '未知');
      }

      // 获取当前WS Token设置
      const settingsRes = await settingsApi.getSettings();
      if (settingsRes.success && settingsRes.data) {
        setWebsocketAuthorization(settingsRes.data.websocket_authorization || '');
      }
    } catch (error) {
      console.error('获取设置失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 输入验证：检查是否包含控制字符
  const containsInvalidChars = (str: string): boolean => {
    // 禁止控制字符（0-31）和DEL（127），但允许正常的空白字符
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) {
        return true;
      }
    }
    return false;
  };

  // 保存设置
  const handleSave = async () => {
    // 前端输入验证
    const maxLength = 512;

    if (websocketAuthorization.length > maxLength) {
      toast.error('WebSocket Authorization 长度不能超过512字符');
      return;
    }

    if (containsInvalidChars(websocketAuthorization)) {
      toast.error('WebSocket Authorization 包含非法字符');
      return;
    }

    try {
      setSaving(true);
      const res = await settingsApi.saveSettings({
        websocket_authorization: websocketAuthorization
      });
      if (res.success) {
        toast.success('设置已保存（正在连接的不受影响）');
      } else {
        toast.error('保存失败: ' + (res.message || '未知错误'));
      }
    } catch (error) {
      console.error('保存设置失败:', error);
      toast.error('保存设置失败');
    } finally {
      setSaving(false);
    }
  };

  // 清除浏览器缓存
  const handleClearCache = async () => {
    if (confirm('确定要清除浏览器缓存吗？这将清除所有本地存储的数据和JS资源缓存。')) {
      try {
        // 清除 localStorage
        localStorage.clear();
        // 清除 sessionStorage
        sessionStorage.clear();

        // 清除所有类型的缓存（包括JS/CSS/图片等资源）
        if ('caches' in window) {
          try {
            const cacheNames = await caches.keys();
            await Promise.all(
              cacheNames.map(cacheName => caches.delete(cacheName))
            );
          } catch (e) {
            console.log('清除Cache API缓存失败:', e);
          }
        }

        // 尝试清除Service Worker缓存
        if ('serviceWorker' in navigator) {
          try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(
              registrations.map(registration => registration.unregister())
            );
          } catch (e) {
            console.log('清除Service Worker失败:', e);
          }
        }

        // 清除IndexedDB
        if ('indexedDB' in window) {
          try {
            const databases = await indexedDB.databases?.() || [];
            databases.forEach(db => {
              if (db.name) {
                indexedDB.deleteDatabase(db.name);
              }
            });
          } catch (e) {
            console.log('清除IndexedDB失败:', e);
          }
        }

        toast.success('浏览器缓存已清除（包括JS资源）');
        // 强制刷新页面（不使用缓存）
        window.location.reload();
      } catch (error) {
        console.error('清除缓存失败:', error);
        toast.error('清除缓存失败');
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-6 overflow-y-auto h-full">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">系统设置</h1>
        <p className="text-gray-500 dark:text-gray-400">管理您的系统配置和偏好设置</p>
      </motion.div>

      {/* WebSocket Token 设置 */}
      <motion.div
        className="bg-white dark:bg-[#1D2129] rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        whileHover={{ y: -2 }}
      >
        <div className="p-6 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center">
            <Shield className="w-5 h-5 text-[#165DFF] mr-2" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">连接设置</h2>
          </div>
          <p className="text-sm text-gray-500 mt-1">设置 LLBot WebSocket 连接的 Token（可留空）</p>
        </div>
        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              WebSocket Authorization(token)
            </label>
            <div className="relative">
              <input
                type={showWebsocketAuth ? "text" : "password"}
                value={websocketAuthorization}
                onChange={(e) => setWebsocketAuthorization(e.target.value)}
                placeholder="留空表示不使用Authorization"
                className="w-full p-2.5 pr-10 bg-gray-50 dark:bg-[#2A2E38] border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-[#165DFF] transition-all"
              />
              <button
                type="button"
                onClick={() => setShowWebsocketAuth(!showWebsocketAuth)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showWebsocketAuth ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              修改后正在连接的不受影响，新连接将使用新Token
            </p>
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 dark:bg-[#2A2E38]/50 border-t border-gray-100 dark:border-gray-800 flex justify-end">
          <motion.button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center px-4 py-2 bg-[#165DFF] text-white rounded-lg text-sm hover:bg-[#0047FF] transition-colors shadow-md hover:shadow-lg disabled:opacity-50"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {saving ? '保存中...' : '保存更改'}
          </motion.button>
        </div>
      </motion.div>

      {/* 浏览器缓存 */}
      <motion.div
        className="bg-white dark:bg-[#1D2129] rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        whileHover={{ y: -2 }}
      >
        <div className="p-6 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center">
            <Trash2 className="w-5 h-5 text-red-500 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">浏览器缓存</h2>
          </div>
          <p className="text-sm text-gray-500 mt-1">清除浏览器本地存储的数据</p>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">清除缓存</h3>
              <p className="text-xs text-gray-500 mt-1">清除 localStorage、sessionStorage 和缓存的API响应</p>
            </div>
            <motion.button
              onClick={handleClearCache}
              className="flex items-center px-4 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 transition-colors"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              清除缓存
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* 软件信息 */}
      <motion.div
        className="bg-white dark:bg-[#1D2129] rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        whileHover={{ y: -2 }}
      >
        <div className="p-6 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center">
            <Info className="w-5 h-5 text-[#165DFF] mr-2" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">软件信息</h2>
          </div>
        </div>
        <div className="p-6">
          <div className="flex items-center mb-6">
            <div className="w-12 h-12 bg-gradient-to-tr from-[#165DFF] to-cyan-400 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-500/30 mr-4">
              <span className="text-lg font-bold">H</span>
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">HanChat-QQBotManager</h3>
              <p className="text-sm text-gray-500">前端 {FRONTEND_VERSION} / 后端 {loading ? '加载中...' : backendVersion}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="bg-gray-50 dark:bg-[#2A2E38] p-3 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">前端版本</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{FRONTEND_VERSION}</p>
            </div>
            <div className="bg-gray-50 dark:bg-[#2A2E38] p-3 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">后端版本</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{loading ? '-' : backendVersion}</p>
            </div>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            OVO 偷懒的第N天
          </p>
          <div className="flex flex-wrap gap-3">
            <motion.a
              href="https://github.com/Lun-OS/HanChat-QQBotManager"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center text-[#165DFF] hover:underline text-sm px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Github className="w-4 h-4 mr-1" />
              GitHub 仓库
            </motion.a>
            <motion.a
              href="https://github.com/Lun-OS/HanChat-QQBotManager/docs/index.md"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center text-[#165DFF] hover:underline text-sm px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <FileText className="w-4 h-4 mr-1" />
              文档中心
            </motion.a>
            <motion.a
              href="https://github.com/Lun-OS/HanChat-QQBotManager/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center text-[#165DFF] hover:underline text-sm px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <HelpCircle className="w-4 h-4 mr-1" />
              提交反馈
            </motion.a>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
