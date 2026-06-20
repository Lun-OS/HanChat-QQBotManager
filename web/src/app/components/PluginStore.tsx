import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import {
  X,
  RefreshCw,
  Download,
  Check,
  AlertCircle,
  Loader2,
  Search,
  Trash2,
  HardDrive,
  Package,
  FileCode,
  Puzzle,
  ChevronDown,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import {
  pluginStoreApi,
  type PluginStoreEntry,
  type PluginStoreIndex,
  type InstallStatus,
  type BlocklyConfigStoreEntry,
  type BlocklyConfigStoreIndex,
  type InstalledPluginInfo,
} from '../services/api';

type PluginType = 'lua' | 'blockly' | 'blockly_config';

interface PluginStoreProps {
  isOpen: boolean;
  onClose: () => void;
  onInstallComplete?: () => void;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  downloading: { label: '下载中', color: 'text-blue-500', icon: <Loader2 className="w-4 h-4 animate-spin" /> },
  verifying: { label: '验证中', color: 'text-yellow-500', icon: <Loader2 className="w-4 h-4 animate-spin" /> },
  extracting: { label: '解压中', color: 'text-purple-500', icon: <Loader2 className="w-4 h-4 animate-spin" /> },
  installing: { label: '安装中', color: 'text-indigo-500', icon: <Loader2 className="w-4 h-4 animate-spin" /> },
  success: { label: '安装成功', color: 'text-green-500', icon: <Check className="w-4 h-4" /> },
  error: { label: '安装失败', color: 'text-red-500', icon: <AlertCircle className="w-4 h-4" /> },
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatTime(timeStr: string): string {
  try {
    const date = new Date(timeStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '昨天';
    if (diffDays < 30) return `${diffDays}天前`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}个月前`;
    return `${Math.floor(diffDays / 365)}年前`;
  } catch {
    return timeStr;
  }
}

export function PluginStore({ isOpen, onClose, onInstallComplete }: PluginStoreProps) {
  const [activeTab, setActiveTab] = useState<PluginType>('lua');
  const [luaIndex, setLuaIndex] = useState<PluginStoreIndex | null>(null);
  const [blocklyIndex, setBlocklyIndex] = useState<PluginStoreIndex | null>(null);
  const [blocklyConfigIndex, setBlocklyConfigIndex] = useState<BlocklyConfigStoreIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [installStatuses, setInstallStatuses] = useState<Record<string, InstallStatus>>({});
  const [cacheInfo, setCacheInfo] = useState<{ file_count: number; total_size: number } | null>(null);
  const [showCachePanel, setShowCachePanel] = useState(false);
  const [installedPlugins, setInstalledPlugins] = useState<InstalledPluginInfo[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const indexUrlsRef = useRef<{ lua: string; blockly: string; blockly_config: string }>({ lua: '', blockly: '', blockly_config: '' });

  const loadIndexUrls = useCallback(async () => {
    try {
      const res = await pluginStoreApi.getConfig();
      if (res.success) {
        indexUrlsRef.current = {
          lua: res.data.index_lua_url,
          blockly: res.data.index_blockly_url,
          blockly_config: res.data.index_blockly_config_url,
        };
      }
    } catch (error: any) {
      toast.error('获取仓库配置失败');
    }
  }, []);

  const fetchIndexFromUrl = useCallback(async (url: string): Promise<PluginStoreIndex | null> => {
    if (!url) return null;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      return data as PluginStoreIndex;
    } catch (error: any) {
      toast.error(`获取索引失败: ${error?.message || '未知错误'}`);
      return null;
    }
  }, []);

  const loadIndex = useCallback(async (type: PluginType) => {
    setLoading(true);
    const url = indexUrlsRef.current[type];
    if (!url) {
      await loadIndexUrls();
    }
    const fetchUrl = indexUrlsRef.current[type] || url;
    const index = await fetchIndexFromUrl(fetchUrl);
    if (index) {
      if (type === 'lua') {
        setLuaIndex(index as PluginStoreIndex);
      } else if (type === 'blockly') {
        setBlocklyIndex(index as PluginStoreIndex);
      } else if (type === 'blockly_config') {
        setBlocklyConfigIndex(index as BlocklyConfigStoreIndex);
      }
    }
    setLoading(false);
  }, [fetchIndexFromUrl, loadIndexUrls]);

  const loadCacheInfo = useCallback(async () => {
    try {
      const res = await pluginStoreApi.getCacheInfo();
      if (res.success) {
        setCacheInfo(res.data);
      }
    } catch {}
  }, []);

  const loadInstalledPlugins = useCallback(async () => {
    try {
      const res = await pluginStoreApi.getInstalledPlugins();
      if (res.success) {
        setInstalledPlugins(res.data);
      }
    } catch {}
  }, []);

  const pollStatus = useCallback(async () => {
    try {
      const res = await pluginStoreApi.getStatus();
      if (res.success) {
        setInstallStatuses(res.data);
        const hasActive = Object.values(res.data).some(
          s => s.status !== 'success' && s.status !== 'error'
        );
        if (!hasActive && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          onInstallComplete?.();
        }
      }
    } catch {}
  }, [onInstallComplete]);

  useEffect(() => {
    if (isOpen) {
      loadIndexUrls().then(() => {
        loadIndex('lua');
        loadIndex('blockly');
        loadIndex('blockly_config');
      });
      loadCacheInfo();
      loadInstalledPlugins();
      pollStatus();
    }
  }, [isOpen]);

  useEffect(() => {
    const hasActive = Object.values(installStatuses).some(
      s => s.status !== 'success' && s.status !== 'error'
    );
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(pollStatus, 2000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [installStatuses, pollStatus]);

  const handleInstall = async (type: PluginType, entry: PluginStoreEntry) => {
    try {
      const res = await pluginStoreApi.installPlugin({
        type,
        name: entry.name,
        version: entry.version,
        index_url: entry.index_url,
        sha256_hash: entry.sha256_hash,
      });
      if (res.success) {
        toast.success(`开始安装插件: ${entry.name}`);
        setInstallStatuses(prev => ({
          ...prev,
          [entry.name]: {
            plugin_name: entry.name,
            plugin_type: type,
            status: 'downloading',
            message: '正在下载...',
          },
        }));
        if (!pollRef.current) {
          pollRef.current = setInterval(pollStatus, 2000);
        }
      }
    } catch (error: any) {
      toast.error(`安装失败: ${error?.message || '未知错误'}`);
    }
  };

  const handleInstallConfig = async (entry: BlocklyConfigStoreEntry) => {
    try {
      const res = await pluginStoreApi.installPlugin({
        type: 'blockly_config',
        name: entry.name,
        version: entry.version,
        index_url: entry.index_url,
        sha256_hash: entry.sha256_hash,
      });
      if (res.success) {
        toast.success(`开始安装积木配置: ${entry.name}`);
        setInstallStatuses(prev => ({
          ...prev,
          [entry.name]: {
            plugin_name: entry.name,
            plugin_type: 'blockly_config',
            status: 'downloading',
            message: '正在下载...',
          },
        }));
        if (!pollRef.current) {
          pollRef.current = setInterval(pollStatus, 2000);
        }
      }
    } catch (error: any) {
      toast.error(`安装失败: ${error?.message || '未知错误'}`);
    }
  };

  const handleUninstall = async (type: PluginType, name: string) => {
    try {
      const res = await pluginStoreApi.uninstallPlugin(type, name);
      if (res.success) {
        toast.success(`已卸载: ${name}`);
        loadInstalledPlugins();
        // 清除该插件的安装状态
        setInstallStatuses(prev => {
          const newStatuses = { ...prev };
          delete newStatuses[name];
          return newStatuses;
        });
      }
    } catch (error: any) {
      toast.error(`卸载失败: ${error?.message || '未知错误'}`);
    }
  };

  // 版本比较函数：如果remoteVersion > localVersion返回true
  const isVersionHigher = (remoteVersion: string, localVersion: string): boolean => {
    if (!localVersion) return true;
    const parseVersion = (v: string) => v.replace(/^v/, '').split('.').map(n => parseInt(n) || 0);
    const remote = parseVersion(remoteVersion);
    const local = parseVersion(localVersion);
    for (let i = 0; i < Math.max(remote.length, local.length); i++) {
      const r = remote[i] || 0;
      const l = local[i] || 0;
      if (r > l) return true;
      if (r < l) return false;
    }
    return false;
  };

  // 获取已安装插件的信息
  const getInstalledInfo = (name: string, type: PluginType): InstalledPluginInfo | undefined => {
    return installedPlugins.find(p => p.name === name && p.type === type);
  };

  const handleCleanCache = async () => {
    try {
      const res = await pluginStoreApi.cleanCache();
      if (res.success) {
        toast.success('缓存清理完成');
        loadCacheInfo();
      }
    } catch (error: any) {
      toast.error(`清理缓存失败: ${error?.message || '未知错误'}`);
    }
  };

  const handleRefresh = () => {
    loadIndex(activeTab);
    loadCacheInfo();
    loadInstalledPlugins();
    pollStatus();
  };

  const currentIndex = activeTab === 'lua' ? luaIndex : activeTab === 'blockly' ? blocklyIndex : null;
  const currentConfigIndex = activeTab === 'blockly_config' ? blocklyConfigIndex : null;
  const filteredPlugins = currentIndex?.plugins?.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.author.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];
  const filteredConfigs = currentConfigIndex?.configs?.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.author.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const getInstallStatus = (name: string): InstallStatus | undefined => {
    return installStatuses[name];
  };

  const isInstalling = (name: string): boolean => {
    const s = getInstallStatus(name);
    return s ? s.status !== 'success' && s.status !== 'error' : false;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

        <motion.div
          className="relative w-[90vw] max-w-4xl h-[80vh] bg-white dark:bg-[#1D2129] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#165DFF] to-[#7B61FF] flex items-center justify-center">
                <Package className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">插件仓库</h2>
                <p className="text-xs text-gray-500">浏览并安装社区插件</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                className="p-2 text-gray-500 hover:text-[#165DFF] hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                title="刷新"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setShowCachePanel(!showCachePanel)}
                className="p-2 text-gray-500 hover:text-[#165DFF] hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                title="缓存管理"
              >
                <HardDrive className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Cache Panel */}
          <AnimatePresence>
            {showCachePanel && (
              <motion.div
                className="flex-shrink-0 px-6 py-3 bg-gray-50 dark:bg-[#2A2E38] border-b border-gray-100 dark:border-gray-800"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <HardDrive className="w-4 h-4" />
                      <span>缓存文件: {cacheInfo?.file_count ?? 0} 个</span>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      占用空间: {cacheInfo ? formatFileSize(cacheInfo.total_size) : '0 B'}
                    </div>
                  </div>
                  <button
                    onClick={handleCleanCache}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    清理缓存
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tab + Search */}
          <div className="flex-shrink-0 px-6 py-3 flex items-center gap-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex bg-gray-100 dark:bg-[#2A2E38] rounded-lg p-1">
              <button
                onClick={() => { setActiveTab('lua'); setSearchQuery(''); }}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeTab === 'lua'
                    ? 'bg-white dark:bg-[#1D2129] text-[#165DFF] shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <FileCode className="w-4 h-4" />
                Lua 插件
              </button>
              <button
                onClick={() => { setActiveTab('blockly'); setSearchQuery(''); }}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeTab === 'blockly'
                    ? 'bg-white dark:bg-[#1D2129] text-[#165DFF] shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Puzzle className="w-4 h-4" />
                Blockly 插件
              </button>
              <button
                onClick={() => { setActiveTab('blockly_config'); setSearchQuery(''); }}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeTab === 'blockly_config'
                    ? 'bg-white dark:bg-[#1D2129] text-[#165DFF] shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Puzzle className="w-4 h-4" />
                积木配置
              </button>
            </div>

            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="搜索插件名称、描述或作者..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-[#2A2E38] border border-gray-200 dark:border-gray-700 rounded-lg text-sm outline-none focus:border-[#165DFF] focus:ring-1 focus:ring-[#165DFF]/20 text-gray-900 dark:text-white placeholder-gray-400 transition-colors"
              />
            </div>
          </div>

          {/* Index Info */}
          {currentIndex && (
            <div className="flex-shrink-0 px-6 py-2 bg-blue-50/50 dark:bg-blue-900/10 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <ExternalLink className="w-3 h-3" />
                <span>{currentIndex.repo_name}</span>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <span>{currentIndex.description}</span>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <span>共 {currentIndex.plugins?.length ?? 0} 个插件</span>
              </div>
            </div>
          )}
          {currentConfigIndex && (
            <div className="flex-shrink-0 px-6 py-2 bg-orange-50/50 dark:bg-orange-900/10 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <ExternalLink className="w-3 h-3" />
                <span>{currentConfigIndex.repo_name}</span>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <span>{currentConfigIndex.description}</span>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <span>共 {currentConfigIndex.configs?.length ?? 0} 个配置</span>
              </div>
            </div>
          )}

          {/* Plugin List */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading && !currentIndex && !currentConfigIndex ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-[#165DFF]" />
                <p className="text-sm">正在加载插件索引...</p>
              </div>
            ) : activeTab === 'blockly_config' ? (
              // 积木配置列表
              !currentConfigIndex ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                  <Package className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-sm">无法加载积木配置索引</p>
                  <p className="text-xs text-gray-400 mt-1">请检查仓库索引URL配置是否正确</p>
                  <button
                    onClick={handleRefresh}
                    className="mt-4 px-4 py-2 text-sm bg-[#165DFF] text-white rounded-lg hover:bg-[#0047FF] transition-colors"
                  >
                    重新加载
                  </button>
                </div>
              ) : filteredConfigs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                  <Search className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-sm">
                    {searchQuery ? `未找到匹配 "${searchQuery}" 的积木配置` : '暂无积木配置'}
                  </p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {filteredConfigs.map((config) => {
                    const installedInfo = getInstalledInfo(config.name, 'blockly_config');
                    return (
                      <ConfigCard
                        key={config.name}
                        config={config}
                        installStatus={getInstallStatus(config.name)}
                        isInstalling={isInstalling(config.name)}
                        onInstall={handleInstallConfig}
                        onUninstall={handleUninstall}
                        installedInfo={installedInfo}
                        isUpdateAvailable={installedInfo ? isVersionHigher(config.version, installedInfo.version) : false}
                      />
                    );
                  })}
                </div>
              )
            ) : (
              // 插件列表
              !currentIndex ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                  <Package className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-sm">无法加载插件索引</p>
                  <p className="text-xs text-gray-400 mt-1">请检查仓库索引URL配置是否正确</p>
                  <button
                    onClick={handleRefresh}
                    className="mt-4 px-4 py-2 text-sm bg-[#165DFF] text-white rounded-lg hover:bg-[#0047FF] transition-colors"
                  >
                    重新加载
                  </button>
                </div>
              ) : filteredPlugins.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                  <Search className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-sm">
                    {searchQuery ? `未找到匹配 "${searchQuery}" 的插件` : '暂无插件'}
                  </p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {filteredPlugins.map((plugin) => {
                    const installedInfo = getInstalledInfo(plugin.name, activeTab);
                    return (
                      <PluginCard
                        key={plugin.name}
                        plugin={plugin}
                        type={activeTab}
                        installStatus={getInstallStatus(plugin.name)}
                        isInstalling={isInstalling(plugin.name)}
                        onInstall={handleInstall}
                        onUninstall={handleUninstall}
                        installedInfo={installedInfo}
                        isUpdateAvailable={installedInfo ? isVersionHigher(plugin.version, installedInfo.version) : false}
                      />
                    );
                  })}
                </div>
              )
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

interface PluginCardProps {
  plugin: PluginStoreEntry;
  type: PluginType;
  installStatus?: InstallStatus;
  isInstalling: boolean;
  onInstall: (type: PluginType, entry: PluginStoreEntry) => void;
  onUninstall: (type: PluginType, name: string) => void;
  installedInfo?: InstalledPluginInfo;
  isUpdateAvailable?: boolean;
}

function PluginCard({ plugin, type, installStatus, isInstalling, onInstall, onUninstall, installedInfo, isUpdateAvailable }: PluginCardProps) {
  const [expanded, setExpanded] = useState(false);

  const statusInfo = installStatus ? statusConfig[installStatus.status] : null;
  const isInstalled = !!installedInfo || installStatus?.status === 'success';
  const isError = installStatus?.status === 'error';

  return (
    <motion.div
      className="bg-white dark:bg-[#2A2E38] rounded-xl border border-gray-100 dark:border-gray-700 hover:border-[#165DFF]/30 dark:hover:border-[#165DFF]/30 transition-all overflow-hidden"
      layout
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                {plugin.name}
              </h3>
              <span className="flex-shrink-0 px-2 py-0.5 text-xs bg-[#165DFF]/10 text-[#165DFF] rounded-full font-medium">
                v{plugin.version}
              </span>
              {type === 'lua' ? (
                <FileCode className="w-4 h-4 text-blue-500 flex-shrink-0" />
              ) : (
                <Puzzle className="w-4 h-4 text-purple-500 flex-shrink-0" />
              )}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
              {plugin.description}
            </p>
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
              <span>作者: {plugin.author}</span>
              <span>更新: {formatTime(plugin.update_time)}</span>
            </div>
          </div>

          <div className="flex-shrink-0 flex flex-col items-end gap-2">
            {isInstalled ? (
              <div className="flex items-center gap-2">
                {isUpdateAvailable ? (
                  <button
                    onClick={() => onInstall(type, plugin)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                    更新
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <Check className="w-4 h-4" />
                    已安装
                  </div>
                )}
                <button
                  onClick={() => onUninstall(type, plugin.name)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="卸载"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : isInstalling ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                {statusInfo?.icon}
                {statusInfo?.label}
              </div>
            ) : isError ? (
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <AlertCircle className="w-4 h-4" />
                  失败
                </div>
                <button
                  onClick={() => onInstall(type, plugin)}
                  className="px-3 py-1 text-xs text-[#165DFF] hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                >
                  重试
                </button>
              </div>
            ) : (
              <button
                onClick={() => onInstall(type, plugin)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#165DFF] rounded-lg hover:bg-[#0047FF] transition-colors shadow-sm"
              >
                <Download className="w-4 h-4" />
                安装
              </button>
            )}
          </div>
        </div>

        {isError && installStatus?.message && (
          <div className="mt-2 px-3 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 rounded-lg">
            {installStatus.message}
          </div>
        )}

        {isInstalling && installStatus?.message && (
          <div className="mt-2 px-3 py-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10 rounded-lg">
            {installStatus.message}
          </div>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          {expanded ? '收起详情' : '查看详情'}
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="pt-3 space-y-2 text-xs text-gray-500 dark:text-gray-400">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-gray-400">插件名称:</span>{' '}
                  <span className="text-gray-700 dark:text-gray-300">{plugin.name}</span>
                </div>
                <div>
                  <span className="text-gray-400">版本:</span>{' '}
                  <span className="text-gray-700 dark:text-gray-300">{plugin.version}</span>
                </div>
                <div>
                  <span className="text-gray-400">作者:</span>{' '}
                  <span className="text-gray-700 dark:text-gray-300">{plugin.author}</span>
                </div>
                <div>
                  <span className="text-gray-400">更新时间:</span>{' '}
                  <span className="text-gray-700 dark:text-gray-300">{new Date(plugin.update_time).toLocaleString()}</span>
                </div>
              </div>
              <div>
                <span className="text-gray-400">SHA256:</span>{' '}
                <span className="font-mono text-gray-600 dark:text-gray-300 break-all">{plugin.sha256_hash}</span>
              </div>
              <div>
                <span className="text-gray-400">下载地址:</span>{' '}
                <span className="font-mono text-gray-600 dark:text-gray-300 break-all">{plugin.index_url}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface ConfigCardProps {
  config: BlocklyConfigStoreEntry;
  installStatus?: InstallStatus;
  isInstalling: boolean;
  onInstall: (entry: BlocklyConfigStoreEntry) => void;
  onUninstall: (type: PluginType, name: string) => void;
  installedInfo?: InstalledPluginInfo;
  isUpdateAvailable?: boolean;
}

function ConfigCard({ config, installStatus, isInstalling, onInstall, onUninstall, installedInfo, isUpdateAvailable }: ConfigCardProps) {
  const [expanded, setExpanded] = useState(false);

  const statusInfo = installStatus ? statusConfig[installStatus.status] : null;
  const isInstalled = !!installedInfo || installStatus?.status === 'success';
  const isError = installStatus?.status === 'error';

  return (
    <motion.div
      className="bg-white dark:bg-[#2A2E38] rounded-xl border border-gray-100 dark:border-gray-700 hover:border-[#165DFF]/30 dark:hover:border-[#165DFF]/30 transition-all overflow-hidden"
      layout
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                {config.name}
              </h3>
              <span className="flex-shrink-0 px-2 py-0.5 text-xs bg-[#165DFF]/10 text-[#165DFF] rounded-full font-medium">
                v{config.version}
              </span>
              <Puzzle className="w-4 h-4 text-orange-500 flex-shrink-0" />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
              {config.description}
            </p>
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
              <span>作者: {config.author}</span>
              <span>更新: {formatTime(config.update_time)}</span>
            </div>
          </div>

          <div className="flex-shrink-0 flex flex-col items-end gap-2">
            {isInstalled ? (
              <div className="flex items-center gap-2">
                {isUpdateAvailable ? (
                  <button
                    onClick={() => onInstall(config)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                    更新
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <Check className="w-4 h-4" />
                    已安装
                  </div>
                )}
                <button
                  onClick={() => onUninstall('blockly_config', config.name)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="卸载"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : isInstalling ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                {statusInfo?.icon}
                {statusInfo?.label}
              </div>
            ) : isError ? (
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <AlertCircle className="w-4 h-4" />
                  失败
                </div>
                <button
                  onClick={() => onInstall(config)}
                  className="px-3 py-1 text-xs text-[#165DFF] hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                >
                  重试
                </button>
              </div>
            ) : (
              <button
                onClick={() => onInstall(config)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#165DFF] rounded-lg hover:bg-[#0047FF] transition-colors shadow-sm"
              >
                <Download className="w-4 h-4" />
                安装
              </button>
            )}
          </div>
        </div>

        {isError && installStatus?.message && (
          <div className="mt-2 px-3 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 rounded-lg">
            {installStatus.message}
          </div>
        )}

        {isInstalling && installStatus?.message && (
          <div className="mt-2 px-3 py-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10 rounded-lg">
            {installStatus.message}
          </div>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          {expanded ? '收起详情' : '查看详情'}
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="pt-3 space-y-2 text-xs text-gray-500 dark:text-gray-400">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-gray-400">配置名称:</span>{' '}
                  <span className="text-gray-700 dark:text-gray-300">{config.name}</span>
                </div>
                <div>
                  <span className="text-gray-400">版本:</span>{' '}
                  <span className="text-gray-700 dark:text-gray-300">{config.version}</span>
                </div>
                <div>
                  <span className="text-gray-400">作者:</span>{' '}
                  <span className="text-gray-700 dark:text-gray-300">{config.author}</span>
                </div>
                <div>
                  <span className="text-gray-400">更新时间:</span>{' '}
                  <span className="text-gray-700 dark:text-gray-300">{new Date(config.update_time).toLocaleString()}</span>
                </div>
              </div>
              <div>
                <span className="text-gray-400">SHA256:</span>{' '}
                <span className="font-mono text-gray-600 dark:text-gray-300 break-all">{config.sha256_hash}</span>
              </div>
              <div>
                <span className="text-gray-400">配置地址:</span>{' '}
                <span className="font-mono text-gray-600 dark:text-gray-300 break-all">{config.index_url}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
