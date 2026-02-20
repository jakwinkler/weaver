import { create } from 'zustand';
import type { User } from '@weaver/shared';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  tenantId: string | null;
  role: string | null;
  login: (token: string, user: User, tenantId: string) => void;
  logout: () => void;
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

  login: (token: string, user: User, tenantId: string) => {
    localStorage.setItem('accessToken', token);
    localStorage.setItem('tenantId', tenantId);
    const role = decodeJwtRole(token);
    set({ accessToken: token, user, tenantId, role });
  },

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('tenantId');
    set({ accessToken: null, user: null, tenantId: null, role: null });
  },

  isAuthenticated: () => {
    return get().accessToken !== null;
  },

  isAdmin: () => {
    const role = get().role;
    return role === 'owner' || role === 'admin';
  },
}));
