import { create } from 'zustand';
import type { User } from '@weaver/shared';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  tenantId: string | null;
  role: string | null;
  login: (token: string, user: User, tenantId: string) => void;
  logout: () => void;
  setUser: (user: User) => void;
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

const browserStorage = typeof window === 'undefined' ? null : window.localStorage;

// Remove credentials left behind by older clients. Authentication is cookie-based.
browserStorage?.removeItem('accessToken');
browserStorage?.removeItem('refreshToken');

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  tenantId: browserStorage?.getItem('tenantId') ?? null,
  role: browserStorage?.getItem('role') ?? null,

  login: (token: string, user: User, tenantId: string) => {
    browserStorage?.removeItem('accessToken');
    browserStorage?.removeItem('refreshToken');
    browserStorage?.setItem('tenantId', tenantId);
    const role = decodeJwtRole(token);
    if (role) browserStorage?.setItem('role', role);
    set({ accessToken: token, user, tenantId, role });
  },

  logout: () => {
    browserStorage?.removeItem('accessToken');
    browserStorage?.removeItem('refreshToken');
    browserStorage?.removeItem('tenantId');
    browserStorage?.removeItem('role');
    set({ accessToken: null, user: null, tenantId: null, role: null });
  },

  setUser: (user: User) => set({ user }),

  updateUser: (partial: Partial<User>) => {
    const current = get().user;
    if (current) {
      set({ user: { ...current, ...partial } });
    }
  },

  isAuthenticated: () => {
    return get().tenantId !== null;
  },

  isAdmin: () => {
    const role = get().role;
    return role === 'owner' || role === 'admin';
  },
}));
