import { create } from 'zustand';
import axios from 'axios';
import type { User } from '@/types';
import { rememberRole } from '@/lib/loginPath';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
}

function clearSession() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  localStorage.removeItem('attendify_last_activity');
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  setUser: (user) => {
    if (user) localStorage.setItem('user', JSON.stringify(user));
    else localStorage.removeItem('user');
    set({ user, isAuthenticated: !!user });
  },
  setLoading: (isLoading) => set({ isLoading }),
  logout: async () => {
    clearSession();
    set({ user: null, isAuthenticated: false });
  },
  initialize: async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      set({ isLoading: false });
      return;
    }
    try {
      const { data } = await axios.get('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const user = data.user || data;
      localStorage.setItem('user', JSON.stringify(user));
      rememberRole(user?.role); // keep the logout-portal hint fresh across refreshes
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));

useAuthStore.getState().initialize();
