import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuthStore } from '../stores/authStore';
import { authApi } from '../services/api';
import { motion } from 'motion/react';
import { Loader2, ShieldCheck, User, Lock, Key } from 'lucide-react';
import { toast } from 'sonner';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [topo, setTopo] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, restoreFromStorage } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    // 使用 store 方法恢复 token
    const hasToken = restoreFromStorage();
    if (hasToken) {
      navigate('/');
    }
  }, [navigate, restoreFromStorage]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await authApi.login(username, password, topo);
      
      if (response.success && response.data?.token) {
        // 使用 store 的 login 方法统一处理 token
        login(username, response.data.token);
        navigate('/');
      } else {
        setIsLoading(false);
      }
    } catch (error: any) {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-200 dark:from-[#0B0D12] dark:to-[#17191F] p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md bg-white dark:bg-[#1D2129] rounded-2xl shadow-xl overflow-hidden"
      >
        <div className="p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-[#165DFF] rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/30">
              <ShieldCheck className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">HanChat-QQBotManager AdminWeb</h1>
            <p className="text-gray-500 dark:text-gray-400">OneBOt机器人多账号管理后台</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">账号</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#2A2E38] border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#165DFF] focus:border-transparent transition-all dark:text-white"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">密码</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#2A2E38] border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#165DFF] focus:border-transparent transition-all dark:text-white"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">TOPO</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={topo}
                  onChange={(e) => setTopo(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#2A2E38] border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#165DFF] focus:border-transparent transition-all dark:text-white"
                  required
                  disabled={isLoading}
                  maxLength={8}
                  pattern="\d{8}"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-[#165DFF] hover:bg-[#124BD8] text-white rounded-lg font-medium shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                '登 录'
              )}
            </button>
          </form>
        </div>
        <div className="px-8 py-4 bg-gray-50 dark:bg-[#232730] border-t border-gray-100 dark:border-gray-800 text-center text-xs text-gray-400">
          © 2026 HanChat-QQBot Manager copyright belongs to Lun.
        </div>
      </motion.div>
    </div>
  );
}
