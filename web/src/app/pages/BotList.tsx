import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  Search,
  Filter,
  Wifi,
  WifiOff,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { accountApi, type AccountData } from '../services/api';
import { getSafeQQAvatarUrl } from '../utils/security';

type StatusFilter = 'all' | 'online' | 'offline';

export function BotList() {
  const navigate = useNavigate();
  const [bots, setBots] = useState<AccountData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    fetchBots();
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
