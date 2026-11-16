// Read-only deployment acceptance: exercise the production loader and compare it
// with organization installations and enabled project features. Bundle presence
// alone does not establish that a feature can appear in the application.
const path = require('node:path');
const { createRequire } = require('node:module');

function activationProblems(available, tenants) {
  const loaded = new Set(available.map((plugin) => plugin.id));
  const problems = new Set();
  for (const tenant of tenants) {
    const installed = new Map(tenant.installed.map((plugin) => [plugin.plugin_id, plugin]));
    for (const plugin of tenant.installed) {
      if (!loaded.has(plugin.plugin_id)) {
        problems.add(`${tenant.slug}: installed plugin ${plugin.plugin_id} is not loaded (check WEAVER_TRUSTED_PLUGINS and manifests)`);
      }
    }
    for (const plugin of tenant.projectPlugins) {
      if (!plugin.enabled) continue;
      if (!installed.has(plugin.plugin_id)) {
        problems.add(`${tenant.slug}: enabled project feature ${plugin.plugin_id} is not installed for the organization`);
      } else if (installed.get(plugin.plugin_id).enabled && !loaded.has(plugin.plugin_id)) {
        problems.add(`${tenant.slug}: enabled project feature ${plugin.plugin_id} is not loaded`);
      }
    }
  }
  return [...problems];
}

async function main() {
  if (process.env.NODE_ENV !== 'production') throw new Error('Run this check with NODE_ENV=production');
  const apiRequire = createRequire(path.resolve(__dirname, '../../apps/api/package.json'));
  apiRequire('reflect-metadata');
  const { PluginLoaderService } = apiRequire('./dist/plugins/plugin-loader.service.js');
  const loader = new PluginLoaderService();
  await loader.onModuleInit();
  const available = loader.getAllManifests();
  if (!available.length) throw new Error('No production plugins loaded; check WEAVER_TRUSTED_PLUGINS and WEAVER_PLUGINS_DIR');

  const { Client } = apiRequire('pg');
  const client = new Client({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT || 5432),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '15s'");
    const { rows: tenants } = await client.query('SELECT id, slug, schema_name FROM public.tenants ORDER BY slug');
    for (const tenant of tenants) {
      if (!/^tenant_[a-z0-9_]+$/.test(tenant.schema_name)) throw new Error('Invalid tenant schema');
      tenant.installed = (await client.query(
        'SELECT plugin_id, enabled FROM public.installed_plugins WHERE tenant_id = $1', [tenant.id],
      )).rows;
      tenant.projectPlugins = (await client.query(
        `SELECT plugin_id, enabled FROM "${tenant.schema_name}".project_plugins`,
      )).rows;
    }
    const problems = activationProblems(available, tenants);
    if (problems.length) throw new Error(problems.join('\n'));
    console.log(`Plugin activation verified: ${available.length} available plugins, ${tenants.length} organizations, ${tenants.reduce((count, tenant) => count + tenant.projectPlugins.filter((plugin) => plugin.enabled).length, 0)} enabled project features`);
  } finally {
    await client.query('ROLLBACK').finally(() => client.end());
  }
}

module.exports = { activationProblems };
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
