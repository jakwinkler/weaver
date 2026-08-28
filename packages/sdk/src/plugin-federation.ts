export const PLUGIN_REMOTE_EXPOSE = './plugin';
export const PLUGIN_REMOTE_MODULE = 'plugin';

export function getPluginRemoteName(pluginId: string): string {
  const slug = pluginId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  let hash = 0xcbf29ce484222325n;

  for (const character of pluginId) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }

  return `weaver_plugin_${slug}_${hash.toString(36)}`;
}
