import React from 'react';
import { NavLink } from 'react-router';
import { 
  Home, 
  Settings, 
  Bot,
  Puzzle,
  MessageSquare
} from 'lucide-react';
import { motion } from 'motion/react';

export function Sidebar({ isOpen }: { isOpen: boolean }) {

  const menuItems = [
    { icon: Home, label: '首页', path: '/' },
    { icon: MessageSquare, label: 'WebQQ', path: '/webqq' },
    { icon: Puzzle, label: '插件管理', path: '/plugins' },
    { icon: Settings, label: '系统设置', path: '/settings' },
  ];

  return (
    <aside 
      className={`fixed left-0 top-0 h-full bg-[#1D2129] text-white flex flex-col z-20 shadow-xl transition-all duration-300 ${
        isOpen ? 'w-[240px]' : 'w-0 -translate-x-full'
      }`}
    >
      <div className="h-[60px] flex items-center px-6 border-b border-gray-700/50">
        <motion.div 
          className="flex items-center"
          whileHover={{ scale: 1.05 }}
          transition={{ duration: 0.2 }}
        >
          <div className="w-10 h-10 bg-[#165DFF] rounded-full flex items-center justify-center mr-3 shadow-lg shadow-blue-500/30">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">HanChat</h1>
            <p className="text-xs text-gray-400">Bot Admin</p>
          </div>
        </motion.div>
      </div>

      <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
        {menuItems.map((item, index) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <NavLink
              to={item.path}
              className={({ isActive }) => 
                `flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 group relative overflow-hidden ${
                  isActive 
                    ? 'bg-[#165DFF] text-white shadow-lg shadow-blue-500/20' 
                    : 'text-gray-400 hover:bg-[#2D323B] hover:text-white'
                }`
              }
            >
              <item.icon className="w-5 h-5 mr-3 shrink-0" />
              <span className="relative z-10">{item.label}</span>
              {/* Hover effect background */}
              <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />
            </NavLink>
          </motion.div>
        ))}
      </nav>

      {/* 作者信息 */}
      <motion.div
        className="p-4 m-4 rounded-xl bg-[#2D323B] border border-gray-700/50 cursor-pointer hover:border-[#165DFF]/50 transition-all"
        onClick={() => window.open('https://github.com/Lun-OS', '_blank')}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <img
              src="http://q1.qlogo.cn/g?b=qq&nk=1596534228&s=100"
              alt="Lun."
              className="w-10 h-10 rounded-full object-cover border-2 border-[#165DFF]"
            />
            <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#2D323B] bg-green-500" />
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-semibold text-white truncate">By:Lun.</span>
            <span className="text-xs text-gray-400 truncate">跳转GitHub</span>
          </div>
        </div>
      </motion.div>
    </aside>
  );
}