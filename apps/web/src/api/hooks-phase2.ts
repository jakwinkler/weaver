import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import type {
  Workflow,
  WorkflowStatus,
  WorkflowTransition,
  Board,
  Sprint,
  BurndownDataPoint,
  SprintSummary,
  SprintVelocity,
  Comment,
  ActivityLog,
  IssueType,
  CreateWorkflowDto,
  CreateBoardDto,
  CreateSprintDto,
  CreateCommentDto,
} from '@weaver/shared';

// ── Workflows ──

export function useWorkflows() {
  return useQuery({
    queryKey: ['workflows'],
    queryFn: async () => {
      const res = await apiClient.get<Workflow[]>('/workflows');
      return res.data;
    },
  });
}

interface WorkflowDetail extends Workflow {
  statuses: WorkflowStatus[];
  transitions: WorkflowTransition[];
}

export function useWorkflow(id: string) {
  return useQuery({
    queryKey: ['workflow', id],
    queryFn: async () => {
      const res = await apiClient.get<WorkflowDetail>(`/workflows/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}

export function useCreateWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateWorkflowDto) => {
      const res = await apiClient.post<Workflow>('/workflows', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}

export function useWorkflowTransitions(workflowId: string, statusId: string) {
  return useQuery({
    queryKey: ['workflowTransitions', workflowId, statusId],
    queryFn: async () => {
      const res = await apiClient.get<WorkflowTransition[]>(
        `/workflows/${workflowId}/transitions/available/${statusId}`,
      );
      return res.data;
    },
    enabled: !!workflowId && !!statusId,
  });
}

// ── Boards ──

export function useBoards(projectId: string) {
  return useQuery({
    queryKey: ['boards', projectId],
    queryFn: async () => {
      const res = await apiClient.get<Board[]>('/boards', {
        params: { projectId },
      });
      return res.data;
    },
    enabled: !!projectId,
  });
}

export function useBoard(id: string) {
  return useQuery({
    queryKey: ['board', id],
    queryFn: async () => {
      const res = await apiClient.get<Board>(`/boards/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}

export function useCreateBoard(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateBoardDto) => {
      const res = await apiClient.post<Board>('/boards', data, {
        params: { projectId },
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boards', projectId] });
    },
  });
}

// ── Sprints ──

export function useSprints(projectId: string) {
  return useQuery({
    queryKey: ['sprints', projectId],
    queryFn: async () => {
      const res = await apiClient.get<Sprint[]>('/sprints', {
        params: { projectId },
      });
      return res.data;
    },
    enabled: !!projectId,
  });
}

export function useCreateSprint(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateSprintDto) => {
      const res = await apiClient.post<Sprint>('/sprints', data, {
        params: { projectId },
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprints', projectId] });
    },
  });
}

export function useStartSprint(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<Sprint>(`/sprints/${id}/start`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprints'] });
    },
  });
}

export function useCompleteSprint(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<Sprint>(`/sprints/${id}/complete`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprints'] });
    },
  });
}

export function useSprintBurndown(id: string) {
  return useQuery({
    queryKey: ['sprint-report', id, 'burndown'],
    queryFn: async () => {
      const res = await apiClient.get<BurndownDataPoint[]>(`/sprints/${id}/burndown`);
      return res.data;
    },
    enabled: !!id,
  });
}

export function useSprintSummary(id: string) {
  return useQuery({
    queryKey: ['sprint-report', id, 'summary'],
    queryFn: async () => {
      const res = await apiClient.get<SprintSummary>(`/sprints/${id}/summary`);
      return res.data;
    },
    enabled: !!id,
  });
}

export function useSprintVelocity(projectKey: string, limit = 10) {
  return useQuery({
    queryKey: ['sprint-report', projectKey, 'velocity', limit],
    queryFn: async () => {
      const res = await apiClient.get<SprintVelocity[]>(`/projects/${projectKey}/velocity`, {
        params: { limit },
      });
      return res.data;
    },
    enabled: !!projectKey,
  });
}

// ── Comments ──

export function useComments(issueKey: string) {
  return useQuery({
    queryKey: ['comments', issueKey],
    queryFn: async () => {
      const res = await apiClient.get<Comment[]>(`/issues/${issueKey}/comments`);
      return res.data;
    },
    enabled: !!issueKey,
  });
}

export function useCreateComment(issueKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateCommentDto) => {
      const res = await apiClient.post<Comment>(`/issues/${issueKey}/comments`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', issueKey] });
      queryClient.invalidateQueries({ queryKey: ['activity', issueKey] });
    },
  });
}

// ── Activity ──

export function useActivity(issueKey: string) {
  return useQuery({
    queryKey: ['activity', issueKey],
    queryFn: async () => {
      const res = await apiClient.get<ActivityLog[]>(`/issues/${issueKey}/activity`);
      return res.data;
    },
    enabled: !!issueKey,
  });
}

// ── Issue Types ──

export function useIssueTypes() {
  return useQuery({
    queryKey: ['issueTypes'],
    queryFn: async () => {
      const res = await apiClient.get<IssueType[]>('/issue-types');
      return res.data;
    },
  });
}
