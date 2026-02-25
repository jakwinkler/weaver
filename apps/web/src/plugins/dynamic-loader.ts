import React, { type ComponentType } from 'react';

type PluginImporter = () => Promise<Record<string, unknown>>;

const pluginImporters: Record<string, PluginImporter> = {
  '@weaver/plugin-checklist': () => import('@weaver/plugin-checklist'),
  '@weaver/plugin-timer': () => import('@weaver/plugin-timer'),
  '@weaver/plugin-time-reports': () => import('@weaver/plugin-time-reports'),
};

const componentCache = new Map<string, ComponentType<any>>();

export function getPluginComponent(
  pluginId: string,
  componentName: string,
): ComponentType<any> | null {
  const cacheKey = `${pluginId}::${componentName}`;

  if (componentCache.has(cacheKey)) {
    return componentCache.get(cacheKey)!;
  }

  const importer = pluginImporters[pluginId];
  if (!importer) {
    return null;
  }

  const LazyComponent = React.lazy(async () => {
    const mod = await importer();
    const Component = mod[componentName] as ComponentType<any> | undefined;
    if (!Component) {
      throw new Error(
        `Component "${componentName}" not found in plugin "${pluginId}"`,
      );
    }
    return { default: Component };
  });

  componentCache.set(cacheKey, LazyComponent);
  return LazyComponent;
}
