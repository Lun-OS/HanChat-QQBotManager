import React, { useEffect, useMemo, useRef } from 'react';
import { Outlet, useLocation } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Menu, PanelLeftClose } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useLocalStorage } from '../../hooks/useLocalStorage';

const menuItems = [
  { label: '首页', path: '/' },
  { label: '机器人列表', path: '/bots' },
  { label: 'WebQQ', path: '/webqq' },
  { label: '插件管理', path: '/plugins' },
  { label: '系统设置', path: '/settings' },
];

const findTitle = (pathname: string): string[] => {
  for (const item of menuItems) {
    if (item.path === pathname) {
      return [item.label];
    }
  }
  return [];
};

export function MainLayout() {
  const location = useLocation();
  const contentRef = useRef<HTMLDivElement>(null);
  const [openSideBar, setOpenSideBar] = useLocalStorage('side-bar-open', true);

  useEffect(() => {
    contentRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  const title = useMemo(() => findTitle(location.pathname), [location.pathname]);

  return (
    <div className='h-screen relative flex items-stretch overflow-hidden'>
      <Sidebar open={openSideBar} onClose={() => setOpenSideBar(false)} />
      <motion.div
        layout
        ref={contentRef}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className='flex-1 flex flex-col overflow-hidden transition-all duration-300 ease-in-out'
      >
        <div className='h-10 flex items-center font-bold text-xl backdrop-blur-lg rounded-full bg-background/50 shadow-sm m-2 mb-0 flex-shrink-0'>
          <div className={`mr-1 ease-in-out ml-0 md:relative z-50 md:z-auto ${openSideBar ? 'pl-2' : ''} md:!ml-0 md:pl-0`}>
            <button
              className='p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors'
              onClick={() => setOpenSideBar(!openSideBar)}
            >
              {openSideBar ? <PanelLeftClose className='w-5 h-5' /> : <Menu className='w-5 h-5' />}
            </button>
          </div>
          <div className='flex items-center gap-1.5 text-sm text-muted-foreground'>
            {title.map((item, index) => (
              <AnimatePresence mode='wait' key={index}>
                <motion.div
                  key={item}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.3 }}
                  className='text-foreground'
                >
                  {item}
                </motion.div>
              </AnimatePresence>
            ))}
          </div>
        </div>
        <AnimatePresence mode='wait'>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className='flex-1 min-h-0 overflow-y-auto'
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
