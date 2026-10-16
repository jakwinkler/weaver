import 'reflect-metadata';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import type { INestApplication } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { createTransport } from 'nodemailer';
import * as db from '@weaver/db';
import { JiraClient } from '@weaver/jira-import';
import { LocalStorageAdapter, sealImportJob } from '@weaver/server-common';
import { AuthService } from '../src/core/auth/auth.service';
import {
  AdminGuard,
  JwtAuthGuard,
  JwtOnlyAuthGuard,
  JwtStrategy,
  PermissionGuard,
} from '../src/core/auth';
import { ApiKeyGuard } from '../src/core/auth/api-key.guard';
import { PermissionService } from '../src/core/auth/permission.service';
import {
  TenantConnectionProvider,
  ProjectAccessService,
  ProjectAccessGuard,
  MemberVisibilityService,
} from '../src/core/tenant';
import { TenantMiddleware } from '../src/core/tenant/tenant.middleware';
import { TenantService } from '../src/core/tenant/tenant.service';
import { StorageService } from '../src/core/storage/storage.service';
import { UsersService } from '../src/modules/users/users.service';
import { CommentsService } from '../src/modules/comments/comments.service';
import { CommentsController } from '../src/modules/comments/comments.controller';
import { MentionService } from '../src/modules/comments/mention.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { NotificationQueueService } from '../src/modules/mail/notification-queue.service';
import { MailService } from '../src/modules/mail/mail.service';
import { AccountMailQueueService } from '../src/modules/mail/account-mail-queue.service';
import { AttachmentsService } from '../src/modules/attachments/attachments.service';
import { AttachmentsController } from '../src/modules/attachments/attachments.controller';
import { AttachmentDownloadController } from '../src/modules/attachments/attachment-download.controller';
import { ImportController } from '../src/modules/import/import.controller';
import { ImportInvitationController } from '../src/modules/import/import-invitation.controller';
import { ImportSourceController } from '../src/modules/import/import-source.controller';
import { ImportService } from '../src/modules/import/import.service';
import { ImportPeopleService } from '../src/modules/import/import-people.service';
import { ImportQueueService } from '../src/modules/import/import-queue.service';
import { JiraClientService } from '../src/modules/import/jira-client.service';
import { processImport } from '../../worker/src/processors/import.processor';
import {
  fixtureSource,
  fixtureStatuses,
  fixtureIssue,
  jiraFixtureTransport,
} from './fixtures/jira-http-source';
import { smtpSink } from './fixtures/smtp-sink';
import { configureHttpSecurity } from '../src/core/security/http-security';

jest.mock('@weaver/jira-import', () => {
  const actual = jest.requireActual<typeof import('@weaver/jira-import')>('@weaver/jira-import');
  return {
    ...actual,
    JiraClient: class extends actual.JiraClient {
      constructor() {
        super(
          jest.requireActual<typeof import('./fixtures/jira-http-source')>(
            './fixtures/jira-http-source',
          ).jiraFixtureTransport,
        );
      }
    },
  };
});
jest.mock('../src/core/security/outbound-http', () => ({
  ...jest.requireActual('../src/core/security/outbound-http'),
  resolveSafeOutboundHost: async (host: string) => {
    if (host !== 'smtp.fixture.example') throw new Error('Unexpected SMTP destination');
    return [{ address: '127.0.0.1', family: 4 }];
  },
}));

const enabled = process.env.WEAVER_IMPORT_TEST_DB === '1' ? describe : describe.skip;
enabled('Jira HTTP, Redis worker and production migration', () => {
  let publicDb: DataSource;
  let ds: DataSource;
  let otherDs: DataSource;
  let tenant: db.TenantEntity;
  let otherTenant: db.TenantEntity;
  let owner: db.UserEntity;
  let viewer: db.UserEntity;
  let otherOwner: db.UserEntity;
  let app: INestApplication;
  let connections: TenantConnectionProvider;
  let queue: ImportQueueService;
  let events: QueueEvents;
  let observer: Queue;
  let notifications: Queue;
  let worker: Worker | undefined;
  let storage: LocalStorageAdapter;
  let directory: string;
  let smtp: Awaited<ReturnType<typeof smtpSink>>;
  let ownerCookie: string;
  let viewerCookie: string;
  let otherCookie: string;
  let userCountBefore: number;
  let releaseInFlight: (() => void) | undefined;
  const redis = { host: '127.0.0.1', port: 55440 };
  const credentials = {
    source: 'jira_cloud',
    baseUrl: fixtureSource.url,
    auth: {
      type: 'api_token',
      email: 'operator@example.test',
      token: 'fixture-jira-token-never-store-plaintext',
    },
  };

  beforeAll(async () => {
    if (!/^weaver_e2e_[a-z0-9_]+$/.test(process.env.WEAVER_IMPORT_DATABASE ?? ''))
      throw new Error('Disposable database required');
    publicDb = await new DataSource({
      type: 'postgres',
      host: '127.0.0.1',
      port: 55439,
      username: 'weaver',
      password: 'weaver_import_test',
      database: process.env.WEAVER_IMPORT_DATABASE,
      schema: 'public',
      entities: [
        db.ApiKeyEntity,
        db.TenantEntity,
        db.UserEntity,
        db.TenantMembershipEntity,
        db.InstalledPluginEntity,
        db.RefreshSessionEntity,
        db.OrganizationInvitationEntity,
      ],
      synchronize: true,
    }).initialize();
  });
  afterAll(async () => {
    await publicDb?.destroy();
  });
  beforeEach(async () => {
    Object.assign(fixtureSource, {
      issueCount: 3,
      attachmentCount: 1,
      workloggedIssues: 3,
      largeCollections: false,
      requests: [],
      onRequest: undefined,
    });
    smtp = await smtpSink();
    directory = await mkdtemp(join(tmpdir(), 'weaver-jira-runtime-'));
    process.env.STORAGE_DRIVER = 'local';
    process.env.STORAGE_LOCAL_PATH = directory;
    const config = new ConfigService({
      NODE_ENV: 'production',
      DATABASE_HOST: '127.0.0.1',
      DATABASE_PORT: 55439,
      DATABASE_USER: 'weaver',
      DATABASE_PASSWORD: 'weaver_import_test',
      DATABASE_NAME: process.env.WEAVER_IMPORT_DATABASE,
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: 55440,
      IMPORT_CREDENTIAL_KEY: process.env.IMPORT_CREDENTIAL_KEY,
      JWT_SECRET: 'runtime-fixture-secret',
      WEB_APP_URL: 'https://weaver.fixture.example',
    });
    const newTenant = async () => {
      const schemaName = `tenant_runtime_${randomUUID().replace(/-/g, '')}`;
      const entity = await publicDb.getRepository(db.TenantEntity).save({
        name: 'Runtime fixture',
        slug: schemaName,
        schemaName,
        settings: {
          smtp: {
            host: 'smtp.fixture.example',
            port: smtp.port,
            secure: false,
            user: '',
            pass: '',
            fromName: 'Fixture Weaver',
            fromEmail: 'weaver@example.test',
          },
        },
      });
      await publicDb.query(`CREATE SCHEMA "${schemaName}"`);
      const connection = await new DataSource({
        ...publicDb.options,
        schema: schemaName,
        entities: [...db.TENANT_ENTITIES],
        synchronize: true,
      }).initialize();
      await connection
        .getRepository(db.RoleEntity)
        .save({ name: 'viewer', permissions: { 'issues.read': true, 'comments.read': true } });
      return { entity, connection };
    };
    const a = await newTenant();
    tenant = a.entity;
    ds = a.connection;
    const b = await newTenant();
    otherTenant = b.entity;
    otherDs = b.connection;
    [owner, viewer, otherOwner] = await publicDb.getRepository(db.UserEntity).save(
      ['Owner', 'Viewer', 'Other owner'].map((displayName) => ({
        displayName,
        email: `${randomUUID()}@example.test`,
        authProvider: 'local',
        authProviders: ['local'],
        passwordHash: null,
      })),
    );
    await publicDb.getRepository(db.TenantMembershipEntity).save([
      { tenantId: tenant.id, userId: owner.id, role: 'owner' },
      { tenantId: tenant.id, userId: viewer.id, role: 'viewer' },
      { tenantId: otherTenant.id, userId: otherOwner.id, role: 'owner' },
    ]);
    userCountBefore = await publicDb.getRepository(db.UserEntity).count();
    connections = new TenantConnectionProvider(config);
    const tenantService = new TenantService(publicDb.getRepository(db.TenantEntity));
    const jwt = new JwtService({ secret: config.get('JWT_SECRET') });
    const auth = new AuthService(
      publicDb.getRepository(db.UserEntity),
      publicDb.getRepository(db.TenantMembershipEntity),
      publicDb.getRepository(db.RefreshSessionEntity),
      publicDb.getRepository(db.OrganizationInvitationEntity),
      jwt,
      config,
      tenantService,
      {} as never,
    );
    ownerCookie = `weaver_token=${(await auth.createSessionForUser(owner.id, tenant.id)).accessToken}`;
    viewerCookie = `weaver_token=${(await auth.createSessionForUser(viewer.id, tenant.id)).accessToken}`;
    otherCookie = `weaver_token=${(await auth.createSessionForUser(otherOwner.id, otherTenant.id)).accessToken}`;
    storage = new LocalStorageAdapter(config);
    const attachments = new AttachmentsService(connections, new StorageService(storage));
    const users = new UsersService(
      publicDb.getRepository(db.UserEntity),
      publicDb.getRepository(db.TenantMembershipEntity),
      attachments,
      connections,
      {} as never,
      new MemberVisibilityService(connections),
    );
    const notificationQueue = new NotificationQueueService(config);
    const mail = new MailService(
      tenantService,
      publicDb.getRepository(db.UserEntity),
      publicDb.getRepository(db.TenantMembershipEntity),
      notificationQueue,
      new AccountMailQueueService(config),
      config,
      createTransport,
    );
    const comments = new CommentsService(
      connections,
      users,
      { emit: async () => {} } as never,
      new NotificationsService(connections, { emitToUser: () => {} } as never),
      new MentionService(),
      mail,
    );
    queue = new ImportQueueService(config);
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [
        ImportController,
        ImportInvitationController,
        ImportSourceController,
        CommentsController,
        AttachmentsController,
        AttachmentDownloadController,
      ],
      providers: [
        ImportService,
        ImportPeopleService,
        JwtStrategy,
        JwtAuthGuard,
        JwtOnlyAuthGuard,
        AdminGuard,
        PermissionGuard,
        PermissionService,
        ProjectAccessService,
        ProjectAccessGuard,
        MemberVisibilityService,
        { provide: DataSource, useValue: publicDb },
        {
          provide: getRepositoryToken(db.UserEntity),
          useValue: publicDb.getRepository(db.UserEntity),
        },
        { provide: ConfigService, useValue: config },
        { provide: TenantConnectionProvider, useValue: connections },
        { provide: AuthService, useValue: auth },
        { provide: MailService, useValue: mail },
        { provide: NotificationQueueService, useValue: notificationQueue },
        { provide: CommentsService, useValue: comments },
        { provide: AttachmentsService, useValue: attachments },
        { provide: ImportQueueService, useValue: queue },
        { provide: JiraClientService, useValue: new JiraClient(jiraFixtureTransport) },
        { provide: ApiKeyGuard, useValue: { canActivate: () => false } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    configureHttpSecurity(app);
    const middleware = new TenantMiddleware(
      publicDb.getRepository(db.TenantMembershipEntity),
      jwt,
      publicDb.getRepository(db.ApiKeyEntity),
    );
    app.use((req: Request, res: Response, next: NextFunction) =>
      middleware.use(req, res, next).catch(next),
    );
    await app.init();
    observer = new Queue('jira-import', { connection: redis });
    notifications = new Queue('notifications', { connection: redis });
    events = new QueueEvents('jira-import', { connection: redis });
    await events.waitUntilReady();
  });
  afterEach(async () => {
    fixtureSource.onRequest = undefined;
    releaseInFlight?.();
    releaseInFlight = undefined;
    await worker?.close();
    worker = undefined;
    await events?.close();
    await observer?.close();
    await notifications?.close();
    await app?.close();
    await queue?.onModuleDestroy();
    await connections?.closeAll();
    for (const connection of [ds, otherDs])
      if (connection?.isInitialized) await connection.destroy();
    for (const entity of [tenant, otherTenant])
      if (entity) {
        await publicDb.query(`DROP SCHEMA IF EXISTS "${entity.schemaName}" CASCADE`);
        await publicDb.getRepository(db.TenantEntity).delete(entity.id);
      }
    await publicDb.getRepository(db.UserEntity).delete([owner.id, viewer.id, otherOwner.id]);
    await smtp?.close();
    await rm(directory, { recursive: true, force: true });
  });
  async function startWorker(concurrency = 1) {
    worker = new Worker('jira-import', processImport, { connection: redis, concurrency });
    worker.on('error', () => {});
    await worker.waitUntilReady();
  }
  async function enqueue(status: 'queued' | 'cancelled' = 'queued') {
    const row = await ds.getRepository(db.ImportJobEntity).save({
      source: 'jira_cloud',
      sourceUrl: fixtureSource.url,
      status,
      selectedProjectKeys: ['GS'],
    });
    const job = await queue.enqueue({
      importJobId: row.id,
      tenantId: tenant.id,
      schemaName: tenant.schemaName,
      requestedByUserId: owner.id,
      config: credentials as never,
      projectKeys: ['GS'],
    });
    return { row, job };
  }
  async function importViaHttp() {
    const response = await request(app.getHttpServer())
      .post('/api/v1/import/jira/start')
      .set('Cookie', ownerCookie)
      .send({ config: credentials, projectKeys: ['GS'] })
      .expect(201);
    const job = await observer.getJob(response.body.id);
    if (!job) throw new Error('Queued job missing');
    const finished = job.waitUntilFinished(events, 600_000);
    expect(JSON.stringify(job.data)).not.toContain(credentials.auth.token);
    if (!worker) await startWorker();
    await finished;
    return ds.getRepository(db.ImportJobEntity).findOneByOrFail({ id: response.body.id });
  }

  it('imports through HTTP and the real queue with no delivery/access, then enforces invitation and content permissions', async () => {
    const preview = await request(app.getHttpServer())
      .post('/api/v1/import/jira/preview')
      .set('Cookie', ownerCookie)
      .send({ config: credentials, projectKeys: ['GS'] })
      .expect(200);
    expect(preview.body.projects[0]).toMatchObject({
      issues: 3,
      comments: 9,
      attachments: 1,
      worklogs: 3,
    });
    expect(await ds.getRepository(db.ImportedPersonEntity).count()).toBe(0);
    expect(await ds.getRepository(db.ImportedResourceEntity).count()).toBe(0);
    expect(smtp.messages).toHaveLength(0);
    const job = await importViaHttp();
    expect(job.errors).toEqual([]);
    expect(job.status).toBe('needs_review');
    expect(await ds.getRepository(db.IssueEntity).count()).toBe(3);
    expect(await publicDb.getRepository(db.UserEntity).count()).toBe(userCountBefore);
    expect(
      await publicDb.getRepository(db.TenantMembershipEntity).countBy({ tenantId: tenant.id }),
    ).toBe(2);
    expect(smtp.messages).toHaveLength(0);
    expect(await notifications.getWaitingCount()).toBe(0);
    expect(await ds.getRepository(db.NotificationEntity).count()).toBe(0);
    const issue = await ds.getRepository(db.IssueEntity).findOneByOrFail({ key: 'GS-1' });
    await request(app.getHttpServer())
      .get('/api/v1/issues/GS-1/comments')
      .set('Cookie', viewerCookie)
      .expect(403);
    await ds
      .getRepository(db.ProjectMemberEntity)
      .save({ projectId: issue.projectId, userId: viewer.id, role: 'viewer' });
    const publicComments = await request(app.getHttpServer())
      .get('/api/v1/issues/GS-1/comments')
      .set('Cookie', viewerCookie)
      .expect(200);
    expect(publicComments.body).toHaveLength(1);
    expect(JSON.stringify(publicComments.body)).not.toContain('private-');
    expect(publicComments.body[0].authorDisplayName).toBe('Source person 1');
    const details = await request(app.getHttpServer())
      .get('/api/v1/issues/GS-1/jira')
      .set('Cookie', viewerCookie)
      .expect(200);
    expect(details.body.worklogs[0].seconds).toBe(2701);
    expect(details.body.history).toHaveLength(1);
    expect(JSON.stringify(details.body)).not.toContain('private-comment');
    await request(app.getHttpServer())
      .get(`/api/v1/import/resources?jobId=${job.id}`)
      .set('Cookie', viewerCookie)
      .expect(403);
    const otherResources = await request(app.getHttpServer())
      .get(`/api/v1/import/resources?jobId=${job.id}`)
      .set('Cookie', otherCookie)
      .expect(200);
    expect(otherResources.body.total).toBe(0);
    const allComments = await request(app.getHttpServer())
      .get('/api/v1/issues/GS-1/comments')
      .set('Cookie', ownerCookie)
      .expect(200);
    expect(allComments.body).toHaveLength(3);
    await request(app.getHttpServer())
      .delete(`/api/v1/issues/GS-1/comments/${allComments.body[0].id}`)
      .set('Cookie', ownerCookie)
      .expect(400);
    const file = (await ds.getRepository(db.AttachmentEntity).find())[0];
    await request(app.getHttpServer())
      .get(`/api/v1/attachments/${file.id}/download`)
      .set('Cookie', viewerCookie)
      .expect(404);
    const audience = await ds
      .getRepository(db.ImportedAudienceEntity)
      .findOneByOrFail({ identifier: 'internal' });
    await request(app.getHttpServer())
      .post(`/api/v1/import/attachments/${file.id}/visibility`)
      .set('Cookie', viewerCookie)
      .send({ audienceId: null })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/import/attachments/${file.id}/visibility`)
      .set('Cookie', ownerCookie)
      .send({ audienceId: audience.id })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/import/audiences/${audience.id}`)
      .set('Cookie', ownerCookie)
      .send({ userIds: [viewer.id] })
      .expect(201);
    const permitted = await request(app.getHttpServer())
      .get('/api/v1/issues/GS-1/comments')
      .set('Cookie', viewerCookie)
      .expect(200);
    expect(permitted.body).toHaveLength(3);
    const download = await request(app.getHttpServer())
      .get(`/api/v1/attachments/${file.id}/download`)
      .set('Cookie', viewerCookie)
      .expect(200);
    expect(Buffer.from(download.body).toString()).toBe('hello');
    await request(app.getHttpServer())
      .post(`/api/v1/import/audiences/${audience.id}`)
      .set('Cookie', ownerCookie)
      .send({ userIds: [] })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/api/v1/attachments/${file.id}/download`)
      .set('Cookie', viewerCookie)
      .expect(404);
    const person = await ds
      .getRepository(db.ImportedPersonEntity)
      .findOneByOrFail({ externalId: 'fixture-person-1' });
    const invitation = {
      personId: person.id,
      email: `${randomUUID()}@example.test`,
      role: 'viewer',
      projectIds: [issue.projectId],
      delivery: 'email',
    };
    await request(app.getHttpServer())
      .post('/api/v1/import/invitations')
      .set('Cookie', viewerCookie)
      .send({ invitations: [invitation] })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/import/invitations')
      .set('Cookie', ownerCookie)
      .send({ invitations: [{ ...invitation, role: 'admin' }] })
      .expect(400);
    expect(smtp.messages).toHaveLength(0);
    await request(app.getHttpServer())
      .post('/api/v1/import/invitations')
      .set('Cookie', ownerCookie)
      .send({ invitations: [invitation] })
      .expect(201);
    expect(smtp.messages).toHaveLength(1);
    expect(smtp.messages[0].recipients).toEqual([`<${invitation.email}>`]);
    expect(
      await publicDb.getRepository(db.TenantMembershipEntity).countBy({ tenantId: tenant.id }),
    ).toBe(2);
    const token = smtp.messages[0].body
      .replace(/=\r\n/g, '')
      .match(/import-invite\/([0-9a-f-]{36}\.[0-9a-f]{64})/)![1];
    const accepted = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post(`/api/v1/auth/import-invitations/${token}/accept`)
          .send({ displayName: 'Verified invitee', password: 'fixture-password-12345' }),
      ),
    );
    expect(accepted.map((response) => response.status).sort()).toEqual([201, 401]);
    const session = accepted.find((response) => response.status === 201)!;
    expect(session.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('HttpOnly')]),
    );
    expect(await publicDb.getRepository(db.UserEntity).count()).toBe(userCountBefore + 1);
    expect(
      await publicDb
        .getRepository(db.TenantMembershipEntity)
        .findOneBy({ tenantId: tenant.id, userId: session.body.user.id }),
    ).toMatchObject({ role: 'viewer' });
    expect(
      (await ds.getRepository(db.IssueEntity).findOneByOrFail({ id: issue.id })).reporterId,
    ).toBe(session.body.user.id);
    expect(await ds.getRepository(db.CommentEntity).countBy({ authorId: person.id })).toBe(0);
    expect(smtp.messages).toHaveLength(1);
    expect(await notifications.getWaitingCount()).toBe(0);
    const inviteeCookie = `weaver_token=${session.body.accessToken}`;
    await request(app.getHttpServer())
      .get('/api/v1/issues/GS-1/comments')
      .set('Cookie', inviteeCookie)
      .expect(200);
    // Password reset revokes imported invitees' sessions just like every other account.
    await publicDb.query(
      'UPDATE public.users SET session_version = session_version + 1 WHERE id = $1',
      [session.body.user.id],
    );
    await request(app.getHttpServer())
      .get('/api/v1/issues/GS-1/comments')
      .set('Cookie', inviteeCookie)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/v1/import/status/${job.id}`)
      .set('Cookie', otherCookie)
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/v1/import/people')
      .set('Cookie', ownerCookie)
      .set('x-tenant-id', otherTenant.id)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/import/attachments/${file.id}/visibility`)
      .set('Cookie', otherCookie)
      .send({ audienceId: null })
      .expect(404);
    await publicDb
      .getRepository(db.TenantMembershipEntity)
      .update({ tenantId: tenant.id, userId: owner.id }, { role: 'viewer' });
    await request(app.getHttpServer())
      .get('/api/v1/import/people')
      .set('Cookie', ownerCookie)
      .expect(403);
  });

  it('upgrades a legacy schema with synchronization disabled and preserves existing content', async () => {
    const flow = await ds.getRepository(db.WorkflowEntity).save({ name: 'Legacy workflow' });
    const status = await ds.getRepository(db.WorkflowStatusEntity).save({
      workflowId: flow.id,
      name: fixtureStatuses[0].name,
      category: 'todo',
      color: '#000000',
    });
    const project = await ds.getRepository(db.ProjectEntity).save({
      key: 'GS',
      name: 'Legacy GS',
      workflowId: flow.id,
      leadUserId: owner.id,
      visibility: 'private',
      issueCounter: 1,
    });
    const issue = await ds.getRepository(db.IssueEntity).save({
      projectId: project.id,
      key: 'GS-1',
      summary: 'Fixture issue 1',
      statusId: status.id,
      reporterId: owner.id,
    });
    const comment = await ds
      .getRepository(db.CommentEntity)
      .save({ issueId: issue.id, authorId: owner.id, body: fixtureIssue(1).fields.description! });
    const file = await ds.getRepository(db.AttachmentEntity).save({
      issueId: issue.id,
      uploaderId: owner.id,
      filename: 'file-1.txt',
      mimeType: 'text/plain',
      size: '5',
      storageKey: 'legacy-file',
    });
    await storage.put('legacy-file', Buffer.from('hello'));
    const oldJob = randomUUID();
    await ds.getRepository(db.ImportRecordEntity).save(
      [
        { externalType: 'project', externalId: 'project-1', localId: project.id },
        { externalType: 'issue', externalId: '1', localId: issue.id },
        { externalType: 'comment', externalId: '1-public', localId: comment.id },
        { externalType: 'attachment', externalId: 'file-1', localId: file.id },
      ].map((record) => ({ ...record, importJobId: oldJob, sourceInstance: fixtureSource.url })),
    );
    await ds.query(
      `DROP TABLE "${tenant.schemaName}".imported_people, "${tenant.schemaName}".imported_audiences, "${tenant.schemaName}".imported_resources; ALTER TABLE "${tenant.schemaName}".comments DROP COLUMN source_id, DROP COLUMN visibility, DROP COLUMN parent_comment_id; ALTER TABLE "${tenant.schemaName}".attachments DROP COLUMN source_id, DROP COLUMN visibility; ALTER TABLE "${tenant.schemaName}".projects DROP COLUMN import_quarantined; ALTER TABLE "${tenant.schemaName}".import_jobs DROP COLUMN report;`,
    );
    expect(
      await ds.query(
        'SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3',
        [tenant.schemaName, 'comments', 'visibility'],
      ),
    ).toHaveLength(0);
    const competing = await new DataSource({
      ...publicDb.options,
      schema: tenant.schemaName,
      entities: [...db.TENANT_ENTITIES],
      synchronize: false,
    }).initialize();
    try {
      const migrations = await Promise.allSettled([
        db.runJiraImportMigration(ds, tenant.schemaName),
        db.runJiraImportMigration(competing, tenant.schemaName),
      ]);
      expect(
        migrations.map((result) =>
          result.status === 'fulfilled' ? result.status : result.reason.message,
        ),
      ).toEqual(['fulfilled', 'fulfilled']);
    } finally {
      await competing.destroy();
    }
    const connection = await connections.getConnection(tenant.schemaName);
    expect(connection.options.synchronize).toBe(false);
    expect(
      (await connection.getRepository(db.CommentEntity).findOneByOrFail({ id: comment.id }))
        .visibility?.type,
    ).toBe('unknown');
    expect(
      (await connection.getRepository(db.AttachmentEntity).findOneByOrFail({ id: file.id }))
        .visibility?.type,
    ).toBe('unknown');
    await db.runJiraImportMigration(connection, tenant.schemaName);
    await db.runJiraImportMigration(connection, tenant.schemaName);
    expect(await connection.getRepository(db.CommentEntity).count()).toBe(1);
    expect(await connection.getRepository(db.AttachmentEntity).count()).toBe(1);
    const job = await importViaHttp();
    expect(job.errors).toEqual([]);
    expect(await connection.getRepository(db.IssueEntity).count()).toBe(3);
    expect(
      (await connection.getRepository(db.CommentEntity).findOneByOrFail({ id: comment.id }))
        .authorId,
    ).not.toBe(owner.id);
    expect(
      (await connection.getRepository(db.AttachmentEntity).findOneByOrFail({ id: file.id }))
        .uploaderId,
    ).not.toBe(owner.id);
    const sourceFile = await connection.getRepository(db.ImportedResourceEntity).findOneByOrFail({
      kind: 'attachment',
      externalId: 'file-1',
      sourceInstance: fixtureSource.url,
    });
    expect(sourceFile.payload.sha256).toBe(createHash('sha256').update('hello').digest('hex'));
  });

  it('blocks invitations during an active import, cancels in progress, and safely retries the partial data', async () => {
    fixtureSource.issueCount = 20;
    let entered!: () => void;
    let unblock!: () => void;
    const paused = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const resume = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    releaseInFlight = unblock;
    fixtureSource.onRequest = async (url) => {
      if (url.pathname.endsWith('/issue/2/comment')) {
        entered();
        await resume;
      }
    };
    const queued = await enqueue();
    const done = queued.job.waitUntilFinished(events, 60_000);
    await startWorker();
    await paused;
    const person = (await ds.getRepository(db.ImportedPersonEntity).find())[0];
    await request(app.getHttpServer())
      .post('/api/v1/import/invitations')
      .set('Cookie', ownerCookie)
      .send({
        invitations: [
          {
            personId: person.id,
            email: 'nobody@example.test',
            role: 'viewer',
            projectIds: person.projectIds,
            delivery: 'email',
          },
        ],
      })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/v1/import/jira/cancel/${queued.row.id}`)
      .set('Cookie', ownerCookie)
      .expect(200);
    fixtureSource.onRequest = undefined;
    unblock();
    await done;
    expect(
      (await ds.getRepository(db.ImportJobEntity).findOneByOrFail({ id: queued.row.id })).status,
    ).toBe('cancelled');
    expect(await ds.getRepository(db.IssueEntity).count()).toBeLessThan(20);
    expect((await ds.getRepository(db.ProjectEntity).find())[0].importQuarantined).toBe(true);
    const retried = await importViaHttp();
    expect(retried.errors).toEqual([]);
    expect(await ds.getRepository(db.IssueEntity).count()).toBe(20);
    expect(await ds.getRepository(db.CommentEntity).count()).toBe(60);
    expect(smtp.messages).toHaveLength(0);
    expect(await notifications.getWaitingCount()).toBe(0);
  });

  it('detects damaged and missing destination files on reimport without overwriting local bytes', async () => {
    await importViaHttp();
    const file = (await ds.getRepository(db.AttachmentEntity).find())[0];
    await storage.put(file.storageKey, Buffer.from('other'));
    const damaged = await importViaHttp();
    expect(
      damaged.errors.some(
        (error) => error.itemType === 'attachment' && error.message.includes('differ'),
      ),
    ).toBe(true);
    expect((await storage.get(file.storageKey)).toString()).toBe('other');
    await storage.delete(file.storageKey);
    const missing = await importViaHttp();
    expect(missing.errors.some((error) => error.itemType === 'attachment')).toBe(true);
    expect(await ds.getRepository(db.AttachmentEntity).count()).toBe(1);
    await storage.put(file.storageKey, Buffer.from('hello'));
    expect((await importViaHttp()).errors).toEqual([]);
  });

  it('serializes concurrent imports, releases its lock, and cancels without delivering history', async () => {
    let unblock!: () => void;
    let started!: () => void;
    const held = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    releaseInFlight = unblock;
    fixtureSource.onRequest = async (url) => {
      if (url.pathname.endsWith('/myself')) {
        started();
        await held;
      }
    };
    await startWorker(2);
    const a = await enqueue();
    const finishedA = a.job.waitUntilFinished(events, 60_000);
    await entered;
    const b = await enqueue();
    await expect(b.job.waitUntilFinished(events, 60_000)).rejects.toThrow('Another import');
    expect(
      (await ds.getRepository(db.ImportJobEntity).findOneByOrFail({ id: b.row.id })).status,
    ).toBe('failed');
    fixtureSource.onRequest = undefined;
    unblock();
    await finishedA;
    const c = await enqueue();
    await c.job.waitUntilFinished(events, 60_000);
    expect(await ds.getRepository(db.IssueEntity).count()).toBe(3);
    await worker!.close();
    worker = undefined;
    fixtureSource.requests = [];
    const cancelled = await enqueue('cancelled');
    const finished = cancelled.job.waitUntilFinished(events, 60_000);
    await startWorker();
    await finished;
    expect(
      (await ds.getRepository(db.ImportJobEntity).findOneByOrFail({ id: cancelled.row.id })).status,
    ).toBe('cancelled');
    expect(fixtureSource.requests).toEqual([]);
    expect(smtp.messages).toHaveLength(0);
    expect(await notifications.getWaitingCount()).toBe(0);
  });

  it('rejects a sealed job whose tenant does not own its schema', async () => {
    const row = await ds
      .getRepository(db.ImportJobEntity)
      .save({ source: 'jira_cloud', sourceUrl: fixtureSource.url, status: 'queued' });
    const data = {
      importJobId: row.id,
      tenantId: tenant.id,
      schemaName: otherTenant.schemaName,
      requestedByUserId: owner.id,
      config: credentials,
      projectKeys: ['GS'],
    };
    await expect(
      processImport({
        data: {
          version: 1,
          tenantId: tenant.id,
          importJobId: row.id,
          payload: sealImportJob(data, `${tenant.id}:${row.id}`, process.env.IMPORT_CREDENTIAL_KEY),
        },
      } as never),
    ).rejects.toThrow('Tenant does not match');
    expect(await otherDs.getRepository(db.ProjectEntity).count()).toBe(0);
    expect(fixtureSource.requests).toEqual([]);
  });

  it('reconciles GS-sized data through the real queue and worker without notifications', async () => {
    Object.assign(fixtureSource, {
      issueCount: 2441,
      attachmentCount: 1345,
      workloggedIssues: 1907,
      largeCollections: true,
    });
    const job = await importViaHttp();
    expect(job.errors).toEqual([]);
    expect(job.report.counts).toMatchObject({
      issue: 2441,
      comment: 7523,
      attachment: 1345,
      version: 145,
      component: 3,
      sprint: 3,
      board: 2,
    });
    expect(await ds.getRepository(db.IssueEntity).count()).toBe(2441);
    expect(await ds.getRepository(db.CommentEntity).count()).toBe(7523);
    expect(await ds.getRepository(db.AttachmentEntity).count()).toBe(1345);
    expect(await ds.getRepository(db.ImportedPersonEntity).count()).toBe(30);
    expect(await publicDb.getRepository(db.UserEntity).count()).toBe(userCountBefore);
    expect(
      await publicDb.getRepository(db.TenantMembershipEntity).countBy({ tenantId: tenant.id }),
    ).toBe(2);
    expect(await ds.getRepository(db.ProjectMemberEntity).count()).toBe(1);
    expect(await ds.getRepository(db.NotificationEntity).count()).toBe(0);
    expect(smtp.messages).toHaveLength(0);
    expect(await notifications.getWaitingCount()).toBe(0);
    const files = await ds.getRepository(db.ImportedResourceEntity).findBy({ kind: 'attachment' });
    expect(
      files.every(
        (file) => file.payload.sha256 === createHash('sha256').update('hello').digest('hex'),
      ),
    ).toBe(true);
  }, 600_000);
});
