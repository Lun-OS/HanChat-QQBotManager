import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuthStore } from '../stores/authStore';
import { authApi } from '../services/api';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, ShieldCheck, User, Lock, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

interface CaptchaData {
  captcha_id: string;
  image_base64: string;
  expire_time: number;
}

function StarField() {
  const stars = [...Array(150)].map((_, i) => {
    const type = Math.random();
    const baseOpacity = 0.3 + Math.random() * 0.5;
    return {
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2.5 + 0.5,
      type,
      baseOpacity,
      duration: type > 0.8 ? 0.8 + Math.random() * 1 : 2 + Math.random() * 4,
      delay: Math.random() * 6,
    };
  });

  const shootingStars = [...Array(3)].map((_, i) => ({
    id: i,
    startX: 20 + Math.random() * 60,
    startY: Math.random() * 30,
    delay: 10 + i * 15 + Math.random() * 10,
    angle: -35 + Math.random() * 25,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <style>{`
        @keyframes twinkle-fast {
          0%, 100% { opacity: var(--base-op); transform: scale(1); }
          50% { opacity: 0.05; transform: scale(0.6); }
        }
        @keyframes twinkle-slow {
          0%, 100% { opacity: var(--base-op); }
          25% { opacity: calc(var(--base-op) * 0.3); }
          50% { opacity: var(--base-op); }
          75% { opacity: calc(var(--base-op) * 0.15); }
        }
        @keyframes twinkle-breathe {
          0%, 100% { opacity: var(--base-op); transform: scale(1); box-shadow: 0 0 2px rgba(255,255,255,var(--glow)); }
          50% { opacity: 0.9; transform: scale(1.4); box-shadow: 0 0 6px rgba(255,255,255,0.8), 0 0 12px rgba(255,255,255,0.3); }
        }
        .star-twinkle {
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
          will-change: opacity, transform;
        }
      `}</style>

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
            ['--glow' as string]: star.size > 1.5 ? '0.5' : '0.2',
            boxShadow: star.size > 1.5
              ? '0 0 4px rgba(255,255,255,0.5), 0 0 8px rgba(255,255,255,0.2)'
              : 'none',
            animationName: star.type > 0.8
              ? 'twinkle-fast'
              : star.type > 0.5
                ? 'twinkle-breathe'
                : 'twinkle-slow',
            animationDuration: `${star.duration}s`,
            animationDelay: `${star.delay}s`,
          }}
          animate={{
            opacity: [
              star.baseOpacity,
              star.type > 0.8 ? 0.02 : star.type > 0.5 ? 1 : star.baseOpacity * 0.2,
              star.type > 0.8 ? star.baseOpacity : star.type > 0.5 ? star.baseOpacity * 0.3 : star.baseOpacity,
              star.baseOpacity
            ],
            scale: star.type > 0.5
              ? [1, star.type > 0.8 ? 0.5 : 1.5, star.type > 0.8 ? 1 : 1.2, 1]
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

      {/* Shooting stars */}
      {shootingStars.map((ss) => (
        <motion.div
          key={`ss-${ss.id}`}
          className="absolute"
          style={{
            left: `${ss.startX}%`,
            top: `${ss.startY}%`,
            width: '120px',
            height: '2px',
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 20%, rgba(255,255,255,0.9) 50%, rgba(255,255,255,0.1) 80%, transparent 100%)',
            transformOrigin: 'left center',
            transform: `rotate(${ss.angle}deg)`,
            filter: 'blur(0.3px)',
          }}
          initial={{ opacity: 0, scaleX: 0, x: 0 }}
          animate={{
            opacity: [0, 0, 1, 1, 0.8, 0],
            scaleX: [0, 0, 1, 1, 1.5, 0],
            x: [0, 0, 0, 120, 200, 300],
          }}
          transition={{
            duration: 2.2,
            repeat: Infinity,
            repeatDelay: ss.delay,
            ease: 'linear',
          }}
        />
      ))}
    </div>
  );
}

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [captchaData, setCaptchaData] = useState<CaptchaData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCaptchaLoading, setIsCaptchaLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login, restoreFromStorage } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    const hasToken = restoreFromStorage();
    if (hasToken) {
      navigate('/');
    } else {
      loadCaptcha();
    }
  }, [navigate, restoreFromStorage]);

  const loadCaptcha = async () => {
    setIsCaptchaLoading(true);
    try {
      const response = await authApi.getCaptcha();
      if (response.success && response.data) {
        setCaptchaData(response.data);
      } else {
        toast.error('获取验证码失败');
      }
    } catch (error) {
      toast.error('获取验证码失败');
    } finally {
      setIsCaptchaLoading(false);
    }
  };

  const refreshCaptcha = async () => {
    setIsCaptchaLoading(true);
    try {
      const response = await authApi.refreshCaptcha(captchaData?.captcha_id);
      if (response.success && response.data) {
        setCaptchaData(response.data);
        setCaptcha('');
      } else {
        toast.error('刷新验证码失败');
      }
    } catch (error) {
      toast.error('刷新验证码失败');
    } finally {
      setIsCaptchaLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!captchaData) {
      toast.error('验证码未加载');
      return;
    }

    if (!captcha.trim()) {
      toast.error('请输入验证码');
      return;
    }

    setIsLoading(true);

    try {
      const response = await authApi.login(username, password, captchaData.captcha_id, captcha);

      if (response.success && response.data?.token) {
        login(username, response.data.token);
        navigate('/');
      } else {
        setIsLoading(false);
        refreshCaptcha();
      }
    } catch (error: any) {
      setIsLoading(false);
      refreshCaptcha();
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-[#05080f] dark:bg-[#05080f]">
      {/* Deep space gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#05080f] via-[#0a0f18] to-[#05080f] dark:from-[#05080f] dark:via-[#0a0f18] dark:to-[#05080f]" />

      {/* Subtle nebula glows */}
      <motion.div
        className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full blur-[130px]"
        style={{
          background: 'radial-gradient(circle, rgba(20,25,35,0.9) 0%, transparent 70%)',
        }}
        animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        className="absolute bottom-[-10%] right-[-10%] w-[450px] h-[450px] rounded-full blur-[130px]"
        style={{
          background: 'radial-gradient(circle, rgba(15,20,28,0.85) 0%, transparent 70%)',
        }}
        animate={{ scale: [1.1, 1, 1.1], opacity: [0.6, 0.95, 0.6] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Star Field with Twinkling & Shooting Stars */}
      <StarField />

      {/* Login Card */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        {/* Glass Card */}
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(10, 14, 22, 0.75)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            boxShadow: `
              0 24px 48px -12px rgba(0, 0, 0, 0.8),
              inset 0 1px 0 0 rgba(255, 255, 255, 0.04)
            `,
          }}
        >
          {/* Content */}
          <div className="relative p-10 pb-8">
            {/* Logo & Title */}
            <motion.div
              className="text-center mb-10"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
            >
              <div
                className="w-16 h-16 mx-auto mb-6 flex items-center justify-center rounded-2xl"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <ShieldCheck className="w-8 h-8 text-white/70" strokeWidth={1.8} />
              </div>

              <h1 className="text-2xl font-bold mb-3 tracking-tight text-gray-900 dark:text-white">
                HanChat-QQBotManager
              </h1>
              <p className="text-sm tracking-wide text-gray-500 dark:text-gray-400">
                OneBot机器人多账号管理后台
              </p>
            </motion.div>

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-6">
              {/* Username Input */}
              <motion.div
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="group"
              >
                <label className="block text-xs font-semibold uppercase tracking-wider mb-2.5 text-gray-500 dark:text-gray-400 transition-colors duration-300 group-focus-within:text-gray-700 dark:group-focus-within:text-gray-300">
                  账号
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 transition-colors duration-300 group-focus-within:text-gray-600 dark:group-focus-within:text-white/40" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-11 pr-4 py-3.5 bg-white/80 dark:bg-[#12151d]/80 outline-none text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 rounded-lg transition-all duration-300 focus:bg-white dark:focus:bg-[#161a24] focus:ring-1 focus:ring-gray-300 dark:focus:ring-white/20"
                    required
                    disabled={isLoading}
                    placeholder="请输入账号"
                  />
                </div>
              </motion.div>

              {/* Password Input */}
              <motion.div
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                className="group"
              >
                <label className="block text-xs font-semibold uppercase tracking-wider mb-2.5 text-gray-500 dark:text-gray-400 transition-colors duration-300 group-focus-within:text-gray-700 dark:group-focus-within:text-gray-300">
                  密码
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 transition-colors duration-300 group-focus-within:text-gray-600 dark:group-focus-within:text-white/40" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-11 pr-11 py-3.5 bg-white/80 dark:bg-[#12151d]/80 outline-none text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 rounded-lg transition-all duration-300 focus:bg-white dark:focus:bg-[#161a24] focus:ring-1 focus:ring-gray-300 dark:focus:ring-white/20"
                    required
                    disabled={isLoading}
                    placeholder="请输入密码"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors duration-300"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </motion.div>

              {/* Captcha Input */}
              <motion.div
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="group"
              >
                <label className="block text-xs font-semibold uppercase tracking-wider mb-2.5 text-gray-500 dark:text-gray-400 transition-colors duration-300 group-focus-within:text-gray-700 dark:group-focus-within:text-gray-300">
                  验证码
                </label>
                <div className="flex gap-3">
                  <div className="relative flex-1 group/captcha">
                    <input
                      type="text"
                      value={captcha}
                      onChange={(e) => setCaptcha(e.target.value)}
                      className="w-full px-4 py-3.5 bg-white/80 dark:bg-[#12151d]/80 outline-none text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 uppercase tracking-widest rounded-lg transition-all duration-300 focus:bg-white dark:focus:bg-[#161a24] focus:ring-1 focus:ring-gray-300 dark:focus:ring-white/20"
                      required
                      disabled={isLoading}
                      maxLength={4}
                      placeholder="验证码"
                    />
                  </div>

                  {/* Captcha Image */}
                  <motion.button
                    type="button"
                    onClick={refreshCaptcha}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-36 h-[50px] rounded-lg overflow-hidden cursor-pointer relative flex-shrink-0"
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <style>{`
                      .dark button[style*="background"] {
                        background: #12151d !important;
                        border-color: rgba(255,255,255,0.06) !important;
                      }
                    `}</style>
                    <AnimatePresence mode="wait">
                      {isCaptchaLoading ? (
                        <motion.div
                          key="loading"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="w-full h-full flex items-center justify-center"
                        >
                          <Loader2 className="w-5 h-5 animate-spin text-gray-400 dark:text-gray-500" />
                        </motion.div>
                      ) : captchaData?.image_base64 ? (
                        <motion.img
                          key={captchaData.captcha_id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          src={captchaData.image_base64}
                          alt="验证码"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <motion.div
                          key="empty"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="w-full h-full flex items-center justify-center"
                        >
                          <span className="text-xs text-gray-400 dark:text-gray-600">点击刷新</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.button>

                  {/* Refresh Button */}
                  <motion.button
                    type="button"
                    onClick={refreshCaptcha}
                    disabled={isCaptchaLoading}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-3 rounded-lg transition-all duration-300 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-white/[0.04]"
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <style>{`
                      .dark button[style*="background"]:nth-of-type(2) {
                        background: #12151d !important;
                        border-color: rgba(255,255,255,0.06) !important;
                      }
                    `}</style>
                    <RefreshCw
                      className={`w-4 h-4 transition-colors ${
                        isCaptchaLoading ? 'animate-spin text-gray-500 dark:text-gray-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400'
                      }`}
                    />
                  </motion.button>
                </div>
              </motion.div>

              {/* Submit Button */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.5 }}
                className="pt-2"
              >
                <motion.button
                  type="submit"
                  disabled={isLoading}
                  whileHover={{ y: -2 }}
                  whileTap={{ y: 0, scale: 0.98 }}
                  className="w-full relative py-3.5 rounded-lg font-semibold text-sm uppercase tracking-wider overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-100"
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>登录中...</span>
                    </div>
                  ) : (
                    <span>登 录</span>
                  )}
                </motion.button>
              </motion.div>
            </form>
          </div>

          {/* Footer */}
          <div
            className="relative px-10 py-4 text-center"
            style={{
              background: 'rgba(248,250,252,0.6)',
              borderTop: '1px solid rgba(226,232,240,0.8)',
            }}
          >
            <style>{`
              .dark div[style*="background"][style*="border-top"] {
                background: rgba(8,10,16,0.5) !important;
                border-top-color: rgba(255,255,255,0.05) !important;
              }
            `}</style>
            <p className="text-xs tracking-wide text-gray-500 dark:text-gray-500">
              © 2026 HanChat-QQBot Manager copyright belongs to Lun.
            </p>
          </div>
        </div>

        {/* Card glow for dark mode only */}
        <motion.div
          className="absolute -inset-3 rounded-2xl -z-10 blur-2xl opacity-0 dark:opacity-30"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(40,45,55,0.5) 0%, transparent 70%)',
          }}
          animate={{
            opacity: [0.2, 0.35, 0.2],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </motion.div>
    </div>
  );
}
