import { automaticTimeCoreMigrationSql, runAutomaticTimeCoreMigration } from '../src/migrations';

describe('Automatic Time core tenant migration', () => {
  it('adds backward-compatible columns and the partial idempotency index', () => {
    const sql = automaticTimeCoreMigrationSql('tenant_example');

    expect(sql).toContain('ALTER TABLE "tenant_example"."time_entries"');
    expect(sql).toContain(
      'ADD COLUMN IF NOT EXISTS "source" VARCHAR(20) NOT NULL DEFAULT \'manual\'',
    );
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMPTZ');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_time_entries_plugin_source_reference"',
    );
    expect(sql).toContain(
      'WHERE "source_plugin_id" IS NOT NULL AND "source_reference" IS NOT NULL',
    );
  });

  it('rejects a schema name that could escape the identifier boundary', () => {
    expect(() => automaticTimeCoreMigrationSql('tenant_bad"; DROP SCHEMA public;')).toThrow(
      'Invalid tenant schema name',
    );
  });

  it('executes the idempotent migration as one database operation', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([]) };

    await runAutomaticTimeCoreMigration(dataSource as any, 'tenant_example');

    expect(dataSource.query).toHaveBeenCalledTimes(1);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('"tenant_example"."time_entries"'),
    );
  });
});
