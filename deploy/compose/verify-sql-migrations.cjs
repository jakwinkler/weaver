// Fails when the SQL files in packages/db/migrations leave the public schema different from the
// TypeORM entities. Builds @weaver/db, recreates a disposable database, synchronizes the public
// entities that no SQL file creates, applies every SQL file twice in file name order, and requires
// an empty plan from schema-plan.cjs. Reads DATABASE_HOST, DATABASE_PORT, DATABASE_USER,
// DATABASE_PASSWORD, and DATABASE_NAME (the database it connects to for CREATE DATABASE).
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const migrationsDir = path.join(root, 'packages/db/migrations');
const plannerPath = path.join(__dirname, 'schema-plan.cjs');
const dbRequire = createRequire(path.join(root, 'packages/db/package.json'));

const database = process.env.WEAVER_SCHEMA_CHECK_DATABASE || 'weaver_e2e_sql_migrations';
const connection = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: Number(process.env.DATABASE_PORT || 5432),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
};

// Tables each SQL file creates in public. A table created here is managed by SQL, so the baseline
// leaves it to the SQL files instead of synchronizing it.
function sqlCreatedTables(files) {
  const tables = new Set();
  for (const file of files) {
    const sql = fs.readFileSync(file, 'utf8').replace(/--[^\n]*/g, '');
    const statements = sql.match(/\bcreate\s+(?:unlogged\s+)?table\b/gi) || [];
    const named = [...sql.matchAll(/\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:"?([a-z_][a-z0-9_]*)"?\.)?"?([a-z_][a-z0-9_]*)"?/gi)];
    if (named.length !== statements.length) throw new Error(`Cannot read every CREATE TABLE name in ${path.basename(file)}`);
    for (const [, schema, table] of named) if (!schema || schema === 'public') tables.add(table);
  }
  return tables;
}

function plan() {
  const result = spawnSync(process.execPath, [plannerPath], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_HOST: connection.host, DATABASE_PORT: String(connection.port), DATABASE_USER: connection.user,
      DATABASE_PASSWORD: connection.password, DATABASE_NAME: database, WEAVER_MIGRATION_SCHEMAS: '',
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
  const { DataSource, getMetadataArgsStorage } = dbRequire('typeorm');
  const { Client } = dbRequire('pg');
  const entities = require(path.join(root, 'packages/db/dist'));

  const tableOf = new Map(getMetadataArgsStorage().tables.filter((table) => table.schema === 'public').map((table) => [table.target, table.name]));
  const publicEntities = [...new Set(Object.values(entities))].filter((value) => tableOf.has(value));
  const files = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort().map((name) => path.join(migrationsDir, name));
  const sqlTables = sqlCreatedTables(files);
  if (!publicEntities.length) throw new Error('@weaver/db exports no public entities');
  // A table no entity maps would leave its entity in the baseline, so the SQL would go unchecked.
  const unmapped = [...sqlTables].filter((table) => !publicEntities.some((entity) => tableOf.get(entity) === table));
  if (unmapped.length) throw new Error(`SQL files create tables that no public entity maps: ${unmapped.join(', ')}`);
  const baseline = publicEntities.filter((entity) => !sqlTables.has(tableOf.get(entity)));
  console.log(`SQL files: ${files.map((file) => path.basename(file)).join(', ') || 'none'}`);
  console.log(`Created by SQL: ${[...sqlTables].join(', ') || 'none'}`);
  console.log(`Baseline from TypeORM: ${baseline.map((entity) => entity.name).join(', ')}`);

  const admin = new Client({ ...connection, database: process.env.DATABASE_NAME || 'postgres' });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${database}"`);
  } finally { await admin.end(); }

  // The planner must cover every public entity, or this check cannot see drift in a missing one.
  const planned = new Set(plan().flatMap((entry) => entry.up)
    .map(({ query }) => /^CREATE TABLE (?:"public"\.)?"([^"]+)"/.exec(query)?.[1]).filter(Boolean));
  const unplanned = publicEntities.filter((entity) => !planned.has(tableOf.get(entity)));
  if (unplanned.length) throw new Error(`schema-plan.cjs does not plan these public entities: ${unplanned.map((entity) => entity.name).join(', ')}`);

  const ds = new DataSource({
    type: 'postgres', host: connection.host, port: connection.port, username: connection.user, password: connection.password,
    database, schema: 'public', entities: baseline, synchronize: true, logging: false,
  });
  await ds.initialize();
  await ds.destroy();

  const psqlEnv = {
    ...process.env, PGHOST: connection.host, PGPORT: String(connection.port), PGUSER: connection.user,
    PGPASSWORD: connection.password || '', PGDATABASE: database, PGOPTIONS: '-c client_min_messages=warning',
  };
  for (const pass of [1, 2]) {
    for (const file of files) {
      const result = spawnSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', path.relative(root, file)], { cwd: root, env: psqlEnv, stdio: 'inherit' });
      if (result.error) throw new Error(`Cannot run psql: ${result.error.message}`);
      if (result.status !== 0) throw new Error(`${path.basename(file)} failed on pass ${pass}`);
    }
  }

  const pending = plan().flatMap((entry) => entry.up.map(({ query }) => `${entry.schema}: ${query}`));
  if (pending.length) {
    console.error(`After the SQL files, schema-plan.cjs still plans ${pending.length} statement(s), so the SQL and the entities disagree:`);
    for (const statement of pending) console.error(`  ${statement}`);
    console.error(`Inspect database ${database} to compare.`);
    process.exitCode = 1;
    return;
  }
  console.log(`SQL migrations match the TypeORM public entities: ${files.length} file(s) applied twice, schema plan empty`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
