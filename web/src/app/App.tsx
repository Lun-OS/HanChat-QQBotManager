import React, { useEffect, useState, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { AnimatePresence } from 'motion/react';
import { MainLayout } from './components/layout/MainLayout';
import { useAuthStore } from './stores/authStore';
import { authApi } from './services/api';
import { Loader2 } from 'lucide-react';

const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const BotDetail = lazy(() => import('./pages/BotDetail').then(m => ({ default: m.BotDetail })));
const BotList = lazy(() => import('./pages/BotList').then(m => ({ default: m.BotList })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const PluginManager = lazy(() => import('./pages/PluginManager').then(m => ({ default: m.PluginManager })));
const WebQQ = lazy(() => import('./pages/WebQQ').then(m => ({ default: m.WebQQ })));

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

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="text-gray-500">加载中...</span>
      </div>
    </div>
  );
}

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={
          <Suspense fallback={<PageLoader />}>
            <Login />
          </Suspense>
        } />
        <Route element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }>
          <Route path="/" element={
            <Suspense fallback={<PageLoader />}>
              <Dashboard />
            </Suspense>
          } />
          <Route path="/bots" element={
            <Suspense fallback={<PageLoader />}>
              <BotList />
            </Suspense>
          } />
          <Route path="/bot/:selfId" element={
            <Suspense fallback={<PageLoader />}>
              <BotDetail />
            </Suspense>
          } />
          <Route path="/settings" element={
            <Suspense fallback={<PageLoader />}>
              <Settings />
            </Suspense>
          } />
          <Route path="/plugins" element={
            <Suspense fallback={<PageLoader />}>
              <PluginManager />
            </Suspense>
          } />
          <Route path="/webqq" element={
            <Suspense fallback={<PageLoader />}>
              <WebQQ />
            </Suspense>
          } />
        </Route>
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <HashRouter>
        <div className="size-full relative">
          <div className='fixed inset-0 -z-10 overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900'>
            <div className='absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-blue-200/40 blur-[100px]' />
            <div className='absolute top-[20%] right-[-10%] w-[400px] h-[400px] rounded-full bg-purple-200/40 blur-[90px]' />
            <div className='absolute bottom-[-10%] left-[20%] w-[600px] h-[600px] rounded-full bg-pink-200/30 blur-[110px]' />
          </div>
          <AnimatedRoutes />
          <Toaster
            position="top-right"
            richColors
            style={{
              opacity: 0.8,
              pointerEvents: 'none',
            }}
          />
        </div>
      </HashRouter>
    </ThemeProvider>
  );
}
