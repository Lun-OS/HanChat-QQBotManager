import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Save, Github, FileText, HelpCircle, Shield, Trash2, Info,
  RefreshCw, Eye, EyeOff, Palette, Sun, Moon
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import { settingsApi, systemApi } from '../services/api';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';

const FRONTEND_VERSION = import.meta.env.VITE_APP_VERSION || 'V26.5.16';

function ConfigPageItem({ children }: { children: React.ReactNode }) {
  return (
    <div className='w-full mx-auto backdrop-blur-sm border border-white/40 dark:border-white/10 shadow-sm rounded-2xl bg-white/60 dark:bg-black/40 max-w-3xl'>
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
        <Icon className='w-5 h-5 text-[#165DFF] mr-2' />
        <h2 className='text-lg font-semibold text-gray-900 dark:text-white'>{title}</h2>
      </div>
      {description && <p className='text-sm text-gray-500 mt-1'>{description}</p>}
    </div>
  );
}

const inputClass = 'w-full p-2.5 bg-white/50 dark:bg-white/5 border border-white/40 dark:border-white/10 rounded-lg outline-none focus:ring-2 focus:ring-[#165DFF] backdrop-blur-sm';

export function Settings() {
  const [backendVersion, setBackendVersion] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchVersion();
  }, []);

  const fetchVersion = async () => {
    try {
      setLoading(true);
      const versionRes = await systemApi.getSystemInfo();
      if (versionRes.success && versionRes.data) {
        setBackendVersion(versionRes.data.version || '未知');
      }
    } catch (error) {
      console.error('获取版本失败:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className='w-full max-w-[1200px] mx-auto py-4 md:py-8 px-2 md:px-6 relative'>
      <Tabs defaultValue='connection' className='w-full flex flex-col items-center'>
        <TabsList className='bg-white/40 dark:bg-black/20 backdrop-blur-md rounded-2xl p-1.5 shadow-sm border border-white/20 dark:border-white/5 mb-4 md:mb-8 w-full md:w-fit mx-auto overflow-x-auto'>
          <TabsTrigger
            value='connection'
            className='h-9 px-4 md:px-6 data-[state=active]:bg-white/80 dark:data-[state=active]:bg-white/10 data-[state=active]:backdrop-blur-md data-[state=active]:shadow-sm data-[state=active]:rounded-xl data-[state=active]:text-[#165DFF] text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-medium transition-all'
          >
            连接配置
          </TabsTrigger>
          <TabsTrigger
            value='appearance'
            className='h-9 px-4 md:px-6 data-[state=active]:bg-white/80 dark:data-[state=active]:bg-white/10 data-[state=active]:backdrop-blur-md data-[state=active]:shadow-sm data-[state=active]:rounded-xl data-[state=active]:text-[#165DFF] text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-medium transition-all'
          >
            外观设置
          </TabsTrigger>
          <TabsTrigger
            value='logger'
            className='h-9 px-4 md:px-6 data-[state=active]:bg-white/80 dark:data-[state=active]:bg-white/10 data-[state=active]:backdrop-blur-md data-[state=active]:shadow-sm data-[state=active]:rounded-xl data-[state=active]:text-[#165DFF] text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-medium transition-all'
          >
            日志设置
          </TabsTrigger>
          <TabsTrigger
            value='about'
            className='h-9 px-4 md:px-6 data-[state=active]:bg-white/80 dark:data-[state=active]:bg-white/10 data-[state=active]:backdrop-blur-md data-[state=active]:shadow-sm data-[state=active]:rounded-xl data-[state=active]:text-[#165DFF] text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-medium transition-all'
          >
            关于
          </TabsTrigger>
        </TabsList>

        <TabsContent value='connection' className='w-full relative p-0'>
          <AnimatePresence mode='wait'>
            <motion.div
              key='connection'
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <ConnectionTab />
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        <TabsContent value='appearance' className='w-full relative p-0'>
          <AnimatePresence mode='wait'>
            <motion.div
              key='appearance'
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <AppearanceTab />
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        <TabsContent value='logger' className='w-full relative p-0'>
          <AnimatePresence mode='wait'>
            <motion.div
              key='logger'
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <LoggerTab />
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        <TabsContent value='about' className='w-full relative p-0'>
          <AnimatePresence mode='wait'>
            <motion.div
              key='about'
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <AboutTab backendVersion={backendVersion} loading={loading} />
            </motion.div>
          </AnimatePresence>
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
    } catch (error) {
      console.error('获取连接设置失败:', error);
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
    } catch (error) {
      console.error('保存连接设置失败:', error);
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
          className='absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
        >
          {showWebsocketAuth ? <EyeOff className='w-4 h-4' /> : <Eye className='w-4 h-4' />}
        </button>
      </div>
      <p className='text-xs text-gray-500'>
        修改后正在连接的不受影响，新连接将使用新Token
      </p>

      <div className='border-t border-white/20 dark:border-white/5 my-2' />

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
      <p className='text-xs text-gray-500'>范围: 1024-65535</p>

      <div className='border-t border-white/20 dark:border-white/5 my-2' />

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
      <p className='text-xs text-gray-500'>留空表示不允许跨域，多个域名用英文逗号分隔</p> */}

      <div className='flex justify-end pt-2'>
        <button
          onClick={handleSave}
          disabled={saving}
          className='flex items-center px-6 py-2 bg-[#165DFF] text-white rounded-xl text-sm hover:bg-[#0047FF] transition-all shadow-lg shadow-[#165DFF]/20 disabled:opacity-50'
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

function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  const [primary, setPrimary] = useState('#165DFF');
  const [accent, setAccent] = useState('#e9ebef');
  const [destructive, setDestructive] = useState('#d4183d');
  const [fontSize, setFontSize] = useState(16);
  const [saving, setSaving] = useState(false);
  const [savingCSS, setSavingCSS] = useState(false);
  const [savingFont, setSavingFont] = useState(false);

  useEffect(() => {
    fetchAppearance();
  }, []);

  const fetchAppearance = async () => {
    try {
      const res = await settingsApi.getAppearance();
      if (res.success && res.data) {
        if (res.data.theme) setTheme(res.data.theme);
        if (res.data.fontSize) {
          setFontSize(res.data.fontSize);
          document.documentElement.style.fontSize = res.data.fontSize + 'px';
        }
        if (res.data.customCSS) {
          if (res.data.customCSS.primary) {
            setPrimary(res.data.customCSS.primary);
            document.documentElement.style.setProperty('--primary', res.data.customCSS.primary);
          }
          if (res.data.customCSS.accent) {
            setAccent(res.data.customCSS.accent);
            document.documentElement.style.setProperty('--accent', res.data.customCSS.accent);
          }
          if (res.data.customCSS.destructive) {
            setDestructive(res.data.customCSS.destructive);
            document.documentElement.style.setProperty('--destructive', res.data.customCSS.destructive);
          }
        }
      }
    } catch (error) {
      console.error('获取外观设置失败:', error);
    }
  };

  const handleThemeChange = async (newTheme: string) => {
    setTheme(newTheme);
    try {
      const res = await settingsApi.saveAppearance({ theme: newTheme });
      if (res.success) {
        toast.success('主题已切换');
      }
    } catch (error) {
      console.error('保存主题失败:', error);
      toast.error('保存主题失败');
    }
  };

  const applyColor = (key: string, value: string) => {
    document.documentElement.style.setProperty(`--${key}`, value);
  };

  const handleSaveCSS = async () => {
    try {
      setSavingCSS(true);
      const res = await settingsApi.saveAppearance({
        customCSS: { primary, accent, destructive },
      });
      if (res.success) {
        toast.success('配色已保存');
      } else {
        toast.error('保存失败: ' + (res.message || '未知错误'));
      }
    } catch (error) {
      console.error('保存配色失败:', error);
      toast.error('保存配色失败');
    } finally {
      setSavingCSS(false);
    }
  };

  const handleFontSizeChange = (value: number) => {
    setFontSize(value);
    document.documentElement.style.fontSize = value + 'px';
  };

  const handleSaveFontSize = async () => {
    try {
      setSavingFont(true);
      const res = await settingsApi.saveAppearance({ fontSize });
      if (res.success) {
        toast.success('字体大小已保存');
      } else {
        toast.error('保存失败: ' + (res.message || '未知错误'));
      }
    } catch (error) {
      console.error('保存字体大小失败:', error);
      toast.error('保存字体大小失败');
    } finally {
      setSavingFont(false);
    }
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
                ? 'border-[#165DFF] bg-white/60 dark:bg-blue-900/20'
                : 'border-white/40 dark:border-white/10 bg-white/60 dark:bg-black/40 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <Sun className={`w-8 h-8 ${currentTheme === 'light' ? 'text-[#165DFF]' : 'text-gray-400'}`} />
            <span className={`text-sm font-medium ${currentTheme === 'light' ? 'text-[#165DFF]' : 'text-gray-500'}`}>
              亮色模式
            </span>
          </button>
          <button
            onClick={() => handleThemeChange('dark')}
            className={`flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all backdrop-blur-sm ${
              currentTheme === 'dark'
                ? 'border-[#165DFF] bg-white/60 dark:bg-blue-900/20'
                : 'border-white/40 dark:border-white/10 bg-white/60 dark:bg-black/40 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <Moon className={`w-8 h-8 ${currentTheme === 'dark' ? 'text-[#165DFF]' : 'text-gray-400'}`} />
            <span className={`text-sm font-medium ${currentTheme === 'dark' ? 'text-[#165DFF]' : 'text-gray-500'}`}>
              暗色模式
            </span>
          </button>
        </div>
      </ConfigPageItem>

      <ConfigPageItem>
        <SectionTitle icon={Palette} title='自定义配色' description='自定义界面的颜色方案' />
        {[
          { label: '主色调', key: 'primary', value: primary, setter: setPrimary },
          { label: '强调色', key: 'accent', value: accent, setter: setAccent },
          { label: '危险色', key: 'destructive', value: destructive, setter: setDestructive },
        ].map((item) => (
          <div key={item.key} className='flex items-center gap-4 bg-white/50 dark:bg-white/5 border border-white/20 dark:border-white/5 rounded-lg p-2'>
            <span className='text-sm font-medium text-gray-700 dark:text-gray-300 w-16 shrink-0'>
              {item.label}
            </span>
            <div
              className='w-8 h-8 rounded-full border border-white/40 dark:border-white/10 shrink-0'
              style={{ backgroundColor: item.value }}
            />
            <input
              type='text'
              value={item.value}
              onChange={(e) => {
                item.setter(e.target.value);
                applyColor(item.key, e.target.value);
              }}
              className='flex-1 p-2 bg-white/50 dark:bg-white/5 border border-white/40 dark:border-white/10 rounded-lg outline-none focus:ring-2 focus:ring-[#165DFF] backdrop-blur-sm text-sm font-mono'
            />
            <input
              type='color'
              value={item.value}
              onChange={(e) => {
                item.setter(e.target.value);
                applyColor(item.key, e.target.value);
              }}
              className='w-10 h-10 rounded-lg border border-white/40 dark:border-white/10 cursor-pointer shrink-0'
            />
          </div>
        ))}
        <div className='flex justify-end pt-2'>
          <button
            onClick={handleSaveCSS}
            disabled={savingCSS}
            className='flex items-center px-6 py-2 bg-[#165DFF] text-white rounded-xl text-sm hover:bg-[#0047FF] transition-all shadow-lg shadow-[#165DFF]/20 disabled:opacity-50'
          >
            {savingCSS ? (
              <RefreshCw className='w-4 h-4 mr-2 animate-spin' />
            ) : (
              <Save className='w-4 h-4 mr-2' />
            )}
            {savingCSS ? '保存中...' : '保存配色'}
          </button>
        </div>
      </ConfigPageItem>

      <ConfigPageItem>
        <SectionTitle icon={Palette} title='字体大小' description='调整界面的基础字体大小' />
        <div className='flex items-center gap-4'>
          <input
            type='range'
            min={12}
            max={24}
            value={fontSize}
            onChange={(e) => handleFontSizeChange(Number(e.target.value))}
            className='flex-1 h-2 bg-white/30 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#165DFF]'
          />
          <span className='text-sm font-medium text-gray-700 dark:text-gray-300 w-12 text-center'>
            {fontSize}px
          </span>
        </div>
        <p className='text-xs text-gray-500'>范围: 12px - 24px，默认 16px</p>
        <div className='flex justify-end pt-2'>
          <button
            onClick={handleSaveFontSize}
            disabled={savingFont}
            className='flex items-center px-6 py-2 bg-[#165DFF] text-white rounded-xl text-sm hover:bg-[#0047FF] transition-all shadow-lg shadow-[#165DFF]/20 disabled:opacity-50'
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

  useEffect(() => {
    fetchLoggerSettings();
  }, []);

  const fetchLoggerSettings = async () => {
    try {
      setLoading(true);
      const res = await settingsApi.getAdvanced();
      if (res.success && res.data) {
        setLogLevel(res.data.logLevel || 'info');
        setLogRetentionDays(res.data.logRetentionDays || 7);
      }
    } catch (error) {
      console.error('获取日志设置失败:', error);
    } finally {
      setLoading(false);
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
    } catch (error) {
      console.error('保存日志设置失败:', error);
      toast.error('保存日志设置失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ConfigPageItem>
      <SectionTitle icon={FileText} title='日志级别' description='设置系统日志的最低输出级别' />
      <label className='text-sm font-medium text-gray-700 dark:text-gray-300'>
        级别
      </label>
      <select
        value={logLevel}
        onChange={(e) => setLogLevel(e.target.value)}
        className={inputClass}
      >
        <option value='debug'>debug - 调试</option>
        <option value='info'>info - 信息</option>
        <option value='warn'>warn - 警告</option>
        <option value='error'>error - 错误</option>
      </select>
      <p className='text-xs text-gray-500'>
        低于此级别的日志将不会被记录
      </p>

      <div className='border-t border-white/20 dark:border-white/5 my-2' />

      <SectionTitle icon={FileText} title='日志保留天数' description='设置日志文件自动清理的保留天数' />
      <label className='text-sm font-medium text-gray-700 dark:text-gray-300'>
        天数
      </label>
      <input
        type='number'
        min={1}
        max={365}
        value={logRetentionDays}
        onChange={(e) => setLogRetentionDays(Number(e.target.value))}
        className={inputClass}
      />
      <p className='text-xs text-gray-500'>范围: 1-365 天，默认 7 天</p>

      <div className='flex justify-end pt-2'>
        <button
          onClick={handleSave}
          disabled={saving}
          className='flex items-center px-6 py-2 bg-[#165DFF] text-white rounded-xl text-sm hover:bg-[#0047FF] transition-all shadow-lg shadow-[#165DFF]/20 disabled:opacity-50'
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

function AboutTab({ backendVersion, loading }: { backendVersion: string; loading: boolean }) {
  const handleClearCache = async () => {
    if (confirm('确定要清除浏览器缓存吗？这将清除所有本地存储的数据和JS资源缓存。')) {
      try {
        localStorage.clear();
        sessionStorage.clear();

        if ('caches' in window) {
          try {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map((name) => caches.delete(name)));
          } catch (e) {
            console.log('清除Cache API缓存失败:', e);
          }
        }

        if ('serviceWorker' in navigator) {
          try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map((reg) => reg.unregister()));
          } catch (e) {
            console.log('清除Service Worker失败:', e);
          }
        }

        if ('indexedDB' in window) {
          try {
            const databases = (await indexedDB.databases?.()) || [];
            databases.forEach((db) => {
              if (db.name) indexedDB.deleteDatabase(db.name);
            });
          } catch (e) {
            console.log('清除IndexedDB失败:', e);
          }
        }

        toast.success('浏览器缓存已清除（包括JS资源）');
        window.location.reload();
      } catch (error) {
        console.error('清除缓存失败:', error);
        toast.error('清除缓存失败');
      }
    }
  };

  return (
    <div className='w-full flex flex-col gap-5'>
      <ConfigPageItem>
        <SectionTitle icon={Info} title='软件信息' />
        <div className='flex items-center'>
          <div className='w-12 h-12 bg-gradient-to-tr from-[#165DFF] to-cyan-400 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-500/30 mr-4'>
            <span className='text-lg font-bold'>H</span>
          </div>
          <div>
            <h3 className='font-bold text-gray-900 dark:text-white'>HanChat-QQBotManager</h3>
            <p className='text-sm text-gray-500'>前端 {FRONTEND_VERSION} / 后端 {loading ? '加载中...' : backendVersion}</p>
          </div>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          <div className='bg-white/50 dark:bg-white/5 p-3 rounded-lg'>
            <p className='text-xs text-gray-500 mb-1'>前端版本</p>
            <p className='text-lg font-semibold text-gray-900 dark:text-white'>{FRONTEND_VERSION}</p>
          </div>
          <div className='bg-white/50 dark:bg-white/5 p-3 rounded-lg'>
            <p className='text-xs text-gray-500 mb-1'>后端版本</p>
            <p className='text-lg font-semibold text-gray-900 dark:text-white'>{loading ? '-' : backendVersion}</p>
          </div>
        </div>

        <p className='text-sm text-gray-600 dark:text-gray-400'>
          OVO 偷懒的第N天
        </p>
        <div className='flex flex-wrap gap-3'>
          <a
            href='https://github.com/Lun-OS/HanChat-QQBotManager'
            target='_blank'
            rel='noopener noreferrer'
            className='flex items-center text-[#165DFF] hover:underline text-sm px-3 py-2 rounded-lg bg-blue-50/60 dark:bg-blue-900/20 backdrop-blur-sm'
          >
            <Github className='w-4 h-4 mr-1' />
            GitHub 仓库
          </a>
          <a
            href='https://github.com/Lun-OS/HanChat-QQBotManager/docs/index.md'
            target='_blank'
            rel='noopener noreferrer'
            className='flex items-center text-[#165DFF] hover:underline text-sm px-3 py-2 rounded-lg bg-blue-50/60 dark:bg-blue-900/20 backdrop-blur-sm'
          >
            <FileText className='w-4 h-4 mr-1' />
            文档中心
          </a>
          <a
            href='https://github.com/Lun-OS/HanChat-QQBotManager/issues'
            target='_blank'
            rel='noopener noreferrer'
            className='flex items-center text-[#165DFF] hover:underline text-sm px-3 py-2 rounded-lg bg-blue-50/60 dark:bg-blue-900/20 backdrop-blur-sm'
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
            <p className='text-xs text-gray-500 mt-1'>清除 localStorage、sessionStorage 和缓存的API响应</p>
          </div>
          <button
            onClick={handleClearCache}
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
