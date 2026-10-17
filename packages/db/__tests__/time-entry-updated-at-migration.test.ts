import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import { runTimeEntryUpdatedAtMigration } from '../src/migrations';
import { TimeEntryEntity } from '../src/entities/tenant';

describe('Time entry updated_at tenant migration', () => {
  async function migrationQueries(schemaName = 'tenant_example'): Promise<unknown[][]> {
    const query = jest.fn().mockResolvedValue([]);
    const dataSource = {
      transaction: async (run: (manager: unknown) => unknown) => run({ query }),
    };
    await runTimeEntryUpdatedAtMigration(
      dataSource as unknown as Parameters<typeof runTimeEntryUpdatedAtMigration>[0],
      schemaName,
    );
    return query.mock.calls;
  }

  it('converts a TIMESTAMPTZ updated_at to the TIMESTAMP the entity maps, keeping UTC values', async () => {
    const column = getMetadataArgsStorage().columns.find(
      (entry) => entry.target === TimeEntryEntity && entry.options.name === 'updated_at',
    );
    const sql = (await migrationQueries()).map(([statement]) => statement).join('\n');

    expect(column?.mode).toBe('updateDate');
    expect(column?.options.type).toBeUndefined();
    expect(sql).toContain("data_type = 'timestamp with time zone'");
    expect(sql).toContain('ALTER TABLE "tenant_example".time_entries');
    expect(sql).toContain("TYPE TIMESTAMP USING updated_at AT TIME ZONE 'UTC'");
  });

  it('serializes concurrent tenant connections with an advisory lock first', async () => {
    const [first] = await migrationQueries();

    expect(first).toEqual([
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['tenant_example:time-entry-updated-at'],
    ]);
  });

  it('rejects a schema name that could escape the identifier boundary', async () => {
    await expect(migrationQueries('tenant_bad"; DROP SCHEMA public;')).rejects.toThrow(
      'Invalid tenant schema name',
    );
  });
});
