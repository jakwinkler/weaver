export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
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
  };
  routes?: PluginRouteDefinition[];
  migrations?: string[];
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
}

export interface PluginRouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  handler: string;
}
