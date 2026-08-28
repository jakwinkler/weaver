import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import type { BulkIssueUpdatesDto, Issue } from '@weaver/shared';

export function useBulkUpdateIssues() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { issueIds: string[]; updates: BulkIssueUpdatesDto }) => {
      const response = await apiClient.patch<Issue[]>('/issues/bulk', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useBulkDeleteIssues() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (issueIds: string[]) => {
      const response = await apiClient.delete<{ count: number }>('/issues/bulk', {
        data: { issueIds },
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
