import { describe, expect, it } from 'vitest';
import type { PluginManifest } from '@/api';
import {
  getPageEntry,
  getSlotEntries,
  HOST_SLOT_NAMES,
  matchesPagePath,
  type HostSlotName,
} from './plugin-slot-registry';

const bundledManifests = import.meta.glob<PluginManifest>('../../../../plugins/*/weaver-plugin.json', {
  eager: true,
  import: 'default',
});

const manifest: PluginManifest = {
  id: '@example/plugin',
  name: 'Example',
  version: '1.0.0',
  permissions: [],
  clientBundle: '/api/v1/plugin-assets/@example/plugin/remoteEntry.js',
  ui: {
    slots: [{ slot: 'issue-detail-content', component: 'ExamplePanel' }],
  },
};

describe('plugin slot registry', () => {
  it('does not resolve components for disabled plugins', () => {
    expect(getSlotEntries('issue-detail-content', [manifest], [])).toEqual([]);
  });

  it('only finds bundled plugin slots that the host renders', () => {
    const unrendered = Object.entries(bundledManifests).flatMap(([path, bundled]) =>
      (bundled.ui?.slots ?? [])
        .filter((slot) => !HOST_SLOT_NAMES.includes(slot.slot as HostSlotName))
        .map((slot) => `${path}: ${slot.slot}`),
    );

    expect(Object.keys(bundledManifests).length).toBeGreaterThan(0);
    expect(unrendered).toEqual([]);
  });
});

describe('plugin page entries', () => {
  const pageManifest = (id: string, path: string): PluginManifest => ({
    id,
    name: id,
    version: '1.0.0',
    permissions: [],
    ui: { pages: [{ path, component: 'AppPage' }] },
  });
  const manifests = [pageManifest('foo', '/apps/foo'), pageManifest('foobar', '/apps/foobar')];

  it('matches the page path and its nested routes', () => {
    expect(getPageEntry('/apps/foo', manifests, ['foo', 'foobar'])?.pluginId).toBe('foo');
    expect(getPageEntry('/apps/foo/settings', manifests, ['foo', 'foobar'])?.pluginId).toBe('foo');
  });

  it('does not match another page that shares a path prefix', () => {
    expect(getPageEntry('/apps/foobar', manifests, ['foo', 'foobar'])?.pluginId).toBe('foobar');
    expect(getPageEntry('/apps/foobar', manifests, ['foo'])).toBeUndefined();
  });
});

describe('matchesPagePath', () => {
  it('matches at a path segment boundary', () => {
    expect(matchesPagePath('/apps/foo', '/apps/foo')).toBe(true);
    expect(matchesPagePath('/apps/foo/', '/apps/foo')).toBe(true);
    expect(matchesPagePath('/apps/foo/edit', '/apps/foo/')).toBe(true);
    expect(matchesPagePath('/apps/foobar', '/apps/foo')).toBe(false);
  });
});
