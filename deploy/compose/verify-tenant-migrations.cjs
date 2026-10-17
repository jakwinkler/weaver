// Fails when the tenant migrations in packages/db/src/migrations/tenant leave a tenant schema
// different from the TypeORM tenant entities, as verify-sql-migrations.cjs does for public. Builds
// @weaver/db, recreates a disposable database, and prepares two tenant schemas. The new tenant is
// provisioned the way TenantProvisioningService does it: synchronize TENANT_ENTITIES, run every
// migration in file name order, create the custom fields GIN index. The existing tenant stands for
// one provisioned before the migrations: synchronize leaves out the tables and indexes the migrations
// create, so the migrations create them. Columns a migration adds to an older table still come from
// synchronize, so this check does not compare them. Both tenants then connect the way
// TenantConnectionProvider does, which runs the migrations again, and schema-plan.cjs must plan no
// tenant change. Reads DATABASE_HOST, DATABASE_PORT, DATABASE_USER, DATABASE_PASSWORD, and
// DATABASE_NAME (the database it connects to for CREATE DATABASE).
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const migrationsDir = path.join(root, 'packages/db/src/migrations/tenant');
const plannerPath = path.join(__dirname, 'schema-plan.cjs');
const dbRequire = createRequire(path.join(root, 'packages/db/package.json'));

const database = process.env.WEAVER_SCHEMA_CHECK_DATABASE || 'weaver_e2e_tenant_migrations';
const connection = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: Number(process.env.DATABASE_PORT || 5432),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
};
const newTenant = 'tenant_check_new';
const existingTenant = 'tenant_check_existing';

// Same statement as TenantProvisioningService. No entity can declare a GIN index.
const ginIndex = (schema) => `CREATE INDEX IF NOT EXISTS "IDX_issue_custom_fields" ON "${schema}"."issues" USING GIN ("custom_fields")`;

// Tables and indexes that one migration's SQL creates in schema. The existing tenant leaves these to
// the migrations, the way a tenant provisioned before them got them.
function createdBy(file, queries, schema) {
  const sql = queries.join(';\n').replace(/--[^\n]*/g, '');
  const table = `"?${schema}"?\\."?([a-z_][a-z0-9_]*)"?`;
  const count = (pattern) => (sql.match(pattern) || []).length;
  const tables = [...sql.matchAll(new RegExp(`\\bcreate\\s+(?:unlogged\\s+)?table\\s+(?:if\\s+not\\s+exists\\s+)?${table}`, 'gi'))]
    .map(([, name]) => name);
  const indexes = [...sql.matchAll(new RegExp(`\\bcreate\\s+(?:unique\\s+)?index\\s+(?:concurrently\\s+)?(?:if\\s+not\\s+exists\\s+)?"?([A-Za-z_][A-Za-z0-9_]*)"?\\s+on\\s+(?:only\\s+)?${table}`, 'gi'))]
    .map(([, name, on]) => ({ name, table: on }));
  if (tables.length !== count(/\bcreate\s+(?:unlogged\s+)?table\b/gi)) throw new Error(`Cannot read every CREATE TABLE in ${file}`);
  if (indexes.length !== count(/\bcreate\s+(?:unique\s+)?index\b/gi)) throw new Error(`Cannot read every CREATE INDEX in ${file}`);
  return { tables, indexes };
}

function plan(schemas) {
  const result = spawnSync(process.execPath, [plannerPath], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_HOST: connection.host, DATABASE_PORT: String(connection.port), DATABASE_USER: connection.user,
      DATABASE_PASSWORD: connection.password, DATABASE_NAME: database, WEAVER_MIGRATION_SCHEMAS: schemas.join(','),
    },
  });
  if (result.status !== 0) throw new Error(`schema-plan.cjs failed: ${result.stderr.trim()}`);
  return JSON.parse(result.stdout);
}

async function main() {
  if (!/^weaver_e2e_[a-z0-9_]+$/.test(database)) throw new Error('WEAVER_SCHEMA_CHECK_DATABASE must be a disposable weaver_e2e_* database');
  if (!connection.user) throw new Error('DATABASE_USER is required');

  execFileSync('pnpm', ['turbo', 'build', '--filter=@weaver/db', '--output-logs=errors-only'], { cwd: root, stdio: 'inherit' });
  dbRequire('reflect-metadata');
  const { Client } = dbRequire('pg');
  const db = require(path.join(root, 'packages/db/dist'));
  const entities = [...db.TENANT_ENTITIES];
  if (!entities.length) throw new Error('@weaver/db exports no TENANT_ENTITIES');

  // File name order is migration order. Each file exports the one function the API calls.
  const migrations = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.ts') && name !== 'index.ts').sort().map((file) => {
    const runs = Object.entries(require(path.join(root, 'packages/db/dist/migrations/tenant', file.replace(/\.ts$/, '.js'))))
      .filter(([name, value]) => typeof value === 'function' && /^run\w*Migration$/.test(name));
    if (runs.length !== 1) throw new Error(`${file} must export exactly one run...Migration function, found ${runs.length}`);
    return { file, run: runs[0][1] };
  });
  if (!migrations.length) throw new Error(`No tenant migrations in ${path.relative(root, migrationsDir)}`);
  console.log(`Tenant migrations: ${migrations.map(({ file }) => file).join(', ')}`);

  const admin = new Client({ ...connection, database: process.env.DATABASE_NAME || 'postgres' });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${database}"`);
  } finally { await admin.end(); }

  // One tenant connection: initialize, synchronizing when asked, then every migration in order
  // unless told not to. Returns each entity's table and the SQL each migration ran.
  async function connect(schema, { only = entities, synchronize = false, migrate = true } = {}) {
    const ran = new Map();
    let queries = [];
    const ds = db.createPostgresDataSource({
      type: 'postgres', host: connection.host, port: connection.port, username: connection.user, password: connection.password,
      database, schema, entities: only, synchronize,
      logger: { logQuery: (query) => queries.push(query), logQueryError() {}, logQuerySlow() {}, logSchemaBuild() {}, logMigration() {}, log() {} },
    });
    await ds.initialize();
    try {
      for (const { file, run } of migrate ? migrations : []) {
        queries = [];
        await run(ds, schema);
        ran.set(file, queries);
      }
      return { ran, tableOf: new Map(ds.entityMetadatas.map((metadata) => [metadata.target, metadata.tableName])) };
    } finally { await ds.destroy(); }
  }

  const client = new Client({ ...connection, database });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${newTenant}"`);
    const { ran, tableOf } = await connect(newTenant, { synchronize: true });
    await client.query(ginIndex(newTenant));

    const created = migrations.map(({ file }) => createdBy(file, ran.get(file), newTenant));
    const createdTables = new Set(created.flatMap(({ tables }) => tables));
    // A table no entity maps would leave its entity in the baseline, so the migration would go unchecked.
    const unmapped = [...createdTables].filter((table) => ![...tableOf.values()].includes(table));
    if (unmapped.length) throw new Error(`Tenant migrations create tables that no tenant entity maps: ${unmapped.join(', ')}`);
    const baseline = entities.filter((entity) => !createdTables.has(tableOf.get(entity)));
    const indexes = created.flatMap(({ indexes }) => indexes).filter(({ table }) => !createdTables.has(table));
    console.log(`Tables created by migrations: ${[...createdTables].join(', ') || 'none'}`);
    console.log(`Indexes created by migrations on synchronized tables: ${indexes.map(({ name }) => name).join(', ') || 'none'}`);

    await client.query(`CREATE SCHEMA "${existingTenant}"`);
    await connect(existingTenant, { only: baseline, synchronize: true, migrate: false });
    for (const { name } of indexes) await client.query(`DROP INDEX IF EXISTS "${existingTenant}"."${name}"`);
    await client.query(ginIndex(existingTenant));

    // TenantConnectionProvider runs every migration on each new connection.
    await connect(newTenant);
    await connect(existingTenant);
    await connect(existingTenant);
  } finally { await client.end(); }

  const pending = plan([newTenant, existingTenant]).filter((entry) => entry.schema !== 'public')
    .flatMap((entry) => entry.up.map(({ query }) => `${entry.schema}: ${query}`));
  if (pending.length) {
    console.error(`After the tenant migrations, schema-plan.cjs still plans ${pending.length} statement(s), so the migrations and the entities disagree:`);
    for (const statement of pending) console.error(`  ${statement}`);
    console.error(`${newTenant} is a new tenant and ${existingTenant} one provisioned before the migrations. Inspect database ${database} to compare.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Tenant migrations match the TypeORM tenant entities: ${migrations.length} migration(s) run twice on a new and an existing tenant, tenant plan empty`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
