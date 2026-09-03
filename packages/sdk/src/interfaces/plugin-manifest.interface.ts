import type { PluginCoreCapability } from './plugin-context.interface';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  icon?: string;
  type?: 'app' | 'widget' | 'feature' | 'integration';
  scope?: 'tenant' | 'project';
  enabledByDefault?: boolean;
  uninstall?: PluginUninstallMetadata;
  entrypoints: {
    server?: string;
    client?: string;
  };
  permissions: string[];
  requires?: PluginRequirements;
  companion?: PluginCompanionMetadata;
  declaredPermissions?: PluginDeclaredPermission[];
  settings?: {
    schema?: Record<string, PluginSettingDefinition>;
  };
  events?: {
    subscribes?: string[];
    emits?: string[];
  };
  ui?: {
    slots?: PluginUISlot[];
    navigation?: PluginNavigationItem[];
    pages?: PluginPageDefinition[];
    projectViews?: PluginProjectViewDefinition[];
  };
  routes?: PluginRouteDefinition[];
  migrations?: Array<string | PluginMigration>;
  /** Runtime URL for the compiled client remote. Added by the API response. */
  clientBundle?: string;
}

export interface PluginMigration {
  version: string;
  sql?: string;
  path?: string;
}

export interface PluginUninstallMetadata {
  deletesPrivateData: boolean;
  confirmationMessage?: string;
}

export interface PluginRequirements {
  coreCapabilities?: PluginCoreCapability[];
  plugins?: Array<{ id: string; minimumVersion?: string }>;
}

export interface PluginCompanionMetadata {
  platform: 'macos' | 'windows' | 'linux';
  downloadArtifact: string;
  minimumVersion: string;
  pairingRoute: string;
  authenticator?: string;
}

export interface PluginProjectViewDefinition {
  label: string;
  icon: string;
  viewPath: string;
  requiredPermissions?: string[];
}

export interface PluginDeclaredPermission {
  key: string;
  label: string;
  description?: string;
}

export interface PluginSettingDefinition {
  type: 'string' | 'number' | 'boolean' | 'select' | 'textarea';
  label?: string;
  required?: boolean;
  default?: unknown;
  description?: string;
  options?: string[];
}

export interface PluginUISlot {
  slot: string;
  component: string;
  requiredPermissions?: string[];
}

export interface PluginNavigationItem {
  label: string;
  icon: string;
  path: string;
  requiredPermissions?: string[];
}

export interface PluginPageDefinition {
  path: string;
  component: string;
  requiredPermissions?: string[];
}

export interface PluginRouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  handler: string;
  auth?: 'interactive' | 'pairing' | 'device';
  requiredPermissions?: string[];
  requiredDeviceScopes?: string[];
}
