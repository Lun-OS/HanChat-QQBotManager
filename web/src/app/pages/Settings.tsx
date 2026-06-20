import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Save, Github, FileText, HelpCircle, Shield, Trash2, Info,
  RefreshCw, Eye, EyeOff, Palette, Sun, Moon, Clock, CalendarDays,
  LogIn, AlertTriangle, CheckCircle, Eraser, Zap, ZapOff
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import { settingsApi, systemApi, logApi } from '../services/api';
import { usePerformanceMode } from '../hooks/usePerformanceMode';
import { confirmAndClearBrowserCache } from '../utils/clearCache';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';


function ConfigPageItem({ children }: { children: React.ReactNode }) {
  return (
    <div className='w-full mx-auto backdrop-blur-sm border border-white/40 dark:border-white/10 shadow-sm rounded-2xl bg-white/60 dark:bg-black/40 dark:backdrop-blur-xl max-w-3xl'>
      <div className='py-6 px-4 md:py-8 md:px-12'>
        <div className='w-full flex flex-col gap-5'>
          {children}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description?: string }) {
  return (
    <div>
      <div className='flex items-center'>
        <Icon className='w-5 h-5 text-[#165DFF] dark:text-white mr-2' />
        <h2 className='text-lg font-semibold text-gray-900 dark:text-white'>{title}</h2>
      </div>
      {description && <p className='text-sm text-gray-600 dark:text-gray-400 mt-1'>{description}</p>}
    </div>
  );
}

const inputClass = 'w-full p-2.5 bg-white/50 dark:bg-white/5 border border-white/40 dark:border-white/10 rounded-lg outline-none focus:ring-2 focus:ring-[#165DFF] dark:focus:ring-white/20 backdrop-blur-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500';

export function Settings() {
  const [backendVersion, setBackendVersion] = useState('');
  const [loading, setLoading] = useState(false);
  const [performanceMode] = usePerformanceMode();

  useEffect(() => {
    fetchVersion();
  }, []);

  const fetchVersion = async () => {
    try {
      setLoading(true);
      const versionRes = await systemApi.getVersion();
      if (versionRes.success) {
        setBackendVersion(versionRes.version || '未知');
      }
    } catch {
      // 忽略版本获取失败
    } finally {
      setLoading(false);
    }
  };

  // 性能模式下跳过 Tab 切换动画
  const renderTab = (key: string, content: React.ReactNode) =>
    performanceMode ? (
      <div key={key}>{content}</div>
    ) : (
      <AnimatePresence mode='wait'>
        <motion.div
          key={key}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {content}
        </motion.div>
      </AnimatePresence>
    );

  return (
    <section className='w-full max-w-[1200px] mx-auto py-4 md:py-8 px-2 md:px-6 relative'>
      <Tabs defaultValue='connection' className='w-full flex flex-col items-center'>
        <TabsList className='bg-white/40 dark:bg-black/20 backdrop-blur-sm rounded-2xl p-1.5 border border-white/40 dark:border-white/10 mb-4 md:mb-8 w-full md:w-fit mx-auto overflow-x-auto'>
          <TabsTrigger
            value='connection'
            className='h-9 px-4 md:px-6 data-[state=active]:bg-[#165DFF]/10 data-[state=active]:backdrop-blur-md data-[state=active]:shadow-sm data-[state=active]:rounded-xl data-[state=active]:text-[#165DFF] dark:data-[state=active]:bg-white/10 dark:data-[state=active]:text-white text-gray-600 dark:text-gray-400 hover:text-[#165DFF] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.04] font-medium transition-all'
          >
            连接配置
          </TabsTrigger>
          <TabsTrigger
            value='appearance'
            className='h-9 px-4 md:px-6 data-[state=active]:bg-[#165DFF]/10 data-[state=active]:backdrop-blur-md data-[state=active]:shadow-sm data-[state=active]:rounded-xl data-[state=active]:text-[#165DFF] dark:data-[state=active]:bg-white/10 dark:data-[state=active]:text-white text-gray-600 dark:text-gray-400 hover:text-[#165DFF] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.04] font-medium transition-all'
          >
            外观设置
          </TabsTrigger>
          <TabsTrigger
            value='logger'
            className='h-9 px-4 md:px-6 data-[state=active]:bg-[#165DFF]/10 data-[state=active]:backdrop-blur-md data-[state=active]:shadow-sm data-[state=active]:rounded-xl data-[state=active]:text-[#165DFF] dark:data-[state=active]:bg-white/10 dark:data-[state=active]:text-white text-gray-600 dark:text-gray-400 hover:text-[#165DFF] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.04] font-medium transition-all'
          >
            日志设置
          </TabsTrigger>
          <TabsTrigger
            value='security'
            className='h-9 px-4 md:px-6 data-[state=active]:bg-[#165DFF]/10 data-[state=active]:backdrop-blur-md data-[state=active]:shadow-sm data-[state=active]:rounded-xl data-[state=active]:text-[#165DFF] dark:data-[state=active]:bg-white/10 dark:data-[state=active]:text-white text-gray-600 dark:text-gray-400 hover:text-[#165DFF] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.04] font-medium transition-all'
          >
            安全
          </TabsTrigger>
          <TabsTrigger
            value='about'
            className='h-9 px-4 md:px-6 data-[state=active]:bg-[#165DFF]/10 data-[state=active]:backdrop-blur-md data-[state=active]:shadow-sm data-[state=active]:rounded-xl data-[state=active]:text-[#165DFF] dark:data-[state=active]:bg-white/10 dark:data-[state=active]:text-white text-gray-600 dark:text-gray-400 hover:text-[#165DFF] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.04] font-medium transition-all'
          >
            关于
          </TabsTrigger>
        </TabsList>

        <TabsContent value='connection' className='w-full relative p-0'>
          {renderTab('connection', <ConnectionTab />)}
        </TabsContent>

        <TabsContent value='appearance' className='w-full relative p-0'>
          {renderTab('appearance', <AppearanceTab />)}
        </TabsContent>

        <TabsContent value='logger' className='w-full relative p-0'>
          {renderTab('logger', <LoggerTab />)}
        </TabsContent>

        <TabsContent value='security' className='w-full relative p-0'>
          {renderTab('security', <SecurityTab />)}
        </TabsContent>

        <TabsContent value='about' className='w-full relative p-0'>
          {renderTab('about', <AboutTab backendVersion={backendVersion} loading={loading} />)}
        </TabsContent>
      </Tabs>
    </section>
  );
}

function ConnectionTab() {
  const [websocketAuthorization, setWebsocketAuthorization] = useState('');
  const [showWebsocketAuth, setShowWebsocketAuth] = useState(false);
  const [wsPort, setWsPort] = useState(8080);
  const [corsOrigins, setCorsOrigins] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchConnectionSettings();
  }, []);

  const fetchConnectionSettings = async () => {
    try {
      setLoading(true);
      const settingsRes = await settingsApi.getSettings();
      if (settingsRes.success && settingsRes.data) {
        setWebsocketAuthorization(settingsRes.data.websocket_authorization || '');
      }
      const advancedRes = await settingsApi.getAdvanced();
      if (advancedRes.success && advancedRes.data) {
        setWsPort(advancedRes.data.wsPort || 8080);
        setCorsOrigins(
          Array.isArray(advancedRes.data.corsOrigins)
            ? advancedRes.data.corsOrigins.join(',')
            : advancedRes.data.corsOrigins || ''
        );
      }
    } catch {
      // 忽略连接设置获取失败
    } finally {
      setLoading(false);
    }
  };

  const containsInvalidChars = (str: string): boolean => {
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) {
        return true;
      }
    }
    return false;
  };

  const handleSave = async () => {
    if (websocketAuthorization.length > 512) {
      toast.error('WebSocket Authorization 长度不能超过512字符');
      return;
    }
    if (containsInvalidChars(websocketAuthorization)) {
      toast.error('WebSocket Authorization 包含非法字符');
      return;
    }
    if (wsPort < 1024 || wsPort > 65535) {
      toast.error('WebSocket端口必须在1024-65535之间');
      return;
    }

    try {
      setSaving(true);
      const [settingsRes, advancedRes] = await Promise.all([
        settingsApi.saveSettings({ websocket_authorization: websocketAuthorization }),
        settingsApi.saveAdvanced({ ws_port: wsPort, cors_origins: corsOrigins }),
      ]);
      if (settingsRes.success && advancedRes.success) {
        toast.success('连接配置已保存');
      } else {
        toast.error('保存失败: ' + (settingsRes.message || advancedRes.message || '未知错误'));
      }
    } catch {
      toast.error('保存连接设置失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ConfigPageItem>
      <SectionTitle icon={Shield} title='WebSocket Token' description='设置 LLBot WebSocket 连接的 Token（可留空）' />
      <label className='text-sm font-medium text-gray-700 dark:text-gray-300'>
        WebSocket Authorization(token)
      </label>
      <div className='relative'>
        <input
          type={showWebsocketAuth ? 'text' : 'password'}
          value={websocketAuthorization}
          onChange={(e) => setWebsocketAuthorization(e.target.value)}
          placeholder='留空表示不使用Authorization'
          className={`${inputClass} pr-10`}
        />
        <button
          type='button'
          onClick={() => setShowWebsocketAuth(!showWebsocketAuth)}
          className='absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
        >
          {showWebsocketAuth ? <EyeOff className='w-4 h-4' /> : <Eye className='w-4 h-4' />}
        </button>
      </div>
      <p className='text-xs text-gray-600 dark:text-gray-400'>
        修改后正在连接的不受影响，新连接将使用新Token
      </p>

      <div className='border-t border-white/40 dark:border-white/[0.06] my-2' />

      {/* <SectionTitle icon={Shield} title='WebSocket端口' description='设置 WebSocket 服务监听端口' />
      <label className='text-sm font-medium text-gray-700 dark:text-gray-300'>
        端口号
      </label>
      <input
        type='number'
        min={1024}
        max={65535}
        value={wsPort}
        onChange={(e) => setWsPort(Number(e.target.value))}
        className={inputClass}
      />
      <p className='text-xs text-gray-600 dark:text-gray-400'>范围: 1024-65535</p>

      <div className='border-t border-white/40 dark:border-white/[0.06] my-2' />

      <SectionTitle icon={Shield} title='CORS允许域名' description='设置允许跨域访问的域名，多个域名用逗号分隔' />
      <label className='text-sm font-medium text-gray-700 dark:text-gray-300'>
        域名列表
      </label>
      <input
        type='text'
        value={corsOrigins}
        onChange={(e) => setCorsOrigins(e.target.value)}
        placeholder='例如: http://localhost:3000,https://example.com'
        className={inputClass}
      />
      <p className='text-xs text-gray-600 dark:text-gray-400'>留空表示不允许跨域，多个域名用英文逗号分隔</p> */}

      <div className='flex justify-end pt-2'>
        <button
          onClick={handleSave}
          disabled={saving}
          className='flex items-center px-6 py-2 bg-[#165DFF] text-white rounded-xl text-sm hover:bg-[#0047FF] transition-all shadow-lg shadow-[#165DFF]/20 dark:bg-white dark:text-black dark:hover:bg-gray-200 dark:shadow-black/20 disabled:opacity-50'
        >
          {saving ? (
            <RefreshCw className='w-4 h-4 mr-2 animate-spin' />
          ) : (
            <Save className='w-4 h-4 mr-2' />
          )}
          {saving ? '保存中...' : '保存更改'}
        </button>
      </div>
    </ConfigPageItem>
  );
}

const APPEARANCE_KEY = 'appearance_settings';

function loadAppearanceFromStorage() {
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return null;
}

function saveAppearanceToStorage(data: Record<string, unknown>) {
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  const [primary, setPrimary] = useState('#165DFF');
  const [accent, setAccent] = useState('#e9ebef');
  const [destructive, setDestructive] = useState('#d4183d');
  const [fontSize, setFontSize] = useState(16);
  const [savingCSS, setSavingCSS] = useState(false);
  const [savingFont, setSavingFont] = useState(false);
  const [performanceMode, setPerformanceMode] = usePerformanceMode();

  useEffect(() => {
    const data = loadAppearanceFromStorage();
    if (data) {
      if (data.theme) setTheme(data.theme);
      if (data.fontSize) {
        setFontSize(data.fontSize);
        document.documentElement.style.fontSize = data.fontSize + 'px';
      }
      if (data.customCSS) {
        if (data.customCSS.primary) {
          setPrimary(data.customCSS.primary);
          document.documentElement.style.setProperty('--primary', data.customCSS.primary);
        }
        if (data.customCSS.accent) {
          setAccent(data.customCSS.accent);
          document.documentElement.style.setProperty('--accent', data.customCSS.accent);
        }
        if (data.customCSS.destructive) {
          setDestructive(data.customCSS.destructive);
          document.documentElement.style.setProperty('--destructive', data.customCSS.destructive);
        }
      }
    }
  }, []);

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    const data = loadAppearanceFromStorage() || {};
    data.theme = newTheme;
    saveAppearanceToStorage(data);
    toast.success('主题已切换');
  };

  const applyColor = (key: string, value: string) => {
    document.documentElement.style.setProperty(`--${key}`, value);
  };

  const handleSaveCSS = () => {
    setSavingCSS(true);
    const data = loadAppearanceFromStorage() || {};
    data.customCSS = { primary, accent, destructive };
    saveAppearanceToStorage(data);
    toast.success('配色已保存');
    setTimeout(() => setSavingCSS(false), 300);
  };

  const handleFontSizeChange = (value: number) => {
    setFontSize(value);
    document.documentElement.style.fontSize = value + 'px';
  };

  const handleSaveFontSize = () => {
    setSavingFont(true);
    const data = loadAppearanceFromStorage() || {};
    data.fontSize = fontSize;
    saveAppearanceToStorage(data);
    toast.success('字体大小已保存');
    setTimeout(() => setSavingFont(false), 300);
  };

  const handleTogglePerformanceMode = () => {
    const next = !performanceMode;
    setPerformanceMode(next);
    toast.success(
      next
        ? '性能模式已开启：已关闭动画与毛玻璃效果'
        : '性能模式已关闭：已恢复动画与毛玻璃效果'
    );
  };

  const currentTheme = theme || 'light';

  return (
    <div className='w-full flex flex-col gap-5'>
      <ConfigPageItem>
        <SectionTitle icon={Palette} title='主题模式' description='选择界面的显示主题' />
        <div className='grid grid-cols-2 gap-4'>
          <button
            onClick={() => handleThemeChange('light')}
            className={`flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all backdrop-blur-sm ${
              currentTheme === 'light'
                ? 'border-[#165DFF] bg-[#165DFF]/10 text-[#165DFF] dark:border-white dark:bg-white/10 dark:text-white'
                : 'border-gray-200 bg-gray-50 text-gray-600 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-gray-400 hover:border-gray-300'
            }`}
          >
            <Sun className={`w-8 h-8 ${currentTheme === 'light' ? 'text-[#165DFF] dark:text-white' : 'text-gray-400 dark:text-gray-500'}`} />
            <span className={`text-sm font-medium ${currentTheme === 'light' ? 'text-[#165DFF] dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
              亮色模式
            </span>
          </button>
          <button
            onClick={() => handleThemeChange('dark')}
            className={`flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all backdrop-blur-sm ${
              currentTheme === 'dark'
                ? 'border-[#165DFF] bg-[#165DFF]/10 text-[#165DFF] dark:border-white dark:bg-white/10 dark:text-white'
                : 'border-gray-200 bg-gray-50 text-gray-600 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-gray-400 hover:border-gray-300'
            }`}
          >
            <Moon className={`w-8 h-8 ${currentTheme === 'dark' ? 'text-[#165DFF] dark:text-white' : 'text-gray-400 dark:text-gray-500'}`} />
            <span className={`text-sm font-medium ${currentTheme === 'dark' ? 'text-[#165DFF] dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
              暗色模式
            </span>
          </button>
        </div>
      </ConfigPageItem>

      <ConfigPageItem>
        <SectionTitle
          icon={performanceMode ? ZapOff : Zap}
          title='性能模式（减少动画）'
          description='关闭界面动画与毛玻璃效果，降低CPU/GPU占用，推荐低端设备或手机端开启'
        />
        <div className='flex items-center justify-between bg-white/50 dark:bg-white/5 border border-white/40 dark:border-white/10 rounded-lg p-3 gap-3'>
          <div className='flex-1 min-w-0'>
            <h3 className='text-sm font-medium text-gray-900 dark:text-white'>
              {performanceMode ? '已开启性能模式' : '当前为标准模式'}
            </h3>
            <p className='text-xs text-gray-600 dark:text-gray-400 mt-0.5'>
              {performanceMode
                ? '已禁用页面切换动画、星空背景、毛玻璃滤镜等高开销效果'
                : '开启后将显著降低移动端的卡顿，登录页面体验会更流畅'}
            </p>
          </div>
          <button
            type='button'
            onClick={handleTogglePerformanceMode}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
              performanceMode
                ? 'bg-[#165DFF] dark:bg-white'
                : 'bg-gray-200 dark:bg-gray-700'
            }`}
            aria-pressed={performanceMode}
            aria-label='切换性能模式'
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-black transition-transform ${
                performanceMode ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </ConfigPageItem>
{/* 
      <ConfigPageItem>
        <SectionTitle icon={Palette} title='自定义配色' description='自定义界面的颜色方案' />
        {[
          { label: '主色调', key: 'primary', value: primary, setter: setPrimary },
          { label: '强调色', key: 'accent', value: accent, setter: setAccent },
          { label: '危险色', key: 'destructive', value: destructive, setter: setDestructive },
        ].map((item) => (
          <div key={item.key} className='flex items-center gap-4 bg-white/50 dark:bg-white/5 border border-white/40 dark:border-white/10 rounded-lg p-2'>
            <span className='text-sm font-medium text-gray-700 dark:text-gray-300 w-16 shrink-0'>
              {item.label}
            </span>
            <div
              className='w-8 h-8 rounded-full border border-white/40 dark:border-white/[0.06] shrink-0'
              style={{ backgroundColor: item.value }}
            />
            <input
              type='text'
              value={item.value}
              onChange={(e) => {
                item.setter(e.target.value);
                applyColor(item.key, e.target.value);
              }}
              className='flex-1 p-2 bg-white/50 dark:bg-white/5 border border-white/40 dark:border-white/10 rounded-lg outline-none focus:ring-2 focus:ring-[#165DFF] dark:focus:ring-white/20 backdrop-blur-sm text-sm font-mono text-gray-900 dark:text-white'
            />
            <input
              type='color'
              value={item.value}
              onChange={(e) => {
                item.setter(e.target.value);
                applyColor(item.key, e.target.value);
              }}
              className='w-10 h-10 rounded-lg border border-white/40 dark:border-white/[0.06] cursor-pointer shrink-0'
            />
          </div>
        ))}
        <div className='flex justify-end pt-2'>
          <button
            onClick={handleSaveCSS}
            disabled={savingCSS}
            className='flex items-center px-6 py-2 bg-[#165DFF] text-white rounded-xl text-sm hover:bg-[#0047FF] transition-all shadow-lg shadow-[#165DFF]/20 dark:bg-white dark:text-black dark:hover:bg-gray-200 dark:shadow-black/20 disabled:opacity-50'
          >
            {savingCSS ? (
              <RefreshCw className='w-4 h-4 mr-2 animate-spin' />
            ) : (
              <Save className='w-4 h-4 mr-2' />
            )}
            {savingCSS ? '保存中...' : '保存配色'}
          </button>
        </div>
      </ConfigPageItem> */}

      <ConfigPageItem>
        <SectionTitle icon={Palette} title='字体大小' description='调整界面的基础字体大小' />
        <div className='flex items-center gap-4'>
          <input
            type='range'
            min={12}
            max={24}
            value={fontSize}
            onChange={(e) => handleFontSizeChange(Number(e.target.value))}
            className='flex-1 h-2 bg-white/40 dark:bg-white/[0.06] rounded-lg appearance-none cursor-pointer accent-[#165DFF] dark:accent-white'
          />
          <span className='text-sm font-medium text-gray-700 dark:text-gray-300 w-12 text-center'>
            {fontSize}px
          </span>
        </div>
        <p className='text-xs text-gray-600 dark:text-gray-400'>范围: 12px - 24px，默认 16px</p>
        <div className='flex justify-end pt-2'>
          <button
            onClick={handleSaveFontSize}
            disabled={savingFont}
            className='flex items-center px-6 py-2 bg-[#165DFF] text-white rounded-xl text-sm hover:bg-[#0047FF] transition-all shadow-lg shadow-[#165DFF]/20 dark:bg-white dark:text-black dark:hover:bg-gray-200 dark:shadow-black/20 disabled:opacity-50'
          >
            {savingFont ? (
              <RefreshCw className='w-4 h-4 mr-2 animate-spin' />
            ) : (
              <Save className='w-4 h-4 mr-2' />
            )}
            {savingFont ? '保存中...' : '保存字体大小'}
          </button>
        </div>
      </ConfigPageItem>
    </div>
  );
}

function LoggerTab() {
  const [logLevel, setLogLevel] = useState('info');
  const [logRetentionDays, setLogRetentionDays] = useState(7);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const [cleanupEnabled, setCleanupEnabled] = useState(true);
  const [cleanupInterval, setCleanupInterval] = useState(24);
  const [cleanupRetention, setCleanupRetention] = useState(7);
  const [cleanupScope, setCleanupScope] = useState({
    pluginLog: true,
    loginLog: true,
    fileOpLog: true,
    pluginOpLog: true,
    proxyLog: true,
    botConnLog: true,
  });
  const [savingCleanup, setSavingCleanup] = useState(false);
  const [loadingCleanup, setLoadingCleanup] = useState(false);

  useEffect(() => {
    fetchLoggerSettings();
    fetchCleanupSettings();
  }, []);

  const fetchLoggerSettings = async () => {
    try {
      setLoading(true);
      const res = await settingsApi.getAdvanced();
      if (res.success && res.data) {
        setLogLevel(res.data.logLevel || 'info');
        setLogRetentionDays(res.data.logRetentionDays || 7);
      }
    } catch {
      // 忽略日志设置获取失败
    } finally {
      setLoading(false);
    }
  };

  const fetchCleanupSettings = async () => {
    try {
      setLoadingCleanup(true);
      const res = await settingsApi.getLogCleanup();
      if (res.success && res.data) {
        setCleanupEnabled(res.data.enabled);
        setCleanupInterval(res.data.interval);
        setCleanupRetention(res.data.retention);
        setCleanupScope(res.data.scope);
      }
    } catch {
      // 忽略日志清理设置获取失败
    } finally {
      setLoadingCleanup(false);
    }
  };

  const handleSave = async () => {
    if (logRetentionDays < 1 || logRetentionDays > 365) {
      toast.error('日志保留天数必须在1-365之间');
      return;
    }
    try {
      setSaving(true);
      const res = await settingsApi.saveAdvanced({
        log_level: logLevel,
        log_retention_days: logRetentionDays,
      });
      if (res.success) {
        toast.success('日志设置已保存');
      } else {
        toast.error('保存失败: ' + (res.message || '未知错误'));
      }
    } catch {
      toast.error('保存日志设置失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCleanup = async () => {
    if (cleanupInterval < 1 || cleanupInterval > 168) {
      toast.error('清理间隔必须在1-168小时之间');
      return;
    }
    if (cleanupRetention < 1 || cleanupRetention > 365) {
      toast.error('保留天数必须在1-365之间');
      return;
    }
    try {
      setSavingCleanup(true);
      const res = await settingsApi.saveLogCleanup({
        enabled: cleanupEnabled,
        interval: cleanupInterval,
        retention: cleanupRetention,
        scope: cleanupScope,
      });
      if (res.success) {
        toast.success('日志自动清理设置已保存');
      } else {
        toast.error('保存失败: ' + (res.message || '未知错误'));
      }
    } catch {
      toast.error('保存日志自动清理设置失败');
    } finally {
      setSavingCleanup(false);
    }
  };

  const scopeOptions = [
    { key: 'pluginLog' as const, label: '插件日志', description: '插件运行产生的日志' },
    { key: 'loginLog' as const, label: '登录日志', description: 'Web登录相关日志' },
    { key: 'fileOpLog' as const, label: '文件操作日志', description: '插件文件管理操作日志' },
    { key: 'pluginOpLog' as const, label: '插件操作日志', description: '插件加载/卸载等操作日志' },
    { key: 'proxyLog' as const, label: '代理日志', description: '接口代理服务相关日志' },
    { key: 'botConnLog' as const, label: '机器人连接日志', description: 'WebSocket连接相关日志' },
  ];

  return (
    <div className='w-full flex flex-col gap-5'>
      <ConfigPageItem>
        <SectionTitle icon={Eraser} title='日志自动清理' description='选择要自动清理的日志类型和清理策略' />

        <div className='flex items-center justify-between bg-white/50 dark:bg-white/5 border border-white/40 dark:border-white/10 rounded-lg p-3'>
          <div>
            <h3 className='text-sm font-medium text-gray-900 dark:text-white'>启用自动清理</h3>
            <p className='text-xs text-gray-600 dark:text-gray-400 mt-0.5'>按配置的策略自动清理过期日志文件</p>
          </div>
          <button
            type='button'
            onClick={() => setCleanupEnabled(!cleanupEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              cleanupEnabled
                ? 'bg-[#165DFF] dark:bg-white'
                : 'bg-gray-200 dark:bg-gray-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-black transition-transform ${
                cleanupEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className={`transition-opacity ${cleanupEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <div>
              <label className='text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2'>
                <Clock className='w-4 h-4' />
                清理间隔（小时）
              </label>
              <input
                type='number'
                min={1}
                max={168}
                value={cleanupInterval}
                onChange={(e) => setCleanupInterval(Number(e.target.value))}
                className={`${inputClass} mt-1.5`}
              />
              <p className='text-xs text-gray-600 dark:text-gray-400 mt-1'>范围: 1-168 小时，默认 24 小时</p>
            </div>
            <div>
              <label className='text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2'>
                <CalendarDays className='w-4 h-4' />
                保留天数
              </label>
              <input
                type='number'
                min={1}
                max={365}
                value={cleanupRetention}
                onChange={(e) => setCleanupRetention(Number(e.target.value))}
                className={`${inputClass} mt-1.5`}
              />
              <p className='text-xs text-gray-600 dark:text-gray-400 mt-1'>范围: 1-365 天，默认 7 天</p>
            </div>
          </div>

          <div className='border-t border-white/40 dark:border-white/[0.06] my-3' />

          <label className='text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block'>
            清理范围
          </label>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
            {scopeOptions.map((option) => (
              <div
                key={option.key}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                  cleanupScope[option.key]
                    ? 'bg-[#165DFF]/5 border-[#165DFF]/30 dark:bg-white/5 dark:border-white/20'
                    : 'bg-white/30 border-white/30 dark:bg-white/[0.02] dark:border-white/[0.06]'
                }`}
                onClick={() => setCleanupScope((prev) => ({ ...prev, [option.key]: !prev[option.key] }))}
              >
                <div className='mt-0.5'>
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                      cleanupScope[option.key]
                        ? 'bg-[#165DFF] border-[#165DFF] dark:bg-white dark:border-white'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    {cleanupScope[option.key] && (
                      <svg className='w-3 h-3 text-white dark:text-black' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={3}>
                        <path strokeLinecap='round' strokeLinejoin='round' d='M5 13l4 4L19 7' />
                      </svg>
                    )}
                  </div>
                </div>
                <div>
                  <p className='text-sm font-medium text-gray-900 dark:text-white'>{option.label}</p>
                  <p className='text-xs text-gray-600 dark:text-gray-400'>{option.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className='flex justify-end pt-2'>
          <button
            onClick={handleSaveCleanup}
            disabled={savingCleanup || loadingCleanup}
            className='flex items-center px-6 py-2 bg-[#165DFF] text-white rounded-xl text-sm hover:bg-[#0047FF] transition-all shadow-lg shadow-[#165DFF]/20 dark:bg-white dark:text-black dark:hover:bg-gray-200 dark:shadow-black/20 disabled:opacity-50'
          >
            {savingCleanup ? (
              <RefreshCw className='w-4 h-4 mr-2 animate-spin' />
            ) : (
              <Save className='w-4 h-4 mr-2' />
            )}
            {savingCleanup ? '保存中...' : '保存清理设置'}
          </button>
        </div>
      </ConfigPageItem>
    </div>
  );
}

function SecurityTab() {
  const [loginLogs, setLoginLogs] = useState<string[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    fetchLoginLogs();
  }, []);

  const fetchLoginLogs = async () => {
    try {
      setLoadingLogs(true);
      const res = await logApi.getLoginLogs(200);
      if (res.status === 'ok' && res.data) {
        setLoginLogs(res.data.logs || []);
      }
    } catch {
      // 忽略获取失败
    } finally {
      setLoadingLogs(false);
    }
  };

  const parseLogLine = (line: string) => {
    const match = line.match(/^\[(.*?)\]\s+\[(.*?)\]\s+\[IP:(.*?)\]\s+\[UA:(.*?)\]\s+(.*)$/);
    if (match) {
      return {
        timestamp: match[1],
        action: match[2],
        ip: match[3],
        ua: match[4],
        detail: match[5],
      };
    }
    return null;
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'LOGIN_SUCCESS':
        return <CheckCircle className='w-4 h-4 text-green-500' />;
      case 'LOGIN_FAILED':
        return <AlertTriangle className='w-4 h-4 text-red-500' />;
      case 'LOGOUT':
        return <LogIn className='w-4 h-4 text-blue-500' />;
      default:
        return <Shield className='w-4 h-4 text-gray-500' />;
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'LOGIN_SUCCESS':
        return '登录成功';
      case 'LOGIN_FAILED':
        return '登录失败';
      case 'LOGOUT':
        return '登出';
      default:
        return action;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'LOGIN_SUCCESS':
        return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10';
      case 'LOGIN_FAILED':
        return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10';
      case 'LOGOUT':
        return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10';
      default:
        return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-500/10';
    }
  };

  const parsedLogs = loginLogs.map(parseLogLine).filter(Boolean).reverse();

  return (
    <div className='w-full flex flex-col gap-5'>
      <ConfigPageItem>
        <SectionTitle icon={Shield} title='登录记录' description='查看最近的登录、登出操作记录' />

        <div className='flex justify-end'>
          <button
            onClick={fetchLoginLogs}
            disabled={loadingLogs}
            className='flex items-center px-4 py-1.5 bg-[#165DFF] text-white rounded-lg text-sm hover:bg-[#0047FF] transition-all shadow-lg shadow-[#165DFF]/20 dark:bg-white dark:text-black dark:hover:bg-gray-200 dark:shadow-black/20 disabled:opacity-50'
          >
            {loadingLogs ? (
              <RefreshCw className='w-4 h-4 mr-2 animate-spin' />
            ) : (
              <RefreshCw className='w-4 h-4 mr-2' />
            )}
            刷新
          </button>
        </div>

        <div className='border border-white/40 dark:border-white/10 rounded-xl overflow-hidden bg-white/30 dark:bg-white/[0.02]'>
          {parsedLogs.length === 0 ? (
            <div className='py-8 text-center text-gray-500 dark:text-gray-400 text-sm'>
              {loadingLogs ? '加载中...' : '暂无登录记录'}
            </div>
          ) : (
            <div className='max-h-[500px] overflow-y-auto'>
              {parsedLogs.map((log, index) => (
                <div
                  key={index}
                  className='flex items-center gap-3 px-4 py-3 border-b border-white/20 dark:border-white/[0.04] last:border-b-0 hover:bg-white/40 dark:hover:bg-white/[0.04] transition-colors'
                >
                  <div className='shrink-0'>{getActionIcon(log!.action)}</div>
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-2 flex-wrap'>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getActionColor(log!.action)}`}>
                        {getActionLabel(log!.action)}
                      </span>
                      <span className='text-xs text-gray-500 dark:text-gray-400 font-mono'>
                        {log!.timestamp}
                      </span>
                    </div>
                    <div className='mt-1 flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400'>
                      <span>IP: <span className='text-gray-900 dark:text-gray-200'>{log!.ip}</span></span>
                    </div>
                    {log!.ua && (
                      <p className='mt-0.5 text-xs text-gray-500 dark:text-gray-500 truncate' title={log!.ua}>
                        UA: {log!.ua}
                      </p>
                    )}
                    {log!.detail && (
                      <p className='mt-0.5 text-xs text-gray-500 dark:text-gray-500 truncate'>
                        {log!.detail}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className='text-xs text-gray-500 dark:text-gray-500'>
          仅显示最近 200 条记录，完整记录请查看服务器 logs/system_login_*.log 文件
        </p>
      </ConfigPageItem>
    </div>
  );
}

function AboutTab({ backendVersion, loading }: { backendVersion: string; loading: boolean }) {
  return (
    <div className='w-full flex flex-col gap-5'>
      <ConfigPageItem>
        <SectionTitle icon={Info} title='软件信息' />
        <div className='flex items-center'>
          <div className='w-12 h-12 bg-gradient-to-tr from-[#165DFF] to-[#69b1ff] dark:from-white dark:to-gray-400 rounded-full flex items-center justify-center text-black dark:text-black shadow-lg shadow-[#165DFF]/30 dark:shadow-black/30 mr-4'>
            <span className='text-lg font-bold'>H</span>
          </div>
          <div>
            <h3 className='font-bold text-gray-900 dark:text-white'>HanChat-QQBotManager</h3>
            <p className='text-sm text-gray-600 dark:text-gray-400'>{loading ? '版本加载中...' : backendVersion}</p>
          </div>
        </div>

        <div className='bg-white/50 dark:bg-white/[0.03] p-3 rounded-lg border border-white/40 dark:border-white/[0.06] w-full md:w-1/2'>
          <p className='text-xs text-gray-600 dark:text-gray-400 mb-1'>版本</p>
          <p className='text-lg font-semibold text-gray-900 dark:text-white'>{loading ? '-' : backendVersion}</p>
        </div>

        <p className='text-sm text-gray-600 dark:text-gray-400'>
          OVO 偷懒的第N天
        </p>
        <div className='flex flex-wrap gap-3'>
          <a
            href='https://github.com/Lun-OS/HanChat-QQBotManager'
            target='_blank'
            rel='noopener noreferrer'
            className='flex items-center text-[#165DFF] hover:text-[#0047FF] dark:text-gray-300 dark:hover:text-white text-sm px-3 py-2 rounded-lg bg-blue-50 dark:bg-white/[0.03]'
          >
            <Github className='w-4 h-4 mr-1' />
            GitHub 仓库
          </a>
          <a
            href='https://github.com/Lun-OS/HanChat-QQBotManager/blob/main/docs/index.md'
            target='_blank'
            rel='noopener noreferrer'
            className='flex items-center text-[#165DFF] hover:text-[#0047FF] dark:text-gray-300 dark:hover:text-white text-sm px-3 py-2 rounded-lg bg-blue-50 dark:bg-white/[0.03]'
          >
            <FileText className='w-4 h-4 mr-1' />
            文档中心
          </a>
          <a
            href='https://github.com/Lun-OS/HanChat-QQBotManager/issues'
            target='_blank'
            rel='noopener noreferrer'
            className='flex items-center text-[#165DFF] hover:text-[#0047FF] dark:text-gray-300 dark:hover:text-white text-sm px-3 py-2 rounded-lg bg-blue-50 dark:bg-white/[0.03]'
          >
            <HelpCircle className='w-4 h-4 mr-1' />
            提交反馈
          </a>
        </div>
      </ConfigPageItem>

      <ConfigPageItem>
        <SectionTitle icon={Trash2} title='浏览器缓存' description='清除浏览器本地存储的数据' />
        <div className='flex items-center justify-between'>
          <div>
            <h3 className='text-sm font-medium text-gray-900 dark:text-white'>清除缓存</h3>
            <p className='text-xs text-gray-600 dark:text-gray-400 mt-1'>清除 localStorage、sessionStorage 和缓存的API响应</p>
          </div>
          <button
            onClick={confirmAndClearBrowserCache}
            className='flex items-center px-6 py-2 bg-red-500 text-white rounded-xl text-sm hover:bg-red-600 transition-all shadow-lg shadow-red-500/20'
          >
            <Trash2 className='w-4 h-4 mr-2' />
            清除缓存
          </button>
        </div>
      </ConfigPageItem>
    </div>
  );
}
