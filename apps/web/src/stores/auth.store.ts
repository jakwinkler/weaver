import { create } from 'zustand';
import type { User } from '@weaver/shared';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  tenantId: string | null;
  login: (token: string, user: User, tenantId: string) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: localStorage.getItem('accessToken'),
  tenantId: localStorage.getItem('tenantId'),

  login: (token: string, user: User, tenantId: string) => {
    localStorage.setItem('accessToken', token);
    localStorage.setItem('tenantId', tenantId);
    set({ accessToken: token, user, tenantId });
  },

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('tenantId');
    set({ accessToken: null, user: null, tenantId: null });
  },

  isAuthenticated: () => {
    return get().accessToken !== null;
  },
}));
