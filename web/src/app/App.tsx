import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { AnimatePresence } from 'motion/react';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { BotDetail } from './pages/BotDetail';
import { BotList } from './pages/BotList';
import { Settings } from './pages/Settings';
import { PluginManager } from './pages/PluginManager';
import { WebQQ } from './pages/WebQQ';
import { MainLayout } from './components/layout/MainLayout';
import { useAuthStore } from './stores/authStore';
import { authApi } from './services/api';
import { Loader2 } from 'lucide-react';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const token = useAuthStore(state => state.token);
  const restoreFromStorage = useAuthStore(state => state.restoreFromStorage);
  const [isVerifying, setIsVerifying] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const logout = useAuthStore(state => state.logout);

  useEffect(() => {
    const verifyToken = async () => {
      let currentToken = token;
      if (!currentToken) {
        const hasToken = restoreFromStorage();
        if (hasToken) {
          currentToken = localStorage.getItem('auth_token');
        }
      }

      if (!currentToken) {
        setIsVerifying(false);
        setIsValid(false);
        return;
      }

      try {
        const response = await authApi.verifyToken();
        if (response.success) {
          setIsValid(true);
        } else {
          logout();
          setIsValid(false);
        }
      } catch (error) {
        logout();
        setIsValid(false);
      } finally {
        setIsVerifying(false);
      }
    };

    verifyToken();
  }, [token, logout, restoreFromStorage]);

  if (isVerifying) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <span className="text-gray-500">验证中...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !isValid) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<Login />} />
        <Route element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }>
          <Route path="/" element={<Dashboard />} />
          <Route path="/bots" element={<BotList />} />
          <Route path="/bot/:selfId" element={<BotDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/plugins" element={<PluginManager />} />
          <Route path="/webqq" element={<WebQQ />} />
        </Route>
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <HashRouter>
        <div className="size-full relative">
          <div className='fixed inset-0 -z-10 overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900'>
            <div className='absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-blue-200/40 blur-[100px]' />
            <div className='absolute top-[20%] right-[-10%] w-[400px] h-[400px] rounded-full bg-purple-200/40 blur-[90px]' />
            <div className='absolute bottom-[-10%] left-[20%] w-[600px] h-[600px] rounded-full bg-pink-200/30 blur-[110px]' />
          </div>
          <AnimatedRoutes />
          <Toaster position="top-center" richColors />
        </div>
      </HashRouter>
    </ThemeProvider>
  );
}
