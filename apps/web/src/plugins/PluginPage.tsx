import { Suspense, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useInstalledPlugins, useAvailablePlugins, useMyPermissions } from '@/api';
import { getPageEntry } from './plugin-slot-registry';
import { createPluginContext } from './plugin-context';
import { Puzzle } from 'lucide-react';
import { PluginErrorBoundary } from './PluginErrorBoundary';
import { PluginLoading } from './PluginLoading';

export function PluginPage() {
  const location = useLocation();
  const { data: installedPlugins, isLoading: installedLoading } = useInstalledPlugins();
  const { data: availablePlugins, isLoading: availableLoading } = useAvailablePlugins();
  const permissions = useMyPermissions();

  const isLoading = installedLoading || availableLoading;

  const enabledPluginIds = useMemo(
    () => (installedPlugins ?? []).filter((p) => p.enabled).map((p) => p.pluginId),
    [installedPlugins],
  );

  const entry = useMemo(
    () => getPageEntry(location.pathname, availablePlugins ?? [], enabledPluginIds),
    [location.pathname, availablePlugins, enabledPluginIds],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!entry || !entry.component) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Puzzle className="mb-4 h-12 w-12 text-muted-foreground/40" />
        <h2 className="text-lg font-semibold text-foreground">Page not found</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This plugin page doesn't exist or the plugin is not installed.
        </p>
      </div>
    );
  }

  const hasPermission =
    permissions.includes('*') ||
    entry.requiredPermissions.every((perm) => permissions.includes(perm));

  if (!hasPermission) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Puzzle className="mb-4 h-12 w-12 text-muted-foreground/40" />
        <h2 className="text-lg font-semibold text-foreground">Access denied</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You don't have permission to view this page.
        </p>
      </div>
    );
  }

  const Component = entry.component;
  const pluginContext = createPluginContext(entry.pluginId);

  return (
    <PluginErrorBoundary pluginId={entry.pluginId}>
      <Suspense fallback={<PluginLoading />}>
        <Component pluginContext={pluginContext} />
      </Suspense>
    </PluginErrorBoundary>
  );
}
