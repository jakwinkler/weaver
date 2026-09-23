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

function absoluteBundleUrl(pluginId: string, clientBundle: string): string | null {
  const pageOrigin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
  const apiBase = new URL(API_BASE_URL, pageOrigin);
  const url = new URL(clientBundle, apiBase);
  const pluginPath = pluginId
    .split('/')
    .map((segment) => encodeURIComponent(segment).replace('%40', '@'))
    .join('/');
  const apiPath = apiBase.pathname.replace(/\/+$/, '');
  const expectedPath = `${apiPath}/plugin-assets/${pluginPath}/remoteEntry.js`;

  if (
    url.origin !== apiBase.origin ||
    url.pathname !== expectedPath ||
    url.search !== '' ||
    url.hash !== '' ||
    url.username !== '' ||
    url.password !== ''
  ) {
    return null;
  }

  return url.toString();
}

function registerPluginRemote(pluginId: string, entry: string): string {
  const remoteName = getPluginRemoteName(pluginId);
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
  const entry = clientBundle ? absoluteBundleUrl(pluginId, clientBundle) : null;
  if (clientBundle && !entry) return null;
  const cacheKey = `${pluginId}::${entry ?? 'workspace'}::${componentName}`;
  const cached = componentCache.get(cacheKey);
  if (cached) return cached;

  const LazyComponent = React.lazy(async () => {
    const remoteModule = entry
      ? await loadRemote(`${registerPluginRemote(pluginId, entry)}/${PLUGIN_REMOTE_MODULE}`) as Record<string, unknown> | null
      : await importer!();
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
