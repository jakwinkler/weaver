import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';

// ── Plugin Types ──

interface PluginNavigationItem {
  label: string;
  icon: string;
  path: string;
  requiredPermissions?: string[];
}

interface PluginPageDefinition {
  path: string;
  component: string;
  requiredPermissions?: string[];
}

interface PluginUISlot {
  slot: string;
  component: string;
  requiredPermissions?: string[];
}

interface PluginProjectViewDefinition {
  label: string;
  icon: string;
  viewPath: string;
  requiredPermissions?: string[];
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  icon?: string;
  type?: 'app' | 'widget' | 'feature' | 'integration';
  scope?: 'tenant' | 'project';
  permissions: string[];
  clientBundle?: string;
  ui?: {
    slots?: PluginUISlot[];
    navigation?: PluginNavigationItem[];
    pages?: PluginPageDefinition[];
    projectViews?: PluginProjectViewDefinition[];
  };
}

interface InstalledPlugin {
  id: string;
  tenantId: string;
  pluginId: string;
  version: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  installedAt: string;
}

// ── Available Plugins ──

export function useAvailablePlugins() {
  return useQuery({
    queryKey: ['plugins', 'available'],
    queryFn: async () => {
      const res = await apiClient.get<PluginManifest[]>('/plugins/available');
      return res.data;
    },
  });
}

// ── Installed Plugins ──

export function useInstalledPlugins() {
  return useQuery({
    queryKey: ['plugins', 'installed'],
    queryFn: async () => {
      const res = await apiClient.get<InstalledPlugin[]>('/plugins');
      return res.data;
    },
  });
}

export function useInstallPlugin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pluginId: string) => {
      const res = await apiClient.post<InstalledPlugin>('/plugins/install', { pluginId });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });
}

export function useUninstallPlugin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pluginId: string) => {
      await apiClient.post('/plugins/uninstall', { pluginId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });
}

export function useEnablePlugin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pluginId: string) => {
      const res = await apiClient.post<InstalledPlugin>('/plugins/enable', { pluginId });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });
}

export function useDisablePlugin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pluginId: string) => {
      const res = await apiClient.post<InstalledPlugin>('/plugins/disable', { pluginId });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });
}

export function useUpdatePluginSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pluginId,
      settings,
    }: {
      pluginId: string;
      settings: Record<string, unknown>;
    }) => {
      const res = await apiClient.patch<InstalledPlugin>('/plugins/settings', {
        pluginId,
        settings,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });
}
