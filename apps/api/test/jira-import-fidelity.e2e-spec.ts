import 'reflect-metadata';
import { visibleIssues, issueVisibilityWhere } from '../src/core/tenant/issue-visibility';
import { applyIssueListOrder } from '../src/modules/issues/issue-list-order';
import { paginate } from '../src/common/pagination';
import { recipientCanReadIssue, eventHasRestrictedContent } from '@weaver/server-common';
import { IssueSecurityController } from '../src/modules/import/issue-security.controller';
import { randomUUID } from 'crypto';
import { mkdtemp, rm, writeFile, readFile, readdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ApiKeyEntity,
  AttachmentEntity,
  BoardEntity,
  CommentEntity,
  ImportedAudienceEntity,
  IssueAccessPolicyEntity,
  ImportedPersonEntity,
  ImportedResourceEntity,
  ImportJobEntity,
  InstalledPluginEntity,
  IssueEntity,
  IssueLinkEntity,
  NotificationEntity,
  ProjectEntity,
  ProjectMemberEntity,
  RefreshSessionEntity,
  OrganizationInvitationEntity,
  TenantEntity,
  TenantMembershipEntity,
  TENANT_ENTITIES,
  TimeEntryEntity,
  UserEntity,
  WorkflowStatusEntity,
  runJiraImportMigration,
} from '@weaver/db';
import {
  FieldMapper,
  ImportOrchestrator,
  JiraClient,
  transferAttachment,
  canReadIssue,
} from '@weaver/jira-import';
import { CommentsService } from '../src/modules/comments/comments.service';
import { ImportPeopleService } from '../src/modules/import/import-people.service';
import { ImportSourceController } from '../src/modules/import/import-source.controller';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { AuthService } from '../src/core/auth/auth.service';
import { tenantStorage } from '../src/core/tenant';
import { ProjectAccessService } from '../src/core/tenant/project-access.service';
import { AttachmentsService } from '../src/modules/attachments/attachments.service';
import { getReport } from '../../../plugins/plugin-time-reports/src/server/handlers';

const source = 'https://jira.fixture.example';
const author = {
  accountId: 'jira-author',
  displayName: 'Original author',
  active: true,
  accountType: 'atlassian',
};
const other = {
  accountId: 'jira-other',
  displayName: 'Another author',
  active: true,
  accountType: 'atlassian',
};
const doc = (text: string) => ({
  type: 'doc',
  version: 1,
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const imported = process.env.WEAVER_IMPORT_TEST_DB === '1' ? describe : describe.skip;

imported('Jira import fidelity with PostgreSQL', () => {
  let publicDb: DataSource;
  let tenantDb: DataSource;
  let schema: string;
  let tenant: TenantEntity;
  let owner: UserEntity;
  let viewer: UserEntity;
  let storage: string;
  let connections: any;
  let auth: AuthService;
  let service: ImportPeopleService;
  const mail = { sendInvitation: jest.fn().mockResolvedValue(undefined) };
  let task: any;
  let client: any;

  beforeAll(async () => {
    if (!/^weaver_e2e_[a-z0-9_]+$/.test(process.env.WEAVER_IMPORT_DATABASE ?? ''))
      throw new Error('Use a disposable weaver_e2e_ database');
    publicDb = new DataSource({
      type: 'postgres',
      host: '127.0.0.1',
      port: 55439,
      username: 'weaver',
      password: 'weaver_import_test',
      database: process.env.WEAVER_IMPORT_DATABASE,
      schema: 'public',
      entities: [
        ApiKeyEntity,
        TenantEntity,
        UserEntity,
        TenantMembershipEntity,
        InstalledPluginEntity,
        RefreshSessionEntity,
        OrganizationInvitationEntity,
      ],
      synchronize: true,
    });
    await publicDb.initialize();
  });
  afterAll(async () => {
    if (publicDb?.isInitialized) await publicDb.destroy();
  });
  beforeEach(async () => {
    mail.sendInvitation.mockClear();
    schema = `tenant_jira_${randomUUID().replace(/-/g, '')}`;
    tenant = await publicDb
      .getRepository(TenantEntity)
      .save({ name: 'Disposable Jira trial', slug: schema, schemaName: schema, settings: {} });
    owner = await publicDb.getRepository(UserEntity).save({
      email: `${randomUUID()}@example.test`,
      displayName: 'Import administrator',
      passwordHash: null,
      authProvider: 'local',
      authProviders: ['local'],
    });
    viewer = await publicDb.getRepository(UserEntity).save({
      email: `${randomUUID()}@example.test`,
      displayName: 'Project reader',
      passwordHash: null,
      authProvider: 'local',
      authProviders: ['local'],
    });
    await publicDb.getRepository(TenantMembershipEntity).save([
      { tenantId: tenant.id, userId: owner.id, role: 'owner' },
      { tenantId: tenant.id, userId: viewer.id, role: 'viewer' },
    ]);
    await publicDb.query(`CREATE SCHEMA "${schema}"`);
    tenantDb = new DataSource({
      ...publicDb.options,
      schema,
      entities: [...TENANT_ENTITIES],
      synchronize: true,
    });
    await tenantDb.initialize();
    await runJiraImportMigration(tenantDb, schema);
    storage = await mkdtemp(join(tmpdir(), 'weaver-jira-files-'));
    process.env.STORAGE_LOCAL_PATH = storage;
    connections = {
      getEntityManager: async () => tenantDb.manager,
      runInTenantTransaction: (fn: any) => tenantDb.transaction(fn),
      deferUntilCommit: jest.fn(),
      getConnection: async (requested: string) => {
        if (requested !== schema) throw new Error('Wrong tenant');
        return tenantDb;
      },
    };
    auth = new AuthService(
      publicDb.getRepository(UserEntity),
      publicDb.getRepository(TenantMembershipEntity),
      publicDb.getRepository(RefreshSessionEntity),
      publicDb.getRepository(OrganizationInvitationEntity),
      new JwtService({ secret: 'disposable-test-secret' }),
      new ConfigService({ JWT_SECRET: 'disposable-test-secret' }),
      {
        findBySlug: async () => publicDb.getRepository(TenantEntity).findOneBy({ id: tenant.id }),
        getSettings: async () => ({ sso: { google: { enabled: true } } }),
      } as never,
      {} as never,
    );
    service = new ImportPeopleService(
      publicDb,
      connections,
      auth,
      mail as never,
      new ConfigService({ WEB_APP_URL: 'https://weaver.fixture.example' }),
    );
    task = {
      id: '12',
      key: 'GS-2',
      fields: {
        security: null,
        project: { id: 'p1', key: 'GS' },
        summary: 'Source issue',
        description: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'mention', attrs: { id: author.accountId, text: '@Original author' } },
              ],
            },
          ],
        },
        status: { id: 'testing', name: 'In Testing', statusCategory: { key: 'indeterminate' } },
        issuetype: { id: 'task', name: 'Task', subtask: false },
        reporter: author,
        assignee: other,
        creator: author,
        parent: { id: '11', key: 'GS-1' },
        customfield_1: 5,
        customfield_2: 'keep me',
        customfield_3: 'separate field',
        customfield_rank: '0|a:',
        labels: ['migration'],
        created: '2020-01-01T00:00:00Z',
        updated: '2021-01-01T00:00:00Z',
        fixVersions: [{ id: 'v1', name: 'Release one' }],
        components: [{ id: 'c1', name: 'Backend' }],
        attachment: [
          { id: 'a1', filename: 'fixture.txt', content: source + '/file', size: 5, author },
        ],
      },
    };
    client = {
      testConnection: async () => {},
      getProjects: async () => [{ id: 'p1', key: 'GS', name: 'GS fixture' }],
      getProjectDetails: async () => ({ id: 'p1', key: 'GS', name: 'GS fixture' }),
      getFieldMetadata: async () => [
        { id: 'customfield_1', name: 'Story points' },
        { id: 'customfield_2', name: 'Duplicated name' },
        { id: 'customfield_3', name: 'Duplicated name' },
        { id: 'customfield_rank', name: 'Rank' },
      ],
      getFieldNames: async () => ({
        customfield_1: 'Story points',
        customfield_2: 'Duplicated name',
        customfield_3: 'Duplicated name',
        customfield_rank: 'Rank',
      }),
      getProjectStatuses: async () => [
        { id: 'task', name: 'Task', subtask: false, statuses: [task.fields.status] },
        { id: 'epic', name: 'Epic', subtask: false, statuses: [task.fields.status] },
        { id: 'sub', name: 'Sub-task', subtask: true, statuses: [task.fields.status] },
      ],
      getVersions: async () => [{ id: 'v1', name: 'Release one', released: true }],
      getComponents: async () => [{ id: 'c1', name: 'Backend' }],
      getBoards: async () => [{ id: 149, name: 'GS board', type: 'kanban' }],
      getBoardConfig: async () => ({
        columnConfig: { columns: [{ name: 'Testing', statuses: [{ id: 'testing' }] }] },
      }),
      getSprints: async () => [],
      issuePages: async function* () {
        yield [
          {
            ...task,
            id: '11',
            key: 'GS-1',
            fields: {
              ...task.fields,
              summary: 'Epic',
              parent: undefined,
              attachment: [],
              issuetype: { id: 'epic', name: 'Epic' },
              customfield_rank: '0|0:',
            },
          },
          task,
        ];
        yield [
          {
            ...task,
            id: '13',
            key: 'GS-3',
            fields: {
              ...task.fields,
              parent: { id: '12' },
              issuetype: { id: 'sub', name: 'Sub-task', subtask: true },
              attachment: [],
              customfield_rank: '0|b:',
            },
          },
        ];
      },
      getComments: async (_config: any, id: string) =>
        id !== '12'
          ? []
          : [
              {
                id: 'public',
                author,
                body: doc('Public text'),
                created: '2020-01-01T00:00:00Z',
                updated: '2021-01-01T00:00:00Z',
              },
              {
                id: 'internal',
                author: other,
                visibility: { type: 'role', value: 'Rocket Web Internal' },
                body: doc('Internal text'),
              },
              { id: 'reply', author, parentId: 'internal', body: doc('Internal reply') },
            ],
      getWorklogs: async (_config: any, id: string) =>
        id !== '12'
          ? []
          : [
              {
                id: 'w1',
                author,
                started: '2021-01-01T00:00:00Z',
                timeSpentSeconds: 2701,
                comment: doc('Original note'),
              },
              {
                id: 'w2',
                author: other,
                started: '2021-01-01T00:00:00Z',
                timeSpentSeconds: 300,
                visibility: { type: 'role', value: 'Rocket Web Internal' },
              },
            ],
      getChangelogs: async (_config: any, id: string) =>
        id !== '12'
          ? []
          : [
              {
                id: 'h1',
                author: other,
                created: '2021-01-01T00:00:00Z',
                items: [{ field: 'status', fromString: 'To Do', toString: 'In Testing' }],
              },
            ],
      getRemoteLinks: async () => [],
      downloadAttachment: async () => Buffer.from('hello'),
      transferAttachment: async (
        _config: any,
        attachment: any,
        storage: any,
        key: string,
        cancelled: any,
      ) =>
        transferAttachment(
          async () => new Response('hello'),
          storage,
          key,
          attachment.size,
          cancelled,
        ),
    };
  });
  afterEach(async () => {
    if (tenantDb?.isInitialized) await tenantDb.destroy();
    await publicDb.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await publicDb.getRepository(TenantEntity).delete(tenant.id);
    await publicDb.getRepository(UserEntity).delete([owner.id, viewer.id]);
    await rm(storage, { recursive: true, force: true });
  });
  const context = <T>(fn: () => Promise<T>) =>
    tenantStorage.run({ tenantId: tenant.id, schemaName: schema }, fn);
  async function run(attachmentRecovery?: { jobId: string; attachmentIds: string[] }) {
    const job = await tenantDb.getRepository(ImportJobEntity).save({
      source: 'jira_cloud',
      sourceUrl: source,
      status: 'queued',
      selectedProjectKeys: ['GS'],
    });
    await new ImportOrchestrator(tenantDb.manager, client as JiraClient, new FieldMapper(), {
      attachmentRecovery,
      importJobId: job.id,
      tenantId: tenant.id,
      schemaName: schema,
      requestedByUserId: owner.id,
      config: {
        source: 'jira_cloud',
        baseUrl: source,
        auth: { type: 'api_token', token: 'fixture', email: 'fixture@example.test' },
      },
      projectKeys: ['GS'],
    }).run();
    return tenantDb.getRepository(ImportJobEntity).findOneByOrFail({ id: job.id });
  }

  it('labels imported and active time-report authors without exposing email addresses', async () => {
    await run();
    const report = () =>
      tenantDb.transaction(async (em) => {
        await em.query(`SET LOCAL search_path TO "${schema}"`);
        return getReport(
          { query: { groupBy: 'user' } } as never,
          {
            db: { query: (sql: string, params: unknown[]) => em.query(sql, params) },
            api: {
              issues: { accessibleIds: async () => null },
              projects: { accessibleIds: async () => null },
            },
          } as never,
        );
      });
    const rows = async () =>
      (await report()).body as { rows: Array<{ label: string; total_minutes: number }> };
    expect((await rows()).rows).toEqual([
      expect.objectContaining({ label: 'Original author', total_minutes: 45 }),
    ]);
    const person = await tenantDb
      .getRepository(ImportedPersonEntity)
      .findOneByOrFail({ externalId: author.accountId });
    await tenantDb.getRepository(ImportedPersonEntity).update(person.id, {
      displayName: '',
      email: 'private-source@example.test',
    });
    expect((await rows()).rows[0].label).toBe('Unknown user');
    const entry = (await tenantDb.getRepository(TimeEntryEntity).find())[0];
    await tenantDb.getRepository(TimeEntryEntity).update(entry.id, { userId: owner.id });
    await publicDb.getRepository(UserEntity).update(owner.id, { displayName: '' });
    expect((await rows()).rows[0].label).toBe('Unknown user');
  });

  it('preserves people, restricted replies, files, source data, and hierarchy without granting access or sending notifications', async () => {
    const job = await run();
    expect(job.errors).toEqual([]);
    expect(job.status).toBe('needs_review'); // Workflow/filter fidelity warnings are explicit.
    expect(job.report).toMatchObject({
      restrictedComments: 2,
      restrictedWorklogs: 1,
      counts: { issue: 3, comment: 3, worklog: 2, attachment: 1, version: 1, component: 1 },
    });
    const people = await tenantDb.getRepository(ImportedPersonEntity).find();
    expect(people).toHaveLength(2);
    const original = people.find((p) => p.externalId === author.accountId)!;
    const second = people.find((p) => p.externalId === other.accountId)!;
    expect(original.email).toBeNull();
    expect(await publicDb.getRepository(UserEntity).findOneBy({ id: original.id })).toBeNull();
    expect(
      await publicDb.getRepository(TenantMembershipEntity).countBy({ tenantId: tenant.id }),
    ).toBe(2);
    expect(await tenantDb.getRepository(ProjectMemberEntity).count()).toBe(1);
    expect(await tenantDb.getRepository(NotificationEntity).count()).toBe(0);
    expect(mail.sendInvitation).not.toHaveBeenCalled();
    await expect(auth.createSessionForUser(original.id, tenant.id)).rejects.toThrow(
      'Invalid credentials',
    );
    await expect(
      auth.completeOAuth({
        provider: 'google',
        email: `${randomUUID()}@example.test`,
        displayName: author.displayName!,
        avatarUrl: null,
        tenantSlug: tenant.slug,
      }),
    ).rejects.toThrow('invitation is required');
    const issue = await tenantDb.getRepository(IssueEntity).findOneByOrFail({ key: 'GS-2' });
    const epic = await tenantDb.getRepository(IssueEntity).findOneByOrFail({ key: 'GS-1' });
    const sub = await tenantDb.getRepository(IssueEntity).findOneByOrFail({ key: 'GS-3' });
    expect(issue.reporterId).toBe(original.id);
    expect(issue.assigneeId).toBe(second.id);
    expect(issue.epicId).toBe(epic.id);
    expect(sub.parentId).toBe(issue.id);
    expect(issue.storyPoints).toBe(5);
    expect(
      Object.entries(issue.customFields).find(([key]) => key.endsWith('.customfield_2'))?.[1],
    ).toBe('keep me');
    expect(
      Object.entries(issue.customFields).find(([key]) => key.endsWith('.customfield_3'))?.[1],
    ).toBe('separate field');
    expect(issue.customFields['jira.components']).toEqual(['Backend']);
    expect(
      (await tenantDb.getRepository(WorkflowStatusEntity).findOneByOrFail({ id: issue.statusId }))
        .category,
    ).toBe('in_progress');
    expect((await tenantDb.getRepository(BoardEntity).find())[0].config).toMatchObject({
      columns: [{ name: 'Testing', statusIds: [issue.statusId] }],
    });
    expect((await tenantDb.getRepository(AttachmentEntity).find())[0].uploaderId).toBe(original.id);
    expect((await tenantDb.getRepository(TimeEntryEntity).find())[0]).toMatchObject({
      userId: original.id,
      minutes: 45,
    });
    expect(await tenantDb.getRepository(TimeEntryEntity).count()).toBe(1);
    const users = {
      findById: async (id: string) => {
        const p = people.find((v) => v.id === id);
        return { displayName: p!.displayName, email: '' };
      },
    };
    const comments = new CommentsService(
      connections,
      users as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await context(async () => {
      const reader = { userId: viewer.id, role: 'viewer' };
      const files = new AttachmentsService(connections, {} as never);
      expect(await (files.findByIssue as any)('GS-2', reader)).toHaveLength(0);
      expect(
        await (files.findByIssue as any)('GS-2', { userId: owner.id, role: 'owner' }),
      ).toHaveLength(1);
      const file = (await tenantDb.getRepository(AttachmentEntity).find())[0];
      const access = new ProjectAccessService(connections);
      await expect(access.assertAttachmentId(file.id, reader as never, 'read')).rejects.toThrow(
        'Attachment not found',
      );
      await tenantDb
        .getRepository(ProjectMemberEntity)
        .save({ projectId: issue.projectId, userId: viewer.id, role: 'viewer' });
      expect((await comments.findByIssue('GS-2', reader)).map((c) => c.id)).toHaveLength(1);
      expect(await comments.findByIssue('GS-2', { userId: owner.id, role: 'owner' })).toHaveLength(
        3,
      );
      const audience = await tenantDb
        .getRepository(ImportedAudienceEntity)
        .findOneByOrFail({ name: 'Rocket Web Internal' });
      await service.reviewAttachment(file.id, audience.id);
      expect(await files.findByIssue('GS-2', reader)).toHaveLength(0);
      await service.mapAudience(audience.id, [viewer.id]);
      expect(await files.findByIssue('GS-2', reader)).toHaveLength(1);
      await expect(
        access.assertAttachmentId(file.id, reader as never, 'read'),
      ).resolves.toBeUndefined();
      expect(await comments.findByIssue('GS-2', reader)).toHaveLength(3);
      const sourceController = new ImportSourceController(connections);
      const details = await sourceController.details('GS-2', {
        ...reader,
        email: viewer.email,
        tenantId: tenant.id,
      });
      expect(details?.worklogs).toHaveLength(2); // Explicit audience membership includes restricted logs.
      await service.mapAudience(audience.id, []);
      expect(await files.findByIssue('GS-2', reader)).toHaveLength(0);
      await expect(access.assertAttachmentId(file.id, reader as never, 'read')).rejects.toThrow(
        'Attachment not found',
      );
      expect(
        (
          await sourceController.details('GS-2', {
            ...reader,
            email: viewer.email,
            tenantId: tenant.id,
          })
        )?.worklogs,
      ).toHaveLength(1);
      const notifications = new NotificationsService(connections, {
        emitToUser: jest.fn(),
      } as never);
      await expect(notifications.create(original.id, 'mention', 'No delivery')).rejects.toThrow();
      expect(await tenantDb.getRepository(NotificationEntity).count()).toBe(0);
      await expect(
        service.invite([
          {
            personId: original.id,
            email: 'person@example.test',
            role: 'member',
            projectIds: [randomUUID()],
            delivery: 'email',
          },
        ]),
      ).rejects.toThrow('Choose projects');
      expect(mail.sendInvitation).not.toHaveBeenCalled();
      const invites = await service.invite([
        {
          personId: original.id,
          email: `${randomUUID()}@example.test`,
          role: 'viewer',
          projectIds: [issue.projectId],
          delivery: 'link',
        },
      ]);
      expect(mail.sendInvitation).not.toHaveBeenCalled();
      expect(
        await publicDb.getRepository(TenantMembershipEntity).countBy({ tenantId: tenant.id }),
      ).toBe(2);
      const token = invites[0].url!.split('/').at(-1)!;
      expect((await service.preview(token)).organizationName).toBe(tenant.name);
      const session = await service.accept(token, {
        displayName: 'Verified person',
        password: 'test-password-123',
      });
      expect(
        await publicDb
          .getRepository(TenantMembershipEntity)
          .findOneBy({ tenantId: tenant.id, userId: session.user.id }),
      ).toMatchObject({ role: 'viewer' });
      expect(
        (await tenantDb.getRepository(IssueEntity).findOneByOrFail({ id: issue.id })).reporterId,
      ).toBe(session.user.id);
      expect(await tenantDb.getRepository(CommentEntity).countBy({ authorId: original.id })).toBe(
        0,
      );
      await expect(
        service.accept(token, { displayName: 'Again', password: 'test-password-123' }),
      ).rejects.toThrow('Invalid or expired');
      await run();
      expect(await files.findByIssue('GS-2', reader)).toHaveLength(0);
      expect(
        (await tenantDb.getRepository(IssueEntity).findOneByOrFail({ id: issue.id })).reporterId,
      ).toBe(session.user.id);
      expect(await tenantDb.getRepository(NotificationEntity).count()).toBe(0);
      expect(mail.sendInvitation).not.toHaveBeenCalled();
    });
  });

  it('reimports without duplicates, repairs legacy comment access, refreshes source changes and preserves local edits', async () => {
    await run();
    const issue = await tenantDb.getRepository(IssueEntity).findOneByOrFail({ key: 'GS-2' });
    task.fields.summary = 'Source changed';
    const job = await run();
    expect(job.errors).toEqual([]);
    expect(
      (await tenantDb.getRepository(IssueEntity).findOneByOrFail({ id: issue.id })).summary,
    ).toBe('Source changed');
    expect(await tenantDb.getRepository(IssueEntity).count()).toBe(3);
    expect(await tenantDb.getRepository(CommentEntity).count()).toBe(3);
    expect(await tenantDb.getRepository(AttachmentEntity).count()).toBe(1);
    await tenantDb.getRepository(IssueEntity).update(issue.id, { summary: 'Local edit' });
    task.fields.summary = 'Another source edit';
    const conflict = await run();
    expect((conflict.report.conflicts as string[]).some((v) => v.includes('GS-2: summary'))).toBe(
      true,
    );
    expect(
      (await tenantDb.getRepository(IssueEntity).findOneByOrFail({ id: issue.id })).summary,
    ).toBe('Local edit');
    const comment = await tenantDb
      .getRepository(CommentEntity)
      .findOneByOrFail({ sourceId: 'internal' });
    await tenantDb.query(
      `UPDATE "${schema}".comments SET source_id = NULL, visibility = NULL WHERE id = $1`,
      [comment.id],
    );
    await runJiraImportMigration(tenantDb, schema);
    expect(
      (await tenantDb.getRepository(CommentEntity).findOneByOrFail({ id: comment.id })).visibility
        ?.type,
    ).toBe('unknown');
    await run();
    expect(
      (await tenantDb.getRepository(CommentEntity).findOneByOrFail({ id: comment.id })).visibility
        ?.value,
    ).toBe('Rocket Web Internal');
  });

  it('imports secured native issues with full children while keeping unmapped readers out', async () => {
    process.env.JIRA_IMPORT_ISSUE_SECURITY_ENABLED = 'true';
    try {
      task.fields.security = { id: 'internal', name: 'Rocket Web Internal' };
      await run();
      const issue = await tenantDb.getRepository(IssueEntity).findOneByOrFail({ key: 'GS-2' });
      expect(issue.accessState).toBe('restricted');
      expect(
        await tenantDb.getRepository(CommentEntity).countBy({ issueId: issue.id }),
      ).toBeGreaterThan(0);
      expect(await tenantDb.getRepository(AttachmentEntity).countBy({ issueId: issue.id })).toBe(1);
      expect(
        await canReadIssue(tenantDb.manager, issue, { userId: viewer.id, role: 'viewer' }),
      ).toBe(false);
      const policy = await tenantDb
        .getRepository(IssueAccessPolicyEntity)
        .findOneByOrFail({ id: issue.accessPolicyId! });
      await tenantDb
        .getRepository(IssueAccessPolicyEntity)
        .update(policy.id, { reviewed: true, userIds: [viewer.id] });
      expect(
        await canReadIssue(tenantDb.manager, issue, { userId: viewer.id, role: 'viewer' }),
      ).toBe(true);
      await run();
      expect(await tenantDb.getRepository(IssueEntity).count()).toBe(3);
      expect(
        (await tenantDb.getRepository(IssueAccessPolicyEntity).findOneByOrFail({ id: policy.id }))
          .userIds,
      ).toEqual([viewer.id]);
      task.fields.security = null;
      await run();
      const changed = await tenantDb.getRepository(IssueEntity).findOneByOrFail({ id: issue.id });
      expect(changed.accessState).toBe('quarantined');
      expect(
        await canReadIssue(tenantDb.manager, changed, { userId: viewer.id, role: 'viewer' }),
      ).toBe(false);
    } finally {
      delete process.env.JIRA_IMPORT_ISSUE_SECURITY_ENABLED;
    }
  });

  it('enforces mapped audiences before pagination and delivery, with reviewed changes and revocation', async () => {
    process.env.JIRA_IMPORT_ISSUE_SECURITY_ENABLED = 'true';
    try {
      task.fields.security = { id: 'internal', name: 'Internal' };
      await run();
      const issues = await tenantDb.getRepository(IssueEntity).find({ order: { key: 'ASC' } });
      const project = await tenantDb
        .getRepository(ProjectEntity)
        .findOneByOrFail({ id: issues[0].projectId });
      const principal = {
        userId: viewer.id,
        tenantId: tenant.id,
        role: 'viewer',
        email: viewer.email,
      };
      const administrator = { ...principal, userId: owner.id, role: 'owner' };
      const context = (actor: typeof principal, fn: () => Promise<any>) =>
        tenantStorage.run({ tenantId: tenant.id, schemaName: schema, actor }, fn);
      const query = () =>
        visibleIssues(
          tenantDb.manager,
          tenantDb.getRepository(IssueEntity).createQueryBuilder('issue'),
          principal,
        );
      const controller = new IssueSecurityController(connections, {
        emitToUser: jest.fn(),
      } as never);
      const policy = await tenantDb
        .getRepository(IssueAccessPolicyEntity)
        .findOneByOrFail({ id: issues[0].accessPolicyId! });
      expect(await query().getCount()).toBe(0);
      await context(administrator, async () => {
        await expect(
          controller.map(
            policy.id,
            { revision: 1, affectedCount: 2, userIds: [viewer.id] },
            administrator,
          ),
        ).rejects.toThrow('affected issues changed');
        await expect(
          controller.map(
            policy.id,
            { revision: 1, affectedCount: 3, userIds: [randomUUID()] },
            administrator,
          ),
        ).rejects.toThrow('active organization members');
        await controller.map(
          policy.id,
          { revision: 1, affectedCount: 3, userIds: [viewer.id] },
          administrator,
        );
        await expect(
          controller.map(policy.id, { revision: 1, affectedCount: 3, userIds: [] }, administrator),
        ).rejects.toThrow('policy changed');
      });
      // An audience mapping alone grants no project access.
      expect(await query().getCount()).toBe(0);
      expect(
        await recipientCanReadIssue(tenantDb.manager, schema, tenant.id, viewer.id, {
          key: 'GS-2',
        }),
      ).toBe(false);
      await tenantDb
        .getRepository(ProjectMemberEntity)
        .save({ projectId: project.id, userId: viewer.id, role: 'viewer' });
      expect(await query().getCount()).toBe(3);
      expect(
        await tenantDb
          .getRepository(IssueEntity)
          .countBy(issueVisibilityWhere(tenantDb.manager, principal)),
      ).toBe(3);
      expect(
        await recipientCanReadIssue(tenantDb.manager, schema, tenant.id, viewer.id, {
          key: 'GS-2',
        }),
      ).toBe(true);
      expect(
        await recipientCanReadIssue(tenantDb.manager, schema, randomUUID(), viewer.id, {
          key: 'GS-2',
        }),
      ).toBe(false);
      expect(await eventHasRestrictedContent(tenantDb.manager, schema, { issueKey: 'GS-2' })).toBe(
        true,
      );
      const notifications = new NotificationsService(connections, {
        emitToUser: jest.fn(),
      } as never);
      await context(principal, async () => {
        await notifications.create(viewer.id, 'assigned', 'Secret title', { issueKey: 'GS-2' });
        expect(await notifications.getUnreadCount(viewer.id)).toBe(1);
      });
      await context(administrator, () =>
        controller.map(policy.id, { revision: 2, affectedCount: 3, userIds: [] }, administrator),
      );
      await context(principal, async () => {
        expect((await notifications.findForUser(viewer.id)).meta.total).toBe(0);
        expect(await notifications.getUnreadCount(viewer.id)).toBe(0);
      });
      expect(await query().getCount()).toBe(0);
      expect(
        await recipientCanReadIssue(tenantDb.manager, schema, tenant.id, owner.id, { key: 'GS-2' }),
      ).toBe(true);
      // The numeric order is applied by PostgreSQL before paging, even across 9/10/100.
      for (const [index, key] of ['GS-9', 'GS-10', 'GS-100'].entries())
        await tenantDb.getRepository(IssueEntity).update(issues[index].id, { key });
      const ordered = tenantDb
        .getRepository(IssueEntity)
        .createQueryBuilder('issue')
        .leftJoinAndSelect('issue.status', 'status');
      const params = applyIssueListOrder(
        ordered,
        { page: 2, perPage: 1 },
        { 'jira.source-id': 'p1' },
      );
      const page = await paginate(ordered, params, ['key']);
      expect(page.data.map((issue) => issue.key)).toEqual(['GS-10']);
      expect(page.meta.total).toBe(3);
      await publicDb
        .getRepository(TenantMembershipEntity)
        .delete({ tenantId: tenant.id, userId: viewer.id });
      expect(
        await recipientCanReadIssue(tenantDb.manager, schema, tenant.id, viewer.id, {
          key: 'GS-10',
        }),
      ).toBe(false);
    } finally {
      delete process.env.JIRA_IMPORT_ISSUE_SECURITY_ENABLED;
    }
  });

  it('recovers only selected failed files, preserves the original report and reviews, and rejects changed source security', async () => {
    const transfer = client.transferAttachment;
    task.fields.attachment.push({
      ...task.fields.attachment[0],
      id: 'a2',
      filename: 'retained.txt',
    });
    client.transferAttachment = async (...args: any[]) => {
      if (args[1].id === 'a1') throw new Error('Fixture transfer interruption');
      return transfer(...args);
    };
    const original = await run();
    const snapshot = structuredClone(original.errors);
    expect(snapshot).toEqual([
      expect.objectContaining({
        itemType: 'attachment',
        itemId: 'a1',
        issueKey: 'GS-2',
        filename: 'fixture.txt',
        expectedBytes: 5,
      }),
    ]);
    const retained = await tenantDb
      .getRepository(AttachmentEntity)
      .findOneByOrFail({ sourceId: 'a2' });
    await tenantDb.getRepository(AttachmentEntity).update(retained.id, { visibility: null });
    const project = await tenantDb.getRepository(ProjectEntity).findOneByOrFail({ key: 'GS' });
    expect(project.importQuarantined).toBe(false); // An attachment fidelity failure is independent of visibility.
    await tenantDb.getRepository(ProjectEntity).update(project.id, { importQuarantined: true });
    client.transferAttachment = transfer;
    client.getIssue = jest.fn(async () => structuredClone(task));
    const recovered = await run({ jobId: original.id, attachmentIds: ['a1'] });
    expect(recovered.errors).toEqual([]);
    expect(recovered.report.recoveryOf).toBe(original.id);
    expect(await tenantDb.getRepository(AttachmentEntity).count()).toBe(2);
    expect(
      (await tenantDb.getRepository(AttachmentEntity).findOneByOrFail({ id: retained.id }))
        .visibility,
    ).toBeNull();
    expect(
      (await tenantDb.getRepository(ProjectEntity).findOneByOrFail({ id: project.id }))
        .importQuarantined,
    ).toBe(true);
    expect(
      (await tenantDb.getRepository(ImportJobEntity).findOneByOrFail({ id: original.id })).errors,
    ).toEqual(snapshot);
    expect((await run({ jobId: original.id, attachmentIds: ['a1'] })).errors).toEqual([]);
    expect(await tenantDb.getRepository(AttachmentEntity).count()).toBe(2);
    task.fields.security = { id: 'changed' };
    const blocked = await run({ jobId: original.id, attachmentIds: ['a1'] });
    expect(blocked.errors[0].message).toContain('security changed');
    expect(
      (await tenantDb.getRepository(IssueEntity).findOneByOrFail({ key: 'GS-2' })).accessState,
    ).toBe('quarantined');
  });

  it('quarantines secured issues instead of claiming a complete migration', async () => {
    task.fields.security = { id: 'private-level' };
    const job = await run();
    expect(job.status).toBe('needs_review');
    expect(
      job.errors.some(
        (e) => e.itemType === 'issue' && e.message.includes('Secured issue retained'),
      ),
    ).toBe(true);
    expect(await tenantDb.getRepository(IssueEntity).count()).toBe(0);
    expect(
      await tenantDb.getRepository(ImportedResourceEntity).countBy({ kind: 'secured_issue' }),
    ).toBe(3);
  });

  it('keeps previous copies administrator-only when source permissions or resource requests fail', async () => {
    await run();
    const project = (await tenantDb.getRepository(ProjectEntity).find())[0];
    await tenantDb
      .getRepository(ProjectMemberEntity)
      .save({ projectId: project.id, userId: viewer.id, role: 'viewer' });
    client.getComments = async () => {
      throw new Error('Jira request failed (403)');
    };
    const job = await run();
    expect(job.errors.some((error) => error.itemType === 'comments')).toBe(true);
    expect(
      (await tenantDb.getRepository(ProjectEntity).findOneByOrFail({ id: project.id }))
        .importQuarantined,
    ).toBe(true);
    await context(async () => {
      const access = new ProjectAccessService(connections);
      await expect(
        access.assertProjectId(project.id, { userId: viewer.id, role: 'viewer' } as never, 'read'),
      ).rejects.toThrow('access review');
      expect(
        await access.accessibleProjectIds({ userId: viewer.id, role: 'viewer' } as never),
      ).toEqual([]);
      await expect(
        access.assertProjectId(project.id, { userId: owner.id, role: 'owner' } as never, 'read'),
      ).resolves.toBeUndefined();
    });
  });

  it('retains quarantine when an earlier secured issue disappears from the source response', async () => {
    await run();
    task.fields.security = { id: 'private-level' };
    await run();
    delete task.fields.security;
    client.issuePages = async function* () {
      yield [];
    };
    const hidden = await run();
    expect((await tenantDb.getRepository(ProjectEntity).find())[0].importQuarantined).toBe(true);
    expect(hidden.status).toBe('needs_review');
  });

  it('requires explicit delivery, rejects expired and revoked tokens, and protects existing accounts', async () => {
    await run();
    const people = await tenantDb.getRepository(ImportedPersonEntity).find();
    await context(async () => {
      const input = {
        personId: people[0].id,
        email: viewer.email,
        role: 'viewer' as const,
        projectIds: people[0].projectIds,
        delivery: 'email' as const,
      };
      const sent = await service.invite([input]);
      expect(sent).toEqual([{ personId: people[0].id, email: viewer.email, status: 'sent' }]);
      expect(mail.sendInvitation).toHaveBeenCalledTimes(1);
      expect(mail.sendInvitation.mock.calls[0][0]).toBe(tenant.id);
      expect(mail.sendInvitation.mock.calls[0][1]).toBe(viewer.email);
      expect(await tenantDb.getRepository(ProjectMemberEntity).count()).toBe(1);
      const token = mail.sendInvitation.mock.calls[0][2].split('/').at(-1)!;
      await expect(service.accept(token, { password: 'unrelated-password' })).rejects.toThrow(
        'Sign in',
      );
      await expect(service.accept(token, {}, owner.id)).rejects.toThrow('Sign in');
      await tenantDb
        .getRepository(ImportedPersonEntity)
        .update(people[0].id, { inviteExpiresAt: new Date(Date.now() - 1000) });
      await expect(service.preview(token)).rejects.toThrow('expired');
      const link = (await service.invite([{ ...input, delivery: 'link' }]))[0].url!;
      const nextToken = link.split('/').at(-1)!;
      await service.revoke(people[0].id);
      await expect(service.accept(nextToken, {}, viewer.id)).rejects.toThrow('expired');
      mail.sendInvitation.mockRejectedValueOnce(new Error('Synthetic delivery failure'));
      expect((await service.invite([input]))[0].status).toBe('delivery_failed');
      const failedToken = mail.sendInvitation.mock.calls.at(-1)![2].split('/').at(-1)!;
      await expect(service.preview(failedToken)).rejects.toThrow('expired');
      expect(await tenantDb.getRepository(ProjectMemberEntity).count()).toBe(1);
      const claim = (await service.invite([{ ...input, delivery: 'link' }]))[0]
        .url!.split('/')
        .at(-1)!;
      const session = await service.accept(claim, {}, viewer.id);
      expect(session.user.id).toBe(viewer.id);
      expect(await tenantDb.getRepository(ProjectMemberEntity).countBy({ userId: viewer.id })).toBe(
        1,
      );
      expect(
        await tenantDb.getRepository(ImportedPersonEntity).countBy({ linkedUserId: viewer.id }),
      ).toBe(1);
      expect(
        await tenantDb
          .getRepository(ImportedPersonEntity)
          .countBy({ id: people[1].id, linkedUserId: null }),
      ).toBe(1);
    });
  });

  it('keeps known-email source people separate from existing accounts until explicit acceptance', async () => {
    task.fields.reporter = { ...author, emailAddress: viewer.email };
    await run();
    const person = await tenantDb
      .getRepository(ImportedPersonEntity)
      .findOneByOrFail({ externalId: author.accountId });
    expect(person.email).toBe(viewer.email);
    expect(person.linkedUserId).toBeNull();
    expect(
      (await tenantDb.getRepository(IssueEntity).findOneByOrFail({ key: 'GS-2' })).reporterId,
    ).toBe(person.id);
    expect(await tenantDb.getRepository(ProjectMemberEntity).countBy({ userId: viewer.id })).toBe(
      0,
    );
    expect(mail.sendInvitation).not.toHaveBeenCalled();
  });

  it('links imported people to existing members and keeps source changes flowing on reimport', async () => {
    await run();
    const people = tenantDb.getRepository(ImportedPersonEntity);
    const reporter = await people.findOneByOrFail({ externalId: author.accountId });
    const assignee = await people.findOneByOrFail({ externalId: other.accountId });
    await context(async () => {
      await expect(service.link(reporter.id, randomUUID())).rejects.toThrow(
        'active organization member',
      );
      const pending = await tenantDb.getRepository(ImportJobEntity).save({
        source: 'jira_cloud',
        sourceUrl: source,
        status: 'running',
        selectedProjectKeys: [],
      });
      await expect(service.link(reporter.id, viewer.id)).rejects.toThrow('running import');
      await tenantDb.getRepository(ImportJobEntity).delete(pending.id);
      const link = await service.invite([
        {
          personId: reporter.id,
          email: viewer.email,
          role: 'viewer',
          projectIds: reporter.projectIds,
          delivery: 'link',
        },
      ]);
      await service.link(reporter.id, viewer.id);
      await service.link(assignee.id, owner.id);
      await expect(service.link(reporter.id, owner.id)).rejects.toThrow('already linked');
      await expect(service.preview(link[0].url!.split('/').at(-1)!)).rejects.toThrow('expired');
      expect((await service.people()).find((p) => p.id === reporter.id)?.status).toBe('active');
    });
    expect((await people.findOneByOrFail({ id: reporter.id })).linkedUserId).toBe(viewer.id);
    const issue = await tenantDb.getRepository(IssueEntity).findOneByOrFail({ key: 'GS-2' });
    expect(issue.reporterId).toBe(viewer.id);
    expect(issue.assigneeId).toBe(owner.id);
    expect(JSON.stringify(issue.description)).toContain(viewer.id);
    expect(JSON.stringify(issue.description)).not.toContain(reporter.id);
    const comments = await tenantDb.getRepository(CommentEntity).find();
    expect(comments.map((c) => c.authorId).sort()).toEqual([viewer.id, viewer.id, owner.id].sort());
    expect(
      (await tenantDb.getRepository(AttachmentEntity).find()).map((a) => a.uploaderId),
    ).toEqual([viewer.id]);
    expect(
      (await tenantDb.getRepository(TimeEntryEntity).find()).map((entry) => entry.userId),
    ).toEqual([viewer.id]);
    // Linking attributes history only; it grants no project access.
    expect(await tenantDb.getRepository(ProjectMemberEntity).countBy({ userId: viewer.id })).toBe(
      0,
    );
    // A Jira-side reassignment after the link must not be mistaken for a local edit.
    task.fields.assignee = author;
    task.fields.updated = '2022-01-01T00:00:00Z';
    const job = await run();
    expect(
      (await tenantDb.getRepository(IssueEntity).findOneByOrFail({ key: 'GS-2' })).assigneeId,
    ).toBe(viewer.id);
    expect((job.report.conflicts as string[]).filter((c) => c.startsWith('GS-2'))).toEqual([]);
    expect(await people.countBy({ externalId: author.accountId })).toBe(1);
    expect(
      (await tenantDb.getRepository(IssueEntity).findOneByOrFail({ key: 'GS-2' })).reporterId,
    ).toBe(viewer.id);
  });

  it('reports failed worklog retrieval and preserves local assignments on repeat imports', async () => {
    await run();
    const issue = await tenantDb.getRepository(IssueEntity).findOneByOrFail({ key: 'GS-2' });
    await tenantDb.getRepository(IssueEntity).update(issue.id, { assigneeId: owner.id });
    client.getWorklogs = async () => {
      throw new Error('Jira request failed (403)');
    };
    const job = await run();
    expect(job.status).toBe('needs_review');
    expect(job.errors.some((error) => error.itemType === 'worklogs')).toBe(true);
    expect(
      (await tenantDb.getRepository(IssueEntity).findOneByOrFail({ id: issue.id })).assigneeId,
    ).toBe(owner.id);
    expect((job.report.conflicts as string[]).some((value) => value.includes('assigneeId'))).toBe(
      true,
    );
  });
  it('recovers orphaned storage writes without deleting referenced attachments', async () => {
    const job = await run();
    const attachment = await tenantDb.getRepository(AttachmentEntity).findOneByOrFail({});
    const original = await readFile(join(storage, attachment.storageKey));
    const orphan = randomUUID();
    await writeFile(join(storage, orphan), 'orphaned complete bytes');
    await writeFile(join(storage, `.partial-${orphan}-${randomUUID()}`), 'interrupted');
    await tenantDb.query(
      `INSERT INTO "${schema}".import_storage_writes(storage_key, import_job_id) VALUES ($1, $3), ($2, $3)`,
      [orphan, attachment.storageKey, job.id],
    );
    const orchestrator = new ImportOrchestrator(
      tenantDb.manager,
      client as JiraClient,
      new FieldMapper(),
      {
        importJobId: job.id,
        tenantId: tenant.id,
        schemaName: schema,
        requestedByUserId: owner.id,
        config: {
          source: 'jira_cloud',
          baseUrl: source,
          auth: { type: 'api_token', token: 'fixture', email: 'fixture@example.test' },
        },
        projectKeys: ['GS'],
      },
    );
    await orchestrator.cleanupStorageWrites();
    expect(await readFile(join(storage, attachment.storageKey))).toEqual(original);
    expect((await readdir(storage)).some((file) => file.includes(orphan))).toBe(false);
    expect(await tenantDb.query(`SELECT * FROM "${schema}".import_storage_writes`)).toEqual([]);
  });
});
