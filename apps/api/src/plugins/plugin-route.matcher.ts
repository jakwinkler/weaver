import type { Request } from 'express';
import type { PluginRouteDefinition } from '@weaver/sdk';
import { PluginLoaderService } from './plugin-loader.service';

export interface MatchedPluginRoute {
  pluginId: string;
  normalizedPath: string;
  route: PluginRouteDefinition;
  params: Record<string, string>;
}

export function matchPluginRoute(
  loader: PluginLoaderService,
  req: Pick<Request, 'path' | 'method'>,
): MatchedPluginRoute | undefined {
  const stripped = req.path.replace(/^.*\/plugin-routes\//, '');
  const firstSlash = stripped.indexOf('/');
  if (firstSlash === -1) return undefined;

  let rawPluginId: string;
  try {
    rawPluginId = decodeURIComponent(stripped.substring(0, firstSlash));
  } catch {
    return undefined;
  }

  const routePath = stripped.substring(firstSlash + 1);
  const pluginId = rawPluginId.replace('~', '/');
  const normalizedPath = `/${routePath}`;
  const manifest = loader.getManifest(pluginId);
  const route = manifest?.routes?.find(
    (candidate) =>
      candidate.method === req.method.toUpperCase() &&
      pathsMatch(candidate.path, normalizedPath),
  );
  if (!route) return undefined;

  return {
    pluginId,
    normalizedPath,
    route,
    params: extractRouteParams(route.path, normalizedPath),
  };
}

function pathsMatch(pattern: string, actual: string): boolean {
  const patternParts = pattern.split('/').filter(Boolean);
  const actualParts = actual.split('/').filter(Boolean);
  return (
    patternParts.length === actualParts.length &&
    patternParts.every(
      (part, index) => part.startsWith(':') || part === actualParts[index],
    )
  );
}

function extractRouteParams(
  pattern: string,
  actual: string,
): Record<string, string> {
  const patternParts = pattern.split('/').filter(Boolean);
  const actualParts = actual.split('/').filter(Boolean);
  const params: Record<string, string> = {};

  for (let index = 0; index < patternParts.length; index++) {
    if (patternParts[index].startsWith(':')) {
      params[patternParts[index].slice(1)] = actualParts[index];
    }
  }

  return params;
}
