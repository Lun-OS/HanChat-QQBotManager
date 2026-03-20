import { useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { AnimatePresence, motion } from 'motion/react';

export function Layout() {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen bg-[#F2F3F5] overflow-hidden font-sans">
        {/* Sidebar */}
        <Sidebar isOpen={isSidebarOpen} />

        {/* Main Content Area */}
        <div className={`flex-1 flex flex-col transition-all duration-300 ${isSidebarOpen ? 'ml-[240px]' : 'ml-0'}`}>
          <Header onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
          
          <main className="flex-1 overflow-y-auto pt-[60px] p-6 relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="h-full w-full max-w-[1600px] mx-auto"
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
  );
}
