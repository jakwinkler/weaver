import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ImportJob,
  JiraConnectionConfig,
  JiraImportRequest,
  JiraProjectSummary,
} from '@weaver/shared';
import { apiClient } from './client';

export function useDiscoverJiraProjects() {
  return useMutation({
    mutationFn: async (config: JiraConnectionConfig) => {
      const response = await apiClient.post<JiraProjectSummary[]>('/import/jira/projects', {
        config,
      });
      return response.data;
    },
  });
}

export function useStartJiraImport() {
  return useMutation({
    mutationFn: async (data: JiraImportRequest) => {
      const response = await apiClient.post<ImportJob>('/import/jira/start', data);
      return response.data;
    },
  });
}

export function useImportStatus(id: string | null) {
  return useQuery({
    queryKey: ['import-job', id],
    queryFn: async () => {
      const response = await apiClient.get<ImportJob>(`/import/status/${id}`);
      return response.data;
    },
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && ['completed', 'failed', 'cancelled'].includes(status) ? false : 2000;
    },
  });
}

export function useCancelImport(id: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('No import job selected');
      const response = await apiClient.post<ImportJob>(`/import/jira/cancel/${id}`);
      return response.data;
    },
    onSuccess: (job) => {
      queryClient.setQueryData(['import-job', id], job);
    },
  });
}
