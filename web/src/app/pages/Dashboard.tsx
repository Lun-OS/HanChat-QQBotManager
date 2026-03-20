import { useEffect, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { 
  Users, 
  MessageSquare, 
  Activity,
  RefreshCw, 
  MoreHorizontal,
  BotIcon,
  TrendingUp,
  Zap,
  Loader2
} from 'lucide-react';
import { useBotStore, type Bot } from '../stores/botStore';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { accountApi, type AccountData, pluginApi } from '../services/api';
import { BotStatus } from '../constants';

export function Dashboard() {
  const { bots, setBots, selectBot } = useBotStore();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [totalPluginCount, setTotalPluginCount] = useState(0);

  const fetchAccounts = useCallback(async () => {
    try {
      const response = await accountApi.getAccounts();
      
      if ((response.status === 'ok' || response.success) && Array.isArray(response.data)) {
        const botList: Bot[] = response.data.map((account: AccountData) => {
          // 优先使用登录信息中的昵称
          let nickname = account.login_info?.nickname || account.custom_name || `Bot ${account.self_id}`;
          let friendCount = 0;
          let groupCount = 0;
          let msgCountToday = 0;

          // 如果有状态信息，从中获取统计数据
          if (account.bot_status?.stat) {
            const stat = account.bot_status.stat;
            msgCountToday = stat.message_received + stat.message_sent;
          }

          // 从login_info获取user_id用于头像
          const userId = account.login_info?.user_id?.toString() || account.self_id;

          return {
            self_id: account.self_id,
            nickname: nickname,
            custom_name: account.custom_name || '',
            status: account.status,
            last_connect: account.last_connected_at,
            msg_count_today: msgCountToday,
            friend_count: friendCount,
            group_count: groupCount,
            avatar: `http://q1.qlogo.cn/g?b=qq&nk=${userId}&s=100`,
            version_info: account.version_info,
            bot_status: account.bot_status,
          };
        });

        // 排序：在线的在前，然后按自定义名称字母顺序排序
        botList.sort((a, b) => {
          if (a.status === BotStatus.ONLINE && b.status !== BotStatus.ONLINE) return -1;
          if (a.status !== BotStatus.ONLINE && b.status === BotStatus.ONLINE) return 1;
          const nameA = (a.custom_name || '').toLowerCase();
          const nameB = (b.custom_name || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });

        setBots(botList);
      } else {
        setBots([]);
      }
    } catch (error) {
      console.error('获取账号列表失败:', error);
      toast.error('获取账号列表失败');
    }
  }, [setBots]);

  // 获取插件数量
  const fetchPluginCount = useCallback(async () => {
    try {
      const response = await pluginApi.getAccountContainers();
      if (response.success && Array.isArray(response.data)) {
        const total = response.data.reduce((sum, container) => sum + (container.plugin_count || 0), 0);
        setTotalPluginCount(total);
      }
    } catch (error) {
      console.error('获取插件数量失败:', error);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([fetchAccounts(), fetchPluginCount()]).finally(() => setIsLoading(false));
  }, [fetchAccounts, fetchPluginCount]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([fetchAccounts(), fetchPluginCount()]);
      toast.success('刷新成功');
    } catch (error) {
      toast.error('刷新失败');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleViewBot = (botId: string) => {
    selectBot(botId);
    navigate(`/bot/${botId}`);
  };

  const stats = [
    {
      title: '总账号数',
      value: bots.length,
      change: '+0',
      icon: Users,
      color: 'from-blue-500 to-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      textColor: 'text-blue-600 dark:text-blue-400'
    },
    {
      title: '在线账号',
      value: bots.filter(b => b.status === BotStatus.ONLINE).length,
      change: '+0',
      icon: Activity,
      color: 'from-green-500 to-emerald-600',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      textColor: 'text-green-600 dark:text-green-400'
    },
    {
      title: '总处理消息数量',
      value: bots.reduce((sum, b) => sum + (b.msg_count_today || 0), 0),
      change: '+0',
      icon: MessageSquare,
      color: 'from-purple-500 to-purple-600',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      textColor: 'text-purple-600 dark:text-purple-400'
    },
    {
      title: '插件运行数量',
      value: totalPluginCount,
      change: '+0',
      icon: Zap,
      color: 'from-orange-500 to-orange-600',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
      textColor: 'text-orange-600 dark:text-orange-400'
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-[#165DFF]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div 
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">仪表盘</h1>
          <p className="text-gray-500 dark:text-gray-400">管理所以连接的机器人ava</p>
        </div>
        <div className="flex gap-3">
          <motion.button 
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-[#2A2E38] dark:border-gray-700 dark:text-gray-200 dark:hover:bg-[#343944] transition-all shadow-sm hover:shadow disabled:opacity-70"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            刷新状态
          </motion.button>
          <motion.button
            className="flex items-center px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-[#165DFF] to-[#0047FF] rounded-lg hover:shadow-lg hover:shadow-blue-500/50 transition-all shadow-md"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <BotIcon className="w-4 h-4 mr-2" />
            偷懒中ava
          </motion.button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1, duration: 0.5 }}
            whileHover={{ y: -4 }}
            className="bg-white dark:bg-[#1D2129] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-lg transition-shadow cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-xl ${stat.bgColor} group-hover:scale-110 transition-transform`}>
                <stat.icon className={`w-6 h-6 ${stat.textColor}`} />
              </div>
              <div className={`flex items-center text-sm font-medium ${stat.textColor}`}>
                <TrendingUp className="w-4 h-4 mr-1" />
                <span>{stat.change}</span>
              </div>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">{stat.title}</p>
              <h3 className="text-3xl font-bold text-gray-900 dark:text-white">{stat.value}</h3>
            </div>
          </motion.div>
        ))}
      </div>

      <div>
        <motion.h2
          className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <BotIcon className="w-6 h-6 mr-2 text-[#165DFF]" />
          机器人账号列表
        </motion.h2>
        
        {bots.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white dark:bg-[#1D2129] rounded-xl p-12 text-center border border-gray-100 dark:border-gray-800"
          >
            <BotIcon className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">暂无机器人账号</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              请在机器人客户端配置反向WebSocket连接到本服务端
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              WebSocket地址: ws://localhost:59178/ws/your_bot_name
            </p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {bots.map((bot, index) => (
              <motion.div
                key={bot.self_id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 + 0.5, duration: 0.4 }}
                whileHover={{ y: -8, transition: { duration: 0.2 } }}
                className="bg-white dark:bg-[#1D2129] rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-xl hover:border-[#165DFF]/50 transition-all p-6 group cursor-pointer"
                onClick={() => handleViewBot(bot.self_id)}
              >
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center">
                    <div className="relative">
                      <motion.img 
                        src={bot.avatar} 
                        alt={bot.nickname} 
                        className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 ring-4 ring-white dark:ring-[#1D2129] group-hover:ring-[#165DFF]/20"
                        whileHover={{ scale: 1.1 }}
                      />
                      <motion.span 
                        className={`absolute bottom-0 right-0 w-4 h-4 border-2 border-white dark:border-[#1D2129] rounded-full ${bot.status === BotStatus.ONLINE ? 'bg-green-500' : 'bg-gray-400'}`}
                        animate={bot.status === BotStatus.ONLINE ? { scale: [1, 1.2, 1] } : {}}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-[#165DFF] transition-colors">{bot.nickname}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">QQ: {bot.self_id}</p>
                      {bot.version_info && (
                        <p className="text-xs text-gray-400 dark:text-gray-500">{bot.version_info.app_name} v{bot.version_info.app_version}</p>
                      )}
                    </div>
                  </div>
                  <motion.button 
                    className="text-gray-400 hover:text-[#165DFF] transition-colors"
                    whileHover={{ rotate: 90 }}
                    transition={{ duration: 0.2 }}
                  >
                    <MoreHorizontal className="w-6 h-6" />
                  </motion.button>
                </div>



                <div className="flex items-center justify-between text-sm pt-4 border-t border-gray-100 dark:border-gray-800">
                  <span className="text-gray-500 dark:text-gray-400">
                    {bot.custom_name}
                  </span>
                  <span className="text-[#165DFF] font-medium group-hover:underline">
                    查看详情 →
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
