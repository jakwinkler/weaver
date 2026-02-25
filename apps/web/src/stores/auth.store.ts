import { create } from 'zustand';
import type { User } from '@weaver/shared';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  tenantId: string | null;
  role: string | null;
  login: (token: string, user: User, tenantId: string, refreshToken?: string) => void;
  logout: () => void;
  updateUser: (partial: Partial<User>) => void;
  isAuthenticated: () => boolean;
  isAdmin: () => boolean;
}

function decodeJwtRole(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role || null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: localStorage.getItem('accessToken'),
  tenantId: localStorage.getItem('tenantId'),
  role: (() => {
    const token = localStorage.getItem('accessToken');
    return token ? decodeJwtRole(token) : null;
  })(),

  login: (token: string, user: User, tenantId: string, refreshToken?: string) => {
    localStorage.setItem('accessToken', token);
    localStorage.setItem('tenantId', tenantId);
    if (refreshToken) {
      localStorage.setItem('refreshToken', refreshToken);
    }
    const role = decodeJwtRole(token);
    set({ accessToken: token, user, tenantId, role });
  },

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('tenantId');
    set({ accessToken: null, user: null, tenantId: null, role: null });
  },

  updateUser: (partial: Partial<User>) => {
    const current = get().user;
    if (current) {
      set({ user: { ...current, ...partial } });
    }
  },

  isAuthenticated: () => {
    return get().accessToken !== null;
  },

  isAdmin: () => {
    const role = get().role;
    return role === 'owner' || role === 'admin';
  },
}));
