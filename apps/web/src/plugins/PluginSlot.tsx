import { Suspense } from 'react';
import { useInstalledPlugins, useAvailablePlugins, useMyPermissions } from '@/api';
import { getSlotEntries } from './plugin-slot-registry';
import { createPluginContext } from './plugin-context';

interface PluginSlotProps {
  name: string;
  [key: string]: unknown;
}

export function PluginSlot({ name, ...props }: PluginSlotProps) {
  const { data: installedPlugins } = useInstalledPlugins();
  const { data: availablePlugins } = useAvailablePlugins();
  const permissions = useMyPermissions();

  if (!installedPlugins || !availablePlugins) return null;

  const enabledPluginIds = installedPlugins
    .filter((p) => p.enabled)
    .map((p) => p.pluginId);

  const entries = getSlotEntries(name, availablePlugins, enabledPluginIds);

  const hasPermission = (required: string[]) => {
    if (permissions.includes('*')) return true;
    return required.every((perm) => permissions.includes(perm));
  };

  const visible = entries.filter(
    (entry) => entry.component && hasPermission(entry.requiredPermissions),
  );

  if (visible.length === 0) return null;

  return (
    <>
      {visible.map((entry) => {
        const Component = entry.component!;
        const pluginContext = createPluginContext(entry.pluginId);
        return (
          <Suspense key={entry.pluginId} fallback={null}>
            <Component pluginContext={pluginContext} {...props} />
          </Suspense>
        );
      })}
    </>
  );
}
