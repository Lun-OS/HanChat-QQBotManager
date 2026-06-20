import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  username: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;
  login: (username: string, token: string) => void;
  logout: () => void;
  setToken: (token: string) => void;
  clearToken: () => void;
  restoreFromStorage: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      token: null,
      login: (username, token) => {
        // 统一在 setToken 中处理 localStorage
        get().setToken(token);
        set({ 
          user: { username }, 
          isAuthenticated: true,
        });
      },
      logout: () => {
        get().clearToken();
        set({ user: null, isAuthenticated: false, token: null });
      },
      setToken: (token: string) => {
        localStorage.setItem('auth_token', token);
        set({ token });
      },
      clearToken: () => {
        localStorage.removeItem('auth_token');
        set({ token: null });
      },
      restoreFromStorage: () => {
        const token = localStorage.getItem('auth_token');
        if (token) {
          set({ token });
          return true;
        }
        return false;
      },
    }),
    {
      name: 'auth-storage',
      // 只持久化非敏感信息，token 由 localStorage 单独管理
      partialize: (state) => ({ 
        user: state.user,
        isAuthenticated: state.isAuthenticated 
      }),
    }
  )
);
