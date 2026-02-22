import { useInstalledPlugins, useMyPermissions } from '@/api';
import { getSlotComponents } from './plugin-slot-registry';

interface PluginSlotProps {
  name: string;
  [key: string]: unknown;
}

export function PluginSlot({ name, ...props }: PluginSlotProps) {
  const { data: installedPlugins } = useInstalledPlugins();
  const permissions = useMyPermissions();

  if (!installedPlugins) return null;

  const enabledPluginIds = installedPlugins
    .filter((p) => p.enabled)
    .map((p) => p.pluginId);

  const entries = getSlotComponents(name, enabledPluginIds);

  const hasPermission = (required: string[]) => {
    if (permissions.includes('*')) return true;
    return required.every((perm) => permissions.includes(perm));
  };

  const visible = entries.filter((entry) => hasPermission(entry.requiredPermissions));

  if (visible.length === 0) return null;

  return (
    <>
      {visible.map((entry) => {
        const Component = entry.component;
        return <Component key={entry.pluginId} {...props} />;
      })}
    </>
  );
}
