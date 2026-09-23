import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import type {
  WorkflowStatus,
  WorkflowTransition,
  IssueType,
  CustomFieldDefinition,
  PaginatedResponse,
} from '@weaver/shared';

// ── Audit log ──

export interface AuditLogFilters {
  page: number;
  perPage: number;
  userId?: string;
  resource?: string;
  action?: string;
  from?: string;
  to?: string;
  search?: string;
}

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  user: { id: string; displayName: string; email: string } | null;
  action: string;
  resource: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

function auditLogParams(filters: AuditLogFilters) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== '' && value !== undefined),
  );
}

export function useAuditLog(filters: AuditLogFilters) {
  return useQuery({
    queryKey: ['auditLog', filters],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<AuditLogEntry>>('/audit-log', {
        params: auditLogParams(filters),
      });
      return res.data;
    },
  });
}

export async function downloadAuditLog(filters: AuditLogFilters) {
  const res = await apiClient.get<Blob>('/audit-log/export', {
    params: auditLogParams(filters),
    responseType: 'blob',
  });
  const disposition = res.headers['content-disposition'] as string | undefined;
  const filename = disposition?.match(/filename="?([^";]+)"?/i)?.[1] ?? 'weaver-audit-log.csv';
  const url = URL.createObjectURL(res.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ── Users ──

export interface TenantUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  createdAt: string;
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await apiClient.get<TenantUser[]>('/users');
      return res.data;
    },
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await apiClient.patch(`/users/${userId}/role`, { role });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

// ── Issue Types CRUD ──

export function useCreateIssueType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; slug: string; icon?: string; iconColor?: string | null; iconAttachmentId?: string | null; isSubtask?: boolean }) => {
      const res = await apiClient.post<IssueType>('/issue-types', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issueTypes'] });
    },
  });
}

export function useUpdateIssueType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; slug?: string; icon?: string; iconColor?: string | null; iconAttachmentId?: string | null; isSubtask?: boolean }) => {
      const res = await apiClient.patch<IssueType>(`/issue-types/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issueTypes'] });
    },
  });
}

export function useDeleteIssueType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/issue-types/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issueTypes'] });
    },
  });
}

// ── Roles ──

export function useUpdateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; permissions?: Record<string, boolean> }) => {
      const res = await apiClient.patch(`/roles/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
  });
}

// ── Workflow mutations ──

export function useDeleteWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/workflows/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}

export function useAddWorkflowStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ workflowId, ...data }: { workflowId: string; name: string; category: string; color: string; isInitial?: boolean; isTerminal?: boolean }) => {
      const res = await apiClient.post<WorkflowStatus>(`/workflows/${workflowId}/statuses`, data);
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', variables.workflowId] });
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}

export function useDeleteWorkflowStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ workflowId, statusId }: { workflowId: string; statusId: string }) => {
      await apiClient.delete(`/workflows/${workflowId}/statuses/${statusId}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', variables.workflowId] });
    },
  });
}

export function useUpdateWorkflowStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      workflowId,
      statusId,
      ...data
    }: {
      workflowId: string;
      statusId: string;
      name?: string;
      category?: string;
      color?: string;
      isInitial?: boolean;
      isTerminal?: boolean;
    }) => {
      const res = await apiClient.patch<WorkflowStatus>(
        `/workflows/${workflowId}/statuses/${statusId}`,
        data,
      );
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', variables.workflowId] });
    },
  });
}

export function useAddWorkflowTransition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ workflowId, ...data }: { workflowId: string; name: string; fromStatusId: string; toStatusId: string }) => {
      const res = await apiClient.post<WorkflowTransition>(`/workflows/${workflowId}/transitions`, data);
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', variables.workflowId] });
    },
  });
}

export function useUpdateWorkflowTransition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      workflowId,
      transitionId,
      ...data
    }: {
      workflowId: string;
      transitionId: string;
      name?: string;
    }) => {
      const res = await apiClient.patch<WorkflowTransition>(
        `/workflows/${workflowId}/transitions/${transitionId}`,
        data,
      );
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', variables.workflowId] });
    },
  });
}

export function useDeleteWorkflowTransition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ workflowId, transitionId }: { workflowId: string; transitionId: string }) => {
      await apiClient.delete(`/workflows/${workflowId}/transitions/${transitionId}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', variables.workflowId] });
    },
  });
}

// ── Teams members ──

export interface TeamMember {
  id: string;
  email: string;
  displayName: string | null;
}

export function useTeamMembers(teamId: string) {
  return useQuery({
    queryKey: ['teamMembers', teamId],
    queryFn: async () => {
      const res = await apiClient.get<TeamMember[]>(`/teams/${teamId}/members`);
      return res.data;
    },
    enabled: !!teamId,
  });
}

export function useAddTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId, userId }: { teamId: string; userId: string }) => {
      await apiClient.post(`/teams/${teamId}/members`, { userId });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['teamMembers', variables.teamId] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}

export function useRemoveTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId, userId }: { teamId: string; userId: string }) => {
      await apiClient.delete(`/teams/${teamId}/members/${userId}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['teamMembers', variables.teamId] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}

// ── Issue Transitions ──

export function useTransitionIssue(issueKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (transitionId: string) => {
      const res = await apiClient.post(`/issues/${issueKey}/transition`, { transitionId });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issue', issueKey] });
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: ['activity', issueKey] });
    },
  });
}

// ── Custom Field Update ──

export function useUpdateCustomField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: {
      id: string;
      name?: string;
      required?: boolean;
      options?: Record<string, unknown>;
      validation?: Record<string, unknown>;
    }) => {
      const res = await apiClient.patch<CustomFieldDefinition>(`/custom-fields/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customFields'] });
    },
  });
}

// ── Delete Team ──

export function useDeleteTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/teams/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}
