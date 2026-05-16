import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Monitor,
  Cpu,
  HardDrive,
  Wifi,
  Code,
  Users,
  Loader2,
  ArrowUp,
  ArrowDown,
  MemoryStick,
} from 'lucide-react';
import { toast } from 'sonner';
import { accountApi, type AccountData, pluginApi, systemApi, settingsApi } from '../services/api';
import { BotStatus } from '../constants';
import { UsagePie } from '../components/dashboard/UsagePie';

interface ServerStatus {
  os: {
    platform: string;
    platformFamily: string;
    platformVersion: string;
    kernelVersion: string;
    os: string;
  };
  cpu: {
    model: string;
    cores: number;
    usagePercent: number;
  };
  memory: {
    total: number;
    used: number;
    available: number;
    usagePercent: number;
  };
  network: {
    uploadBytes: number;
    downloadBytes: number;
  };
}

interface PluginMemoryInfo {
  name: string;
  memory: number;
  memory_mb: string;
}

// 格式化字节（用于网络速度）
const formatBytes = (bytes: number) => {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
};

// 智能格式化内存大小
const formatMemorySize = (bytes: number) => {
  if (bytes < 1024) {
    return bytes.toFixed(0) + ' B';
  } else if (bytes < 1024 * 512) {
    // 512KB 以内显示 KB
    return (bytes / 1024).toFixed(1) + ' KB';
  } else if (bytes < 1024 * 1024 * 1024) {
    // 1GB 以内显示 MB
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  } else {
    // 1GB 以上显示 GB
    return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
  }
};

const cardCls = 'backdrop-blur-sm border border-white/40 dark:border-white/10 shadow-sm rounded-2xl transition-all overflow-hidden bg-white/60 dark:bg-black/40';

const StatusItem: React.FC<{ title: string; value?: string | number; unit?: string }> = ({ title, value = '-', unit }) => (
  <div className='py-1.5 text-sm col-span-1 flex justify-between items-center'>
    <div className='w-24 font-medium text-default-600 dark:text-gray-300'>{title}</div>
    <div className='font-mono text-xs text-default-500'>
      {value}
      {unit && <span className='ml-0.5 opacity-70'>{unit}</span>}
    </div>
  </div>
);

export function Dashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [backendVersion, setBackendVersion] = useState('');
  const [onlineCount, setOnlineCount] = useState(0);
  const [totalAccountCount, setTotalAccountCount] = useState(0);
  const [runningPluginCount, setRunningPluginCount] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const [prevUpload, setPrevUpload] = useState(0);
  const [prevDownload, setPrevDownload] = useState(0);
  const [pluginMemories, setPluginMemories] = useState<PluginMemoryInfo[]>([]);
  const [pluginMemTotal, setPluginMemTotal] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const networkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pluginMemTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPluginMemory = useCallback(async () => {
    try {
      console.log('开始获取插件内存...');
      const allPluginsRes = await pluginApi.getAllPluginsWithMemory();
      console.log('所有插件响应:', allPluginsRes);
      
      if (!allPluginsRes.success || !Array.isArray(allPluginsRes.data)) return;

      const allPlugins: PluginMemoryInfo[] = [];
      let totalMem = 0;

      for (const plugin of allPluginsRes.data) {
        const mem = plugin.memory || 0;
        totalMem += mem;
        // 显示插件名称和所属账号
        allPlugins.push({
          name: `${plugin.name} (${plugin.self_id})`,
          memory: mem,
          // 使用我们自己的格式化函数
          memory_mb: formatMemorySize(mem),
        });
      }

      // 确保按内存从高到低排序
      allPlugins.sort((a, b) => b.memory - a.memory);
      console.log('最终插件列表:', allPlugins);
      setPluginMemories(allPlugins);
      setPluginMemTotal(totalMem);
    } catch (e) {
      console.error('获取插件内存失败:', e);
    }
  }, []);

  const fetchInitialData = useCallback(async () => {
    try {
      const [statusRes, infoRes, accountsRes, allPluginsRes] = await Promise.all([
        systemApi.getServerStatus(),
        systemApi.getSystemInfo(),
        accountApi.getAccounts(),
        pluginApi.getAllPluginsWithMemory(),
      ]);

      if (statusRes.success && statusRes.data) {
        setServerStatus(statusRes.data);
        setPrevUpload(statusRes.data.network.uploadBytes);
        setPrevDownload(statusRes.data.network.downloadBytes);
      }

      if (infoRes.success && infoRes.data) {
        setBackendVersion(infoRes.data.version);
      }

      if ((accountsRes.status === 'ok' || accountsRes.success) && Array.isArray(accountsRes.data)) {
        setTotalAccountCount(accountsRes.data.length);
        setOnlineCount(
          accountsRes.data.filter((a: AccountData) => a.status === BotStatus.ONLINE).length
        );
      }

      // 使用新的API获取准确的插件运行数量
      if (allPluginsRes.success && Array.isArray(allPluginsRes.data)) {
        setRunningPluginCount(allPluginsRes.data.length);
      }

      await fetchPluginMemory();
    } catch (error) {
      console.error('获取初始数据失败:', error);
      toast.error('获取系统信息失败');
    }
  }, [fetchPluginMemory]);

  const fetchNetworkSpeed = useCallback(async () => {
    try {
      const res = await settingsApi.getNetworkSpeed();
      if (res.success && res.data) {
        setUploadSpeed(res.data.uploadSpeed);
        setDownloadSpeed(res.data.downloadSpeed);
      }
    } catch {
      // silent
    }
  }, []);

  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const token = localStorage.getItem('auth_token');
    const url = token
      ? `/api/system/status-stream?token=${encodeURIComponent(token)}`
      : '/api/system/status-stream';

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data) {
          setServerStatus((prev) => {
            if (!prev) return prev;
            const newUpload = data.network?.uploadBytes ?? prev.network.uploadBytes;
            const newDownload = data.network?.downloadBytes ?? prev.network.downloadBytes;
            if (prevUpload > 0 && newUpload > prevUpload) {
              setUploadSpeed((newUpload - prevUpload) / 5);
            }
            if (prevDownload > 0 && newDownload > prevDownload) {
              setDownloadSpeed((newDownload - prevDownload) / 5);
            }
            setPrevUpload(newUpload);
            setPrevDownload(newDownload);
            return {
              os: prev.os,
              cpu: data.cpu ?? prev.cpu,
              memory: data.memory ?? prev.memory,
              network: {
                uploadBytes: newUpload,
                downloadBytes: newDownload,
              },
            };
          });
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      startPolling();
    };
  }, [prevUpload, prevDownload]);

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await systemApi.getServerStatus();
        if (res.success && res.data) {
          setServerStatus((prev) => {
            if (!prev) return res.data;
            const newUpload = res.data.network.uploadBytes;
            const newDownload = res.data.network.downloadBytes;
            if (prevUpload > 0 && newUpload > prevUpload) {
              setUploadSpeed((newUpload - prevUpload) / 5);
            }
            if (prevDownload > 0 && newDownload > prevDownload) {
              setDownloadSpeed((newDownload - prevDownload) / 5);
            }
            setPrevUpload(newUpload);
            setPrevDownload(newDownload);
            return res.data;
          });
        }
      } catch {
        // silent
      }
    }, 5000);
  }, [prevUpload, prevDownload]);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await fetchInitialData();
      setIsLoading(false);
      connectSSE();
    };
    init();

    networkTimerRef.current = setInterval(fetchNetworkSpeed, 5000);
    fetchNetworkSpeed();

    pluginMemTimerRef.current = setInterval(fetchPluginMemory, 10000);

    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (networkTimerRef.current) clearInterval(networkTimerRef.current);
      if (pluginMemTimerRef.current) clearInterval(pluginMemTimerRef.current);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-[#165DFF]" />
      </div>
    );
  }

  const os = serverStatus?.os;
  const cpu = serverStatus?.cpu;
  const memory = serverStatus?.memory;

  return (
    <section className='w-full p-2 md:p-4 md:max-w-[1000px] mx-auto overflow-hidden'>
      <div className='grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch'>
        <div className='flex flex-col gap-2'>
          <div className={cardCls}>
            <div className='flex items-center gap-2 font-bold px-4 pt-4 pb-0 text-default-700 dark:text-white'>
              <Monitor className='text-lg opacity-80' />
              <span>系统信息</span>
            </div>
            <div className='px-4 pb-4 pt-2 flex flex-col gap-1'>
              <div className='flex text-sm gap-3 py-2 items-baseline'>
                <div className='w-24 font-medium text-default-600 dark:text-gray-300'>OS</div>
                <div className='text-xs font-mono flex-1 text-default-500'>{os?.os || '-'}</div>
              </div>
              <div className='flex text-sm gap-3 py-2 items-baseline'>
                <div className='w-24 font-medium text-default-600 dark:text-gray-300'>平台</div>
                <div className='text-xs font-mono flex-1 text-default-500'>{os?.platformFamily || '-'}</div>
              </div>
              <div className='flex text-sm gap-3 py-2 items-baseline'>
                <div className='w-24 font-medium text-default-600 dark:text-gray-300'>内核版本</div>
                <div className='text-xs font-mono flex-1 text-default-500'>{os?.kernelVersion || '-'}</div>
              </div>
              <div className='flex text-sm gap-3 py-2 items-baseline'>
                <div className='w-24 font-medium text-default-600 dark:text-gray-300'>后端版本</div>
                <div className='text-xs font-mono flex-1 text-default-500'>{backendVersion || '-'}</div>
              </div>
            </div>
          </div>

          <div className={cardCls}>
            <div className='flex items-center gap-2 font-bold px-4 pt-4 pb-0 text-default-700 dark:text-white'>
              <Users className='text-lg opacity-80' />
              <span>账号概览</span>
            </div>
            <div className='px-4 pb-4 pt-2 flex flex-col gap-1'>
              <div className='flex text-sm gap-3 py-2 items-baseline'>
                <div className='w-24 font-medium text-default-600 dark:text-gray-300'>在线/总计</div>
                <div className='text-xs font-mono flex-1 text-default-500'>{onlineCount} / {totalAccountCount}</div>
              </div>
              <div className='flex text-sm gap-3 py-2 items-baseline'>
                <div className='w-24 font-medium text-default-600 dark:text-gray-300'>运行中插件</div>
                <div className='text-xs font-mono flex-1 text-default-500'>{runningPluginCount}</div>
              </div>
            </div>
          </div>
        </div>

        <div className={`${cardCls} lg:col-span-2`}>
          <div className='overflow-visible md:flex-row gap-4 items-center justify-stretch p-4 flex flex-col md:flex-row'>
            <div className='flex-1 w-full md:max-w-96'>
              <h2 className='text-lg font-semibold flex items-center gap-2 mb-2 text-default-700 dark:text-gray-200'>
                <Cpu className='text-xl opacity-80' />
                <span>CPU</span>
              </h2>
              <div className='grid grid-cols-2 gap-2'>
                <StatusItem title='型号' value={cpu?.model || '-'} />
                <StatusItem title='核心数' value={cpu?.cores ?? '-'} />
                <StatusItem title='使用率' value={cpu?.usagePercent?.toFixed(1) ?? '-'} unit='%' />
              </div>

              <h2 className='text-lg font-semibold flex items-center gap-2 mb-2 mt-4 text-default-700 dark:text-gray-200'>
                <HardDrive className='text-xl opacity-80' />
                <span>内存</span>
              </h2>
              <div className='grid grid-cols-2 gap-2'>
                <StatusItem title='总量' value={formatMemorySize(memory?.total ?? 0)} />
                <StatusItem title='使用量' value={formatMemorySize(memory?.used ?? 0)} />
              </div>
            </div>
            <div className='flex flex-row md:flex-col gap-2 flex-shrink-0 w-full justify-center md:w-40 min-h-40 mt-4 md:mt-0 md:mx-auto'>
              <UsagePie
                systemUsage={cpu?.usagePercent ?? 0}
                processUsage={0}
                title='CPU占用'
              />
              <UsagePie
                systemUsage={memory?.usagePercent ?? 0}
                processUsage={0}
                title='内存占用'
              />
            </div>
          </div>
        </div>
      </div>

      <div className='mt-4 grid grid-cols-1 md:grid-cols-2 gap-4'>
        <div className={cardCls}>
          <div className='flex items-center gap-2 font-bold px-4 pt-4 pb-0 text-default-700 dark:text-white'>
            <Wifi className='text-lg opacity-80' />
            <span>网络速度</span>
          </div>
          <div className='px-4 pb-4 pt-2 grid grid-cols-2 gap-4'>
            <div className='flex items-center gap-2'>
              <ArrowUp className='w-4 h-4 text-green-500' />
              <div className='flex flex-col'>
                <span className='text-xs text-default-600 dark:text-gray-300'>上传</span>
                <span className='text-sm font-mono text-default-500'>{formatBytes(uploadSpeed)}/s</span>
              </div>
            </div>
            <div className='flex items-center gap-2'>
              <ArrowDown className='w-4 h-4 text-blue-500' />
              <div className='flex flex-col'>
                <span className='text-xs text-default-600 dark:text-gray-300'>下载</span>
                <span className='text-sm font-mono text-default-500'>{formatBytes(downloadSpeed)}/s</span>
              </div>
            </div>
          </div>
        </div>

        <div className={cardCls}>
          <div className='flex items-center gap-2 font-bold px-4 pt-4 pb-0 text-default-700 dark:text-white'>
            <MemoryStick className='text-lg opacity-80' />
            <span>Lua插件内存</span>
            <span className='ml-auto text-xs font-normal text-default-500'>
              暂不支持
            </span>
          </div>
          <div className='px-4 pb-4 pt-2 flex flex-col gap-1 max-h-48 overflow-y-auto'>
            <div className='flex flex-col items-center justify-center py-6'>
              <Code className='w-8 h-8 text-gray-300 dark:text-gray-600 mb-2' />
              <span className='text-sm text-gray-400 dark:text-gray-500'>暂不支持</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
