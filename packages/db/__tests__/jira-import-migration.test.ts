import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import { runJiraImportMigration } from '../src/migrations';
import {
  ImportedAudienceEntity,
  ImportedPersonEntity,
  ImportedResourceEntity,
  IssueEntity,
} from '../src/entities/tenant';

describe('Jira import tenant migration', () => {
  async function migrationSql(): Promise<string> {
    const query = jest.fn().mockResolvedValue([]);
    const dataSource = {
      transaction: async (run: (manager: unknown) => unknown) => run({ query }),
    };
    await runJiraImportMigration(
      dataSource as unknown as Parameters<typeof runJiraImportMigration>[0],
      'tenant_example',
    );
    return query.mock.calls.map(([sql]) => sql).join('\n');
  }

  it('creates the constraint and index names the entities declare', async () => {
    const storage = getMetadataArgsStorage();
    const imported: unknown[] = [
      ImportedPersonEntity,
      ImportedAudienceEntity,
      ImportedResourceEntity,
    ];
    const names = [
      ...storage.uniques.filter((unique) => imported.includes(unique.target)),
      ...storage.indices.filter((index) => imported.includes(index.target)),
    ].map((entry) => entry.name);
    const sql = await migrationSql();

    expect(names).toHaveLength(4);
    for (const name of names) expect(sql).toContain(name);
  });

  it('keeps the provisioning GIN index out of schema synchronization', () => {
    const index = getMetadataArgsStorage().indices.find(
      (entry) => entry.target === IssueEntity && entry.name === 'IDX_issue_custom_fields',
    );

    expect(index?.synchronize).toBe(false);
  });
});
