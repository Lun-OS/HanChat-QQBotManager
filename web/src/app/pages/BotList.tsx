import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  Search,
  Filter,
  Wifi,
  WifiOff,
  Loader2,
  ExternalLink,
  Plus,
  X,
  Copy,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { accountApi, settingsApi, type AccountData } from '../services/api';
import { getSafeQQAvatarUrl } from '../utils/security';

type StatusFilter = 'all' | 'online' | 'offline';

export function BotList() {
  const navigate = useNavigate();
  const [bots, setBots] = useState<AccountData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [wsName, setWsName] = useState('');
  const [qqId, setQqId] = useState('');
  const [wsToken, setWsToken] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetchBots();
    fetchWsToken();
  }, []);

  const fetchBots = async () => {
    try {
      setLoading(true);
      const res = await accountApi.getAccounts();
      if ((res.success || res.status === 'ok') && Array.isArray(res.data)) {
        setBots(res.data);
      }
    } catch {
      toast.error('获取机器人列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchWsToken = async () => {
    try {
      const res = await settingsApi.getSettings();
      if (res.success && res.data) {
        setWsToken(res.data.websocket_authorization || '');
      }
    } catch {
      // 忽略
    }
  };

  const handleOpenAddModal = () => {
    setWsName('');
    setQqId('');
    setCopied(null);
    setShowAddModal(true);
  };

  const wsUrl = wsName ? `ws://${window.location.host}/ws/${wsName}` : '';

  const connectMessage = '{\n  "post_type": "meta_event",\n  "meta_event_type": "lifecycle",\n  "sub_type": "connect"\n}';

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      toast.success('已复制');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error('复制失败');
    }
  };

  const filteredBots = useMemo(() => {
    return bots.filter((bot) => {
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'online' && bot.is_online) ||
        (statusFilter === 'offline' && !bot.is_online);

      const nickname = bot.login_info?.nickname || bot.self_id;
      const wsName = bot.custom_name || '';
      const appName = bot.version_info?.app_name || '';
      const searchLower = search.toLowerCase();
      const matchesSearch =
        !search ||
        nickname.toLowerCase().includes(searchLower) ||
        bot.self_id.toLowerCase().includes(searchLower) ||
        wsName.toLowerCase().includes(searchLower) ||
        appName.toLowerCase().includes(searchLower);

      return matchesStatus && matchesSearch;
    });
  }, [bots, search, statusFilter]);

  const onlineCount = bots.filter((b) => b.is_online).length;
  const offlineCount = bots.length - onlineCount;

  if (loading) {
    return (
      <div className='flex items-center justify-center h-64'>
        <Loader2 className='w-8 h-8 animate-spin text-[#165DFF] dark:text-white/60' />
      </div>
    );
  }

  return (
    <>
      <div className='w-full max-w-[1000px] mx-auto space-y-4'>
        <div className='flex flex-col sm:flex-row items-start sm:items-center gap-3'>
          <div className='relative flex-1 w-full'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 dark:text-gray-400' />
            <input
              type='text'
              placeholder='搜索昵称、QQ号、WS名称、框架...'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className='w-full pl-10 pr-4 py-2.5 bg-white/50 dark:bg-white/[0.03] border border-white/60 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:ring-1 focus:ring-blue-200 dark:focus:ring-white/20 backdrop-blur-sm dark:backdrop-blur-md outline-none transition-all'
            />
          </div>
          <div className='flex items-center gap-2'>
            <button
              onClick={handleOpenAddModal}
              className='flex items-center gap-1.5 px-4 py-2.5 bg-[#165DFF] text-white rounded-xl text-sm hover:bg-[#0047FF] transition-all shadow-lg shadow-[#165DFF]/20 dark:bg-white dark:text-black dark:hover:bg-gray-200 dark:shadow-black/20 font-medium'
            >
              <Plus className='w-4 h-4' />
              添加账号
            </button>
            <Filter className='w-4 h-4 text-gray-600 dark:text-gray-400' />
            {(
              [
                { key: 'all', label: '全部', count: bots.length },
                { key: 'online', label: '在线', count: onlineCount },
                { key: 'offline', label: '离线', count: offlineCount },
              ] as const
            ).map((filter) => (
              <button
                key={filter.key}
                onClick={() => setStatusFilter(filter.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === filter.key
                    ? 'bg-[#165DFF] text-white dark:bg-white dark:text-black'
                    : 'bg-gray-100 text-gray-700 dark:bg-white/[0.03] dark:text-gray-400 border border-white/60 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/[0.06]'
                }`}
              >
                {filter.label} ({filter.count})
              </button>
            ))}
          </div>
        </div>

        {filteredBots.length === 0 ? (
          <div className='flex flex-col items-center justify-center py-20'>
            <WifiOff className='w-12 h-12 text-gray-300 dark:text-gray-600 mb-4' />
            <p className='text-gray-400 dark:text-gray-500 text-sm'>
              {search || statusFilter !== 'all' ? '没有匹配的机器人' : '暂无机器人'}
            </p>
          </div>
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
            {filteredBots.map((bot) => (
              <BotCard
                key={bot.self_id}
                bot={bot}
                onClick={() => navigate(`/bot/${bot.self_id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 添加账号弹窗 */}
      {showAddModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center'>
          <div
            className='absolute inset-0 bg-black/50 backdrop-blur-sm'
            onClick={() => setShowAddModal(false)}
          />
          <div className='relative bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl border border-white/60 dark:border-white/10 w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto'>
            <div className='flex items-center justify-between p-5 border-b border-gray-100 dark:border-white/[0.06]'>
              <h2 className='text-lg font-semibold text-gray-900 dark:text-white'>添加账号</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className='p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors'
              >
                <X className='w-5 h-5' />
              </button>
            </div>

            <div className='p-5 space-y-4'>
              <div>
                <label className='text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block'>
                  WS 名称
                </label>
                <input
                  type='text'
                  placeholder='例如: my_bot'
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                  className='w-full px-4 py-2.5 bg-white/50 dark:bg-white/[0.03] border border-white/60 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:ring-1 focus:ring-blue-200 dark:focus:ring-white/20 backdrop-blur-sm outline-none transition-all'
                />
                <p className='text-xs text-gray-500 dark:text-gray-500 mt-1'>
                  仅允许中文、英文、数字、点(.)、下划线(_)、减号(-)
                </p>
              </div>

              <div>
                <label className='text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block'>
                  QQ 号
                </label>
                <input
                  type='text'
                  placeholder='例如: 123456789'
                  value={qqId}
                  onChange={(e) => setQqId(e.target.value.replace(/\D/g, ''))}
                  className='w-full px-4 py-2.5 bg-white/50 dark:bg-white/[0.03] border border-white/60 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:ring-1 focus:ring-blue-200 dark:focus:ring-white/20 backdrop-blur-sm outline-none transition-all'
                />
              </div>

              {wsName && (
                <div className='border-t border-gray-100 dark:border-white/[0.06] pt-4 space-y-4'>
                  <p className='text-sm font-medium text-gray-900 dark:text-white'>连接信息</p>

                  <div>
                    <label className='text-xs text-gray-500 dark:text-gray-500 mb-1 block'>
                      WebSocket 地址
                    </label>
                    <div className='flex items-center gap-2'>
                      <code className='flex-1 px-3 py-2 bg-blue-50 dark:bg-white/[0.03] border border-blue-100 dark:border-white/[0.06] rounded-lg text-sm font-mono text-gray-900 dark:text-white break-all'>
                        {wsUrl}
                      </code>
                      <button
                        onClick={() => copyToClipboard(wsUrl, 'url')}
                        className='shrink-0 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors'
                      >
                        {copied === 'url' ? (
                          <Check className='w-4 h-4 text-green-500' />
                        ) : (
                          <Copy className='w-4 h-4' />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className='text-xs text-gray-500 dark:text-gray-500 mb-1.5 block'>
                      请求头（Header）
                    </label>
                    <div className='space-y-2'>
                      <div className='flex items-center gap-2'>
                        <code className='flex-1 px-3 py-2 bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.06] rounded-lg text-sm font-mono text-gray-900 dark:text-white break-all'>
                          Authorization: Bearer {wsToken || '(未配置)'}
                        </code>
                        <button
                          onClick={() => copyToClipboard(`Authorization: Bearer ${wsToken || ''}`, 'auth')}
                          className='shrink-0 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors'
                        >
                          {copied === 'auth' ? (
                            <Check className='w-4 h-4 text-green-500' />
                          ) : (
                            <Copy className='w-4 h-4' />
                          )}
                        </button>
                      </div>
                      <div className='flex items-center gap-2'>
                        <code className='flex-1 px-3 py-2 bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.06] rounded-lg text-sm font-mono text-gray-900 dark:text-white break-all'>
                          X-Self-ID: {qqId || '(未填写)'}
                        </code>
                        <button
                          onClick={() => copyToClipboard(`X-Self-ID: ${qqId || ''}`, 'selfId')}
                          className='shrink-0 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors'
                        >
                          {copied === 'selfId' ? (
                            <Check className='w-4 h-4 text-green-500' />
                          ) : (
                            <Copy className='w-4 h-4' />
                          )}
                        </button>
                      </div>
                    </div>
                    {!wsToken && (
                      <p className='text-xs text-amber-600 dark:text-amber-400 mt-1'>
                        Token 未配置，请在设置页面配置 WebSocket Authorization
                      </p>
                    )}
                  </div>

                  <div>
                    <label className='text-xs text-gray-500 dark:text-gray-500 mb-1.5 block'>
                      连接声明（WebSocket 连接后发送的第一条消息）
                    </label>
                    <div className='flex items-start gap-2'>
                      <pre className='flex-1 px-3 py-2 bg-green-50 dark:bg-green-500/[0.04] border border-green-100 dark:border-green-500/[0.12] rounded-lg text-sm font-mono text-gray-900 dark:text-white overflow-x-auto whitespace-pre'>
{connectMessage}
                      </pre>
                      <button
                        onClick={() => copyToClipboard(connectMessage, 'connect')}
                        className='shrink-0 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors'
                      >
                        {copied === 'connect' ? (
                          <Check className='w-4 h-4 text-green-500' />
                        ) : (
                          <Copy className='w-4 h-4' />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className='flex justify-end gap-3 p-5 border-t border-gray-100 dark:border-white/[0.06]'>
              <button
                onClick={() => setShowAddModal(false)}
                className='px-5 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06] rounded-xl transition-colors'
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BotCard({
  bot,
  onClick,
}: {
  bot: AccountData;
  onClick: () => void;
}) {
  const nickname = bot.login_info?.nickname || bot.self_id;
  const avatarUrl = getSafeQQAvatarUrl(bot.self_id, 40);
  const appName = bot.version_info?.app_name || '未知框架';
  const appVersion = bot.version_info?.app_version || '';
  const isOnline = bot.is_online;

  return (
    <div
      onClick={onClick}
      className='backdrop-blur-sm bg-white/60 dark:bg-black/40 dark:backdrop-blur-xl border border-white/60 dark:border-white/10 rounded-2xl p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.04] hover:border-blue-200 dark:hover:border-white/[0.12] transition-all duration-300 group'
    >
      <div className='flex items-center gap-4'>
        <div className='relative shrink-0'>
          <img
            src={avatarUrl}
            alt={nickname}
            className='w-12 h-12 rounded-full object-cover border-2 border-white/60 dark:border-white/10 shadow-sm'
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${nickname[0]}&background=165DFF&color=fff&size=48`;
            }}
          />
          <span
            className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-black ${
              isOnline ? 'bg-green-500 dark:bg-green' : 'bg-gray-400 dark:bg-gray-600'
            }`}
          />
        </div>

        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2'>
            <h3 className='text-sm font-semibold text-gray-900 dark:text-white truncate'>
              {nickname}
            </h3>
            {isOnline ? (
              <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 dark:bg-white/[0.06] dark:text-gray-300'>
                <Wifi className='w-2.5 h-2.5' />
                在线
              </span>
            ) : (
              <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 dark:bg-white/[0.06] dark:text-gray-300'>
                <WifiOff className='w-2.5 h-2.5' />
                离线
              </span>
            )}
          </div>

          <div className='flex items-center gap-3 mt-1.5 text-xs text-gray-600 dark:text-gray-400'>
            {bot.custom_name && (
              <span className='flex items-center gap-1'>
                <span className='text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-white/[0.06] dark:text-gray-300 font-medium'>
                  WS
                </span>
                <span className='truncate max-w-[100px]'>{bot.custom_name}</span>
              </span>
            )}
            <span className='flex items-center gap-1'>
              <span className='text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-white/[0.06] dark:text-gray-300 font-medium'>
                {appName}
              </span>
              {appVersion && (
                <span className='text-gray-500'>
                  v{appVersion}
                </span>
              )}
            </span>
          </div>

          <p className='text-[11px] text-gray-500 mt-1 font-mono'>
            QQ: {bot.self_id}
          </p>
        </div>

        <ExternalLink className='w-4 h-4 text-gray-500 group-hover:text-[#165DFF] dark:group-hover:text-white transition-colors shrink-0' />
      </div>
    </div>
  );
}
