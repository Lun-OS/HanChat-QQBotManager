import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useBotStore } from '../stores/botStore';
import { BotStatus } from '../constants';
import { motion, AnimatePresence } from 'motion/react';
import Editor from '@monaco-editor/react';
import { 
  ArrowLeft, 
  Activity, 
  Terminal, 
  Package, 
  FileText, 
  Settings,
  Send,
  RefreshCw,
  Play,
  Pause,
  TrendingUp,
  Users,
  RotateCcw,
  X,
  Search,
  Download,
  Save,
  ShieldCheck,
  Copy,
  Code,
  ChevronDown,
  Network,
  AlertCircle,
  Plus,
  Trash2,
  Filter,
  Minus
} from 'lucide-react';
import { toast } from 'sonner';
import { validateImageUrl, getSafeQQAvatarUrl } from '../utils/security';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import apiTemplatesData from '../resources/ApiDebugTMPL.json';
import { 
  accountApi,
  botApi, 
  pluginApi, 
  systemApi,
  logApi,
  settingsApi,
  PluginInfo,
  proxyApi
} from '../services/api';

// --- Types ---
interface BotStats {
  uptime: string;
  msg_received: number;
  msg_sent: number;
  llbot_version: string;
  ws_name: string;
}

interface ApiTemplate {
  PS: string;
  PS_json: Record<string, [string, string, string]>;
  json: Record<string, any>;
}

interface ApiTemplates {
  [key: string]: ApiTemplate;
}

// --- BotOverview Component ---
const BotOverview = ({ selfId }: { selfId: string }) => {
  const { bots } = useBotStore();
  const bot = bots.find(b => b.self_id === selfId);

  const [stats, setStats] = useState<BotStats>({
    uptime: '-',
    msg_received: 0,
    msg_sent: 0,
    llbot_version: '-',
    ws_name: '-',
  });
  const [loading, setLoading] = useState(true);
  const [friendCount, setFriendCount] = useState<number>(0);
  const [groupCount, setGroupCount] = useState<number>(0);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);

      const statusRes = await systemApi.getStatus(selfId);
      const versionRes = await systemApi.getVersionInfo(selfId);

      let stat = {};
      const statusData = statusRes.data?.data || statusRes.data;
      if (statusData) {
        stat = statusData.stat || {};
      }

      let versionData = {};
      const verData = versionRes.data?.data || versionRes.data;
      if (verData) {
        versionData = verData;
      }

      let wsName = '-';
      try {
        const containerRes = await pluginApi.getAccountContainers();
        if (containerRes.success && containerRes.data) {
          const container = containerRes.data.find((c: any) => c.self_id === selfId);
          if (container) {
            wsName = container.ws_name || bot?.custom_name || '-';
          }
        }
      } catch {
        // 忽略容器信息获取失败
      }

      setStats({
        uptime: formatUptime((stat as any).startup_time),
        msg_received: (stat as any).message_received || 0,
        msg_sent: (stat as any).message_sent || 0,
        llbot_version: (versionData as any).app_version || (versionData as any).version || '-',
        ws_name: wsName,
      });

      try {
        const friendRes = await botApi.getFriendList(selfId);
        const friendData = friendRes?.data?.data || friendRes?.data;
        setFriendCount(Array.isArray(friendData) ? friendData.length : 0);
      } catch { setFriendCount(0); }

      try {
        const groupRes = await botApi.getGroupList(selfId);
        const groupData = groupRes?.data?.data || groupRes?.data;
        setGroupCount(Array.isArray(groupData) ? groupData.length : 0);
      } catch { setGroupCount(0); }
    } catch (e: any) {
      // 账号离线/不存在是正常状态，不弹错误提示
      if (e?.status !== 404 && !e?.message?.includes('账号不存在')) {
        toast.error('获取统计数据失败');
      }
    } finally {
      setLoading(false);
    }
  }, [selfId, bot]);

  const formatUptime = (startupTime: number): string => {
    if (!startupTime) return '-';
    const now = Math.floor(Date.now() / 1000);
    const diff = now - startupTime;
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    if (days > 0) return `${days}天${hours}小时${minutes}分钟`;
    if (hours > 0) return `${hours}小时${minutes}分钟`;
    return `${minutes}分钟`;
  };

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-[#165DFF] dark:text-white/60" />
      </div>
    );
  }

  const statCards = [
    { label: '运行时间', value: stats.uptime, icon: Activity, gradient: 'from-[#165DFF]/20 to-[#165DFF]/5 dark:from-white/10 dark:to-white/5', bg: 'bg-white dark:bg-white/[0.03]' },
    { label: '收到消息', value: stats.msg_received.toLocaleString(), icon: TrendingUp, gradient: 'from-[#165DFF]/20 to-[#165DFF]/5 dark:from-white/10 dark:to-white/5', bg: 'bg-white dark:bg-white/[0.03]' },
    { label: '发送消息', value: stats.msg_sent.toLocaleString(), icon: Send, gradient: 'from-[#165DFF]/20 to-[#165DFF]/5 dark:from-white/10 dark:to-white/5', bg: 'bg-white dark:bg-white/[0.03]' },
    { label: '好友数', value: friendCount.toLocaleString(), icon: Users, gradient: 'from-[#165DFF]/20 to-[#165DFF]/5 dark:from-white/10 dark:to-white/5', bg: 'bg-white dark:bg-white/[0.03]' },
    { label: '群组数', value: groupCount.toLocaleString(), icon: Package, gradient: 'from-[#165DFF]/20 to-[#165DFF]/5 dark:from-white/10 dark:to-white/5', bg: 'bg-white dark:bg-white/[0.03]' },
  ];

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {statCards.map((stat, idx) => (
          <motion.div
            key={idx}
            className="bg-white dark:bg-[#1D2129] dark:backdrop-blur-xl rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden hover:shadow-md transition-shadow"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.08 }}
          >
            <div className={`h-1 bg-gradient-to-r ${stat.gradient}`} />
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{stat.label}</span>
                <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div
          className="bg-white dark:bg-[#1D2129] dark:backdrop-blur-xl rounded-xl border border-gray-100 dark:border-gray-800 p-5"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Settings className="w-4 h-4 text-gray-900 dark:text-white" />
            系统信息
          </h3>
          <div className="space-y-3">
            {[
              { label: '框架版本', value: stats.llbot_version },
              { label: 'WS 名称', value: stats.ws_name },
              { label: 'QQ 号', value: selfId },
              { label: '状态', value: bot?.status === BotStatus.ONLINE ? '在线' : '离线' },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                <span className="text-sm text-gray-500 dark:text-gray-400">{item.label}</span>
                <span className={`text-sm font-medium ${
                  item.label === '状态'
                    ? (item.value === '在线' ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400')
                    : 'text-gray-900 dark:text-white'
                }`}>
                  {item.label === '状态' && (
                    <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${item.value === '在线' ? 'bg-green-500' : 'bg-gray-400'}`} />
                  )}
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          className="bg-white dark:bg-[#1D2129] dark:backdrop-blur-xl rounded-xl border border-gray-100 dark:border-gray-800 p-5"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-gray-900 dark:text-white" />
            消息统计
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-500 dark:text-gray-400">收到消息</span>
                <span className="text-xs font-medium text-gray-900 dark:text-white">{stats.msg_received.toLocaleString()}</span>
              </div>
              <div className="h-2 bg-gray-50 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#165DFF]/50 to-[#165DFF]/20 dark:from-white/30 dark:to-white/10 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (stats.msg_received / Math.max(stats.msg_received + stats.msg_sent, 1)) * 100)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-500 dark:text-gray-400">发送消息</span>
                <span className="text-xs font-medium text-gray-900 dark:text-white">{stats.msg_sent.toLocaleString()}</span>
              </div>
              <div className="h-2 bg-gray-50 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#165DFF]/40 to-[#165DFF]/15 dark:from-white/25 dark:to-white/8 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (stats.msg_sent / Math.max(stats.msg_received + stats.msg_sent, 1)) * 100)}%` }}
                />
              </div>
            </div>
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 dark:text-gray-400">消息总量</span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">{(stats.msg_received + stats.msg_sent).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div
        className="flex justify-end"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <motion.button
          onClick={fetchStats}
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-[#165DFF] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <RefreshCw className="w-4 h-4" />
          刷新数据
        </motion.button>
      </motion.div>
    </motion.div>
  );
};

// --- ApiDebug Component ---
const ApiDebug = ({ botId }: { botId: string }) => {
  const templates = apiTemplatesData as unknown as ApiTemplates;
  const [openApis, setOpenApis] = useState<string[]>([]);
  const [activeApi, setActiveApi] = useState<string | null>(null);
  const [requestBody, setRequestBody] = useState('{}');
  const [response, setResponse] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteSearch, setPaletteSearch] = useState('');
  const [activeEditorTab, setActiveEditorTab] = useState<'request' | 'docs'>('request');
  const [responseExpanded, setResponseExpanded] = useState(true);
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [requestPath, setRequestPath] = useState('');
  const paletteInputRef = useRef<HTMLInputElement>(null);

  const extractEndpoint = (templateKey: string): string => {
    const colonIndex = templateKey.indexOf(':');
    return colonIndex > 0 ? templateKey.substring(0, colonIndex) : templateKey;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(prev => !prev);
        setPaletteSearch('');
      }
      if (e.key === 'Escape' && paletteOpen) {
        setPaletteOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [paletteOpen]);

  useEffect(() => {
    if (paletteOpen && paletteInputRef.current) {
      setTimeout(() => paletteInputRef.current?.focus(), 50);
    }
  }, [paletteOpen]);

  const openApi = (templateKey: string) => {
    if (!openApis.includes(templateKey)) {
      setOpenApis(prev => [...prev, templateKey]);
    }
    setActiveApi(templateKey);
    const template = templates[templateKey];
    if (template) {
      setRequestBody(JSON.stringify(template.json, null, 2));
    }
    setRequestPath(extractEndpoint(templateKey));
    setActiveEditorTab('request');
    setResponse('');
    setResponseStatus(null);
    setPaletteOpen(false);
    setPaletteSearch('');
  };

  const closeApi = (templateKey: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newOpenApis = openApis.filter(k => k !== templateKey);
    setOpenApis(newOpenApis);
    if (activeApi === templateKey) {
      setActiveApi(newOpenApis.length > 0 ? newOpenApis[newOpenApis.length - 1] : null);
    }
  };

  const handleSend = async () => {
    if (!activeApi) {
      toast.error('请先选择一个接口');
      return;
    }
    setIsFetching(true);
    setResponse('');
    setResponseStatus(null);
    try {
      const body = JSON.parse(requestBody);
      const endpoint = requestPath || extractEndpoint(activeApi);
      const result = await botApi.callApi(botId, endpoint, body);
      setResponse(JSON.stringify(result, null, 2));
      setResponseStatus(200);
      if (result.retcode === 0) {
        toast.success('请求成功');
      } else {
        toast.error(result.message || '请求失败');
      }
    } catch (error: any) {
      setResponse(JSON.stringify({ error: error.message }, null, 2));
      setResponseStatus(500);
      toast.error('请求失败: ' + error.message);
    } finally {
      setIsFetching(false);
    }
  };

  const handleCopyResponse = () => {
    if (response) {
      navigator.clipboard.writeText(response);
      toast.success('已复制响应');
    }
  };

  const filteredTemplates = Object.entries(templates).filter(([key, template]) =>
    key.toLowerCase().includes(paletteSearch.toLowerCase()) ||
    template.PS.toLowerCase().includes(paletteSearch.toLowerCase())
  );

  const currentTemplate = activeApi ? templates[activeApi] : null;

  return (
    <motion.div
      className="backdrop-blur-sm bg-white dark:bg-[#1D2129] border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden flex flex-col"
      style={{ height: 'calc(100vh - 280px)', minHeight: '500px' }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center gap-1 px-3 py-2 bg-gray-50 dark:bg-white/5 rounded-t-xl border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-none">
          {openApis.map(apiKey => (
            <div
              key={apiKey}
              onClick={() => { setActiveApi(apiKey); setRequestBody(JSON.stringify(templates[apiKey]?.json ?? {}, null, 2)); setRequestPath(extractEndpoint(apiKey)); setResponse(''); setResponseStatus(null); }}
              className={`flex items-center gap-2 px-3 h-8 rounded-md cursor-pointer shrink-0 transition-colors ${
                activeApi === apiKey
                  ? 'bg-[#165DFF]/15 dark:bg-white/15 font-medium text-[#165DFF] dark:text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.05]'
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-[#165DFF] text-white dark:bg-white/10 dark:text-white">POST</span>
              <span className="text-xs truncate max-w-[120px]">{templates[apiKey]?.PS ?? extractEndpoint(apiKey)}</span>
              <button
                onClick={(e) => closeApi(apiKey, e)}
                className="ml-1 w-4 h-4 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 hover:text-[#165DFF] dark:hover:text-white transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => { setPaletteOpen(true); setPaletteSearch(''); }}
          className="flex items-center gap-1.5 px-3 h-8 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.05] transition-colors shrink-0"
          title="Ctrl+K 搜索接口"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="text-xs">搜索</span>
          <kbd className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded bg-[#165DFF]/10 dark:bg-white/10 font-mono text-[#165DFF] dark:text-white">⌘K</kbd>
        </button>
      </div>

      {activeApi && currentTemplate ? (
        <>
          <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-white/[0.04]">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-[#165DFF] text-white dark:bg-white/10 dark:text-white shrink-0">POST</span>
              <span className="text-gray-500 dark:text-gray-400 shrink-0">/</span>
              <input
                type="text"
                value={requestPath}
                onChange={e => setRequestPath(e.target.value)}
                className="flex-1 min-w-0 bg-transparent font-mono text-sm text-gray-900/90 dark:text-white/90 outline-none border-none placeholder-gray-400"
                placeholder="请求路径"
              />
            </div>
            <button
              onClick={handleSend}
              disabled={isFetching}
              className="bg-[#165DFF] text-white dark:bg-white dark:text-black rounded-md px-4 h-8 font-bold hover:bg-[#0047FF] dark:hover:bg-gray-200 transition-colors flex items-center gap-2 disabled:opacity-50 shrink-0"
            >
              {isFetching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              发送
            </button>
          </div>

          <div className="flex items-center gap-4 px-4 pt-2 border-b border-gray-100 dark:border-gray-800">
            <button
              onClick={() => setActiveEditorTab('request')}
              className={`text-xs font-medium pb-2 border-b-2 transition-colors ${
                activeEditorTab === 'request'
                  ? 'border-[#165DFF] text-[#165DFF] dark:border-white/40 dark:text-white'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              请求体
            </button>
            <button
              onClick={() => setActiveEditorTab('docs')}
              className={`text-xs font-medium pb-2 border-b-2 transition-colors ${
                activeEditorTab === 'docs'
                  ? 'border-[#165DFF] text-[#165DFF] dark:border-white/40 dark:text-white'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              接口文档
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            {activeEditorTab === 'request' ? (
              <Editor
                height="100%"
                language="json"
                value={requestBody}
                onChange={val => setRequestBody(val ?? '{}')}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  padding: { top: 8 },
                  wordWrap: 'on',
                }}
              />
            ) : (
              <div className="p-4 overflow-auto h-full">
                <div className="mb-4">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">
                    {currentTemplate.PS}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                    {extractEndpoint(activeApi)}
                  </p>
                </div>
                {Object.keys(currentTemplate.PS_json).length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">参数说明</h4>
                    <div className="space-y-2">
                      {Object.entries(currentTemplate.PS_json).map(([fieldName, fieldConfig]) => {
                        const [type, description, defaultValue] = fieldConfig;
                        const isRequired = defaultValue === '必须';
                        return (
                          <div key={fieldName} className="flex items-start gap-3 p-2 rounded-lg bg-gray-50 dark:bg-white/[0.03]">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <code className="text-xs font-mono font-bold text-gray-700 dark:text-gray-300">{fieldName}</code>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-gray-400">{type}</span>
                                {isRequired && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-gray-400">必填</span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
                              {!isRequired && defaultValue && (
                                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">默认: {defaultValue}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800">
            <div
              onClick={() => setResponseExpanded(!responseExpanded)}
              className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.05] transition-colors"
            >
              <ChevronDown className={`w-3.5 h-3.5 text-gray-500 dark:text-gray-400 transition-transform ${responseExpanded ? '' : '-rotate-90'}`} />
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Response</span>
              {responseStatus !== null && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  responseStatus >= 200 && responseStatus < 300
                    ? 'bg-[#165DFF]/10 text-[#165DFF] dark:bg-white/10 dark:text-white'
                    : 'bg-[#165DFF]/10 text-[#165DFF] dark:bg-white/10 dark:text-gray-400'
                }`}>
                  {responseStatus} {responseStatus < 300 ? 'OK' : 'Error'}
                </span>
              )}
              <div className="flex-1" />
              {response && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleCopyResponse(); }}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                >
                  <Copy className="w-3 h-3" />
                  复制
                </button>
              )}
            </div>
            <AnimatePresence>
              {responseExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 200, opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="h-[200px] bg-gray-950 overflow-auto">
                    {response ? (
                      <Editor
                        height="100%"
                        language="json"
                        value={response}
                        theme="vs-dark"
                        options={{
                          readOnly: true,
                          minimap: { enabled: false },
                          fontSize: 12,
                          lineNumbers: 'on',
                          scrollBeyondLastLine: false,
                          automaticLayout: true,
                          padding: { top: 8 },
                          wordWrap: 'on',
                        }}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-600 text-sm select-none">
                        等待请求...
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 gap-4">
          <Code className="w-12 h-12 opacity-30" />
          <p className="text-sm">按 <kbd className="px-1.5 py-0.5 rounded bg-[#165DFF]/10 dark:bg-white/10 font-mono text-xs text-[#165DFF] dark:text-white">Ctrl+K</kbd> 搜索并打开接口</p>
        </div>
      )}

      <AnimatePresence>
        {paletteOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[20vh]"
            onClick={() => setPaletteOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: -10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="bg-white dark:bg-black/80 dark:backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-100 dark:border-white/[0.06] w-full max-w-lg overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center border-b border-gray-100 dark:border-white/[0.06]">
                <Search className="w-4 h-4 text-gray-500 dark:text-gray-400 ml-4 shrink-0" />
                <input
                  ref={paletteInputRef}
                  type="text"
                  value={paletteSearch}
                  onChange={e => setPaletteSearch(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      setPaletteOpen(false);
                    }
                    if (e.key === 'Enter' && filteredTemplates.length > 0) {
                      openApi(filteredTemplates[0][0]);
                    }
                  }}
                  placeholder="搜索接口..."
                  className="w-full p-4 bg-transparent text-lg outline-none text-gray-900 dark:text-white placeholder-gray-400"
                />
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                {filteredTemplates.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">未找到匹配的接口</div>
                ) : (
                  filteredTemplates.map(([key, template]) => (
                    <button
                      key={key}
                      onClick={() => openApi(key)}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-white/[0.05] transition-colors text-left"
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-[#165DFF] text-white dark:bg-white/10 dark:text-white shrink-0">POST</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{template.PS}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">{extractEndpoint(key)}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// --- Plugins Component ---
const Plugins = ({ selfId }: { selfId: string }) => {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedPlugin, setSelectedPlugin] = useState<PluginInfo | null>(null);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [pluginConfig, setPluginConfig] = useState<Record<string, any>>({});
  const [pluginConfigText, setPluginConfigText] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [pluginLogs, setPluginLogs] = useState<string[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [configMode, setConfigMode] = useState<'simple' | 'advanced'>('simple');
  const [isJsonValid, setIsJsonValid] = useState(true);

  // 当配置弹窗打开时，同步文本并验证JSON格式
  useEffect(() => {
    if (configModalOpen && selectedPlugin) {
      setPluginConfigText(JSON.stringify(pluginConfig, null, 2));
      // 验证JSON格式
      try {
        JSON.parse(JSON.stringify(pluginConfig, null, 2));
        setIsJsonValid(true);
      } catch {
        setIsJsonValid(false);
        setConfigMode('simple');
      }
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [configModalOpen, selectedPlugin, pluginConfig]);

  const fetchPlugins = useCallback(async () => {
    try {
      setLoading(true);
      // 获取指定账号的插件列表
      const res = await pluginApi.getPluginList(selfId);
      if (res.success) {
        setPlugins(res.data);
      } else {
        toast.error('获取插件列表失败');
      }
    } catch (error) {
      toast.error('获取插件列表失败');
    } finally {
      setLoading(false);
    }
  }, [selfId]);

  useEffect(() => {
    fetchPlugins();
  }, [fetchPlugins]);

  // 检查插件文件是否存在
  const handleCheckPluginFiles = async () => {
    try {
      setLoading(true);
      const res = await pluginApi.checkPluginFiles();
      if (res.success) {
        if (res.data.removed_count > 0) {
          toast.success(`检查完成，已清理 ${res.data.removed_count} 个丢失文件的插件`);
        } else {
          toast.success('检查完成，所有插件文件正常');
        }
        await fetchPlugins();
      } else {
        toast.error(res.message || '检查失败');
      }
    } catch (error) {
      toast.error('检查插件文件失败');
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePlugin = async (plugin: PluginInfo) => {
    setActionLoading(plugin.name);
    try {
      if (plugin.running) {
        // 卸载指定账号的插件
        const res = await pluginApi.unloadPlugin(selfId, plugin.name);
        if (res.success) {
          toast.success(`插件 ${plugin.name} 已卸载`);
        } else {
          toast.error(res.message || '卸载失败');
        }
      } else {
        // 加载插件到指定账号
        const res = await pluginApi.loadPlugin(selfId, plugin.name);
        if (res.success) {
          toast.success(`插件 ${plugin.name} 已加载`);
        } else {
          toast.error(res.message || '加载失败');
        }
      }
      await fetchPlugins();
    } catch (error: any) {
      toast.error(error.message || '操作失败');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestartPlugin = async (plugin: PluginInfo) => {
    setActionLoading(`restart:${plugin.name}`);
    try {
      const res = await pluginApi.restartPlugin(selfId, plugin.name);
      if (res.success) {
        toast.success(`插件 ${plugin.name} 已重启`);
      } else {
        toast.error(res.message || '重启失败');
      }
      await fetchPlugins();
    } catch (error: any) {
      toast.error(error.message || '重启失败');
    } finally {
      setActionLoading(null);
    }
  };

  const openConfigModal = async (plugin: PluginInfo) => {
    setSelectedPlugin(plugin);
    setConfigModalOpen(true);
    try {
      // 获取指定账号的插件配置
      const res = await pluginApi.getPluginConfig(selfId, plugin.name);
      if (res.success) {
        const config = res.data || {};
        setPluginConfig(config);
        const configText = JSON.stringify(config, null, 2);
        setPluginConfigText(configText);
        // 验证JSON格式
        try {
          JSON.parse(configText);
          setIsJsonValid(true);
        } catch {
          setIsJsonValid(false);
        }
      }
    } catch (error) {
      toast.error('获取配置失败');
      const config = plugin.config || {};
      setPluginConfig(config);
      const configText = JSON.stringify(config, null, 2);
      setPluginConfigText(configText);
      try {
        JSON.parse(configText);
        setIsJsonValid(true);
      } catch {
        setIsJsonValid(false);
      }
    }
  };

  const openLogModal = async (plugin: PluginInfo) => {
    setSelectedPlugin(plugin);
    setLogModalOpen(true);
    setLoadingLogs(true);
    try {
      // 获取插件日志，限制100条
      const res = await pluginApi.getPluginLogs(selfId, plugin.name, 100);
      if (res.success) {
        setPluginLogs(res.data || []);
      } else {
        // 根据后端 err_code 显示精确的中文提示
        const code = (res as any).err_code;
        let message = res.message || '获取插件日志失败';
        // 2002 = 插件未运行
        // 2005 = 插件不存在
        // 1002 = 账号容器不存在
        if (code === 2002 || code === 2005) {
          // 直接显示后端消息（已包含"插件「xxx」未启动"）
          toast.warning(message);
        } else if (code === 1002) {
          toast.warning('账号未连接，无法获取日志');
        } else {
          toast.error(message);
        }
        setPluginLogs([]);
      }
    } catch (error: any) {
      // 网络错误或后端 502 等无 err_code 场景
      const errMsg = error?.response?.data?.message || '获取插件日志失败';
      toast.error(errMsg);
      setPluginLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!selectedPlugin) return;
    setSavingConfig(true);
    try {
      // 保存指定账号的插件配置
      const res = await pluginApi.savePluginConfig(selfId, selectedPlugin.name, pluginConfig);
      if (res.success) {
        toast.success('配置已保存');
        setConfigModalOpen(false);
        await fetchPlugins();
      } else {
        toast.error(res.message || '保存失败');
      }
    } catch (error: any) {
      toast.error(error.message || '保存失败');
    } finally {
      setSavingConfig(false);
    }
  };

  const filteredPlugins = plugins.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-[#165DFF] dark:text-white/60" />
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-6 flex flex-col overflow-hidden"
      style={{ maxHeight: 'calc(100vh - 280px)' }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex justify-between items-center bg-white dark:bg-[#1D2129] dark:backdrop-blur-xl p-4 rounded-xl border border-gray-100 dark:border-gray-800 flex-shrink-0">
        <div className="relative">
          <input
            type="text"
            placeholder="搜索插件..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 bg-gray-50 dark:bg-white/[0.03] rounded-lg text-sm w-64 border-none outline-none focus:ring-2 focus:ring-[#165DFF] dark:focus:ring-white/20 text-gray-900 dark:text-white"
          />
          <Search className="w-4 h-4 text-gray-500 dark:text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        </div>
        <div className="flex gap-2">
          <motion.button
            onClick={handleCheckPluginFiles}
            className="p-2 text-gray-500 dark:text-gray-400 hover:text-[#165DFF] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.05] rounded-lg transition-colors"
            title="检查插件文件"
            whileHover={{ scale: 1.1 }}
            transition={{ duration: 0.2 }}
          >
            <ShieldCheck className="w-5 h-5" />
          </motion.button>
          <motion.button
            onClick={fetchPlugins}
            className="p-2 text-gray-500 dark:text-gray-400 hover:text-[#165DFF] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.05] rounded-lg transition-colors"
            whileHover={{ rotate: 180 }}
            transition={{ duration: 0.3 }}
          >
            <RefreshCw className="w-5 h-5" />
          </motion.button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 350px)' }}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 content-start">
          {filteredPlugins.map((plugin, idx) => (
          <motion.div 
            key={`${plugin.self_id}/${plugin.name}`}
            className="bg-white dark:bg-[#1D2129] dark:backdrop-blur-xl p-6 rounded-xl border border-gray-100 dark:border-gray-800 flex flex-col justify-between h-48 group hover:border-[#165DFF]/30 dark:hover:border-white/20 transition-all hover:shadow-lg"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.05 }}
            whileHover={{ y: -4 }}
          >
            <div>
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-gray-900 dark:text-white text-lg">{plugin.name}</h3>
                <motion.span 
                  className={`w-2 h-2 rounded-full ${plugin.running ? 'bg-green-500' : 'bg-gray-400'}`}
                  animate={plugin.running ? { scale: [1, 1.2, 1] } : {}}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                {plugin.version ? `v${plugin.version}` : '未指定版本'}
                {plugin.remark && <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{plugin.remark}</span>}
              </p>
            </div>
            
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <motion.button 
                  onClick={() => handleTogglePlugin(plugin)}
                  disabled={actionLoading === plugin.name}
                  className={`p-2 rounded-lg transition-colors ${
                    plugin.running 
                      ? 'text-white bg-[#165DFF] dark:text-white dark:bg-white/10 hover:bg-[#0047FF] dark:hover:bg-white/15' 
                      : 'text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-white/[0.03] hover:bg-gray-100 dark:hover:bg-white/[0.05]'
                  }`}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  title={plugin.running ? '卸载插件' : '加载插件'}
                >
                  {actionLoading === plugin.name ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : plugin.running ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                </motion.button>
                <motion.button 
                  onClick={() => handleRestartPlugin(plugin)}
                  disabled={actionLoading === `restart:${plugin.name}`}
                  className="p-2 text-gray-500 dark:text-gray-400 hover:text-[#165DFF] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.05] rounded-lg transition-colors"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  title="重启插件"
                >
                  {actionLoading === `restart:${plugin.name}` ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4" />
                  )}
                </motion.button>
              </div>
              <div className="flex items-center gap-2">
                <motion.button 
                  onClick={() => openLogModal(plugin)}
                  className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.05] rounded-lg transition-colors"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  title="查看日志"
                >
                  <FileText className="w-4 h-4" />
                </motion.button>
                <motion.button 
                  onClick={() => openConfigModal(plugin)}
                  className="p-2 text-gray-500 dark:text-gray-400 hover:text-[#165DFF] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.05] rounded-lg transition-colors"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  title="配置"
                >
                  <Settings className="w-4 h-4" />
                </motion.button>
              </div>
            </div>
          </motion.div>
        ))}
        </div>
      </div>

      {filteredPlugins.length === 0 && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>暂无插件</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">请在 /plugins/{selfId}/ 目录下添加插件</p>
        </div>
      )}

      {/* Config Modal */}
      <AnimatePresence>
        {configModalOpen && selectedPlugin && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setConfigModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-black/80 dark:backdrop-blur-xl rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-white/[0.06]">
                <div className="flex items-center gap-4">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    配置: {selectedPlugin.name}
                  </h3>
                  <div className="flex bg-gray-100 dark:bg-white/[0.06] rounded-lg p-1">
                    <button
                      onClick={() => setConfigMode('simple')}
                      disabled={!isJsonValid}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                        configMode === 'simple'
                          ? 'bg-[#165DFF] text-white dark:bg-white/10 dark:text-white'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                      }`}
                    >
                      可视化模式
                    </button>
                    <button
                      onClick={() => setConfigMode('advanced')}
                      disabled={!isJsonValid}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                        configMode === 'advanced'
                          ? 'bg-[#165DFF] text-white dark:bg-white/10 dark:text-white'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                      }`}
                    >
                      高级模式
                    </button>
                  </div>
                  {!isJsonValid && (
                    <span className="text-xs text-orange-500">配置文件格式异常，仅支持简易模式编辑</span>
                  )}
                </div>
                <button
                  onClick={() => setConfigModalOpen(false)}
                  className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {configMode === 'simple' ? (
                  <div className="space-y-4">
                    {Object.entries(pluginConfig).length === 0 ? (
                      <div className="flex items-center justify-center h-32 text-gray-500 dark:text-gray-400 text-sm">
                        配置为空
                      </div>
                    ) : (
                      Object.entries(pluginConfig).map(([key, value], idx) => (
                        <div key={idx} className="space-y-1">
                          <label className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                            <span className="font-medium">{key}</span>
                            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                              ({typeof value === 'object' ? (Array.isArray(value) ? 'array' : 'object') : typeof value})
                            </span>
                          </label>
                          {typeof value === 'boolean' ? (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={value}
                                onChange={e => {
                                  const newConfig = { ...pluginConfig, [key]: e.target.checked };
                                  setPluginConfig(newConfig);
                                  setPluginConfigText(JSON.stringify(newConfig, null, 2));
                                }}
                                className="w-4 h-4 text-[#165DFF] dark:text-white rounded border-gray-300 focus:ring-2 focus:ring-[#165DFF] dark:focus:ring-white/20"
                              />
                              <span className="text-sm text-gray-500 dark:text-gray-400">
                                {value ? '是' : '否'}
                              </span>
                            </label>
                          ) : typeof value === 'number' ? (
                            <input
                              type="number"
                              value={value}
                              onChange={e => {
                                const newValue = e.target.value === '' ? 0 : Number(e.target.value);
                                const newConfig = { ...pluginConfig, [key]: newValue };
                                setPluginConfig(newConfig);
                                setPluginConfigText(JSON.stringify(newConfig, null, 2));
                              }}
                              className="w-full p-2 text-sm bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.06] rounded-lg outline-none focus:ring-2 focus:ring-[#165DFF] dark:focus:ring-white/20 text-gray-900 dark:text-white"
                            />
                          ) : typeof value === 'object' ? (
                            <textarea
                              value={Array.isArray(value) ? JSON.stringify(value, null, 2) : JSON.stringify(value, null, 2)}
                              onChange={e => {
                                try {
                                  const parsed = JSON.parse(e.target.value);
                                  const newConfig = { ...pluginConfig, [key]: parsed };
                                  setPluginConfig(newConfig);
                                  setPluginConfigText(JSON.stringify(newConfig, null, 2));
                                } catch {
                                  const newConfig = { ...pluginConfig, [key]: e.target.value };
                                  setPluginConfig(newConfig);
                                }
                              }}
                              rows={3}
                              className="w-full p-2 text-sm bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.06] rounded-lg outline-none focus:ring-2 focus:ring-[#165DFF] dark:focus:ring-white/20 text-gray-900 dark:text-white resize-none font-mono"
                            />
                          ) : (
                            <input
                              type="text"
                              value={String(value)}
                              onChange={e => {
                                const newConfig = { ...pluginConfig, [key]: e.target.value };
                                setPluginConfig(newConfig);
                                setPluginConfigText(JSON.stringify(newConfig, null, 2));
                              }}
                              className="w-full p-2 text-sm bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.06] rounded-lg outline-none focus:ring-2 focus:ring-[#165DFF] dark:focus:ring-white/20 text-gray-900 dark:text-white"
                            />
                          )}
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <textarea
                    ref={textareaRef}
                    value={pluginConfigText}
                    onChange={e => {
                      setPluginConfigText(e.target.value);
                      try {
                        const parsed = JSON.parse(e.target.value);
                        setPluginConfig(parsed);
                        setIsJsonValid(true);
                      } catch {
                        setIsJsonValid(false);
                      }
                    }}
                    className="w-full h-64 p-4 font-mono text-sm bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.06] rounded-lg outline-none resize-y text-gray-900 dark:text-white focus:ring-2 focus:ring-[#165DFF] dark:focus:ring-white/20 focus:border-transparent"
                    style={{ display: 'block' }}
                  />
                )}
              </div>
              <div className="flex justify-end gap-2 p-4 border-t border-gray-100 dark:border-white/[0.06]">
                <button
                  onClick={() => setConfigModalOpen(false)}
                  className="px-4 py-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.05] rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveConfig}
                  disabled={savingConfig}
                  className="px-4 py-2 bg-[#165DFF] text-white dark:bg-white dark:text-black rounded-lg hover:bg-[#0047FF] dark:hover:bg-gray-200 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {savingConfig ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  保存
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Log Modal */}
      <AnimatePresence>
        {logModalOpen && selectedPlugin && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setLogModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-black/80 dark:backdrop-blur-xl rounded-xl shadow-xl max-w-3xl w-full max-h-[80vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-white/[0.06]">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  插件日志: {selectedPlugin.name}
                </h3>
                <button
                  onClick={() => setLogModalOpen(false)}
                  className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {loadingLogs ? (
                  <div className="flex items-center justify-center h-64">
                    <RefreshCw className="w-8 h-8 animate-spin text-[#165DFF] dark:text-white/60" />
                  </div>
                ) : !selectedPlugin.running ? (
                  // 插件未启动：提示用户先启动插件
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="mb-2 font-medium">插件未启动</p>
                    <p className="text-sm">请先启动该插件，然后再次查看日志</p>
                  </div>
                ) : pluginLogs.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>暂无日志</p>
                    <p className="text-sm mt-2">插件运行后产生的日志会显示在这里</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pluginLogs.map((log, idx) => (
                      <div key={idx} className="p-2 bg-gray-50 dark:bg-white/[0.03] rounded text-sm font-mono text-gray-700 dark:text-gray-300 break-all">
                        {log}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 p-4 border-t border-gray-100 dark:border-white/[0.06]">
                <button
                  onClick={() => openLogModal(selectedPlugin)}
                  className="px-4 py-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.05] rounded-lg transition-colors flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  刷新
                </button>
                <button
                  onClick={() => setLogModalOpen(false)}
                  className="px-4 py-2 bg-[#165DFF] text-white dark:bg-white dark:text-black rounded-lg hover:bg-[#0047FF] dark:hover:bg-gray-200 transition-colors"
                >
                  关闭
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const JsonHighlight = ({ json }: { json: string }) => {
  const highlightJson = (str: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    let keyIndex = 0;
    const regex = /("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|(\b-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\btrue\b|\bfalse\b)|(\bnull\b)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(str)) !== null) {
      if (match.index > lastIndex) {
        parts.push(str.slice(lastIndex, match.index));
      }
      if (match[1] !== undefined) {
        parts.push(<span key={keyIndex++} className="text-cyan-500">{match[1]}</span>);
        parts.push(<span key={keyIndex++}>:</span>);
      } else if (match[2] !== undefined) {
        parts.push(<span key={keyIndex++} className="text-green-500">{match[2]}</span>);
      } else if (match[3] !== undefined) {
        parts.push(<span key={keyIndex++} className="text-orange-500">{match[3]}</span>);
      } else if (match[4] !== undefined) {
        parts.push(<span key={keyIndex++} className="text-purple-500">{match[4]}</span>);
      } else if (match[5] !== undefined) {
        parts.push(<span key={keyIndex++} className="text-yellow-500">{match[5]}</span>);
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < str.length) {
      parts.push(str.slice(lastIndex));
    }
    return parts;
  };

  try {
    const obj = JSON.parse(json);
    const formatted = JSON.stringify(obj, null, 2);
    return <>{highlightJson(formatted)}</>;
  } catch {
    return <>{json}</>;
  }
};

interface ParsedLogEntry {
  timestamp: string | null;
  direction: 'send' | 'recv' | null;
  jsonContent: string | null;
  raw: string;
}

const formatLogEntry = (log: string): ParsedLogEntry => {
  const timestampMatch = log.match(/\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\]/);
  const timestamp = timestampMatch ? timestampMatch[1] : null;
  const directionMatch = log.match(/\[(send|recv)\]/);
  const direction = directionMatch ? (directionMatch[1] as 'send' | 'recv') : null;
  const jsonStart = log.indexOf('{');
  let jsonContent: string | null = null;
  if (jsonStart !== -1) {
    jsonContent = log.substring(jsonStart);
  }
  return { timestamp, direction, jsonContent, raw: log };
};

const FormattedLogContent = ({ log, expanded }: { log: string; expanded: boolean }) => {
  const parsed = formatLogEntry(log);

  if (!expanded) {
    return <div className="truncate" title="点击展开">{log}</div>;
  }

  return (
    <pre className="whitespace-pre-wrap break-all font-mono text-xs">
      {parsed.timestamp && (
        <span className="text-gray-700 dark:text-gray-300 font-medium">[{parsed.timestamp}]</span>
      )}
      {' '}
      {parsed.direction && (
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
          parsed.direction === 'send'
            ? 'bg-gray-100 dark:bg-white/[0.06] text-gray-700 dark:text-gray-300'
            : 'bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-gray-400'
        }`}>
          {parsed.direction}
        </span>
      )}
      {parsed.jsonContent ? (
        <div className="mt-1">
          <JsonHighlight json={parsed.jsonContent} />
        </div>
      ) : (
        <span className="font-mono">{log.replace(/\[.*?\]/g, '').trim()}</span>
      )}
    </pre>
  );
};

// --- Logs Component ---
const Logs = ({ selfId }: { selfId: string }) => {
  const [wsLogs, setWsLogs] = useState<string[]>([]);
  const [proxyLogs, setProxyLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'send' | 'recv' | 'info'>('all');
  const [logSource, setLogSource] = useState<'ws' | 'proxy' | 'all'>('all');
  const logsContainerRef = useRef<HTMLDivElement>(null);

  const fetchWSLogs = useCallback(async () => {
    try {
      const res = await logApi.getWSLogs(selfId, 100);
      if (res.retcode === 0 && res.data) {
        setWsLogs(res.data.logs);
      }
    } catch {
      // 忽略日志获取失败
    }
  }, [selfId]);

  const fetchProxyLogs = useCallback(async () => {
    try {
      const res = await logApi.getProxyLogs(selfId, 100);
      if (res.retcode === 0 && res.data) {
        setProxyLogs(res.data.logs);
      }
    } catch {
      // 忽略日志获取失败
    }
  }, [selfId]);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      if (logSource === 'ws' || logSource === 'all') {
        await fetchWSLogs();
      }
      if (logSource === 'proxy' || logSource === 'all') {
        await fetchProxyLogs();
      }
    } finally {
      setIsLoading(false);
    }
  }, [selfId, logSource, fetchWSLogs, fetchProxyLogs]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // WebSocket 实时日志流
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let stopped = false;

    const connect = async () => {
      try {
        const settingsRes = await settingsApi.getSettings();
        const token = settingsRes?.data?.websocket_authorization || '';
        if (!token) return;

        const url = logApi.getLogStreamUrl(selfId, token);
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
        };

        ws.onmessage = (event) => {
          if (stopped) return;
          try {
            const data = JSON.parse(event.data);
            if (data.type !== 'log' || !data.message) return;

            const logLine = data.message;
            if (data.source === 'ws') {
              setWsLogs(prev => {
                const next = [...prev, logLine];
                return next.length > 100 ? next.slice(-100) : next;
              });
            } else if (data.source === 'proxy') {
              setProxyLogs(prev => {
                const next = [...prev, logLine];
                return next.length > 100 ? next.slice(-100) : next;
              });
            }
          } catch {
            // 忽略解析错误
          }
        };

        ws.onclose = () => {
          if (stopped) return;
          wsRef.current = null;
          // 3秒后自动重连
          reconnectTimerRef.current = setTimeout(() => {
            if (!stopped) connect();
          }, 3000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        // 获取 token 失败，静默处理
      }
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [selfId]);

  const getLogType = (log: string): 'send' | 'recv' | 'info' => {
    if (log.includes('[send]')) return 'send';
    if (log.includes('[recv]')) return 'recv';
    if (log.includes('[ERROR]') || log.includes('[WARN]')) return 'info';
    return 'info';
  };

  const filteredLogs = (() => {
    let logs: string[] = [];
    if (logSource === 'ws' || logSource === 'all') {
      logs = [...logs, ...wsLogs];
    }
    if (logSource === 'proxy' || logSource === 'all') {
      logs = [...logs, ...proxyLogs];
    }

    logs = logs.filter(log => {
      if (typeFilter !== 'all' && getLogType(log) !== typeFilter) return false;
      if (searchKeyword) {
        return log.toLowerCase().includes(searchKeyword.toLowerCase());
      }
      return true;
    });

    return logs;
  })();

  const handleDownload = () => {
    const content = filteredLogs.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bot-${selfId}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('日志已下载');
  };

  const typeOptions = [
    { key: 'all' as const, label: '全部', color: 'bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-gray-400' },
    { key: 'send' as const, label: '发送', color: 'bg-gray-100 dark:bg-white/[0.06] text-gray-700 dark:text-gray-300' },
    { key: 'recv' as const, label: '接收', color: 'bg-gray-100 dark:bg-white/[0.06] text-gray-700 dark:text-gray-300' },
    { key: 'info' as const, label: '信息', color: 'bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-gray-400' },
  ];

  return (
    <motion.div
      className="flex flex-col h-[calc(100vh-16rem)]"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-gray-400" />
          <input
            type="text"
            placeholder="搜索日志关键词..."
            value={searchKeyword}
            onChange={e => setSearchKeyword(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/[0.06] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#165DFF] dark:focus:ring-white/20 backdrop-blur-sm transition-all text-gray-900 dark:text-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={logSource}
            onValueChange={(value) => setLogSource(value as 'ws' | 'proxy' | 'all')}
          >
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部日志</SelectItem>
              <SelectItem value="ws">WebSocket</SelectItem>
              <SelectItem value="proxy">代理服务</SelectItem>
            </SelectContent>
          </Select>
          {typeOptions.map(opt => (
            <button
              key={opt.key}
              onClick={() => setTypeFilter(opt.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${opt.color} ${
                typeFilter === opt.key ? 'ring-1 ring-offset-1 ring-current' : 'opacity-60 hover:opacity-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-[#1D2129] dark:backdrop-blur-sm border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden flex-1 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-white/5">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {filteredLogs.length} / {(logSource === 'all' ? wsLogs.length + proxyLogs.length : logSource === 'ws' ? wsLogs.length : proxyLogs.length)} 条日志
          </span>
          <div className="flex items-center gap-2">
            <motion.button
              onClick={fetchLogs}
              disabled={isLoading}
              className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-[#165DFF] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.05] rounded-lg transition-colors"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </motion.button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/[0.10] rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              下载
            </button>
          </div>
        </div>

        <div
          ref={logsContainerRef}
          className="flex-1 overflow-auto p-3 bg-gray-900 dark:bg-black/40 rounded-b-2xl"
        >
          {isLoading && filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-500 dark:text-gray-400 text-sm">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              加载中...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-500 dark:text-gray-400 text-sm font-mono">
              {searchKeyword || typeFilter !== 'all' ? '没有匹配的日志' : '暂无日志'}
            </div>
          ) : (
            <pre className="font-mono text-xs text-green-400 whitespace-pre-wrap break-all leading-relaxed">
              {filteredLogs.map((log, i) => (
                <div key={i} className="py-0.5 hover:bg-white/5 rounded px-1 transition-colors">
                  {log}
                </div>
              ))}
            </pre>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// --- ProxyTab Component (NapCat 多实例管理) ---
const FILTER_FIELDS = [
  { value: 'post_type', label: '事件类型 (post_type)' },
  { value: 'message_type', label: '消息类型 (message_type)' },
  { value: 'notice_type', label: '通知类型 (notice_type)' },
  { value: 'request_type', label: '请求类型 (request_type)' },
  { value: 'group_id', label: '群号 (group_id)' },
  { value: 'user_id', label: '用户QQ号 (user_id)' },
  { value: 'sub_type', label: '子类型 (sub_type)' },
  { value: 'raw_message', label: '消息内容 (raw_message)' },
];

const FILTER_MATCH_TYPES = [
  { value: 'exact', label: '精确匹配' },
  { value: 'contain', label: '包含匹配' },
  { value: 'regex', label: '正则匹配' },
];

const ProxyTab = ({ selfId }: { selfId: string }) => {
  const [adapters, setAdapters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingAdapter, setEditingAdapter] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // 添加/编辑表单状态
  const [formType, setFormType] = useState('websocket_client');
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    token: '',
    enabled: true,
    enableCors: false,
    timeout: 10000,
    reconnectInterval: 5000,
    maxReconnectAttempts: 0,
    maxRetries: 0,
  });
  // 事件过滤器状态
  const [eventFilter, setEventFilter] = useState<EventFilterConfig>({
    mode: 'whitelist',
    is_enabled: false,
    rules: [],
  });

  const typeLabels: Record<string, string> = {
    websocket_client: 'WebSocket正向',
    websocket_server: 'WebSocket反向',
    http_server: 'HTTP服务',
    http_client: 'HTTP上报',
  };

  const typeDescriptions: Record<string, string> = {
    websocket_client: `作为客户端连接`,
    websocket_server: '作为服务端被连接',
    http_server: `作为http接口`,
    http_client: '事件上报到url',
  };

  const typeIcons: Record<string, React.ReactNode> = {
    websocket_client: <Send className="w-5 h-5 text-blue-500" />,
    websocket_server: <Activity className="w-5 h-5 text-purple-500" />,
    http_server: <Network className="w-5 h-5 text-green-500" />,
    http_client: <RefreshCw className="w-5 h-5 text-orange-500" />,
  };

  const fetchAdapters = useCallback(async () => {
    try {
      setLoading(true);
      const res = await proxyApi.getAllAdapters();
      if (res.success || res.status === 'ok') {
        setAdapters(res.data || []);
      }
    } catch {
      toast.error('获取适配器列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdapters();
  }, [fetchAdapters]);

  const resetForm = () => {
    setFormData({
      name: '',
      url: '',
      token: '',
      enabled: true,
      enableCors: false,
      timeout: 10000,
      reconnectInterval: 5000,
      maxReconnectAttempts: 0,
      maxRetries: 0,
    });
    setFormType('websocket_client');
    setEditingAdapter(null);
    setEventFilter({
      mode: 'whitelist',
      is_enabled: false,
      rules: [],
    });
  };

  const handleAddAdapter = async () => {
    if (!formData.name.trim()) {
      toast.error('请输入适配器名称');
      return;
    }

    try {
      setActionLoading('add');
      const config = buildConfigFromForm();
      await proxyApi.addAdapter({ type: formType, config });
      toast.success('适配器添加成功');
      setShowAddDialog(false);
      resetForm();
      fetchAdapters();
    } catch (error: any) {
      toast.error('添加失败: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateAdapter = async () => {
    if (!editingAdapter) return;

    try {
      setActionLoading('update');
      const config = buildConfigFromForm();
      await proxyApi.updateAdapter(editingAdapter.name, config);
      toast.success('适配器更新成功');
      setShowEditDialog(false);
      resetForm();
      fetchAdapters();
    } catch (error: any) {
      toast.error('更新失败: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteAdapter = async (name: string) => {
    if (!confirm(`确定要删除适配器 "${name}" 吗？`)) return;

    try {
      setActionLoading(`delete-${name}`);
      await proxyApi.removeAdapter(name);
      toast.success('适配器已删除');
      fetchAdapters();
    } catch (error: any) {
      toast.error('删除失败: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleEnable = async (adapter: any) => {
    try {
      setActionLoading(`toggle-${adapter.name}`);
      if (adapter.enabled) {
        await proxyApi.disableAdapter(adapter.name);
        toast.success(`${adapter.name} 已禁用`);
      } else {
        await proxyApi.enableAdapter(adapter.name);
        toast.success(`${adapter.name} 已启用`);
      }
      fetchAdapters();
    } catch (error: any) {
      toast.error('操作失败: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReloadAll = async () => {
    try {
      setActionLoading('reload');
      await proxyApi.reloadAll();
      toast.success('所有适配器已重载');
      fetchAdapters();
    } catch (error: any) {
      toast.error('重载失败: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  const openEditDialog = (adapter: any) => {
    setEditingAdapter(adapter);
    setFormType(adapter.type || 'websocket_client');
    const cfg = adapter.config || {};
    setFormData({
      name: adapter.name || '',
      url: cfg.url || '',
      token: cfg.token || '',
      enabled: adapter.enabled !== false,
      enableCors: cfg.enableCors || false,
      timeout: cfg.timeout || 10000,
      reconnectInterval: cfg.reconnectInterval || 5000,
      maxReconnectAttempts: cfg.maxReconnectAttempts ?? 0,
      maxRetries: cfg.maxRetries ?? 0,
    });
    // 加载事件过滤器配置
    const ef = cfg.event_filter || {};
    setEventFilter({
      mode: ef.mode || 'whitelist',
      is_enabled: ef.is_enabled || false,
      rules: (ef.rules || []).map((r: any) => ({
        field: r.field || 'post_type',
        value: r.value || '',
        match_type: r.match_type || 'exact',
        is_enabled: r.is_enabled !== false,
      })),
    });
    setShowEditDialog(true);
  };

  const buildConfigFromForm = () => {
    const base = {
      name: formData.name,
      self_id: selfId,
      enable: formData.enabled,
      event_filter: eventFilter,
    };
    switch (formType) {
      case 'websocket_client':
        return { ...base, token: formData.token };
      case 'websocket_server':
        return {
          ...base,
          url: formData.url,
          token: formData.token,
          reconnectInterval: formData.reconnectInterval || 5000,
          maxReconnectAttempts: formData.maxReconnectAttempts ?? 0,
        };
      case 'http_server':
        return { ...base, token: formData.token, enableCors: formData.enableCors, timeout: formData.timeout || 10000 };
      case 'http_client':
        return {
          ...base,
          url: formData.url,
          token: formData.token,
          messagePostFormat: 'array',
          timeout: formData.timeout || 10000,
          maxRetries: formData.maxRetries ?? 0,
        };
      default:
        return base;
    }
  };

  const getConfigSummary = (adapter: any): string => {
    const cfg = adapter.config || {};
    const sid = cfg.self_id || selfId || '_';
    switch (adapter.type) {
      case 'websocket_client':
        return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}/onebot/${sid}/${adapter.name}`;
      case 'websocket_server':
        return `${cfg.url || '-'}`;
      case 'http_server':
        return `${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}/onebot/${sid}/${adapter.name}`;
      case 'http_client':
        return `推送至: ${cfg.url || '-'}`;
      default:
        return '-';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-[#165DFF] dark:text-white/60" />
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Network className="w-6 h-6 text-[#165DFF] dark:text-white" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">接口代理</h2>
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400">
            {adapters.length} 个适配器
          </span>
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            onClick={handleReloadAll}
            disabled={actionLoading === 'reload'}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-[#165DFF] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <RefreshCw className={`w-4 h-4 ${actionLoading === 'reload' ? 'animate-spin' : ''}`} />
            重载全部
          </motion.button>

          <motion.button
            onClick={() => { resetForm(); setShowAddDialog(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-[#165DFF] hover:bg-[#4080ff] text-white rounded-lg font-medium transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Plus className="w-4 h-4" />
            添加适配器
          </motion.button>
        </div>
      </div>

      {/* 适配器卡片列表 */}
      {adapters.length === 0 ? (
        <motion.div
          className="bg-white dark:bg-[#1D2129] dark:backdrop-blur-xl p-12 rounded-xl border border-gray-100 dark:border-gray-800 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <Network className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">暂无适配器</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">点击上方按钮添加新的适配器</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AnimatePresence>
            {adapters.map((adapter, index) => (
              <motion.div
                key={adapter.name}
                className="bg-white dark:bg-[#1D2129] dark:backdrop-blur-xl p-5 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-[#165DFF]/30 dark:hover:border-white/20 transition-colors"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.05 }}
              >
                {/* 卡片头部 */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gray-50 dark:bg-white/5">
                      {typeIcons[adapter.type] || <Network className="w-5 h-5 text-gray-500" />}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">{adapter.name}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{typeLabels[adapter.type] || adapter.type}</p>
                    </div>
                  </div>

                  {/* 状态标签 */}
                  <span className={`px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                    adapter.enabled
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400'
                  }`}>
                    {adapter.enabled ? '已启用' : '未启用'}
                  </span>
                </div>

                {/* 配置摘要 */}
                <div className="mb-3 px-3 py-2 bg-gray-50 dark:bg-white/5 rounded-lg">
                  <code className="text-xs text-gray-600 dark:text-gray-400 break-all">
                    {getConfigSummary(adapter)}
                  </code>
                </div>

                {/* 指标 */}
                {adapter.stats && (
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="text-center p-2 bg-gray-50 dark:bg-white/5 rounded">
                      <div className="text-sm font-bold text-gray-900 dark:text-white">{adapter.stats.connections || 0}</div>
                      <div className="text-xs text-gray-500">连接数</div>
                    </div>
                    <div className="text-center p-2 bg-gray-50 dark:bg-white/5 rounded">
                      <div className="text-sm font-bold text-blue-600 dark:text-blue-400">{adapter.stats.messages_in || 0}</div>
                      <div className="text-xs text-gray-500">接收</div>
                    </div>
                    <div className="text-center p-2 bg-gray-50 dark:bg-white/5 rounded">
                      <div className="text-sm font-bold text-green-600 dark:text-green-400">{adapter.stats.messages_out || 0}</div>
                      <div className="text-xs text-gray-500">发送</div>
                    </div>
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <motion.button
                    onClick={() => handleToggleEnable(adapter)}
                    disabled={actionLoading === `toggle-${adapter.name}`}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      adapter.enabled
                        ? 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400'
                        : 'bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400'
                    }`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {actionLoading === `toggle-${adapter.name}` ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : adapter.enabled ? (
                      <Pause className="w-3 h-3" />
                    ) : (
                      <Play className="w-3 h-3" />
                    )}
                    {adapter.enabled ? '禁用' : '启用'}
                  </motion.button>

                  <motion.button
                    onClick={() => openEditDialog(adapter)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-400 dark:hover:bg-white/20 transition-colors"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Settings className="w-3 h-3" />
                    编辑
                  </motion.button>

                  <motion.button
                    onClick={() => handleDeleteAdapter(adapter.name)}
                    disabled={actionLoading === `delete-${adapter.name}`}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 transition-colors ml-auto"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {actionLoading === `delete-${adapter.name}` ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}
                    删除
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* 添加/编辑对话框 */}
      <AnimatePresence>
        {(showAddDialog || showEditDialog) && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => { if (e.target === e.currentTarget) { setShowAddDialog(false); setShowEditDialog(false); resetForm(); } }}
          >
            <motion.div
              className="bg-white dark:bg-[#1D2129] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              {/* 对话框头部 */}
              <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  {showEditDialog ? '编辑适配器' : '添加适配器'}
                </h3>
                <button
                  onClick={() => { setShowAddDialog(false); setShowEditDialog(false); resetForm(); }}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* 表单内容 */}
              <div className="p-5 space-y-4">
                {/* 类型选择（仅添加时显示）- 2x2 排版 */}
                {!showEditDialog && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">选择适配器类型(心跳验证由bot端配置)</label>
                    <div className="grid grid-cols-2 gap-3">
                      {Object.entries(typeLabels).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setFormType(key)}
                          className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                            formType === key
                              ? 'border-[#165DFF] bg-blue-50 dark:bg-blue-900/20 shadow-md'
                              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-white/5'
                          }`}
                        >
                          {typeIcons[key]}
                          <div className="flex flex-col items-start">
                            <span className={`text-sm font-semibold ${formType === key ? 'text-[#165DFF]' : 'text-gray-700 dark:text-gray-300'}`}>
                              {label}
                            </span>
                            <span className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight mt-0.5">
                              {typeDescriptions[key]}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 名称 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">名称 *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="例如：my-ws-client"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#165DFF]/50 focus:border-transparent"
                    disabled={showEditDialog}
                  />
                </div>

                {/* WS反向/HTTP上报：URL输入框 */}
                {(formType === 'websocket_server' || formType === 'http_client') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {formType === 'websocket_server' ? '连接地址 (URL)' : '回调 URL'}
                    </label>
                    <input
                      type="text"
                      value={formData.url}
                      onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                      placeholder={
                        formType === 'websocket_server'
                          ? 'wss://your-server.com:123/path 或 ws://...'
                          : 'http://your-server.com:8080/webhook'
                      }
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#165DFF]/50 font-mono"
                    />
                  </div>
                )}

                {/* HTTP Server：高级选项 */}
                {formType === 'http_server' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-white/5 rounded-lg">
                      <input
                        type="checkbox"
                        id="enableCors"
                        checked={formData.enableCors}
                        onChange={(e) => setFormData({ ...formData, enableCors: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300 text-[#165DFF] focus:ring-[#165DFF]"
                      />
                      <label htmlFor="enableCors" className="text-sm text-gray-700 dark:text-gray-300">启用 CORS</label>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">超时时间 (ms)</label>
                      <input
                        type="number"
                        value={formData.timeout || ''}
                        onChange={(e) => setFormData({ ...formData, timeout: parseInt(e.target.value) || 0 })}
                        placeholder="默认10000"
                        min="1000"
                        className="w-full px-3 py-1.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#165DFF]/50"
                      />
                    </div>
                  </div>
                )}

                {/* Token */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Token（可选）</label>
                  <input
                    type="text"
                    value={formData.token}
                    onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                    placeholder="访问令牌，留空则不鉴权"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#165DFF]/50 focus:border-transparent"
                  />
                </div>

                {/* WS反向：重连设置（客户端模式） */}
                {formType === 'websocket_server' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">重连间隔 (ms)</label>
                      <input
                        type="number"
                        value={formData.reconnectInterval || ''}
                        onChange={(e) => setFormData({ ...formData, reconnectInterval: parseInt(e.target.value) || 0 })}
                        placeholder="默认5000"
                        className="w-full px-3 py-1.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#165DFF]/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">最大重连次数（0=不限制）</label>
                      <input
                        type="number"
                        value={formData.maxReconnectAttempts ?? ''}
                        onChange={(e) => setFormData({ ...formData, maxReconnectAttempts: parseInt(e.target.value) || 0 })}
                        placeholder="0=不限制"
                        min="0"
                        className="w-full px-3 py-1.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#165DFF]/50"
                      />
                    </div>
                  </div>
                )}

                {/* HTTP上报：超时和重试设置 */}
                {formType === 'http_client' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">超时时间 (ms)</label>
                      <input
                        type="number"
                        value={formData.timeout || ''}
                        onChange={(e) => setFormData({ ...formData, timeout: parseInt(e.target.value) || 0 })}
                        placeholder="默认10000"
                        min="1000"
                        className="w-full px-3 py-1.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#165DFF]/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">重试次数</label>
                      <input
                        type="number"
                        value={formData.maxRetries ?? ''}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          setFormData({ ...formData, maxRetries: Math.min(val, 20) });
                        }}
                        placeholder="0=不重试，最大20"
                        min="0"
                        max="20"
                        className="w-full px-3 py-1.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#165DFF]/50"
                      />
                    </div>
                  </div>
                )}

                {/* 启用状态 */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="enabled"
                    checked={formData.enabled}
                    onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-[#165DFF] focus:ring-[#165DFF]"
                  />
                  <label htmlFor="enabled" className="text-sm text-gray-700 dark:text-gray-300">启用此适配器</label>
                </div>

                {/* 事件过滤器配置 */}
                <div className="border-t border-gray-100 dark:border-gray-800 pt-4 mt-2">
                  <div className="flex items-center gap-2 mb-3">
                    <Filter className="w-4 h-4 text-[#165DFF]" />
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">事件过滤器</h4>
                    <label className="relative inline-flex items-center cursor-pointer ml-auto">
                      <input
                        type="checkbox"
                        checked={eventFilter.is_enabled}
                        onChange={(e) => setEventFilter({ ...eventFilter, is_enabled: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#165DFF]/50 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-[#165DFF]"></div>
                    </label>
                  </div>

                  {eventFilter.is_enabled && (
                    <div className="space-y-3">
                      {/* 模式选择 */}
                      <div className="flex items-center gap-4">
                        <label className="text-xs text-gray-500 dark:text-gray-400">过滤模式：</label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="filterMode"
                            value="whitelist"
                            checked={eventFilter.mode === 'whitelist'}
                            onChange={(e) => setEventFilter({ ...eventFilter, mode: e.target.value as 'whitelist' | 'blacklist' })}
                            className="w-3.5 h-3.5 text-[#165DFF]"
                          />
                          <span className="text-xs text-gray-700 dark:text-gray-300">白名单（匹配才上报）</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="filterMode"
                            value="blacklist"
                            checked={eventFilter.mode === 'blacklist'}
                            onChange={(e) => setEventFilter({ ...eventFilter, mode: e.target.value as 'whitelist' | 'blacklist' })}
                            className="w-3.5 h-3.5 text-[#165DFF]"
                          />
                          <span className="text-xs text-gray-700 dark:text-gray-300">黑名单（匹配则拦截）</span>
                        </label>
                      </div>

                      {/* 规则列表 */}
                      <div className="space-y-2">
                        {eventFilter.rules.map((rule, index) => (
                          <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-white/5 rounded-lg">
                            <input
                              type="checkbox"
                              checked={rule.is_enabled}
                              onChange={(e) => {
                                const newRules = [...eventFilter.rules];
                                newRules[index] = { ...rule, is_enabled: e.target.checked };
                                setEventFilter({ ...eventFilter, rules: newRules });
                              }}
                              className="w-4 h-4 rounded border-gray-300 text-[#165DFF] focus:ring-[#165DFF] flex-shrink-0"
                            />
                            <Select
                              value={rule.field}
                              onValueChange={(value) => {
                                const newRules = [...eventFilter.rules];
                                newRules[index] = { ...rule, field: value };
                                setEventFilter({ ...eventFilter, rules: newRules });
                              }}
                            >
                              <SelectTrigger className="w-[100px] h-7 text-xs flex-shrink-0">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {FILTER_FIELDS.map((f) => (
                                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={rule.match_type}
                              onValueChange={(value) => {
                                const newRules = [...eventFilter.rules];
                                newRules[index] = { ...rule, match_type: value as 'exact' | 'contain' | 'regex' };
                                setEventFilter({ ...eventFilter, rules: newRules });
                              }}
                            >
                              <SelectTrigger className="w-[90px] h-7 text-xs flex-shrink-0">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {FILTER_MATCH_TYPES.map((m) => (
                                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <input
                              type="text"
                              value={rule.value}
                              onChange={(e) => {
                                const newRules = [...eventFilter.rules];
                                newRules[index] = { ...rule, value: e.target.value };
                                setEventFilter({ ...eventFilter, rules: newRules });
                              }}
                              placeholder="匹配值"
                              className="flex-1 min-w-0 px-2 py-1.5 bg-white dark:bg-white/5 border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#165DFF]/50"
                            />
                            <button
                              onClick={() => {
                                const newRules = eventFilter.rules.filter((_, i) => i !== index);
                                setEventFilter({ ...eventFilter, rules: newRules });
                              }}
                              className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500 flex-shrink-0"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* 添加规则按钮 */}
                      <button
                        onClick={() => {
                          setEventFilter({
                            ...eventFilter,
                            rules: [
                              ...eventFilter.rules,
                              { field: 'post_type', value: '', match_type: 'exact', is_enabled: true },
                            ],
                          });
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#165DFF] hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        添加规则
                      </button>

                      {eventFilter.rules.length === 0 && (
                        <p className="text-xs text-gray-400 dark:text-gray-500">暂无规则，点击上方按钮添加</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 底部操作 */}
              <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 dark:border-gray-800">
                <button
                  onClick={() => { setShowAddDialog(false); setShowEditDialog(false); resetForm(); }}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors"
                >
                  取消
                </button>
                <motion.button
                  onClick={showEditDialog ? handleUpdateAdapter : handleAddAdapter}
                  disabled={actionLoading === 'add' || actionLoading === 'update' || !formData.name.trim()}
                  className="px-4 py-2 bg-[#165DFF] hover:bg-[#4080ff] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {(actionLoading === 'add' || actionLoading === 'update') && <RefreshCw className="w-4 h-4 animate-spin" />}
                  {showEditDialog ? '保存修改' : '确认添加'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// --- Main Page ---
export function BotDetail() {
  const { selfId } = useParams<{ selfId: string }>();
  const navigate = useNavigate();
  const { bots, selectBot, setBots } = useBotStore();
  const [activeTab, setActiveTab] = useState('overview');
  const [restarting, setRestarting] = useState(false);
  const [botLoading, setBotLoading] = useState(true);

  let bot = bots.find(b => b.self_id === selfId);

  useEffect(() => {
    if (selfId) selectBot(selfId);
  }, [selfId, selectBot]);

  useEffect(() => {
    if (!selfId || bot) {
      setBotLoading(false);
      return;
    }
    const fetchBot = async () => {
      try {
        setBotLoading(true);
        const res = await accountApi.getAccounts();
        if ((res.success || res.status === 'ok') && Array.isArray(res.data)) {
          const mapped = res.data.map((a: any) => ({
            self_id: a.self_id,
            nickname: a.login_info?.nickname || a.self_id,
            custom_name: a.custom_name || '',
            status: a.is_online ? 'online' as const : 'offline' as const,
            last_connect: a.last_connected_at || '',
            msg_count_today: 0,
            friend_count: 0,
            group_count: 0,
            avatar: getSafeQQAvatarUrl(a.self_id, 40),
            version_info: a.version_info,
            bot_status: a.bot_status,
          }));
          setBots(mapped);
        }
      } catch {
        // ignore
      } finally {
        setBotLoading(false);
      }
    };
    fetchBot();
  }, [selfId, bot, setBots]);

  bot = bots.find(b => b.self_id === selfId);

  if (botLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-[#165DFF] dark:text-white/60" />
      </div>
    );
  }

  const handleRestart = async () => {
    if (!selfId) return;
    setRestarting(true);
    try {
      await botApi.callApi(selfId, 'set_restart');
      toast.success('重启指令已发送');
    } catch (error) {
      toast.error('重启失败');
    } finally {
      setRestarting(false);
    }
  };

  if (!bot) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        <p className="mb-4">Bot not found</p>
        <button onClick={() => navigate('/bots')} className="text-[#165DFF] dark:text-white underline">返回列表</button>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: '概览', icon: Activity },
    { id: 'debug', label: '接口调试', icon: Terminal },
    { id: 'plugins', label: '插件管理', icon: Package },
    { id: 'logs', label: '日志中心', icon: FileText },
    { id: 'proxy', label: '接口代理', icon: Network },
  ];

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* Top Header */}
      <motion.div 
        className="flex items-center justify-between bg-white dark:bg-[#1D2129] dark:backdrop-blur-xl px-4 py-3 rounded-xl border border-gray-100 dark:border-gray-800"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center">
          <motion.button 
            onClick={() => navigate('/bots')} 
            className="mr-3 p-1.5 hover:bg-gray-100 dark:hover:bg-white/[0.05] rounded-lg transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <ArrowLeft className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </motion.button>
          <motion.img
            src={validateImageUrl(bot.avatar)}
            className="w-10 h-10 rounded-full bg-gray-50 dark:bg-white/[0.03] mr-3 ring-2 ring-gray-200 dark:ring-white/10"
            alt="Avatar"
            whileHover={{ scale: 1.1 }}
          />
          <div>
             <h1 className="text-base font-bold text-gray-900 dark:text-white flex items-center">
               {bot.nickname}
               <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                 bot.status === BotStatus.ONLINE 
                   ? 'bg-[#165DFF]/10 text-[#165DFF] dark:bg-white/10 dark:text-white'
                   : 'bg-gray-50 dark:bg-white/[0.03] text-gray-500 dark:text-gray-400'
               }`}>
                 {bot.status === BotStatus.ONLINE ? '在线' : '离线'}
               </span>
             </h1>
             <p className="text-gray-500 dark:text-gray-400 font-mono text-xs mt-0.5">QQ: {bot.self_id}</p>
          </div>
        </div>
        
        <div className="flex space-x-2">
          <motion.button 
            onClick={handleRestart}
            disabled={restarting}
            className="px-3 py-1.5 border border-gray-100 dark:border-white/[0.06] text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.05] transition-colors text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {restarting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            重启服务
          </motion.button>
        </div>
      </motion.div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-gray-100 dark:border-gray-800">
        {tabs.map((tab, index) => (
          <motion.button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center px-6 py-3 border-b-2 font-medium text-sm transition-all ${
              activeTab === tab.id 
                ? 'border-[#165DFF] text-[#165DFF] dark:border-white/40 dark:text-white' 
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            whileHover={{ y: -2 }}
          >
            <tab.icon className="w-4 h-4 mr-2" />
            {tab.label}
          </motion.button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <div className="flex-1 min-h-[400px] overflow-hidden flex flex-col">
          {activeTab === 'overview' && <BotOverview selfId={bot.self_id} />}
          {activeTab === 'debug' && <ApiDebug botId={bot.self_id} />}
          {activeTab === 'plugins' && <Plugins selfId={bot.self_id} />}
          {activeTab === 'logs' && <Logs selfId={bot.self_id} />}
          {activeTab === 'proxy' && <ProxyTab selfId={bot.self_id} />}
        </div>
      </AnimatePresence>
    </div>
  );
}
