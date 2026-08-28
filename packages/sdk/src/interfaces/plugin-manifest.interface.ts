export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  icon?: string;
  type?: 'app' | 'widget' | 'feature' | 'integration';
  scope?: 'tenant' | 'project';
  entrypoints: {
    server?: string;
    client?: string;
  };
  permissions: string[];
  declaredPermissions?: PluginDeclaredPermission[];
  settings?: {
    schema: Record<string, PluginSettingDefinition>;
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
  migrations?: string[];
  /** Runtime URL for the compiled client remote. Added by the API response. */
  clientBundle?: string;
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
  type: 'string' | 'number' | 'boolean' | 'select';
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
  requiredPermissions?: string[];
}
