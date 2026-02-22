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
  PaginatedResponse,
} from '@weaver/shared';

// ── Auth ──

interface AuthResponse {
  accessToken: string;
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
}

export function useProjects(params: UseProjectsParams = {}) {
  const { page = 1, perPage = 50 } = params;
  return useQuery({
    queryKey: ['projects', { page, perPage }],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<Project>>('/projects', {
        params: { page, perPage },
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
}

export function useProjectIssues(params: UseProjectIssuesParams) {
  const { projectKey, page = 1, perPage = 50 } = params;
  return useQuery({
    queryKey: ['issues', projectKey, { page, perPage }],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<Issue>>(
        `/projects/${projectKey}/issues`,
        { params: { page, perPage } },
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
