import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAllPages } from './pagination';
import { apiClient } from './client';
import type {
  User,
  Project,
  Issue,
  LoginDto,
  RegisterDto,
  AcceptInvitationDto,
  CreateProjectDto,
  CreateIssueDto,
  UpdateIssueDto,
  ReorderIssuesDto,
  PaginatedResponse,
  RoadmapEpic,
  AuthResponse,
} from '@weaver/shared';

// ── Auth ──

export function useLogin() {
  return useMutation({
    mutationFn: async (data: LoginDto) => {
      const res = await apiClient.post<AuthResponse>('/auth/login', data);
      return res.data;
    },
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: async (data: RegisterDto) => {
      const res = await apiClient.post<AuthResponse>('/auth/register', data);
      return res.data;
    },
  });
}

export interface SignInProviders {
  google: boolean;
  github: boolean;
}

export function useSignInProviders() {
  return useQuery({
    queryKey: ['signInProviders'],
    queryFn: async () => {
      const res = await apiClient.get<SignInProviders>('/auth/providers');
      return res.data;
    },
    staleTime: Infinity,
    retry: false,
  });
}

export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: async (data: { email: string }) => {
      const res = await apiClient.post<{ message: string }>('/auth/password-reset/request', data);
      return res.data;
    },
  });
}

export function useConfirmPasswordReset() {
  return useMutation({
    mutationFn: async (data: { token: string; password: string }) => {
      const res = await apiClient.post<{ message: string }>('/auth/password-reset/confirm', data);
      return res.data;
    },
  });
}

export interface InvitationDetails {
  email: string;
  role: string;
  organizationName: string;
  expiresAt: string;
}

export function useInvitation(token: string) {
  return useQuery({
    queryKey: ['invitation', token],
    queryFn: async () => {
      const res = await apiClient.get<InvitationDetails>(`/auth/invitations/${token}`);
      return res.data;
    },
    enabled: !!token,
    retry: false,
  });
}

export function useAcceptInvitation(token: string) {
  return useMutation({
    mutationFn: async (data: AcceptInvitationDto) => {
      const res = await apiClient.post<AuthResponse>(`/auth/invitations/${token}/accept`, data);
      return res.data;
    },
  });
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const res = await apiClient.get<User & { role: string }>('/auth/me');
      return res.data;
    },
    retry: false,
  });
}

export interface OrganizationMembership {
  tenantId: string;
  name: string;
  slug: string;
  role: string;
}

export function useOrganizations() {
  return useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      const res = await apiClient.get<OrganizationMembership[]>('/auth/organizations');
      return res.data;
    },
  });
}

export function useSwitchOrganization() {
  return useMutation({
    mutationFn: async (tenantId: string) => {
      const res = await apiClient.post<AuthResponse>('/auth/switch-organization', { tenantId });
      return res.data;
    },
  });
}

// ── Projects ──

interface UseProjectsParams {
  page?: number;
  perPage?: number;
  sort?: string;
}

export function useProjects(params: UseProjectsParams = {}) {
  const { page = 1, perPage = 50, sort } = params;
  return useQuery({
    queryKey: ['projects', { page, perPage, sort }],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<Project>>('/projects', {
        params: { page, perPage, ...(sort ? { sort } : {}) },
      });
      return res.data;
    },
  });
}

export function useProject(key: string) {
  return useQuery({
    queryKey: ['project', key],
    queryFn: async () => {
      const res = await apiClient.get<Project>(`/projects/${key}`);
      return res.data;
    },
    enabled: !!key,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateProjectDto) => {
      const res = await apiClient.post<Project>('/projects', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, ...data }: { key: string } & Record<string, unknown>) => {
      const res = await apiClient.patch<Project>(`/projects/${key}`, data);
      return res.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', variables.key] });
    },
  });
}

// ── Issues ──

interface UseProjectIssuesParams {
  all?: boolean;
  projectKey: string;
  page?: number;
  perPage?: number;
  sort?: string;
  statusId?: string;
  assigneeId?: string;
  priority?: string;
  startDateFrom?: string;
  startDateTo?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
}

export function useProjectIssues(params: UseProjectIssuesParams) {
  const { projectKey, page = 1, perPage = 50, sort, all = false, ...filters } = params;
  // Strip undefined values from filters
  const activeFilters = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined),
  );
  return useQuery({
    queryKey: ['issues', projectKey, { page, perPage, sort, all, ...activeFilters }],
    queryFn: async ({ signal }) => {
      if (all) return fetchAllPages<Issue>(`/projects/${projectKey}/issues`, { sort, ...activeFilters }, signal);
      const res = await apiClient.get<PaginatedResponse<Issue>>(`/projects/${projectKey}/issues`, {
        params: { page, perPage, ...(sort ? { sort } : {}), ...activeFilters },
      });
      return res.data;
    },
    enabled: !!projectKey,
  });
}

export function useRoadmapEpics(projectKey: string) {
  return useQuery({
    queryKey: ['issues', projectKey, 'roadmap'],
    queryFn: async () => {
      const res = await apiClient.get<RoadmapEpic[]>(`/projects/${projectKey}/epics`);
      return res.data;
    },
    enabled: !!projectKey,
  });
}

export function useResizeRoadmapEpic(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      issueKey,
      startDate,
      dueDate,
    }: {
      issueKey: string;
      startDate: string;
      dueDate: string;
    }) => {
      const res = await apiClient.patch<Issue>(`/issues/${issueKey}`, {
        startDate,
        dueDate,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues', projectKey, 'roadmap'] });
      queryClient.invalidateQueries({ queryKey: ['issues', projectKey] });
    },
  });
}

export function useIssue(key: string) {
  return useQuery({
    queryKey: ['issue', key],
    queryFn: async () => {
      const res = await apiClient.get<Issue>(`/issues/${key}`);
      return res.data;
    },
    enabled: !!key,
  });
}

export function useIssueRecurrence(key: string) {
  return useQuery({
    queryKey: ['issueRecurrence', key],
    queryFn: async () => {
      const res = await apiClient.get<Issue[]>(`/issues/${key}/recurrence`);
      return res.data;
    },
    enabled: !!key,
  });
}

export function useCreateIssue(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateIssueDto) => {
      const res = await apiClient.post<Issue>(`/projects/${projectKey}/issues`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues', projectKey] });
      queryClient.invalidateQueries({ queryKey: ['backlog', projectKey] });
    },
  });
}

export function useUpdateIssue(issueKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdateIssueDto) => {
      const res = await apiClient.patch<Issue>(`/issues/${issueKey}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issue', issueKey] });
      queryClient.invalidateQueries({ queryKey: ['issueRecurrence'] });
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: ['sprints'] });
    },
  });
}

export function useUpdateIssueDynamic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ issueKey, ...data }: UpdateIssueDto & { issueKey: string }) => {
      const res = await apiClient.patch<Issue>(`/issues/${issueKey}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: ['sprints'] });
    },
  });
}

export function useTransitionIssueDynamic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ issueKey, transitionId }: { issueKey: string; transitionId: string }) => {
      const res = await apiClient.post<Issue>(`/issues/${issueKey}/transition`, {
        transitionId,
      });
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['issue', variables.issueKey] });
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: ['activity', variables.issueKey] });
    },
  });
}

export function useReorderIssues() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: ReorderIssuesDto) => {
      await apiClient.patch('/issues/reorder', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
    },
  });
}
