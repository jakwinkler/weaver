import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';

export function useBulkUpdateIssues() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { issueKeys: string[]; updates: Record<string, unknown> }) => {
      const results = await Promise.allSettled(
        data.issueKeys.map((key) => apiClient.patch(`/issues/${key}`, data.updates)),
      );
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
    },
  });
}

export function useBulkDeleteIssues() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (issueKeys: string[]) => {
      const results = await Promise.allSettled(
        issueKeys.map((key) => apiClient.delete(`/issues/${key}`)),
      );
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
    },
  });
}
