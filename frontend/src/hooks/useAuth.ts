import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/services/api';
import { User } from '@/types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null, token: null, isAuthenticated: false,
      login: async (email: string, password: string) => {
        const response = await api.post('/auth/login', { email, password });
        const { token, user } = response.data.data;
        localStorage.setItem('token', token);
        set({ user, token, isAuthenticated: true });
      },
      logout: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        set({ user: null, token: null, isAuthenticated: false });
      },
      fetchMe: async () => {
        try {
          const response = await api.get('/auth/me');
          set({ user: response.data.data, isAuthenticated: true });
        } catch { get().logout(); }
      },
    }),
    { name: 'auth-storage' }
  )
);
