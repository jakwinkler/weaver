import axios from 'axios';
import { clearLocalSession } from '@/auth/clear-local-session';
import { queryClient } from './query-client';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const tenantId = localStorage.getItem('tenantId');
  if (tenantId && !config.url?.includes('/auth/')) {
    config.headers['x-tenant-id'] = tenantId;
  }

  return config;
});

let isRefreshing = false;
let refreshQueue: Array<{ resolve: () => void; reject: (err: unknown) => void }> = [];

function processQueue(error?: unknown) {
  refreshQueue.forEach((p) => {
    if (!error) p.resolve();
    else p.reject(error);
  });
  refreshQueue = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Don't try refresh on auth routes
    if (originalRequest.url?.includes('/auth/')) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshQueue.push({
          resolve: () => {
            resolve(apiClient(originalRequest));
          },
          reject,
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      await axios.post(
        `${API_BASE_URL}/auth/refresh`,
        {},
        {
          withCredentials: true,
        },
      );

      processQueue();
      return apiClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError);
      clearLocalSession(queryClient);
      window.location.href = '/login';
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);
