// Read-only TypeORM schema diff. Never synchronize an existing database.
const { createRequire } = require('node:module');
const path = require('node:path');
const dbRequire = createRequire(path.resolve(__dirname, '../../packages/db/package.json'));
dbRequire('reflect-metadata');
const { DataSource } = dbRequire('typeorm');
const entities = require('../../packages/db/dist');

async function main() {
  const schemas = (process.env.WEAVER_MIGRATION_SCHEMAS || '').split(',').filter(Boolean);
  if (schemas.some((schema) => !/^tenant_[a-z0-9_]+$/.test(schema))) throw new Error('Invalid tenant schema');
  const plan = [];
  for (const schema of ['public', ...schemas]) {
    const ds = new DataSource({
      type: 'postgres', host: process.env.DATABASE_HOST || 'localhost', port: Number(process.env.DATABASE_PORT || 5432),
      username: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD, database: process.env.DATABASE_NAME,
      schema, synchronize: false, logging: false, installExtensions: false,
      entities: schema === 'public' ? [entities.TenantEntity, entities.UserEntity, entities.TenantMembershipEntity, entities.ApiKeyEntity, entities.InstalledPluginEntity, entities.RefreshSessionEntity] : [...entities.TENANT_ENTITIES],
    });
    await ds.initialize();
    try {
      const diff = await ds.driver.createSchemaBuilder().log();
      plan.push({ schema, up: diff.upQueries.map(({ query, parameters }) => ({ query, parameters })), down: diff.downQueries.map(({ query, parameters }) => ({ query, parameters })) });
    } finally { await ds.destroy(); }
  }
  process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
