// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mutate = vi.fn();
const mutateAsync = vi.fn();

vi.mock('@/api/hooks-phase4', () => ({
  useAvailablePlugins: () => ({
    data: [
      {
        id: '@weaver/plugin-checklist',
        name: 'Checklist',
        version: '1.0.0',
        permissions: [],
        settings: {
          schema: {
            trackActivity: {
              type: 'boolean',
              label: 'Track activity',
              default: true,
            },
          },
        },
      },
    ],
    isLoading: false,
  }),
  useInstalledPlugins: () => ({
    data: [
      {
        id: 'installed-plugin-id',
        tenantId: 'tenant-id',
        pluginId: '@weaver/plugin-checklist',
        version: '1.0.0',
        enabled: true,
        settings: {},
        installedAt: '2026-08-28T00:00:00.000Z',
      },
    ],
    isLoading: false,
  }),
  useInstallPlugin: () => ({ mutate, isPending: false }),
  useUninstallPlugin: () => ({ mutate, isPending: false }),
  useEnablePlugin: () => ({ mutate, isPending: false }),
  useDisablePlugin: () => ({ mutate, isPending: false }),
  usePluginSettings: () => ({
    data: { trackActivity: true },
    isLoading: false,
    isError: false,
  }),
  useUpdatePluginSettings: () => ({
    mutateAsync,
    isPending: false,
  }),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverStub);

import { formatSettingsSummary, PluginsPage } from './PluginsPage';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PluginsPage settings', () => {
  it('shows a settings action, default summary, and generated form for an installed plugin', () => {
    render(<PluginsPage />);

    expect(screen.getByText('Default settings')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Checklist settings')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Track activity' })).toBeChecked();
  });

  it('formats saved values while masking secret-like settings', () => {
    expect(
      formatSettingsSummary(
        { webhookSecret: 'do-not-display', trackActivity: false },
        {
          webhookSecret: { type: 'string', label: 'Webhook secret' },
          trackActivity: { type: 'boolean', label: 'Track activity' },
        },
      ),
    ).toBe('Webhook secret=configured, Track activity=off');
  });
});
