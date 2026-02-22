import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';

// ── Plugin Permissions ──

export interface PluginPermission {
  key: string;
  label: string;
  description?: string;
}

export interface PluginPermissionsMap {
  [pluginId: string]: {
    pluginName: string;
    permissions: PluginPermission[];
  };
}

export function usePluginPermissions() {
  return useQuery({
    queryKey: ['pluginPermissions'],
    queryFn: async () => {
      const res = await apiClient.get<PluginPermissionsMap>('/plugins/permissions');
      return res.data;
    },
  });
}

// ── Project Members ──

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: string;
  createdAt: string;
}

export function useProjectMembers(projectKey: string) {
  return useQuery({
    queryKey: ['projectMembers', projectKey],
    queryFn: async () => {
      const res = await apiClient.get<ProjectMember[]>(`/projects/${projectKey}/members`);
      return res.data;
    },
    enabled: !!projectKey,
  });
}

export function useAddProjectMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectKey, userId, role }: { projectKey: string; userId: string; role?: string }) => {
      const res = await apiClient.post<ProjectMember>(`/projects/${projectKey}/members`, { userId, role });
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projectMembers', variables.projectKey] });
    },
  });
}

export function useUpdateProjectMemberRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectKey, userId, role }: { projectKey: string; userId: string; role: string }) => {
      const res = await apiClient.patch<ProjectMember>(`/projects/${projectKey}/members/${userId}`, { role });
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projectMembers', variables.projectKey] });
    },
  });
}

export function useRemoveProjectMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectKey, userId }: { projectKey: string; userId: string }) => {
      await apiClient.delete(`/projects/${projectKey}/members/${userId}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projectMembers', variables.projectKey] });
    },
  });
}

// ── Project Issue Types ──

export interface IssueType {
  id: string;
  name: string;
  slug: string;
  isSubtask: boolean;
}

export function useProjectIssueTypes(projectKey: string) {
  return useQuery({
    queryKey: ['projectIssueTypes', projectKey],
    queryFn: async () => {
      const res = await apiClient.get<IssueType[]>(`/projects/${projectKey}/issue-types`);
      return res.data;
    },
    enabled: !!projectKey,
  });
}

export function useSetProjectIssueTypes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectKey, issueTypeIds }: { projectKey: string; issueTypeIds: string[] }) => {
      const res = await apiClient.post<IssueType[]>(`/projects/${projectKey}/issue-types`, { issueTypeIds });
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projectIssueTypes', variables.projectKey] });
    },
  });
}
