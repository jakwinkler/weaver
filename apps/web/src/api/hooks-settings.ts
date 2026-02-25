import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import type { TenantSettings } from '@weaver/shared';

export function useTenantSettings() {
  return useQuery({
    queryKey: ['tenant-settings'],
    queryFn: async () => {
      const res = await apiClient.get<TenantSettings>('/settings');
      return res.data;
    },
  });
}

export function useUpdateTenantSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<TenantSettings>) => {
      const res = await apiClient.patch<TenantSettings>('/settings', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
    },
  });
}

export function useTestSmtp() {
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{ success: boolean; message: string }>('/settings/smtp/test');
      return res.data;
    },
  });
}
