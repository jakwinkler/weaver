import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';

export interface ProjectPlugin {
  id: string;
  projectId: string;
  pluginId: string;
  enabled: boolean;
  enabledAt: string;
}

export function useProjectPlugins(projectKey: string) {
  return useQuery<ProjectPlugin[]>({
    queryKey: ['project-plugins', projectKey],
    queryFn: () => apiClient.get(`/projects/${projectKey}/plugins`).then((r) => r.data),
    enabled: !!projectKey,
  });
}

export function useEnableProjectPlugin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectKey, pluginId }: { projectKey: string; pluginId: string }) =>
      apiClient.post(`/projects/${projectKey}/plugins/enable`, { pluginId }),
    onSuccess: (_, { projectKey }) => {
      qc.invalidateQueries({ queryKey: ['project-plugins', projectKey] });
    },
  });
}

export function useDisableProjectPlugin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectKey, pluginId }: { projectKey: string; pluginId: string }) =>
      apiClient.post(`/projects/${projectKey}/plugins/disable`, { pluginId }),
    onSuccess: (_, { projectKey }) => {
      qc.invalidateQueries({ queryKey: ['project-plugins', projectKey] });
    },
  });
}
