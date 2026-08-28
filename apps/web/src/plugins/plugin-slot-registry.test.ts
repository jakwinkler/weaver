import { describe, expect, it } from 'vitest';
import type { PluginManifest } from '@/api';
import { getSlotEntries } from './plugin-slot-registry';

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
});
