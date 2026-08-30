import React, { type ComponentType } from 'react';
import { loadRemote, registerRemotes } from '@module-federation/enhanced/runtime';
import { getPluginRemoteName, PLUGIN_REMOTE_MODULE } from '@weaver/sdk';
import { API_BASE_URL } from '@/api/client';

type PluginImporter = () => Promise<Record<string, unknown>>;

const pluginImporters: Record<string, PluginImporter> = {
  '@weaver/plugin-automatic-time': () => import('@weaver/plugin-automatic-time'),
};

const componentCache = new Map<string, ComponentType<any>>();
const registeredRemotes = new Map<string, string>();

function absoluteBundleUrl(clientBundle: string): string {
  return new URL(clientBundle, API_BASE_URL).toString();
}

function registerPluginRemote(pluginId: string, clientBundle: string): string {
  const remoteName = getPluginRemoteName(pluginId);
  const entry = absoluteBundleUrl(clientBundle);
  const previousEntry = registeredRemotes.get(remoteName);

  if (previousEntry !== entry) {
    registerRemotes(
      [{ name: remoteName, entry, type: 'module' }],
      previousEntry ? { force: true } : undefined,
    );
    registeredRemotes.set(remoteName, entry);
  }

  return remoteName;
}

export function getPluginComponent(
  pluginId: string,
  componentName: string,
  clientBundle?: string,
): ComponentType<any> | null {
  const importer = pluginImporters[pluginId];
  if (!clientBundle && !importer) return null;

  const cacheKey = `${pluginId}::${clientBundle ?? 'workspace'}::${componentName}`;
  const cached = componentCache.get(cacheKey);
  if (cached) return cached;

  const LazyComponent = React.lazy(async () => {
    const remoteModule = importer
      ? await importer()
      : ((await loadRemote(
          `${registerPluginRemote(pluginId, clientBundle!)}/${PLUGIN_REMOTE_MODULE}`,
        )) as Record<string, unknown> | null);
    const Component = remoteModule?.[componentName] as ComponentType<any> | undefined;

    if (!Component) {
      throw new Error(`Component "${componentName}" not found in plugin "${pluginId}"`);
    }

    return { default: Component };
  });

  componentCache.set(cacheKey, LazyComponent);
  return LazyComponent;
}

export function clearPluginLoaderCache(): void {
  componentCache.clear();
  registeredRemotes.clear();
}
