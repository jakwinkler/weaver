import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { pluginManifestSchema, RENAMED_EVENTS } from '@weaver/shared';

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
type SchemaIssue = Extract<
  ReturnType<typeof pluginManifestSchema.safeParse>,
  { success: false }
>['error']['issues'][number];

const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Which manifests are valid is decided by the shared schema alone, so this table only names the
 * issues it reports. Paths are shaped like `routes[].method` and `settings.schema.*.type`. A path
 * with no entry is reported as `invalid-<top-level-field>`.
 */
const SCHEMA_ISSUE_CODES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^id$/, 'invalid-id'],
  [/^name$/, 'missing-name'],
  [/^version$/, 'invalid-version'],
  [/^entrypoints\.(?:server|client)$/, 'invalid-entrypoint'],
  [/^declaredPermissions\[\]$/, 'invalid-declared-permission'],
  [/^declaredPermissions\[\]\.key$/, 'missing-permission-key'],
  [/^declaredPermissions\[\]\.label$/, 'missing-permission-label'],
  [/^declaredPermissions\[\]\.description$/, 'invalid-permission-description'],
  [/^settings(?:\.schema)?$/, 'invalid-settings'],
  [/^settings\.schema\.\*$/, 'invalid-setting'],
  [/^settings\.schema\.\*\.(type|required|description)$/, 'invalid-setting-$1'],
  [/^settings\.schema\.\*\.options(?:\[\])?$/, 'invalid-setting-options'],
  [/^events\.subscribes(?:\[\])?$/, 'invalid-event-subscriptions'],
  [/^events\.emits(?:\[\])?$/, 'invalid-emitted-events'],
  [/^(?:routes|ui\.\w+)\[\]\.requiredPermissions(?:\[\])?$/, 'invalid-required-permissions'],
  [/^routes\[\]$/, 'invalid-route'],
  [/^routes\[\]\.method$/, 'invalid-route-method'],
  [/^routes\[\]\.path$/, 'invalid-route-path'],
  [/^routes\[\]\.handler$/, 'missing-route-handler'],
  [/^ui\.\w+(?:\[\])?$/, 'invalid-ui-contribution'],
  [/^ui\.\w+\[\]\.\w+$/, 'missing-ui-field'],
];

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
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

function formatSchemaPath(path: Array<string | number>): string {
  return path.reduce<string>((formatted, segment) => {
    if (typeof segment === 'number') return `${formatted}[${segment}]`;
    return formatted ? `${formatted}.${segment}` : segment;
  }, '');
}

function schemaIssueCode(path: Array<string | number>): string {
  const shape = path.reduce<string>((formatted, segment, index) => {
    if (typeof segment === 'number') return `${formatted}[]`;
    const isSettingKey = index === 2 && path[0] === 'settings' && path[1] === 'schema';
    const name = isSettingKey ? '*' : segment;
    return formatted ? `${formatted}.${name}` : name;
  }, '');

  for (const [pattern, code] of SCHEMA_ISSUE_CODES) {
    if (pattern.test(shape)) return shape.replace(pattern, code);
  }
  const field = String(path[0] ?? 'manifest').replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  return `invalid-${field}`;
}

/** Zod reports a failed union as one opaque issue; surface the branch the author was aiming for. */
function expandSchemaIssue(issue: SchemaIssue): SchemaIssue[] {
  if (issue.code !== 'invalid_union') return [issue];
  const branches = issue.unionErrors.map((error) => error.issues);
  const informative = branches.filter(
    (issues) =>
      !(
        issues.length === 1 &&
        issues[0]?.code === 'invalid_type' &&
        issues[0].path.length === issue.path.length
      ),
  );
  const best = (informative.length > 0 ? informative : branches)[0] ?? [];
  return best.flatMap(expandSchemaIssue);
}

function validateAgainstSchema(manifest: JsonObject, result: ValidationResult): void {
  const parsed = pluginManifestSchema.safeParse(manifest);
  if (parsed.success) return;

  for (const issue of parsed.error.issues.flatMap(expandSchemaIssue)) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        addIssue(
          result,
          'error',
          'unknown-property',
          'unrecognized property; Weaver rejects manifests with fields it does not define',
          formatSchemaPath([...issue.path, key]),
        );
      }
      continue;
    }
    addIssue(
      result,
      'error',
      schemaIssueCode(issue.path),
      issue.message === 'Required' ? 'is required' : issue.message,
      formatSchemaPath(issue.path),
    );
  }
}

function isUnsafeRelativePath(value: string): boolean {
  return value.startsWith('/') || value.split(/[\\/]/).includes('..');
}

function validateEntrypoints(
  manifest: JsonObject,
  pluginRoot: string,
  result: ValidationResult,
): { server?: string; client?: string } {
  const validated: { server?: string; client?: string } = {};
  if (!isObject(manifest.entrypoints)) return validated;

  for (const kind of ['server', 'client'] as const) {
    const entrypoint = manifest.entrypoints[kind];
    if (!isNonEmptyString(entrypoint)) continue;

    if (isUnsafeRelativePath(entrypoint)) {
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

function settingDefaultMatches(type: string, value: unknown, options?: string[]): boolean {
  if (value === undefined) return true;
  if (type === 'string' || type === 'textarea') return typeof value === 'string';
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'select') return typeof value === 'string' && Boolean(options?.includes(value));
  return false;
}

/** Checks the schema cannot express: select options and defaults that fit the declared type. */
function validateSettingDefaults(manifest: JsonObject, result: ValidationResult): void {
  if (!isObject(manifest.settings) || !isObject(manifest.settings.schema)) return;

  for (const [key, definition] of Object.entries(manifest.settings.schema)) {
    if (!isObject(definition) || typeof definition.type !== 'string') continue;
    const path = `settings.schema.${key}`;
    const options = isStringArray(definition.options) ? definition.options : undefined;

    if (definition.type === 'select' && (!options || options.length === 0)) {
      addIssue(
        result,
        'error',
        'missing-select-options',
        `${path}.options must contain at least one string`,
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

function validateMigrations(
  manifest: JsonObject,
  pluginRoot: string,
  result: ValidationResult,
): void {
  if (!Array.isArray(manifest.migrations)) return;

  manifest.migrations.forEach((migration: unknown, index) => {
    const files: Array<{ file: string; path: string }> = [];
    if (isNonEmptyString(migration)) {
      files.push({ file: migration, path: `migrations[${index}]` });
    } else if (isObject(migration)) {
      for (const field of ['path', 'sql']) {
        const file = migration[field];
        if (isNonEmptyString(file)) {
          files.push({ file, path: `migrations[${index}].${field}` });
        }
      }
    }

    for (const { file, path } of files) {
      if (isUnsafeRelativePath(file)) {
        addIssue(
          result,
          'error',
          'unsafe-migration',
          `${path} must stay inside the plugin directory`,
          path,
        );
      } else if (!existsSync(resolve(pluginRoot, file))) {
        addIssue(result, 'error', 'missing-migration', `Migration does not exist: ${file}`, path);
      }
    }
  });
}

function collectComponents(manifest: JsonObject): string[] {
  if (!isObject(manifest.ui)) return [];
  const components: string[] = [];
  for (const key of ['slots', 'pages']) {
    const contributions = manifest.ui[key];
    if (!Array.isArray(contributions)) continue;
    for (const item of contributions) {
      if (isObject(item) && isNonEmptyString(item.component)) components.push(item.component);
    }
  }
  return components;
}

interface RouteHandlerReference {
  name: string;
  routeIndex: number;
}

function collectRouteHandlers(
  manifest: JsonObject,
  result: ValidationResult,
): RouteHandlerReference[] {
  const handlers: RouteHandlerReference[] = [];
  if (!Array.isArray(manifest.routes)) return handlers;

  manifest.routes.forEach((route: unknown, index) => {
    if (!isObject(route) || !isNonEmptyString(route.handler)) return;
    if (IDENTIFIER_PATTERN.test(route.handler)) {
      handlers.push({ name: route.handler, routeIndex: index });
    } else {
      addIssue(
        result,
        'error',
        'missing-route-handler',
        `routes[${index}].handler must be a valid exported function name`,
        `routes[${index}].handler`,
      );
    }
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

function validateEventSubscriptions(manifest: JsonObject, result: ValidationResult): void {
  const subscribes = isObject(manifest.events) ? manifest.events.subscribes : undefined;
  if (!isStringArray(subscribes)) return;

  subscribes.forEach((event, index) => {
    const current = RENAMED_EVENTS.get(event);
    if (!current) return;
    addIssue(
      result,
      'warning',
      'renamed-event',
      `${event} is a retired name. This subscription receives ${current} events, and onEvent sees them as ${current}; subscribe to ${current} instead.`,
      `events.subscribes[${index}]`,
    );
  });
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

  validateAgainstSchema(manifest, result);

  const entrypoints = validateEntrypoints(manifest, pluginRoot, result);
  validateSettingDefaults(manifest, result);
  validateMigrations(manifest, pluginRoot, result);
  const handlers = collectRouteHandlers(manifest, result);
  validateHandlerReferences(entrypoints.server, handlers, result);
  validateComponentReferences(entrypoints.client, collectComponents(manifest), result);
  validateEventSubscriptions(manifest, result);

  return result;
}

export function formatValidationIssue(issue: ValidationIssue): string {
  const location = issue.path ? ` (${issue.path})` : '';
  return `${issue.severity === 'error' ? 'error' : 'warning'} [${issue.code}]${location}: ${issue.message}`;
}
