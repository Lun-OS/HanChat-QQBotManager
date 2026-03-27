import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useBotStore } from '../stores/botStore';
import { BotStatus } from '../constants';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  Activity, 
  Terminal, 
  Package, 
  FileText, 
  Settings,
  Send,
  Trash2,
  RefreshCw,
  Play,
  Pause,
  Upload,
  TrendingUp,
  Power,
  RotateCcw,
  X,
  Check,
  Search,
  Download,
  Edit3,
  Save,
  ShieldCheck
} from 'lucide-react';
import { toast } from 'sonner';
import apiTemplatesData from '../resources/ApiDebugTMPL.json';
import { 
  botApi, 
  pluginApi, 
  settingsApi, 
  systemApi,
  logApi,
  PluginInfo,
  SystemLog,
  LogEntry 
} from '../services/api';

// --- Types ---
interface BotStats {
  uptime: string;
  msg_received: number;
  msg_sent: number;
  lua_memory: string;
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
    lua_memory: '-',
    llbot_version: '-',
    ws_name: '-',
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);

      // 获取状态信息
      const statusRes = await systemApi.getStatus(selfId);
      const versionRes = await systemApi.getVersionInfo(selfId);

      // 调试日志
      console.log('statusRes:', statusRes);
      console.log('versionRes:', versionRes);

      // 处理状态响应 - 后端包装格式: {status, retcode, data: {status, retcode, data: {stat}}}}
      let stat = {};
      const statusData = statusRes.data?.data || statusRes.data;
      if (statusData) {
        stat = statusData.stat || {};
      }

      // 处理版本响应
      let versionData = {};
      const verData = versionRes.data?.data || versionRes.data;
      if (verData) {
        versionData = verData;
      }

      console.log('提取的stat:', stat);
      console.log('提取的versionData:', versionData);

      // 获取Lua内存和WS名称
      let luaMemory = '-';
      let wsName = '-';
      try {
        const containerRes = await pluginApi.getAccountContainers();
        if (containerRes.success && containerRes.data) {
          const container = containerRes.data.find((c: any) => c.self_id === selfId);
          if (container) {
            luaMemory = formatBytes(container.memory_usage || 0);
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
        lua_memory: luaMemory,
        llbot_version: (versionData as any).app_version || (versionData as any).version || '-',
        ws_name: wsName,
      });
    } catch (error) {
      console.error('获取统计数据失败:', error);
      toast.error('获取统计数据失败');
    } finally {
      setLoading(false);
    }
  }, [selfId, bot]);

  // 格式化字节大小
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 格式化运行时间
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
    // 取消自动刷新，只在页面加载时获取一次数据
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-[#165DFF]" />
      </div>
    );
  }

  return (
    <motion.div 
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: '运行时间', value: stats.uptime, color: 'text-blue-600', icon: Activity },
          { label: '收到消息', value: stats.msg_received, color: 'text-green-600', icon: TrendingUp },
          { label: '发送消息', value: stats.msg_sent, color: 'text-purple-600', icon: Send },
          { label: 'Lua内存', value: stats.lua_memory, color: 'text-orange-600', icon: Package },
          { label: 'LLBot版本', value: stats.llbot_version, color: 'text-cyan-600', icon: Settings },
          { label: 'WS名称', value: stats.ws_name, color: 'text-pink-600', icon: Power }
        ].map((stat, idx) => (
          <motion.div 
            key={idx}
            className="bg-white dark:bg-[#1D2129] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-lg transition-shadow"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            whileHover={{ y: -4 }}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-gray-500 dark:text-gray-400 text-sm">{stat.label}</h3>
              <stat.icon className="w-4 h-4 text-gray-400" />
            </div>
            <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
          </motion.div>
        ))}
      </div>

      <motion.div 
        className="flex justify-end"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <motion.button
          onClick={fetchStats}
          className="p-2 text-gray-500 hover:text-[#165DFF] hover:bg-blue-50 rounded-lg transition-colors"
          whileHover={{ rotate: 180 }}
          transition={{ duration: 0.3 }}
        >
          <RefreshCw className="w-4 h-4" />
        </motion.button>
      </motion.div>
    </motion.div>
  );
};

// --- ApiDebug Component ---
const ApiDebug = ({ botId }: { botId: string }) => {
  const [mode, setMode] = useState<'simple' | 'advanced'>('simple');
  const templates = apiTemplatesData as unknown as ApiTemplates;
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [endpoint, setEndpoint] = useState('');
  const [params, setParams] = useState('{}');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});

  // 提取实际的接口名称（去掉冒号及后面内容）
  const extractEndpoint = (templateKey: string): string => {
    const colonIndex = templateKey.indexOf(':');
    return colonIndex > 0 ? templateKey.substring(0, colonIndex) : templateKey;
  };

  const handleTemplateChange = (templateKey: string) => {
    setSelectedTemplate(templateKey);
    const template = templates[templateKey];
    if (!template) return;
    
    // 使用提取后的接口名称
    setEndpoint(extractEndpoint(templateKey));
    setParams(JSON.stringify(template.json, null, 2));
    
    const initialFormData: Record<string, any> = {};
    Object.entries(template.PS_json).forEach(([fieldName, fieldConfig]) => {
      const [, , defaultValue] = fieldConfig;
      initialFormData[fieldName] = defaultValue === '必须' ? '' : defaultValue;
    });
    setFormData(initialFormData);
  };

  const handleFormChange = (fieldName: string, value: any, type: string) => {
    const newValue = type === 'integer' || type === 'number' ? 
      (value === '' ? '' : Number(value)) : value;
    
    setFormData(prev => ({ ...prev, [fieldName]: newValue }));
    
    const newParams = { ...formData, [fieldName]: newValue };
    setParams(JSON.stringify(newParams, null, 2));
  };

  const handleParamsChange = (value: string) => {
    setParams(value);
    try {
      const parsed = JSON.parse(value);
      setFormData(parsed);
    } catch {
      // JSON 解析失败时不更新表单
    }
  };

  const handleSend = async () => {
    if (!endpoint) {
      toast.error('请输入接口地址');
      return;
    }

    setLoading(true);
    setResponse(null);

    try {
      let requestParams;
      try {
        requestParams = JSON.parse(params);
      } catch {
        toast.error('请求参数 JSON 格式错误');
        setLoading(false);
        return;
      }

      const result = await botApi.callApi(botId, endpoint, requestParams);
      setResponse(JSON.stringify(result, null, 2));
      
      if (result.retcode === 0) {
        toast.success('请求发送成功');
      } else {
        toast.error(result.message || '请求失败');
      }
    } catch (error: any) {
      setResponse(JSON.stringify({ error: error.message }, null, 2));
      toast.error('请求失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const currentTemplate = selectedTemplate ? templates[selectedTemplate] : null;

  return (
    <motion.div 
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="bg-white dark:bg-[#1D2129] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">调试模式：</span>
            <div className="flex bg-gray-100 dark:bg-[#2A2E38] rounded-lg p-1">
              <button
                onClick={() => setMode('simple')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  mode === 'simple'
                    ? 'bg-white dark:bg-[#1D2129] text-[#165DFF] shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                简易模式
              </button>
              <button
                onClick={() => setMode('advanced')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  mode === 'advanced'
                    ? 'bg-white dark:bg-[#1D2129] text-[#165DFF] shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                高级模式
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">选择模板：</span>
            <select
              value={selectedTemplate}
              onChange={e => handleTemplateChange(e.target.value)}
              className="px-3 py-1.5 bg-gray-50 dark:bg-[#2A2E38] border border-gray-200 dark:border-gray-700 rounded-lg text-sm outline-none focus:ring-2 ring-[#165DFF] text-gray-900 dark:text-white min-w-[200px]"
            >
              <option value="">-- 请选择接口模板 --</option>
              {Object.entries(templates).map(([key, template]) => (
                <option key={key} value={key}>
                  {extractEndpoint(key)} - {template.PS}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-6">
          <div className="md:col-span-2">
            <select 
              className="w-full p-2.5 bg-gray-50 dark:bg-[#2A2E38] border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 ring-[#165DFF] text-gray-900 dark:text-white"
              disabled
            >
              <option>默认</option>
            </select>
          </div>
          <div className="md:col-span-10 flex gap-2">
            <div className="flex-1 flex items-center bg-gray-50 dark:bg-[#2A2E38] border border-gray-200 dark:border-gray-700 rounded-lg px-3 text-gray-500 font-mono text-sm">
              <span>/api/{botId}/</span>
              <input 
                type="text" 
                value={endpoint} 
                onChange={e => setEndpoint(e.target.value)}
                className="flex-1 bg-transparent border-none outline-none text-gray-900 dark:text-white ml-1"
                placeholder="请输入接口地址" 
                readOnly={mode === 'simple'}
              />
            </div>
            <motion.button 
              onClick={handleSend}
              disabled={loading || !endpoint}
              className="px-6 bg-[#165DFF] text-white rounded-lg hover:bg-[#0047FF] transition-colors flex items-center justify-center min-w-[100px] disabled:opacity-50"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : '发送'}
            </motion.button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[400px]">
          <div className="flex flex-col">
            {mode === 'simple' ? (
              <>
                <label className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  请求参数
                  {currentTemplate && (
                    <span className="ml-2 text-xs text-gray-500 font-normal">({currentTemplate.PS})</span>
                  )}
                </label>
                <div className="flex-1 overflow-auto p-4 bg-gray-50 dark:bg-[#2A2E38] border border-gray-200 dark:border-gray-700 rounded-lg">
                  {selectedTemplate && currentTemplate ? (
                    <div className="space-y-4">
                      {Object.entries(currentTemplate.PS_json).map(([fieldName, fieldConfig], idx) => {
                        const [type, description, defaultValue] = fieldConfig;
                        const isRequired = defaultValue === '必须';
                        const fieldValue = formData[fieldName] ?? '';
                        
                        return (
                          <div key={idx} className="space-y-1">
                            <label className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                              <span className="font-medium">{fieldName}</span>
                              <span className="ml-2 text-xs text-gray-500">({type})</span>
                              {isRequired && (
                                <span className="ml-1 text-xs text-red-500">*</span>
                              )}
                            </label>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
                            {type === 'array' ? (
                              <textarea
                                value={fieldValue}
                                onChange={e => handleFormChange(fieldName, e.target.value, type)}
                                placeholder={isRequired ? '必填' : `默认值: ${defaultValue}`}
                                rows={3}
                                className="w-full p-2 text-sm bg-white dark:bg-[#1D2129] border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 ring-[#165DFF] text-gray-900 dark:text-white resize-none"
                              />
                            ) : (
                              <input
                                type={type === 'integer' || type === 'number' ? 'number' : 'text'}
                                value={fieldValue}
                                onChange={e => handleFormChange(fieldName, e.target.value, type)}
                                placeholder={isRequired ? '必填' : `默认值: ${defaultValue}`}
                                className="w-full p-2 text-sm bg-white dark:bg-[#1D2129] border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 ring-[#165DFF] text-gray-900 dark:text-white"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                      请先选择一个模板
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <label className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">请求参数 (JSON)</label>
                <textarea
                  value={params}
                  onChange={e => handleParamsChange(e.target.value)}
                  className="flex-1 w-full p-4 font-mono text-sm bg-gray-50 dark:bg-[#2A2E38] border border-gray-200 dark:border-gray-700 rounded-lg outline-none resize-none focus:ring-2 ring-[#165DFF] text-gray-900 dark:text-white"
                  spellCheck={false}
                />
              </>
            )}
          </div>
          
          <div className="flex flex-col h-full overflow-hidden">
            <label className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">响应结果</label>
            <div className="flex-1 w-full p-4 font-mono text-sm bg-gray-900 text-green-400 rounded-lg overflow-auto">
              {response ? <pre className="whitespace-pre-wrap break-all">{response}</pre> : <span className="text-gray-500 select-none">等待请求...</span>}
            </div>
          </div>
        </div>
      </div>
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

  // 当配置弹窗打开时，同步文本
  useEffect(() => {
    if (configModalOpen && selectedPlugin) {
      setPluginConfigText(JSON.stringify(pluginConfig, null, 2));
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
        setPluginConfigText(JSON.stringify(config, null, 2));
      }
    } catch (error) {
      toast.error('获取配置失败');
      const config = plugin.config || {};
      setPluginConfig(config);
      setPluginConfigText(JSON.stringify(config, null, 2));
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
        <RefreshCw className="w-8 h-8 animate-spin text-[#165DFF]" />
      </div>
    );
  }

  return (
    <motion.div 
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex justify-between items-center bg-white dark:bg-[#1D2129] p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
        <div className="relative">
          <input 
            type="text" 
            placeholder="搜索插件..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 bg-gray-50 dark:bg-[#2A2E38] rounded-lg text-sm w-64 border-none outline-none focus:ring-2 ring-[#165DFF] text-gray-900 dark:text-white"
          />
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        </div>
        <div className="flex gap-2">
          <motion.button 
            onClick={handleCheckPluginFiles}
            className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
            title="检查插件文件"
            whileHover={{ scale: 1.1 }}
            transition={{ duration: 0.2 }}
          >
            <ShieldCheck className="w-5 h-5" />
          </motion.button>
          <motion.button 
            onClick={fetchPlugins}
            className="p-2 text-gray-500 hover:text-[#165DFF] hover:bg-blue-50 rounded-lg transition-colors"
            whileHover={{ rotate: 180 }}
            transition={{ duration: 0.3 }}
          >
            <RefreshCw className="w-5 h-5" />
          </motion.button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPlugins.map((plugin, idx) => (
          <motion.div 
            key={`${plugin.self_id}/${plugin.name}`}
            className="bg-white dark:bg-[#1D2129] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col justify-between h-48 group hover:border-[#165DFF]/50 transition-all hover:shadow-lg"
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
              <p className="text-sm text-gray-500 mb-1">
                {plugin.version ? `v${plugin.version}` : '未指定版本'}
                {plugin.remark && <span className="ml-2 text-xs text-gray-400">{plugin.remark}</span>}
              </p>
            </div>
            
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <motion.button 
                onClick={() => handleTogglePlugin(plugin)}
                disabled={actionLoading === plugin.name}
                className={`p-2 rounded-lg transition-colors ${
                  plugin.running 
                    ? 'text-green-600 bg-green-50 hover:bg-green-100' 
                    : 'text-gray-500 bg-gray-50 hover:bg-gray-100'
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
                  className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  title="查看日志"
                >
                  <FileText className="w-4 h-4" />
                </motion.button>
                <motion.button 
                  onClick={() => openConfigModal(plugin)}
                  className="p-2 text-gray-500 hover:text-[#165DFF] hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
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

      {filteredPlugins.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>暂无插件</p>
          <p className="text-sm text-gray-400 mt-2">请在 /plugins/{selfId}/ 目录下添加插件</p>
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
              className="bg-white dark:bg-[#1D2129] rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  配置: {selectedPlugin.name}
                </h3>
                <button
                  onClick={() => setConfigModalOpen(false)}
                  className="p-2 text-gray-500 hover:text-gray-700 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                <textarea
                  ref={textareaRef}
                  value={pluginConfigText}
                  onChange={e => {
                    setPluginConfigText(e.target.value);
                    try {
                      setPluginConfig(JSON.parse(e.target.value));
                    } catch {
                      // 继续允许编辑
                    }
                  }}
                  className="w-full h-64 p-4 font-mono text-sm bg-gray-50 dark:bg-[#2A2E38] border border-gray-200 dark:border-gray-700 rounded-lg outline-none resize-y text-gray-900 dark:text-white focus:ring-2 focus:ring-[#165DFF] focus:border-transparent"
                  style={{ display: 'block' }}
                />
              </div>
              <div className="flex justify-end gap-2 p-4 border-t border-gray-100 dark:border-gray-800">
                <button
                  onClick={() => setConfigModalOpen(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveConfig}
                  disabled={savingConfig}
                  className="px-4 py-2 bg-[#165DFF] text-white rounded-lg hover:bg-[#0047FF] transition-colors flex items-center gap-2 disabled:opacity-50"
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
              className="bg-white dark:bg-[#1D2129] rounded-xl shadow-xl max-w-3xl w-full max-h-[80vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  插件日志: {selectedPlugin.name}
                </h3>
                <button
                  onClick={() => setLogModalOpen(false)}
                  className="p-2 text-gray-500 hover:text-gray-700 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {loadingLogs ? (
                  <div className="flex items-center justify-center h-64">
                    <RefreshCw className="w-8 h-8 animate-spin text-[#165DFF]" />
                  </div>
                ) : pluginLogs.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>暂无日志</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pluginLogs.map((log, idx) => (
                      <div key={idx} className="p-2 bg-gray-50 dark:bg-[#2A2E38] rounded text-sm font-mono text-gray-700 dark:text-gray-300 break-all">
                        {log}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 p-4 border-t border-gray-100 dark:border-gray-800">
                <button
                  onClick={() => openLogModal(selectedPlugin)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  刷新
                </button>
                <button
                  onClick={() => setLogModalOpen(false)}
                  className="px-4 py-2 bg-[#165DFF] text-white rounded-lg hover:bg-[#0047FF] transition-colors"
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

// --- Logs Component ---
const Logs = ({ selfId }: { selfId: string }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [logType, setLogType] = useState<'ws' | 'plugin'>('ws');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'recv' | 'send'>('all');
  const [expandedLog, setExpandedLog] = useState<number | null>(null);
  const MAX_LOGS = 100; // 单个账号只缓存 100 条
  const logsEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  // 获取日志
  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await logApi.getWSLogs(selfId, MAX_LOGS);
      if (res.retcode === 0 && res.data) {
        setLogs(res.data.logs);
      }
    } catch (error) {
      console.error('获取日志失败:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selfId]);

  // 初始加载和定时刷新
  useEffect(() => {
    fetchLogs();

    if (!autoRefresh) return;

    // 每 3 秒刷新一次
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [fetchLogs, autoRefresh]);

  // 提取 echo 值用于配对
  const extractEcho = (log: string): string | null => {
    try {
      // 找到 JSON 部分（在 [send] 或 [recv] 之后）
      const jsonStart = log.indexOf('{');
      if (jsonStart === -1) return null;
      const jsonStr = log.substring(jsonStart);
      const data = JSON.parse(jsonStr);
      return data.echo || null;
    } catch {
      return null;
    }
  };

  // 配对日志：将发送和对应的返回消息组合
  const pairLogs = (logList: string[]) => {
    const pairs: { send?: string; recv?: string; echo: string | null }[] = [];
    const sendMap = new Map<string, string>();
    const unpaired: string[] = [];

    // 先收集所有发送消息
    logList.forEach(log => {
      if (log.includes('[send]')) {
        const echo = extractEcho(log);
        if (echo) {
          sendMap.set(echo, log);
        } else {
          unpaired.push(log);
        }
      }
    });

    // 然后匹配接收消息
    logList.forEach(log => {
      if (log.includes('[recv]')) {
        const echo = extractEcho(log);
        if (echo && sendMap.has(echo)) {
          pairs.push({
            send: sendMap.get(echo),
            recv: log,
            echo
          });
          sendMap.delete(echo);
        } else {
          unpaired.push(log);
        }
      }
    });

    // 剩余未匹配的发送消息
    sendMap.forEach((sendLog) => {
      unpaired.push(sendLog);
    });

    return { pairs, unpaired };
  };

  // 过滤日志
  const filteredLogs = logs.filter(log => {
    if (directionFilter === 'all') return true;
    if (directionFilter === 'recv') return log.includes('[recv]');
    if (directionFilter === 'send') return log.includes('[send]');
    return true;
  });

  // 全部模式下使用配对视图
  const { pairs, unpaired } = directionFilter === 'all' ? pairLogs(logs) : { pairs: [], unpaired: [] };

  const getDirectionColor = (log: string) => {
    if (log.includes('[recv]')) return 'text-green-600 bg-green-50 dark:bg-green-900/20';
    if (log.includes('[send]')) return 'text-blue-600 bg-blue-50 dark:bg-blue-900/20';
    return 'text-gray-500 bg-gray-50';
  };

  const getDirectionText = (log: string) => {
    if (log.includes('[recv]')) return '接收';
    if (log.includes('[send]')) return '发送';
    return '未知';
  };

  const clearLogs = () => {
    setLogs([]);
    toast.success('日志已清空');
  };

  const toggleExpand = (index: number) => {
    setExpandedLog(expandedLog === index ? null : index);
  };

  return (
    <motion.div 
      className="bg-white dark:bg-[#1D2129] rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col h-[600px]"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <h3 className="font-bold text-gray-900 dark:text-white flex items-center">
            <FileText className="w-5 h-5 mr-2 text-[#165DFF]" />
            实时日志
          </h3>
          <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
          <span className="text-xs text-gray-500">
            {autoRefresh ? '自动刷新' : '手动刷新'}
          </span>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs text-gray-500">
            {filteredLogs.length} / {logs.length} 条
          </span>
          <select
            value={logType}
            onChange={e => setLogType(e.target.value as 'ws' | 'plugin')}
            className="px-3 py-1.5 bg-gray-50 dark:bg-[#2A2E38] border border-gray-200 dark:border-gray-700 rounded-lg text-sm outline-none text-gray-900 dark:text-white"
          >
            <option value="ws">默认</option>
          </select>
          <select
            value={directionFilter}
            onChange={e => setDirectionFilter(e.target.value as 'all' | 'recv' | 'send')}
            className="px-3 py-1.5 bg-gray-50 dark:bg-[#2A2E38] border border-gray-200 dark:border-gray-700 rounded-lg text-sm outline-none text-gray-900 dark:text-white"
          >
            <option value="all">全部</option>
            <option value="recv">接收</option>
            <option value="send">发送</option>
          </select>
          <motion.button 
            onClick={fetchLogs}
            disabled={isLoading}
            className="p-2 text-gray-500 hover:text-[#165DFF] hover:bg-blue-50 rounded-lg transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title="刷新日志"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </motion.button>
          <motion.button 
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`p-2 rounded-lg transition-colors ${autoRefresh ? 'text-green-600 bg-green-50' : 'text-gray-500 hover:text-gray-700'}`}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title={autoRefresh ? '自动刷新开启' : '自动刷新关闭'}
          >
            {autoRefresh ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </motion.button>
          <motion.button 
            onClick={clearLogs}
            className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title="清空日志"
          >
            <Trash2 className="w-4 h-4" />
          </motion.button>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto">
        {directionFilter === 'all' ? (
          // 全部模式：配对视图
          <div className="space-y-2 p-2">
            {pairs.length === 0 && unpaired.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                {isLoading ? '加载中...' : '暂无日志'}
              </div>
            ) : (
              <>
                {/* 配对的消息 */}
                {pairs.map((pair, i) => (
                  <motion.div
                    key={`pair-${i}`}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden cursor-pointer"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.01 }}
                    onClick={() => toggleExpand(i)}
                  >
                    {/* 发送消息 */}
                    {pair.send && (
                      <div className="bg-blue-50 dark:bg-blue-900/10 p-3 border-b border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold text-blue-600 bg-blue-100 dark:bg-blue-900/30">
                            发送
                          </span>
                          {pair.echo && (
                            <span className="text-xs text-gray-400">echo: {pair.echo}</span>
                          )}
                        </div>
                        <div className="text-gray-800 dark:text-gray-200 font-mono text-xs">
                          {expandedLog === i ? (
                            <div className="whitespace-pre-wrap break-all bg-white dark:bg-gray-800 p-2 rounded">
                              {pair.send}
                            </div>
                          ) : (
                            <div className="truncate" title="点击展开">
                              {pair.send}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {/* 接收消息 */}
                    {pair.recv && (
                      <div className="bg-green-50 dark:bg-green-900/10 p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold text-green-600 bg-green-100 dark:bg-green-900/30">
                            返回
                          </span>
                          {pair.echo && (
                            <span className="text-xs text-gray-400">echo: {pair.echo}</span>
                          )}
                        </div>
                        <div className="text-gray-800 dark:text-gray-200 font-mono text-xs">
                          {expandedLog === i ? (
                            <div className="whitespace-pre-wrap break-all bg-white dark:bg-gray-800 p-2 rounded">
                              {pair.recv}
                            </div>
                          ) : (
                            <div className="truncate" title="点击展开">
                              {pair.recv}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
                {/* 未配对的消息 */}
                {unpaired.map((log, i) => (
                  <motion.div
                    key={`unpaired-${i}`}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-[#2A2E38]/50"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: (pairs.length + i) * 0.01 }}
                    onClick={() => toggleExpand(pairs.length + i)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getDirectionColor(log)}`}>
                        {getDirectionText(log)}
                      </span>
                      <span className="text-xs text-gray-400">(未配对)</span>
                    </div>
                    <div className="text-gray-800 dark:text-gray-200 font-mono text-xs">
                      {expandedLog === pairs.length + i ? (
                        <div className="whitespace-pre-wrap break-all bg-gray-100 dark:bg-gray-800 p-2 rounded">
                          {log}
                        </div>
                      ) : (
                        <div className="truncate" title="点击展开">
                          {log}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </>
            )}
          </div>
        ) : (
          // 筛选模式：列表视图
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 dark:bg-[#2A2E38] text-gray-500 sticky top-0">
              <tr>
                <th className="px-6 py-3 w-24">方向</th>
                <th className="px-6 py-3">消息内容</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-6 py-12 text-center text-gray-500">
                    {isLoading ? '加载中...' : '暂无日志'}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log, i) => (
                  <motion.tr 
                    key={i} 
                    className="hover:bg-gray-50 dark:hover:bg-[#2A2E38]/50 transition-colors cursor-pointer"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.01 }}
                    onClick={() => toggleExpand(i)}
                  >
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getDirectionColor(log)}`}>
                        {getDirectionText(log)}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-800 dark:text-gray-200 font-mono text-xs">
                      {expandedLog === i ? (
                        <div className="whitespace-pre-wrap break-all bg-gray-100 dark:bg-gray-800 p-2 rounded">
                          {log}
                        </div>
                      ) : (
                        <div className="truncate max-w-2xl" title="点击展开">
                          {log}
                        </div>
                      )}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        )}
        <div ref={logsEndRef} />
      </div>
    </motion.div>
  );
};

// --- Main Page ---
export function BotDetail() {
  const { selfId } = useParams<{ selfId: string }>();
  const navigate = useNavigate();
  const { bots, selectBot } = useBotStore();
  const [activeTab, setActiveTab] = useState('overview');
  const [restarting, setRestarting] = useState(false);

  const bot = bots.find(b => b.self_id === selfId);

  useEffect(() => {
    if (selfId) selectBot(selfId);
  }, [selfId, selectBot]);

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
      <div className="p-8 text-center text-gray-500">
        <p className="mb-4">Bot not found</p>
        <button onClick={() => navigate('/')} className="text-[#165DFF] underline">返回首页</button>
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
        className="flex items-center justify-between bg-white dark:bg-[#1D2129] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center">
          <motion.button 
            onClick={() => navigate('/')} 
            className="mr-4 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </motion.button>
          <motion.img 
            src={bot.avatar} 
            className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mr-4 ring-4 ring-white dark:ring-[#1D2129]" 
            alt="Avatar"
            whileHover={{ scale: 1.1 }}
          />
          <div>
             <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
               {bot.nickname}
               <span className={`ml-3 px-2 py-0.5 rounded-full text-xs font-normal border ${
                 bot.status === BotStatus.ONLINE 
                   ? 'bg-green-50 border-green-200 text-green-600' 
                   : 'bg-gray-50 border-gray-200 text-gray-500'
               }`}>
                 {bot.status === BotStatus.ONLINE ? '在线' : '离线'}
               </span>
             </h1>
             <p className="text-gray-500 font-mono text-sm mt-1">QQ: {bot.self_id}</p>
          </div>
        </div>
        
        <div className="flex space-x-3">
          <motion.button 
            onClick={handleRestart}
            disabled={restarting}
            className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-[#2A2E38] transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {restarting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            重启服务
          </motion.button>
        </div>
      </motion.div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-gray-200 dark:border-gray-800">
        {tabs.map((tab, index) => (
          <motion.button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center px-6 py-3 border-b-2 font-medium text-sm transition-all ${
              activeTab === tab.id 
                ? 'border-[#165DFF] text-[#165DFF]' 
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
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
        <div className="flex-1 min-h-[400px]">
          {activeTab === 'overview' && <BotOverview selfId={bot.self_id} />}
          {activeTab === 'debug' && <ApiDebug botId={bot.self_id} />}
          {activeTab === 'plugins' && <Plugins selfId={bot.self_id} />}
          {activeTab === 'logs' && <Logs selfId={bot.self_id} />}
        </div>
      </AnimatePresence>
    </div>
  );
}
