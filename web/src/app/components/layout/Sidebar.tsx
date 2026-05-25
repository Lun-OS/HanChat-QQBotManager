import { NavLink } from 'react-router';
import {
  Home,
  Settings,
  Bot,
  Puzzle,
  MessageSquare,
  Sun,
  Moon,
  LogOut,
  Users,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { AnimatePresence, motion } from 'motion/react';
import { useAuthStore } from '../../stores/authStore';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

interface SidebarProps {
  open: boolean;
  onClose?: () => void;
}

const menuItems = [
  { icon: Home, label: '首页', path: '/' },
  { icon: Users, label: '机器人列表', path: '/bots' },
  { icon: MessageSquare, label: 'WebQQ', path: '/webqq' },
  { icon: Puzzle, label: '插件管理', path: '/plugins' },
  { icon: Settings, label: '系统设置', path: '/settings' },
];

export function Sidebar({ open, onClose }: SidebarProps) {
  const { theme, setTheme } = useTheme();
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const isDark = theme === 'dark';

  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark');

  const handleLogout = () => {
    logout();
    toast.success('退出登录成功');
    navigate('/login');
  };

  return (
    <>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className='fixed inset-y-0 left-64 right-0 bg-black/20 backdrop-blur-[1px] z-40 md:hidden'
            aria-hidden='true'
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.2, delay: 0.15 }}
          />
        )}
      </AnimatePresence>
      <motion.div
        className='overflow-hidden fixed top-0 left-0 h-full z-50 md:static md:shadow-none rounded-r-2xl md:rounded-none bg-white/80 backdrop-blur-xl backdrop-saturate-150 shadow-xl dark:bg-black/40 dark:border-r dark:border-white/[0.06] md:bg-transparent md:backdrop-blur-none md:backdrop-saturate-100 md:shadow-none'
        initial={{ width: 0 }}
        animate={{ width: open ? '16rem' : 0 }}
        transition={{
          type: open ? 'spring' : 'tween',
          stiffness: 150,
          damping: open ? 15 : 10,
        }}
        style={{ overflow: 'hidden' }}
      >
        <motion.div className='w-64 flex flex-col items-stretch h-full transition-transform duration-300 ease-in-out z-30 relative float-right p-4'>
          <div className='flex items-center justify-start gap-3 px-2 my-8 ml-2'>
            <div className='h-5 w-1 bg-[#165DFF] dark:bg-white/60 rounded-full shadow-sm' />
            <div className='text-xl font-bold tracking-wide select-none text-gray-900 dark:text-white'>
              HanChat
            </div>
          </div>
          <div className='overflow-y-auto flex flex-col flex-1 px-2'>
            <nav className='flex flex-col gap-2'>
              {menuItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  children={({ isActive }) => (
                    <div className={`flex items-center w-full text-left justify-start transition-all duration-300 rounded-lg px-3 py-2.5 text-sm ${
                      isActive
                        ? 'bg-[#165DFF]/10 text-[#165DFF] dark:bg-white/10 dark:text-white font-semibold translate-x-1'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] hover:translate-x-1'
                    }`}>
                      <item.icon className='w-5 h-5 mr-3 shrink-0 text-gray-500 dark:text-gray-500' />
                      <span className='flex-1'>{item.label}</span>
                      <div className={`w-3 h-1.5 rounded-full ml-auto transition-all ${
                        isActive
                          ? 'bg-[#165DFF] dark:bg-white/70'
                          : 'bg-transparent dark:bg-white/10'
                      }`} />
                    </div>
                  )}
                />
              ))}
            </nav>
            <div className='mt-auto mb-10 md:mb-0 space-y-3 px-2'>
              <button
                className='w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium bg-[#165DFF]/10 hover:bg-[#165DFF]/20 text-[#165DFF] shadow-sm hover:shadow-md transition-all duration-300 backdrop-blur-sm dark:bg-white/[0.06] dark:hover:bg-white/[0.12] dark:text-gray-300 dark:shadow-none'
                onClick={toggleTheme}
              >
                {isDark ? <Sun className='w-4 h-4' /> : <Moon className='w-4 h-4' />}
                切换主题
              </button>
              <button
                className='w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium bg-red-50/50 hover:bg-red-100/80 dark:bg-red-500/10 dark:hover:bg-red-500/20 text-red-500 shadow-sm hover:shadow-md transition-all duration-300 backdrop-blur-sm'
                onClick={handleLogout}
              >
                <LogOut className='w-4 h-4' />
                退出登录
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}
