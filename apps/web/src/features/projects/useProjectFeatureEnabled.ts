import { useInstalledPlugins, useProjectPlugins } from '@/api';

export function useProjectFeatureEnabled(projectKey: string, pluginId: string) {
  const project = useProjectPlugins(projectKey);
  const tenant = useInstalledPlugins();
  return {
    isLoading: project.isLoading || tenant.isLoading,
    enabled: Boolean(
      project.data?.some((plugin) => plugin.pluginId === pluginId && plugin.enabled)
      && tenant.data?.some((plugin) => plugin.pluginId === pluginId && plugin.enabled),
    ),
  };
}
