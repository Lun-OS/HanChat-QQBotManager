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

function StarFieldBackground() {
  const stars = [...Array(100)].map((_, i) => {
    const type = Math.random();
    const baseOpacity = 0.25 + Math.random() * 0.5;
    return {
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 0.3,
      type,
      baseOpacity,
      duration: type > 0.8 ? 0.8 + Math.random() * 1 : 2 + Math.random() * 4,
      delay: Math.random() * 6,
    };
  });

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none dark:block hidden">
      <style>{`
        @keyframes star-twinkle-fast {
          0%, 100% { opacity: var(--base-op); transform: scale(1); }
          50% { opacity: 0.03; transform: scale(0.5); }
        }
        @keyframes star-twinkle-slow {
          0%, 100% { opacity: var(--base-op); }
          33% { opacity: calc(var(--base-op) * 0.2); }
          66% { opacity: calc(var(--base-op) * 0.5); }
        }
        @keyframes star-breathe-glow {
          0%, 100% { opacity: var(--base-op); transform: scale(1); box-shadow: 0 0 2px rgba(255,255,255,0.15); }
          50% { opacity: 0.95; transform: scale(1.35); box-shadow: 0 0 8px rgba(255,255,255,0.7), 0 0 16px rgba(255,255,255,0.25); }
        }
      `}</style>

      <div className="absolute inset-0 bg-gradient-to-b from-[#050810] via-[#0a0f18] to-[#050810]" />

      <motion.div
        className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full blur-[130px]"
        style={{
          background: 'radial-gradient(circle, rgba(20,25,35,0.7) 0%, transparent 70%)',
        }}
        animate={{ scale: [1, 1.12, 1], opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        className="absolute bottom-[-10%] right-[-10%] w-[450px] h-[450px] rounded-full blur-[130px]"
        style={{
          background: 'radial-gradient(circle, rgba(15,20,28,0.65) 0%, transparent 70%)',
        }}
        animate={{ scale: [1.1, 1, 1.1], opacity: [0.5, 0.85, 0.5] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />

      {stars.map((star) => (
        <motion.div
          key={star.id}
          className="absolute rounded-full bg-white"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            ['--base-op' as string]: star.baseOpacity,
            boxShadow: star.size > 1
              ? '0 0 3px rgba(255,255,255,0.4), 0 0 6px rgba(255,255,255,0.15)'
              : 'none',
            animationName: star.type > 0.8
              ? 'star-twinkle-fast'
              : star.type > 0.5
                ? 'star-breathe-glow'
                : 'star-twinkle-slow',
            animationDuration: `${star.duration}s`,
            animationDelay: `${star.delay}s`,
            animationTimingFunction: 'ease-in-out',
            animationIterationCount: 'infinite',
            willChange: 'opacity, transform' as any,
          }}
          animate={{
            opacity: [
              star.baseOpacity,
              star.type > 0.8 ? 0.02 : star.type > 0.5 ? 0.95 : star.baseOpacity * 0.2,
              star.type > 0.8 ? star.baseOpacity : star.type > 0.5 ? star.baseOpacity * 0.3 : star.baseOpacity * 0.5,
              star.baseOpacity
            ],
            scale: star.type > 0.5
              ? [1, star.type > 0.8 ? 0.5 : 1.4, star.type > 0.8 ? 1 : 1.2, 1]
              : undefined,
          }}
          transition={{
            duration: star.duration,
            repeat: Infinity,
            delay: star.delay,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

export function MainLayout() {
  const location = useLocation();
  const contentRef = useRef<HTMLDivElement>(null);
  const [openSideBar, setOpenSideBar] = useLocalStorage('side-bar-open', true);

  useEffect(() => {
    contentRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  const title = useMemo(() => findTitle(location.pathname), [location.pathname]);

  return (
    <div className='h-screen relative flex items-stretch overflow-hidden bg-gray-50 dark:bg-[#050810]'>
      <StarFieldBackground />

      <Sidebar open={openSideBar} onClose={() => setOpenSideBar(false)} />

      <motion.div
        layout
        ref={contentRef}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className='flex-1 flex flex-col overflow-hidden transition-all duration-300 ease-in-out relative z-10'
      >
        <div className='h-10 flex items-center font-bold text-xl backdrop-blur-lg rounded-full bg-white/70 dark:bg-black/30 shadow-sm dark:shadow-none border border-gray-200/50 dark:border-white/[0.06] m-2 mb-0 flex-shrink-0'>
          <div className={`mr-1 ease-in-out ml-0 md:relative z-50 md:z-auto ${openSideBar ? 'pl-2' : ''} md:!ml-0 md:pl-0`}>
            <button
              className='p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/[0.08] transition-colors'
              onClick={() => setOpenSideBar(!openSideBar)}
            >
              {openSideBar ? <PanelLeftClose className='w-5 h-5 text-gray-700 dark:text-gray-400' /> : <Menu className='w-5 h-5 text-gray-700 dark:text-gray-400' />}
            </button>
          </div>
          <div className='flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400'>
            {title.map((item, index) => (
              <AnimatePresence mode='wait' key={index}>
                <motion.div
                  key={item}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.3 }}
                  className='text-gray-900 dark:text-white font-medium'
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
