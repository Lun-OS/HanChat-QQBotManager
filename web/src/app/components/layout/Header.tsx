import React from 'react';
import { useBotStore } from '../../stores/botStore';
import { useAuthStore } from '../../stores/authStore';
import { useNavigate } from 'react-router';
import { LogOut, ChevronDown, Bell, Search, User, Menu } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { motion } from 'motion/react';
import { toast } from 'sonner';

export function Header({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { bots, selectedBotId, selectBot } = useBotStore();
  const { logout, user } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    toast.success('退出登录成功');
    navigate('/login');
  };

  return (
    <header className="fixed top-0 left-[240px] right-0 h-[60px] bg-white/80 dark:bg-[#1D2129]/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-700/50 flex items-center justify-between px-6 z-10 shadow-sm">
      <div className="flex items-center space-x-4">
        <motion.button
          onClick={onToggleSidebar}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Menu className="w-5 h-5" />
        </motion.button>

        <div className="relative w-96 group hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 transition-colors group-focus-within:text-[#165DFF]" />
          <input 
            type="text" 
            placeholder="搜索命令、日志或机器人..." 
            className="w-full pl-10 pr-4 py-2 bg-gray-50/50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#165DFF]/20 focus:border-[#165DFF] transition-all"
          />
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <motion.button 
          className="relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400 hover:text-[#165DFF]"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <Bell className="w-5 h-5" />
          <motion.span 
            className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-[#1D2129]"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </motion.button>

        <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <motion.button 
              className="flex items-center space-x-3 hover:bg-gray-50 dark:hover:bg-gray-800 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
              whileHover={{ scale: 1.02 }}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#165DFF] to-cyan-400 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                <span className="text-sm font-bold">{user?.username?.[0].toUpperCase() || 'A'}</span>
              </div>
              <div className="text-left hidden md:block">
                <p className="text-sm font-medium text-gray-900 dark:text-white leading-tight">{user?.username || 'Admin'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">系统管理员</p>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </motion.button>
          </DropdownMenu.Trigger>
          
          <DropdownMenu.Portal>
            <DropdownMenu.Content 
              className="min-w-[200px] bg-white dark:bg-[#1D2129] rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 p-1.5 animate-in fade-in zoom-in-95 duration-200 z-50 origin-top-right"
              sideOffset={5}
            >
              <DropdownMenu.Label className="text-xs font-semibold text-gray-400 px-2 py-1.5 uppercase tracking-wider">
                我的账户
              </DropdownMenu.Label>
              <DropdownMenu.Item className="flex items-center px-2 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-[#165DFF] rounded-lg cursor-pointer outline-none transition-colors">
                <User className="w-4 h-4 mr-2" />
                个人资料
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="h-px bg-gray-100 dark:bg-gray-700 my-1" />
              <DropdownMenu.Item 
                onClick={handleLogout}
                className="flex items-center px-2 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg cursor-pointer outline-none transition-colors mt-1"
              >
                <LogOut className="w-4 h-4 mr-2" />
                退出登录
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}