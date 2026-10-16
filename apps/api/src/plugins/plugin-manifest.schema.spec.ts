import type {
  PluginCompanionMetadata,
  PluginDeclaredPermission,
  PluginManifest,
  PluginMigration,
  PluginNavigationItem,
  PluginPageDefinition,
  PluginProjectViewDefinition,
  PluginRequirements,
  PluginRouteDefinition,
  PluginSettingDefinition,
  PluginUISlot,
  PluginUninstallMetadata,
} from '@weaver/sdk';

import { parsePluginManifest } from './plugin-manifest.schema';

describe('parsePluginManifest', () => {
  // Every optional key of the SDK types is set. Adding a key to an SDK type stops this file
  // compiling until it is listed here, and the strict schema then rejects it until it is allowed,
  // so the SDK types and the schema cannot drift apart unnoticed.
  const setting: Required<PluginSettingDefinition> = {
    type: 'textarea',
    label: 'Notes',
    required: true,
    default: 'Release notes',
    description: 'Shown to teammates',
    options: ['unused'],
  };
  const slot: Required<PluginUISlot> = {
    slot: 'issue.sidebar',
    component: 'Sidebar',
    requiredPermissions: ['example.view'],
  };
  const navigation: Required<PluginNavigationItem> = {
    label: 'Example',
    icon: 'puzzle',
    path: '/apps/example',
    requiredPermissions: ['example.view'],
  };
  const page: Required<PluginPageDefinition> = {
    path: '/apps/example',
    component: 'ExamplePage',
    requiredPermissions: ['example.view'],
  };
  const projectView: Required<PluginProjectViewDefinition> = {
    label: 'Example',
    icon: 'puzzle',
    viewPath: 'example',
    requiredPermissions: ['example.view'],
  };
  const route: Required<PluginRouteDefinition> = {
    method: 'POST',
    path: '/pair',
    handler: 'pair',
    auth: 'device',
    requiredPermissions: ['example.view'],
    requiredDeviceScopes: ['example.upload'],
    public: false,
  };
  const declaredPermission: Required<PluginDeclaredPermission> = {
    key: 'example.view',
    label: 'View example',
    description: 'See the example',
  };
  const uninstall: Required<PluginUninstallMetadata> = {
    deletesPrivateData: true,
    confirmationMessage: 'Deletes example data',
  };
  const requires: Required<PluginRequirements> = {
    coreCapabilities: ['issue-candidates', 'time-entries'],
    plugins: [{ id: '@weaver/plugin-board', minimumVersion: '1.0.0' }],
  };
  const companion: Required<PluginCompanionMetadata> = {
    platform: 'macos',
    downloadArtifact: 'example.dmg',
    minimumVersion: '1.0.0',
    pairingRoute: '/pair',
    authenticator: 'example-device',
  };
  const versionedMigration: Required<PluginMigration> = {
    version: '1.1.0',
    sql: 'migrations/002.sql',
    path: 'migrations/002.sql',
  };

  const fullManifest: Required<Omit<PluginManifest, 'clientBundle'>> = {
    id: '@weaver/plugin-example',
    name: 'Example',
    version: '1.0.0',
    description: 'Example plugin',
    author: 'Weaver',
    icon: 'puzzle',
    type: 'app',
    scope: 'project',
    enabledByDefault: true,
    uninstall,
    entrypoints: { server: 'src/server/index.ts', client: 'src/client/index.ts' },
    permissions: ['example.view'],
    requires,
    companion,
    declaredPermissions: [declaredPermission],
    settings: { schema: { notes: setting } },
    events: { subscribes: ['issue.created'], emits: ['example.published'] },
    ui: {
      slots: [slot],
      navigation: [navigation],
      pages: [page],
      projectViews: [projectView],
    },
    routes: [route],
    migrations: ['migrations/001.sql', versionedMigration],
  };

  it('accepts every field the SDK manifest type allows', () => {
    expect(parsePluginManifest(JSON.parse(JSON.stringify(fullManifest)))).toEqual(fullManifest);
  });

  it('rejects an unknown settings key so the plugin is not loaded half-configured', () => {
    const manifest = {
      ...fullManifest,
      settings: { schema: { notes: { ...setting, title: 'Notes' } } },
    };

    expect(() => parsePluginManifest(manifest)).toThrow(/unrecognized/i);
  });
});
