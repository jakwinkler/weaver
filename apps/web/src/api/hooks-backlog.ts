import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Issue, MoveIssueSprintDto, PaginatedResponse, SprintStats } from '@weaver/shared';
import { apiClient } from './client';

export interface UseBacklogParams {
  projectKey: string;
  page?: number;
  perPage?: number;
  priority?: string;
  assigneeId?: string;
  issueTypeId?: string;
}

export function useBacklog(params: UseBacklogParams) {
  const { projectKey, page = 1, perPage = 200, ...filters } = params;
  const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));

  return useQuery({
    queryKey: ['backlog', projectKey, { page, perPage, ...activeFilters }],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<Issue>>(
        `/projects/${projectKey}/backlog`,
        { params: { page, perPage, ...activeFilters } },
      );
      return response.data;
    },
    enabled: !!projectKey,
  });
}

export function useMoveIssueToSprint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ issueKey, ...data }: MoveIssueSprintDto & { issueKey: string }) => {
      const response = await apiClient.patch<Issue>(`/issues/${issueKey}/sprint`, data);
      return response.data;
    },
    onSuccess: (issue) => {
      queryClient.invalidateQueries({ queryKey: ['backlog'] });
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: ['sprintStats'] });
      queryClient.invalidateQueries({ queryKey: ['activity', issue.key] });
    },
  });
}

export function useSprintStats(sprintId: string) {
  return useQuery({
    queryKey: ['sprintStats', sprintId],
    queryFn: async () => {
      const response = await apiClient.get<SprintStats>(`/sprints/${sprintId}/stats`);
      return response.data;
    },
    enabled: !!sprintId,
  });
}
