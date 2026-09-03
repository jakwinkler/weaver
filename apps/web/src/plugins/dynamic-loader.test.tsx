// @vitest-environment jsdom
import { Suspense } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadRemote, registerRemotes } from '@module-federation/enhanced/runtime';
import { getPluginRemoteName } from '@weaver/sdk';
import { clearPluginLoaderCache, getPluginComponent } from './dynamic-loader';
import { PluginErrorBoundary } from './PluginErrorBoundary';

vi.mock('@module-federation/enhanced/runtime', () => ({
  loadRemote: vi.fn(),
  registerRemotes: vi.fn(),
}));

describe('dynamic plugin loader', () => {
  afterEach(() => {
    cleanup();
    clearPluginLoaderCache();
    vi.clearAllMocks();
  });

  it('registers and renders a component from the manifest bundle URL', async () => {
    vi.mocked(loadRemote).mockResolvedValue({
      ExamplePanel: () => <div>Runtime plugin content</div>,
    });

    const Component = getPluginComponent(
      '@example/plugin',
      'ExamplePanel',
      '/api/v1/plugin-assets/@example/plugin/remoteEntry.js',
    );

    render(<Suspense fallback={<div>Loading</div>}>{Component ? <Component /> : null}</Suspense>);

    expect(await screen.findByText('Runtime plugin content')).toBeTruthy();
    expect(registerRemotes).toHaveBeenCalledWith(
      [
        {
          name: getPluginRemoteName('@example/plugin'),
          entry: 'http://localhost:3000/api/v1/plugin-assets/@example/plugin/remoteEntry.js',
          type: 'module',
        },
      ],
      undefined,
    );
    expect(loadRemote).toHaveBeenCalledWith(`${getPluginRemoteName('@example/plugin')}/plugin`);
  });

  it('renders the plugin error fallback when the remote cannot load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(loadRemote).mockRejectedValue(new Error('network failure'));
    const Component = getPluginComponent(
      '@example/plugin',
      'ExamplePanel',
      '/api/v1/plugin-assets/@example/plugin/remoteEntry.js',
    );

    render(
      <PluginErrorBoundary pluginId="@example/plugin">
        <Suspense fallback={<div>Loading</div>}>{Component ? <Component /> : null}</Suspense>
      </PluginErrorBoundary>,
    );

    expect(await screen.findByText('Plugin failed to load')).toBeTruthy();
  });

  it('does not create a component without a client bundle', () => {
    expect(getPluginComponent('@example/plugin', 'ExamplePanel')).toBeNull();
    expect(registerRemotes).not.toHaveBeenCalled();
    expect(loadRemote).not.toHaveBeenCalled();
  });

  it.each([
    'https://attacker.example/remoteEntry.js',
    '/api/v1/projects',
    '/api/v1/plugin-assets/@other/plugin/remoteEntry.js',
  ])('rejects an untrusted client bundle URL: %s', (clientBundle) => {
    expect(
      getPluginComponent('@example/plugin', 'ExamplePanel', clientBundle),
    ).toBeNull();
    expect(registerRemotes).not.toHaveBeenCalled();
    expect(loadRemote).not.toHaveBeenCalled();
  });
});
