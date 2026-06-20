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

const formatBytes = (bytes: number) => {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
};

const formatMemorySize = (bytes: number) => {
  if (bytes < 1024) {
    return bytes.toFixed(0) + ' B';
  } else if (bytes < 1024 * 512) {
    return (bytes / 1024).toFixed(1) + ' KB';
  } else if (bytes < 1024 * 1024 * 1024) {
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  } else {
    return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
  }
};

const cardCls = 'backdrop-blur-sm bg-white/60 dark:bg-black/40 dark:backdrop-blur-xl border border-gray-100 dark:border-white/10 rounded-2xl overflow-hidden dark:backdrop-saturate-150';

const StatusItem: React.FC<{ title: string; value?: string | number; unit?: string }> = ({ title, value = '-', unit }) => (
  <div className='py-1.5 text-sm col-span-1 flex justify-between items-center'>
    <div className='w-24 font-medium text-gray-600 dark:text-gray-400'>{title}</div>
    <div className='font-mono text-xs text-gray-900 dark:text-white font-medium'>
      {value}
      {unit && <span className='ml-0.5 text-gray-500'>{unit}</span>}
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
  const abortControllerRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const networkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pluginMemTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPluginMemory = useCallback(async () => {
    try {
      const allPluginsRes = await pluginApi.getAllPluginsWithMemory();
      if (!allPluginsRes.success || !Array.isArray(allPluginsRes.data)) return;

      const allPlugins: PluginMemoryInfo[] = [];
      let totalMem = 0;

      for (const plugin of allPluginsRes.data) {
        const mem = plugin.memory || 0;
        totalMem += mem;
        allPlugins.push({
          name: `${plugin.name} (${plugin.self_id})`,
          memory: mem,
          memory_mb: formatMemorySize(mem),
        });
      }

      allPlugins.sort((a, b) => b.memory - a.memory);
      setPluginMemories(allPlugins);
      setPluginMemTotal(totalMem);
    } catch {
      // 忽略插件内存获取失败
    }
  }, []);

  const fetchInitialData = useCallback(async () => {
    try {
      const [statusRes, accountsRes, verRes] = await Promise.all([
        systemApi.getServerStatus(),
        accountApi.getAccounts(),
        systemApi.getVersion(),
      ]);

      if (statusRes.success && statusRes.data) {
        setServerStatus(statusRes.data);
        setPrevUpload(statusRes.data.network.uploadBytes);
        setPrevDownload(statusRes.data.network.downloadBytes);
      }

      if (verRes.success) {
        setBackendVersion(verRes.version);
      }

      if ((accountsRes.status === 'ok' || accountsRes.success) && Array.isArray(accountsRes.data)) {
        setTotalAccountCount(accountsRes.data.length);
        setOnlineCount(
          accountsRes.data.filter((a: AccountData) => a.status === BotStatus.ONLINE).length
        );
      }
    } catch {
      toast.error('获取系统信息失败');
    }
  }, []);

  const fetchNetworkSpeed = useCallback(async () => {
    try {
      const res = await settingsApi.getNetworkSpeed();
      if (res.success && res.data) {
        setUploadSpeed(res.data.uploadSpeed);
        setDownloadSpeed(res.data.downloadSpeed);
      }
    } catch {
    }
  }, []);

  /**
   * connectSSE - 使用 fetch + ReadableStream 实现 SSE 连接
   *
   * [安全修复] 原实现使用 EventSource (GET)，将认证 Token 暴露在 URL 查询参数中。
   * 修复方案：改用 fetch + POST + ReadableStream，Token 通过 Authorization Header 传递。
   */
  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const token = localStorage.getItem('auth_token') || '';
    const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
    const url = `${baseUrl}/api/system/status-stream`;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let isCleanClose = false;

    (async () => {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({}),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          startPolling();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!controller.signal.aborted) {
          try {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data:')) {
                const dataStr = line.slice(5).trim();
                if (dataStr) {
                  try {
                    const data = JSON.parse(dataStr);
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
                    // 忽略单行解析错误
                  }
                }
              }
            }
          } catch (readError) {
            if ((readError as Error).name === 'AbortError') break;
            throw readError;
          }
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError' || isCleanClose) return;
        startPolling();
      }
    })();
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
      }
    }, 5000);
  }, [prevUpload, prevDownload]);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await fetchInitialData();
      setIsLoading(false);
      connectSSE();
      
      setTimeout(() => {
        fetchPluginMemory();
      }, 1000);
    };
    init();

    networkTimerRef.current = setInterval(fetchNetworkSpeed, 5000);
    fetchNetworkSpeed();

    pluginMemTimerRef.current = setInterval(fetchPluginMemory, 10000);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (networkTimerRef.current) clearInterval(networkTimerRef.current);
      if (pluginMemTimerRef.current) clearInterval(pluginMemTimerRef.current);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-[#165DFF] dark:text-white/60" />
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
            <div className='flex items-center gap-2 font-bold px-4 pt-4 pb-0 text-gray-900 dark:text-white'>
              <Monitor className='text-lg text-default-500 dark:text-white/60' />
              <span>系统信息</span>
            </div>
            <div className='px-4 pb-4 pt-2 flex flex-col gap-1'>
              <div className='flex text-sm gap-3 py-2 items-baseline'>
                <div className='w-24 font-medium text-gray-600 dark:text-gray-400'>OS</div>
                <div className='text-xs font-mono flex-1 text-gray-900 dark:text-white font-medium'>{os?.platform || os?.os || '-'}</div>
              </div>
              <div className='flex text-sm gap-3 py-2 items-baseline'>
                <div className='w-24 font-medium text-gray-600 dark:text-gray-400'>内核版本</div>
                <div className='text-xs font-mono flex-1 text-gray-900 dark:text-white font-medium'>{os?.kernelVersion || '-'}</div>
              </div>
              <div className='flex text-sm gap-3 py-2 items-baseline'>
                <div className='w-24 font-medium text-gray-600 dark:text-gray-400'>软件版本</div>
                <div className='text-xs font-mono flex-1 text-gray-900 dark:text-white font-medium'>{backendVersion || '-'}</div>
              </div>
            </div>
          </div>

          <div className={cardCls}>
            <div className='flex items-center gap-2 font-bold px-4 pt-4 pb-0 text-gray-900 dark:text-white'>
              <Users className='text-lg text-default-500 dark:text-white/60' />
              <span>账号概览</span>
            </div>
            <div className='px-4 pb-4 pt-2 flex flex-col gap-1'>
              <div className='flex text-sm gap-3 py-2 items-baseline'>
                <div className='w-24 font-medium text-gray-600 dark:text-gray-400'>在线/总计</div>
                <div className='text-xs font-mono flex-1 text-gray-900 dark:text-white font-medium'>{onlineCount} / {totalAccountCount}</div>
              </div>
              <div className='flex text-sm gap-3 py-2 items-baseline'>
                <div className='w-24 font-medium text-gray-600 dark:text-gray-400'>运行中插件</div>
                <div className='text-xs font-mono flex-1 text-gray-900 dark:text-white font-medium'>{runningPluginCount}</div>
              </div>
            </div>
          </div>
        </div>

        <div className={`${cardCls} lg:col-span-2`}>
          <div className='overflow-visible md:flex-row gap-8 items-center justify-center p-4 flex flex-col md:flex-row'>
            <div className='w-full md:w-auto md:max-w-96'>
              <h2 className='text-lg font-semibold flex items-center gap-2 mb-2 text-gray-900 dark:text-white'>
                <Cpu className='text-xl text-default-500 dark:text-white/60' />
                <span>CPU</span>
              </h2>
              <div className='grid grid-cols-2 gap-2'>
                <StatusItem title='型号' value={cpu?.model || '-'} />
                <StatusItem title='核心数' value={cpu?.cores ?? '-'} />
                <StatusItem title='使用率' value={cpu?.usagePercent?.toFixed(1) ?? '-'} unit='%' />
              </div>

              <h2 className='text-lg font-semibold flex items-center gap-2 mb-2 mt-8 text-gray-900 dark:text-white'>
                <HardDrive className='text-xl text-default-500 dark:text-white/60' />
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
          <div className='flex items-center gap-2 font-bold px-4 pt-4 pb-0 text-gray-900 dark:text-white'>
            <Wifi className='text-lg text-default-500 dark:text-white/60' />
            <span>网络速度</span>
          </div>
          <div className='px-4 pb-4 pt-2 grid grid-cols-2 gap-4'>
            <div className='flex items-center gap-2'>
              <ArrowUp className='w-4 h-4 text-gray-500' />
              <div className='flex flex-col'>
                <span className='text-xs text-gray-600 dark:text-gray-400'>上传</span>
                <span className='text-sm font-mono text-gray-900 dark:text-white font-medium'>{formatBytes(uploadSpeed)}/s</span>
              </div>
            </div>
            <div className='flex items-center gap-2'>
              <ArrowDown className='w-4 h-4 text-gray-500' />
              <div className='flex flex-col'>
                <span className='text-xs text-gray-600 dark:text-gray-400'>下载</span>
                <span className='text-sm font-mono text-gray-900 dark:text-white font-medium'>{formatBytes(downloadSpeed)}/s</span>
              </div>
            </div>
          </div>
        </div>

        <div className={cardCls}>
          <div className='flex items-center gap-2 font-bold px-4 pt-4 pb-0 text-gray-900 dark:text-white'>
            <MemoryStick className='text-lg text-default-500 dark:text-white/60' />
            <span>Lua插件内存</span>
            <span className='ml-auto text-xs font-normal text-gray-500'>
              预留
            </span>
          </div>
          <div className='px-4 pb-4 pt-2 flex flex-col gap-1 max-h-48 overflow-y-auto'>
            <div className='flex flex-col items-center justify-center py-6'>
              <Code className='w-8 h-8 text-gray-500 mb-2' />
              <span className='text-sm text-gray-500'>暂不支持</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
