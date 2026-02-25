import { apiClient } from '@/api/client';
import { useAuthStore } from '@/stores/auth.store';

export interface PluginApiMethods {
  get<T = unknown>(path: string, params?: Record<string, string>): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  put<T = unknown>(path: string, body?: unknown): Promise<T>;
  patch<T = unknown>(path: string, body?: unknown): Promise<T>;
  delete<T = unknown>(path: string): Promise<T>;
}

export interface PluginComponentContext {
  pluginId: string;
  pluginRouteId: string;
  api: PluginApiMethods;
  coreApi: PluginApiMethods;
  currentUserId: string;
}

function buildPluginApi(pluginRouteId: string): PluginApiMethods {
  const base = `/plugin-routes/${pluginRouteId}`;
  return {
    async get<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
      const res = await apiClient.get(`${base}${path}`, { params });
      return res.data;
    },
    async post<T = unknown>(path: string, body?: unknown): Promise<T> {
      const res = await apiClient.post(`${base}${path}`, body);
      return res.data;
    },
    async put<T = unknown>(path: string, body?: unknown): Promise<T> {
      const res = await apiClient.put(`${base}${path}`, body);
      return res.data;
    },
    async patch<T = unknown>(path: string, body?: unknown): Promise<T> {
      const res = await apiClient.patch(`${base}${path}`, body);
      return res.data;
    },
    async delete<T = unknown>(path: string): Promise<T> {
      const res = await apiClient.delete(`${base}${path}`);
      return res.data;
    },
  };
}

const coreApi: PluginApiMethods = {
  async get<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
    const res = await apiClient.get(path, { params });
    return res.data;
  },
  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    const res = await apiClient.post(path, body);
    return res.data;
  },
  async put<T = unknown>(path: string, body?: unknown): Promise<T> {
    const res = await apiClient.put(path, body);
    return res.data;
  },
  async patch<T = unknown>(path: string, body?: unknown): Promise<T> {
    const res = await apiClient.patch(path, body);
    return res.data;
  },
  async delete<T = unknown>(path: string): Promise<T> {
    const res = await apiClient.delete(path);
    return res.data;
  },
};

export function createPluginContext(pluginId: string): PluginComponentContext {
  const pluginRouteId = pluginId.replace('/', '~');
  const user = useAuthStore.getState().user;
  return {
    pluginId,
    pluginRouteId,
    api: buildPluginApi(pluginRouteId),
    coreApi,
    currentUserId: user?.id ?? 'anonymous',
  };
}
