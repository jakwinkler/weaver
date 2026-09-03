const fs = require('node:fs');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const path = require('node:path');
const dbRequire = createRequire(path.resolve(__dirname, '../../packages/db/package.json'));
const { Client } = dbRequire('pg');

async function main() {
  const [planPath, expectedHash, direction] = process.argv.slice(2);
  if (!planPath || !/^[a-f0-9]{64}$/.test(expectedHash || '') || !['up', 'down'].includes(direction)) throw new Error('Usage: apply-schema-plan.cjs PLAN SHA256 up|down');
  const contents = fs.readFileSync(planPath);
  const hash = crypto.createHash('sha256').update(contents).digest('hex');
  if (hash !== expectedHash) throw new Error('Migration checksum mismatch');
  const plan = JSON.parse(contents);
  const allowedSchemas = ['public', ...(process.env.WEAVER_MIGRATION_SCHEMAS || '').split(',').filter(Boolean)];
  if (plan.length !== allowedSchemas.length || plan.some((entry) => !allowedSchemas.includes(entry.schema) || !/^(public|tenant_[a-z0-9_]+)$/.test(entry.schema))) throw new Error('Migration schema scope mismatch');
  if (!process.env.DATABASE_NAME || !process.env.DATABASE_USER) throw new Error('Database target is required');
  const client = new Client({ host: process.env.DATABASE_HOST || 'localhost', port: Number(process.env.DATABASE_PORT || 5432), user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD, database: process.env.DATABASE_NAME });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '120s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('weaver:reviewed-schema-migration'))");
    await client.query('CREATE TABLE IF NOT EXISTS public.weaver_schema_migrations (checksum varchar(64) PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const applied = (await client.query('SELECT checksum FROM public.weaver_schema_migrations WHERE checksum = $1', [hash])).rowCount > 0;
    if ((direction === 'up' && applied) || (direction === 'down' && !applied)) {
      await client.query('ROLLBACK');
      console.log('No change: migration already in requested state');
      return;
    }
    const entries = direction === 'up' ? plan : [...plan].reverse();
    let count = 0;
    for (const entry of entries) {
      await client.query("SELECT set_config('search_path', quote_ident($1) || ', public', true)", [entry.schema]);
      const queries = direction === 'up' ? entry.up : [...entry.down].reverse();
      for (const statement of queries) {
        await client.query(statement.query, statement.parameters);
        count += 1;
      }
    }
    if (direction === 'up') await client.query('INSERT INTO public.weaver_schema_migrations(checksum) VALUES ($1)', [hash]);
    else await client.query('DELETE FROM public.weaver_schema_migrations WHERE checksum = $1', [hash]);
    await client.query('COMMIT');
    console.log(JSON.stringify({ direction, database: process.env.DATABASE_NAME, schemas: allowedSchemas, statements: count, checksum: hash }));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { await client.end(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
