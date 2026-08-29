import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';

import type { Command } from 'commander';

export type PluginType = 'app' | 'widget' | 'feature' | 'integration';
export type PluginScope = 'tenant' | 'project';

export interface CreatePluginOptions {
  name: string;
  displayName: string;
  author: string;
  type: PluginType;
  scope: PluginScope;
  includeServer: boolean;
  includeClient: boolean;
  destinationRoot: string;
}

interface CreatePluginCommandOptions {
  displayName?: string;
  author?: string;
  type?: PluginType;
  scope?: PluginScope;
  server?: boolean;
  client?: boolean;
  directory: string;
  yes?: boolean;
}

const NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const TYPES: PluginType[] = ['app', 'widget', 'feature', 'integration'];
const SCOPES: PluginScope[] = ['tenant', 'project'];

function titleFromSlug(slug: string): string {
  return slug
    .replace(/^plugin-/, '')
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function pluginSlug(name: string): string {
  return name.replace(/^plugin-/, '');
}

function parseBoolean(value: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('Expected true or false');
}

function templateFiles(root: string, current = root): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) files.push(...templateFiles(root, path));
    if (entry.isFile()) files.push(relative(root, path));
  }
  return files;
}

function renderTemplate(source: string, variables: Record<string, unknown>, file: string): string {
  return source
    .replace(/{{([A-Za-z0-9]+)}}/g, (_placeholder, name: string) => {
      const value = variables[name];
      if (value === undefined) throw new Error(`Unknown template variable {{${name}}} in ${file}`);
      if (typeof value === 'object') {
        throw new Error(`Template variable {{${name}}} in ${file} requires JSON rendering`);
      }
      return String(value);
    })
    .replace(/\bWEAVER_PLUGIN_(?:DISPLAY_NAME|ID)\b/g, (name) => {
      const value = variables[name];
      if (typeof value !== 'string') {
        throw new Error(`Unknown code template variable ${name} in ${file}`);
      }
      return value;
    });
}

function renderJsonValue(
  value: unknown,
  variables: Record<string, unknown>,
  file: string,
): unknown {
  if (typeof value === 'string') {
    const exactMatch = value.match(/^{{([A-Za-z0-9]+)}}$/);
    if (exactMatch?.[1]) {
      const replacement = variables[exactMatch[1]];
      if (replacement === undefined) {
        throw new Error(`Unknown template variable {{${exactMatch[1]}}} in ${file}`);
      }
      return replacement;
    }
    return renderTemplate(value, variables, file);
  }
  if (Array.isArray(value)) return value.map((item) => renderJsonValue(item, variables, file));
  if (value && typeof value === 'object') {
    const rendered: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === '{{manifestExtensions}}') {
        const extensions = variables.manifestExtensions;
        if (!extensions || typeof extensions !== 'object' || Array.isArray(extensions)) {
          throw new Error(`manifestExtensions must be an object in ${file}`);
        }
        Object.assign(rendered, extensions);
      } else {
        rendered[renderTemplate(key, variables, file)] = renderJsonValue(item, variables, file);
      }
    }
    return rendered;
  }
  return value;
}

function renderJsonTemplate(
  source: string,
  variables: Record<string, unknown>,
  file: string,
): string {
  return `${JSON.stringify(renderJsonValue(JSON.parse(source), variables, file), null, 2)}\n`;
}

function buildManifestExtensions(
  options: CreatePluginOptions,
  slug: string,
): Record<string, unknown> {
  const extensions: Record<string, unknown> = {};
  if (options.includeClient) {
    extensions.ui = {
      navigation: [
        {
          label: options.displayName,
          icon: 'puzzle',
          path: `/apps/${slug}`,
          requiredPermissions: [`${slug}.view`],
        },
      ],
      pages: [
        {
          path: `/apps/${slug}`,
          component: 'PluginPage',
          requiredPermissions: [`${slug}.view`],
        },
      ],
    };
  }
  if (options.includeServer) {
    extensions.routes = [
      {
        method: 'GET',
        path: '/hello',
        handler: 'getHello',
        requiredPermissions: [`${slug}.view`],
      },
    ];
  }
  return extensions;
}

export function validatePluginName(name: string): void {
  if (!NAME_PATTERN.test(name)) {
    throw new Error(
      'Plugin name must use lowercase letters, numbers, and single hyphens (for example: release-notes)',
    );
  }
}

export async function createPlugin(options: CreatePluginOptions): Promise<string> {
  validatePluginName(options.name);
  if (!options.displayName.trim()) throw new Error('Display name is required');
  if (!options.author.trim()) throw new Error('Author is required');
  if (!TYPES.includes(options.type)) {
    throw new Error(`Plugin type must be one of: ${TYPES.join(', ')}`);
  }
  if (!SCOPES.includes(options.scope)) {
    throw new Error(`Plugin scope must be one of: ${SCOPES.join(', ')}`);
  }
  if (!options.includeServer && !options.includeClient) {
    throw new Error('Choose at least one of server or client support');
  }

  const target = resolve(options.destinationRoot, options.name);
  if (existsSync(target)) {
    throw new Error(`Destination already exists: ${target}`);
  }

  const slug = pluginSlug(options.name);
  const pluginId = `@weaver/plugin-${slug}`;
  const entrypoints: Record<string, string> = {};
  if (options.includeServer) entrypoints.server = 'src/server/index.ts';
  if (options.includeClient) entrypoints.client = 'src/client/index.ts';

  const variables: Record<string, unknown> = {
    author: options.author,
    displayName: options.displayName,
    entrypoints,
    mainEntrypoint: options.includeClient ? './src/client/index.ts' : './src/server/index.ts',
    manifestExtensions: buildManifestExtensions(options, slug),
    pluginId,
    pluginName: options.name,
    pluginSlug: slug,
    scope: options.scope,
    type: options.type,
    WEAVER_PLUGIN_DISPLAY_NAME: JSON.stringify(options.displayName),
    WEAVER_PLUGIN_ID: JSON.stringify(pluginId),
  };

  const templatesRoot = resolve(__dirname, '../../templates/plugin');
  const renderedFiles = templateFiles(templatesRoot)
    .filter((file) => options.includeServer || !file.startsWith('src/server/'))
    .filter(
      (file) =>
        options.includeClient || (!file.startsWith('src/client/') && file !== 'vite.config.ts'),
    )
    .map((file) => {
      const source = readFileSync(join(templatesRoot, file), 'utf8');
      const content =
        file === 'package.json' || file === 'weaver-plugin.json'
          ? renderJsonTemplate(source, variables, file)
          : renderTemplate(source, variables, file);
      return { file, content };
    });

  try {
    for (const { file, content } of renderedFiles) {
      const destination = join(target, file);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, content, { flag: 'wx' });
    }
  } catch (error) {
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
    throw error;
  }

  return target;
}

async function collectOptions(
  name: string | undefined,
  commandOptions: CreatePluginCommandOptions,
): Promise<CreatePluginOptions> {
  const defaults = {
    name: name ?? '',
    displayName: commandOptions.displayName,
    author: commandOptions.author,
    type: commandOptions.type,
    scope: commandOptions.scope,
    includeServer: commandOptions.server,
    includeClient: commandOptions.client,
  };

  if (commandOptions.yes) {
    const acceptedName = defaults.name;
    if (!acceptedName) throw new Error('Plugin name is required when using --yes');
    return {
      name: acceptedName,
      displayName: defaults.displayName ?? titleFromSlug(acceptedName),
      author: defaults.author ?? 'Your Name',
      type: defaults.type ?? 'app',
      scope: defaults.scope ?? 'tenant',
      includeServer: defaults.includeServer ?? true,
      includeClient: defaults.includeClient ?? true,
      destinationRoot: commandOptions.directory,
    };
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    if (
      !defaults.name ||
      !defaults.displayName ||
      !defaults.author ||
      !defaults.type ||
      !defaults.scope ||
      defaults.includeServer === undefined ||
      defaults.includeClient === undefined
    ) {
      throw new Error(
        'Interactive prompts require a terminal. Pass all options or use --yes for defaults.',
      );
    }
    return {
      name: defaults.name,
      displayName: defaults.displayName,
      author: defaults.author,
      type: defaults.type,
      scope: defaults.scope,
      includeServer: defaults.includeServer,
      includeClient: defaults.includeClient,
      destinationRoot: commandOptions.directory,
    };
  }

  const prompts = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (question: string, fallback?: string): Promise<string> => {
    const suffix = fallback ? ` (${fallback})` : '';
    const answer = (await prompts.question(`${question}${suffix}: `)).trim();
    return answer || fallback || '';
  };
  const askBoolean = async (question: string, fallback: boolean): Promise<boolean> => {
    const answer = (await ask(`${question} [y/n]`, fallback ? 'y' : 'n')).toLowerCase();
    if (answer === 'y' || answer === 'yes') return true;
    if (answer === 'n' || answer === 'no') return false;
    throw new Error(`${question} must be answered yes or no`);
  };

  try {
    const acceptedName = defaults.name || (await ask('Plugin name'));
    validatePluginName(acceptedName);
    const type = (defaults.type ??
      (await ask(`Plugin type [${TYPES.join('/')}]`, 'app'))) as PluginType;
    const scope = (defaults.scope ??
      (await ask(`Plugin scope [${SCOPES.join('/')}]`, 'tenant'))) as PluginScope;
    if (!TYPES.includes(type)) throw new Error(`Plugin type must be one of: ${TYPES.join(', ')}`);
    if (!SCOPES.includes(scope))
      throw new Error(`Plugin scope must be one of: ${SCOPES.join(', ')}`);

    return {
      name: acceptedName,
      displayName: defaults.displayName ?? (await ask('Display name', titleFromSlug(acceptedName))),
      author: defaults.author ?? (await ask('Author', 'Your Name')),
      type,
      scope,
      includeServer: defaults.includeServer ?? (await askBoolean('Include server code?', true)),
      includeClient: defaults.includeClient ?? (await askBoolean('Include client code?', true)),
      destinationRoot: commandOptions.directory,
    };
  } finally {
    prompts.close();
  }
}

export function registerCreatePluginCommand(program: Command): void {
  program
    .command('create-plugin')
    .description('Scaffold a complete Weaver plugin')
    .argument('[name]', 'lowercase plugin directory name')
    .option('--display-name <name>', 'human-readable plugin name')
    .option('--author <author>', 'plugin author')
    .option('--type <type>', `plugin type: ${TYPES.join(', ')}`)
    .option('--scope <scope>', `plugin scope: ${SCOPES.join(', ')}`)
    .option('--server <boolean>', 'include server code (true or false)', parseBoolean)
    .option('--client <boolean>', 'include client code (true or false)', parseBoolean)
    .option('-d, --directory <directory>', 'parent directory for the plugin', process.cwd())
    .option('-y, --yes', 'accept defaults for unanswered prompts')
    .action(async (name: string | undefined, commandOptions: CreatePluginCommandOptions) => {
      const options = await collectOptions(name, commandOptions);
      const target = await createPlugin(options);
      process.stdout.write(`Created ${options.displayName} in ${target}\n`);
      process.stdout.write(
        `Next: cd ${basename(target)}, then run pnpm install and pnpm validate\n`,
      );
    });
}
