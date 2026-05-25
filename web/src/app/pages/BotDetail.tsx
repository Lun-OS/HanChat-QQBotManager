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
  ChevronDown
} from 'lucide-react';
import { toast } from 'sonner';
import { validateImageUrl, getSafeQQAvatarUrl } from '../utils/security';
import apiTemplatesData from '../resources/ApiDebugTMPL.json';
import { 
  accountApi,
  botApi, 
  pluginApi, 
  systemApi,
  logApi,
  PluginInfo
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
      } catch (e) {
        console.log('获取容器信息失败:', e);
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
    } catch (error) {
      console.error('获取统计数据失败:', error);
      toast.error('获取统计数据失败');
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
              { label: 'LLBot 版本', value: stats.llbot_version },
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
        toast.error('获取插件日志失败');
        setPluginLogs([]);
      }
    } catch (error) {
      toast.error('获取插件日志失败');
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
              >
                {actionLoading === plugin.name ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : plugin.running ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </motion.button>
              <div className="space-x-2">
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
                ) : pluginLogs.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>暂无日志</p>
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
  const [logs, setLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'send' | 'recv' | 'info'>('all');
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());
  const logsContainerRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await logApi.getWSLogs(selfId, 500);
      if (res.retcode === 0 && res.data) {
        setLogs(res.data.logs);
      }
    } catch (error) {
      console.error('获取日志失败:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selfId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const getLogType = (log: string): 'send' | 'recv' | 'info' => {
    if (log.includes('[send]')) return 'send';
    if (log.includes('[recv]')) return 'recv';
    return 'info';
  };

  const getLogTimestamp = (log: string): string => {
    const match = log.match(/\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
    return match ? match[1] : '';
  };

  const filteredLogs = logs.filter(log => {
    if (typeFilter !== 'all' && getLogType(log) !== typeFilter) return false;
    if (searchKeyword) {
      return log.toLowerCase().includes(searchKeyword.toLowerCase());
    }
    return true;
  });

  const toggleLogExpand = (index: number) => {
    setExpandedLogs(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

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

  const getTypeBadge = (type: 'send' | 'recv' | 'info') => {
    const config = {
      send: { label: 'SEND', cls: 'bg-gray-100 dark:bg-white/[0.06] text-gray-700 dark:text-gray-300' },
      recv: { label: 'RECV', cls: 'bg-gray-100 dark:bg-white/[0.06] text-gray-700 dark:text-gray-300' },
      info: { label: 'INFO', cls: 'bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-gray-400' },
    };
    const c = config[type];
    return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c.cls}`}>{c.label}</span>;
  };

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
            {filteredLogs.length} / {logs.length} 条日志
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
          className="flex-1 overflow-y-auto p-3 space-y-1"
        >
          {isLoading && logs.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-500 dark:text-gray-400 text-sm">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              加载中...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-500 dark:text-gray-400 text-sm">
              {searchKeyword || typeFilter !== 'all' ? '没有匹配的日志' : '暂无日志'}
            </div>
          ) : (
            filteredLogs.map((log, i) => {
              const logType = getLogType(log);
              const isExpanded = expandedLogs.has(i);
              const parsed = formatLogEntry(log);

              return (
                <div
                  key={i}
                  onClick={() => toggleLogExpand(i)}
                  className={`group rounded-lg px-3 py-2 cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-white/[0.05] ${
                    logType === 'send' ? 'border-l-2 border-l-gray-400' :
                    logType === 'recv' ? 'border-l-2 border-l-gray-400' :
                    'border-l-2 border-l-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs">
                    {parsed.timestamp && (
                      <span className="text-gray-500 dark:text-gray-400 font-mono shrink-0">{parsed.timestamp}</span>
                    )}
                    {getTypeBadge(logType)}
                    <span className={`flex-1 min-w-0 ${isExpanded ? '' : 'truncate'}`}>
                      {parsed.jsonContent ? (
                        isExpanded ? (
                          <JsonHighlight json={parsed.jsonContent} />
                        ) : (
                          <span className="text-gray-700 dark:text-gray-300 font-mono">{parsed.jsonContent.substring(0, 120)}{parsed.jsonContent.length > 120 ? '...' : ''}</span>
                        )
                      ) : (
                        <span className="text-gray-700 dark:text-gray-300">{log.replace(/\[.*?\]/g, '').trim()}</span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
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
        </div>
      </AnimatePresence>
    </div>
  );
}
