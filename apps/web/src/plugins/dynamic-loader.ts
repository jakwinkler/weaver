import React, { type ComponentType } from 'react';
import { loadRemote, registerRemotes } from '@module-federation/enhanced/runtime';
import { getPluginRemoteName, PLUGIN_REMOTE_MODULE } from '@weaver/sdk';
import { API_BASE_URL } from '@/api/client';

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
  if (!clientBundle) return null;

  const cacheKey = `${pluginId}::${clientBundle}::${componentName}`;
  const cached = componentCache.get(cacheKey);
  if (cached) return cached;

  const LazyComponent = React.lazy(async () => {
    const remoteName = registerPluginRemote(pluginId, clientBundle);
    const remoteModule = (await loadRemote(`${remoteName}/${PLUGIN_REMOTE_MODULE}`)) as Record<
      string,
      unknown
    > | null;
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
