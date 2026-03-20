import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router';
import { Toaster } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { BotDetail } from './pages/BotDetail';
import { Settings } from './pages/Settings';
import { PluginManager } from './pages/PluginManager';
import { WebQQ } from './pages/WebQQ';
import { MainLayout } from './components/layout/MainLayout';
import { useAuthStore } from './stores/authStore';
import { authApi } from './services/api';
import { Loader2 } from 'lucide-react';

// Background animation component
function AnimatedBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-[#0B0D12] dark:via-[#0F1117] dark:to-[#0B0D12]" />
      
      {/* Animated orbs */}
      <motion.div
        className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-400/10 dark:bg-blue-500/5 rounded-full blur-3xl"
        animate={{
          x: [0, 100, 0],
          y: [0, -50, 0],
          scale: [1, 1.2, 1],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
      <motion.div
        className="absolute bottom-1/4 -right-20 w-96 h-96 bg-cyan-400/10 dark:bg-cyan-500/5 rounded-full blur-3xl"
        animate={{
          x: [0, -100, 0],
          y: [0, 50, 0],
          scale: [1, 1.3, 1],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-400/5 dark:bg-purple-500/3 rounded-full blur-3xl"
        animate={{
          scale: [1, 1.1, 1],
          rotate: [0, 180, 360],
        }}
        transition={{
          duration: 30,
          repeat: Infinity,
          ease: "linear"
        }}
      />

      {/* Grid pattern */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzAwMCIgc3Ryb2tlLW9wYWNpdHk9IjAuMDIiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-40 dark:opacity-20" />
    </div>
  );
}

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const token = useAuthStore(state => state.token);
  const restoreFromStorage = useAuthStore(state => state.restoreFromStorage);
  const [isVerifying, setIsVerifying] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const logout = useAuthStore(state => state.logout);

  useEffect(() => {
    const verifyToken = async () => {
      // 先从 localStorage 恢复 token（页面刷新后）
      let currentToken = token;
      if (!currentToken) {
        const hasToken = restoreFromStorage();
        if (hasToken) {
          currentToken = localStorage.getItem('auth_token');
        }
      }

      // 如果没有 token，直接返回未认证
      if (!currentToken) {
        setIsVerifying(false);
        setIsValid(false);
        return;
      }

      try {
        // 服务端验证 token
        const response = await authApi.verifyToken();
        if (response.success) {
          setIsValid(true);
        } else {
          // Token 无效，清除登录状态
          logout();
          setIsValid(false);
        }
      } catch (error) {
        // 验证失败，清除登录状态
        logout();
        setIsValid(false);
      } finally {
        setIsVerifying(false);
      }
    };

    verifyToken();
  }, [token, logout, restoreFromStorage]);

  // 正在验证时显示加载状态
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

  // 未认证或验证失败，跳转到登录页
  if (!isAuthenticated || !isValid) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Route animation wrapper
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
    <HashRouter>
      <div className="size-full relative">
        <AnimatedBackground />
        <AnimatedRoutes />
        <Toaster position="top-center" richColors />
      </div>
    </HashRouter>
  );
}