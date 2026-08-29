import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  path?: string;
}

export interface ValidationResult {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

type JsonObject = Record<string, unknown>;

const PLUGIN_ID_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const PLUGIN_TYPES = new Set(['app', 'widget', 'feature', 'integration']);
const PLUGIN_SCOPES = new Set(['tenant', 'project']);
const ROUTE_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const SETTING_TYPES = new Set(['string', 'number', 'boolean', 'select']);

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0);
}

function addIssue(
  result: ValidationResult,
  severity: ValidationSeverity,
  code: string,
  message: string,
  path?: string,
): void {
  const issue: ValidationIssue = { severity, code, message };
  if (path) issue.path = path;
  result[severity === 'error' ? 'errors' : 'warnings'].push(issue);
}

function validateOptionalString(
  manifest: JsonObject,
  field: string,
  result: ValidationResult,
): void {
  const value = manifest[field];
  if (value !== undefined && (typeof value !== 'string' || value.trim().length === 0)) {
    addIssue(result, 'error', `invalid-${field}`, `${field} must be a non-empty string`, field);
  }
}

function validateStringArray(
  value: unknown,
  path: string,
  code: string,
  result: ValidationResult,
  required = false,
): void {
  if (value === undefined && !required) return;
  if (!isStringArray(value) && !(Array.isArray(value) && value.length === 0)) {
    addIssue(result, 'error', code, `${path} must be an array of non-empty strings`, path);
  }
}

function validateEntrypoints(
  manifest: JsonObject,
  pluginRoot: string,
  result: ValidationResult,
): { server?: string; client?: string } {
  const entrypoints = manifest.entrypoints;
  if (!isObject(entrypoints)) {
    addIssue(
      result,
      'error',
      'invalid-entrypoints',
      'entrypoints must be an object',
      'entrypoints',
    );
    return {};
  }

  const validated: { server?: string; client?: string } = {};
  for (const kind of ['server', 'client'] as const) {
    const entrypoint = entrypoints[kind];
    if (entrypoint === undefined) continue;
    if (typeof entrypoint !== 'string' || entrypoint.trim().length === 0) {
      addIssue(
        result,
        'error',
        'invalid-entrypoint',
        `entrypoints.${kind} must be a non-empty relative path`,
        `entrypoints.${kind}`,
      );
      continue;
    }

    if (entrypoint.startsWith('/') || entrypoint.split(/[\\/]/).includes('..')) {
      addIssue(
        result,
        'error',
        'unsafe-entrypoint',
        `entrypoints.${kind} must stay inside the plugin directory`,
        `entrypoints.${kind}`,
      );
      continue;
    }

    const absolutePath = resolve(pluginRoot, entrypoint);
    if (!existsSync(absolutePath)) {
      addIssue(
        result,
        'error',
        'missing-entrypoint',
        `entrypoints.${kind} does not exist: ${entrypoint}`,
        `entrypoints.${kind}`,
      );
    }
    validated[kind] = absolutePath;
  }

  return validated;
}

function validateDeclaredPermissions(manifest: JsonObject, result: ValidationResult): void {
  if (manifest.declaredPermissions === undefined) return;
  if (!Array.isArray(manifest.declaredPermissions)) {
    addIssue(
      result,
      'error',
      'invalid-declared-permissions',
      'declaredPermissions must be an array',
      'declaredPermissions',
    );
    return;
  }

  manifest.declaredPermissions.forEach((permission, index) => {
    const path = `declaredPermissions[${index}]`;
    if (!isObject(permission)) {
      addIssue(result, 'error', 'invalid-declared-permission', `${path} must be an object`, path);
      return;
    }
    if (typeof permission.key !== 'string' || permission.key.length === 0) {
      addIssue(result, 'error', 'missing-permission-key', `${path}.key is required`, `${path}.key`);
    }
    if (typeof permission.label !== 'string' || permission.label.length === 0) {
      addIssue(
        result,
        'error',
        'missing-permission-label',
        `${path}.label is required`,
        `${path}.label`,
      );
    }
    if (permission.description !== undefined && typeof permission.description !== 'string') {
      addIssue(
        result,
        'error',
        'invalid-permission-description',
        `${path}.description must be a string`,
        `${path}.description`,
      );
    }
  });
}

function settingDefaultMatches(type: string, value: unknown, options?: string[]): boolean {
  if (value === undefined) return true;
  if (type === 'string') return typeof value === 'string';
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'select') return typeof value === 'string' && Boolean(options?.includes(value));
  return false;
}

function validateSettings(manifest: JsonObject, result: ValidationResult): void {
  if (manifest.settings === undefined) return;
  if (!isObject(manifest.settings) || !isObject(manifest.settings.schema)) {
    addIssue(
      result,
      'error',
      'invalid-settings',
      'settings must contain a schema object',
      'settings.schema',
    );
    return;
  }

  for (const [key, definition] of Object.entries(manifest.settings.schema)) {
    const path = `settings.schema.${key}`;
    if (!isObject(definition)) {
      addIssue(result, 'error', 'invalid-setting', `${path} must be an object`, path);
      continue;
    }
    if (typeof definition.type !== 'string' || !SETTING_TYPES.has(definition.type)) {
      addIssue(
        result,
        'error',
        'invalid-setting-type',
        `${path}.type must be string, number, boolean, or select`,
        `${path}.type`,
      );
      continue;
    }
    if (definition.required !== undefined && typeof definition.required !== 'boolean') {
      addIssue(
        result,
        'error',
        'invalid-setting-required',
        `${path}.required must be a boolean`,
        `${path}.required`,
      );
    }
    if (definition.description !== undefined && typeof definition.description !== 'string') {
      addIssue(
        result,
        'error',
        'invalid-setting-description',
        `${path}.description must be a string`,
        `${path}.description`,
      );
    }

    const options = isStringArray(definition.options) ? definition.options : undefined;
    if (definition.type === 'select' && (!options || options.length === 0)) {
      addIssue(
        result,
        'error',
        'missing-select-options',
        `${path}.options must contain at least one string`,
        `${path}.options`,
      );
    } else if (definition.options !== undefined && !options) {
      addIssue(
        result,
        'error',
        'invalid-setting-options',
        `${path}.options must be an array of non-empty strings`,
        `${path}.options`,
      );
    }

    if (!settingDefaultMatches(definition.type, definition.default, options)) {
      addIssue(
        result,
        'error',
        'invalid-setting-default',
        `${path}.default does not match the ${definition.type} setting type`,
        `${path}.default`,
      );
    }
  }
}

function validateEvents(manifest: JsonObject, result: ValidationResult): void {
  if (manifest.events === undefined) return;
  if (!isObject(manifest.events)) {
    addIssue(result, 'error', 'invalid-events', 'events must be an object', 'events');
    return;
  }
  validateStringArray(
    manifest.events.subscribes,
    'events.subscribes',
    'invalid-event-subscriptions',
    result,
  );
  validateStringArray(manifest.events.emits, 'events.emits', 'invalid-emitted-events', result);
}

function validateMigrations(
  manifest: JsonObject,
  pluginRoot: string,
  result: ValidationResult,
): void {
  if (manifest.migrations === undefined) return;
  if (
    !isStringArray(manifest.migrations) &&
    !(Array.isArray(manifest.migrations) && manifest.migrations.length === 0)
  ) {
    addIssue(
      result,
      'error',
      'invalid-migrations',
      'migrations must be an array of relative paths',
      'migrations',
    );
    return;
  }
  for (const [index, migration] of manifest.migrations.entries()) {
    if (migration.startsWith('/') || migration.split(/[\\/]/).includes('..')) {
      addIssue(
        result,
        'error',
        'unsafe-migration',
        `migrations[${index}] must stay inside the plugin directory`,
        `migrations[${index}]`,
      );
    } else if (!existsSync(resolve(pluginRoot, migration))) {
      addIssue(
        result,
        'error',
        'missing-migration',
        `Migration does not exist: ${migration}`,
        `migrations[${index}]`,
      );
    }
  }
}

function validateRequiredPermissions(value: unknown, path: string, result: ValidationResult): void {
  validateStringArray(value, path, 'invalid-required-permissions', result);
}

function validateUi(manifest: JsonObject, result: ValidationResult): string[] {
  const components: string[] = [];
  if (manifest.ui === undefined) return components;
  if (!isObject(manifest.ui)) {
    addIssue(result, 'error', 'invalid-ui', 'ui must be an object', 'ui');
    return components;
  }

  const collections: Array<{
    key: 'slots' | 'navigation' | 'pages' | 'projectViews';
    required: string[];
    component?: boolean;
  }> = [
    { key: 'slots', required: ['slot', 'component'], component: true },
    { key: 'navigation', required: ['label', 'icon', 'path'] },
    { key: 'pages', required: ['path', 'component'], component: true },
    { key: 'projectViews', required: ['label', 'icon', 'viewPath'] },
  ];

  for (const collection of collections) {
    const value = manifest.ui[collection.key];
    if (value === undefined) continue;
    if (!Array.isArray(value)) {
      addIssue(
        result,
        'error',
        'invalid-ui-contribution',
        `ui.${collection.key} must be an array`,
        `ui.${collection.key}`,
      );
      continue;
    }

    value.forEach((item, index) => {
      const path = `ui.${collection.key}[${index}]`;
      if (!isObject(item)) {
        addIssue(result, 'error', 'invalid-ui-contribution', `${path} must be an object`, path);
        return;
      }
      for (const field of collection.required) {
        if (typeof item[field] !== 'string' || item[field].length === 0) {
          addIssue(
            result,
            'error',
            'missing-ui-field',
            `${path}.${field} is required`,
            `${path}.${field}`,
          );
        }
      }
      validateRequiredPermissions(item.requiredPermissions, `${path}.requiredPermissions`, result);
      if (collection.component && typeof item.component === 'string' && item.component.length > 0) {
        components.push(item.component);
      }
    });
  }

  return components;
}

interface RouteHandlerReference {
  name: string;
  routeIndex: number;
}

function validateRoutes(manifest: JsonObject, result: ValidationResult): RouteHandlerReference[] {
  const handlers: RouteHandlerReference[] = [];
  if (manifest.routes === undefined) return handlers;
  if (!Array.isArray(manifest.routes)) {
    addIssue(result, 'error', 'invalid-routes', 'routes must be an array', 'routes');
    return handlers;
  }

  manifest.routes.forEach((route, index) => {
    const path = `routes[${index}]`;
    if (!isObject(route)) {
      addIssue(result, 'error', 'invalid-route', `${path} must be an object`, path);
      return;
    }
    if (typeof route.method !== 'string' || !ROUTE_METHODS.has(route.method)) {
      addIssue(
        result,
        'error',
        'invalid-route-method',
        `${path}.method must be GET, POST, PUT, PATCH, or DELETE`,
        `${path}.method`,
      );
    }
    if (typeof route.path !== 'string' || !route.path.startsWith('/')) {
      addIssue(
        result,
        'error',
        'invalid-route-path',
        `${path}.path must start with /`,
        `${path}.path`,
      );
    }
    if (typeof route.handler !== 'string' || !IDENTIFIER_PATTERN.test(route.handler)) {
      addIssue(
        result,
        'error',
        'missing-route-handler',
        `${path}.handler must be a valid exported function name`,
        `${path}.handler`,
      );
    } else {
      handlers.push({ name: route.handler, routeIndex: index });
    }
    validateRequiredPermissions(route.requiredPermissions, `${path}.requiredPermissions`, result);
  });

  return handlers;
}

function exportedNames(filePath: string): Set<string> {
  if (!existsSync(filePath)) return new Set();
  const source = readFileSync(filePath, 'utf8');
  const names = new Set<string>();
  const declarationPattern =
    /export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  const exportListPattern = /export\s*{([^}]+)}/g;

  for (const match of source.matchAll(declarationPattern)) {
    if (match[1]) names.add(match[1]);
  }
  for (const match of source.matchAll(exportListPattern)) {
    for (const item of (match[1] ?? '').split(',')) {
      const parts = item.trim().split(/\s+as\s+/);
      const name = parts[1] ?? parts[0];
      if (name && IDENTIFIER_PATTERN.test(name)) names.add(name);
    }
  }
  return names;
}

function validateHandlerReferences(
  serverEntrypoint: string | undefined,
  handlers: RouteHandlerReference[],
  result: ValidationResult,
): void {
  if (!serverEntrypoint) {
    if (handlers.length === 0) return;
    addIssue(
      result,
      'error',
      'routes-without-server',
      'routes require entrypoints.server',
      'routes',
    );
    return;
  }

  const handlersBasePath = join(dirname(serverEntrypoint), 'handlers');
  const handlersPath = ['.ts', '.js', '.mts', '.cts']
    .map((extension) => `${handlersBasePath}${extension}`)
    .find(existsSync);
  if (!handlersPath) {
    if (handlers.length === 0) return;
    addIssue(
      result,
      'error',
      'missing-handlers-file',
      `Route handlers file does not exist beside ${serverEntrypoint}`,
      'routes',
    );
    return;
  }

  const exports = exportedNames(handlersPath);
  handlers.forEach(({ name, routeIndex }) => {
    if (!exports.has(name)) {
      addIssue(
        result,
        'error',
        'handler-not-exported',
        `Route handler ${name} is not exported from ${handlersPath}`,
        `routes[${routeIndex}].handler`,
      );
    }
  });

  for (const exported of exports) {
    if (!handlers.some(({ name }) => name === exported)) {
      addIssue(
        result,
        'warning',
        'unreferenced-handler',
        `Exported handler ${exported} is not referenced by any manifest route`,
        'routes',
      );
    }
  }
}

function validateComponentReferences(
  clientEntrypoint: string | undefined,
  components: string[],
  result: ValidationResult,
): void {
  if (components.length === 0) return;
  if (!clientEntrypoint) {
    addIssue(
      result,
      'error',
      'ui-without-client',
      'UI contributions require entrypoints.client',
      'ui',
    );
    return;
  }

  const exports = exportedNames(clientEntrypoint);
  components.forEach((component) => {
    if (!exports.has(component)) {
      addIssue(
        result,
        'error',
        'component-not-exported',
        `UI component ${component} is not exported from the client entrypoint`,
        'ui',
      );
    }
  });
}

export function validatePlugin(pluginDirectory = process.cwd()): ValidationResult {
  const result: ValidationResult = { errors: [], warnings: [] };
  const pluginRoot = resolve(pluginDirectory);
  const manifestPath = join(pluginRoot, 'weaver-plugin.json');

  if (!existsSync(manifestPath)) {
    addIssue(
      result,
      'error',
      'missing-manifest',
      `No weaver-plugin.json found in ${pluginRoot}`,
      'weaver-plugin.json',
    );
    return result;
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    addIssue(
      result,
      'error',
      'invalid-json',
      `weaver-plugin.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      'weaver-plugin.json',
    );
    return result;
  }

  if (!isObject(manifest)) {
    addIssue(
      result,
      'error',
      'invalid-manifest',
      'Plugin manifest must be an object',
      'weaver-plugin.json',
    );
    return result;
  }

  if (typeof manifest.id !== 'string' || !PLUGIN_ID_PATTERN.test(manifest.id)) {
    addIssue(
      result,
      'error',
      'invalid-id',
      'id must be a lowercase package identifier such as @weaver/plugin-example',
      'id',
    );
  }
  if (typeof manifest.name !== 'string' || manifest.name.trim().length === 0) {
    addIssue(result, 'error', 'missing-name', 'name must be a non-empty string', 'name');
  }
  if (typeof manifest.version !== 'string' || !SEMVER_PATTERN.test(manifest.version)) {
    addIssue(
      result,
      'error',
      'invalid-version',
      'version must be a semantic version such as 1.0.0',
      'version',
    );
  }
  validateOptionalString(manifest, 'description', result);
  validateOptionalString(manifest, 'author', result);
  validateOptionalString(manifest, 'icon', result);
  if (
    manifest.type !== undefined &&
    (typeof manifest.type !== 'string' || !PLUGIN_TYPES.has(manifest.type))
  ) {
    addIssue(
      result,
      'error',
      'invalid-type',
      'type must be app, widget, feature, or integration',
      'type',
    );
  }
  if (
    manifest.scope !== undefined &&
    (typeof manifest.scope !== 'string' || !PLUGIN_SCOPES.has(manifest.scope))
  ) {
    addIssue(result, 'error', 'invalid-scope', 'scope must be tenant or project', 'scope');
  }

  const entrypoints = validateEntrypoints(manifest, pluginRoot, result);
  validateStringArray(manifest.permissions, 'permissions', 'invalid-permissions', result, true);
  validateDeclaredPermissions(manifest, result);
  validateSettings(manifest, result);
  validateEvents(manifest, result);
  validateMigrations(manifest, pluginRoot, result);
  const handlers = validateRoutes(manifest, result);
  const components = validateUi(manifest, result);
  validateHandlerReferences(entrypoints.server, handlers, result);
  validateComponentReferences(entrypoints.client, components, result);

  return result;
}

export function formatValidationIssue(issue: ValidationIssue): string {
  const location = issue.path ? ` (${issue.path})` : '';
  return `${issue.severity === 'error' ? 'error' : 'warning'} [${issue.code}]${location}: ${issue.message}`;
}
