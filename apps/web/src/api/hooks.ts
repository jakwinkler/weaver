import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import type {
  User,
  Project,
  Issue,
  LoginDto,
  RegisterDto,
  CreateProjectDto,
  CreateIssueDto,
  UpdateIssueDto,
  ReorderIssuesDto,
  PaginatedResponse,
} from '@weaver/shared';

// ── Auth ──

interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  user: User;
  tenantId: string;
}

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

export function useCurrentUser() {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const res = await apiClient.get<User>('/auth/me');
      return res.data;
    },
    retry: false,
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
  const { projectKey, page = 1, perPage = 50, sort, ...filters } = params;
  // Strip undefined values from filters
  const activeFilters = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined),
  );
  return useQuery({
    queryKey: ['issues', projectKey, { page, perPage, sort, ...activeFilters }],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<Issue>>(
        `/projects/${projectKey}/issues`,
        { params: { page, perPage, ...(sort ? { sort } : {}), ...activeFilters } },
      );
      return res.data;
    },
    enabled: !!projectKey,
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

export function useCreateIssue(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateIssueDto) => {
      const res = await apiClient.post<Issue>(`/projects/${projectKey}/issues`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues', projectKey] });
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
      queryClient.invalidateQueries({ queryKey: ['issues'] });
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
