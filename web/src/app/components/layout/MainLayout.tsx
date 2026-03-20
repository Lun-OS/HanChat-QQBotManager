import React, { useState } from 'react';
import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar isOpen={sidebarOpen} />
      <div className={`flex flex-col flex-1 h-full overflow-hidden transition-all duration-300 ${sidebarOpen ? 'ml-[240px]' : 'ml-0'}`}>
        <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden mt-[60px] bg-[#F2F3F5] dark:bg-neutral-900">
          <div className="flex-1 flex flex-col min-h-0 p-6 max-w-[1600px] mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}