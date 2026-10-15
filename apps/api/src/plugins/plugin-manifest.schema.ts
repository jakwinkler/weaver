import { pluginManifestSchema } from '@weaver/shared';
import type { PluginManifest } from '@weaver/sdk';

export function parsePluginManifest(value: unknown): PluginManifest {
  return pluginManifestSchema.parse(value);
}
