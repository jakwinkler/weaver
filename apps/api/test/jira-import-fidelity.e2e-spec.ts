import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { mkdtemp, rm } from 'fs/promises';
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
import { FieldMapper, ImportOrchestrator, JiraClient } from '@weaver/jira-import';
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
  async function run() {
    const job = await tenantDb.getRepository(ImportJobEntity).save({
      source: 'jira_cloud',
      sourceUrl: source,
      status: 'queued',
      selectedProjectKeys: ['GS'],
    });
    await new ImportOrchestrator(tenantDb.manager, client as JiraClient, new FieldMapper(), {
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
            api: { projects: { accessibleIds: async () => null } },
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
});
