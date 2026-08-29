import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

describe('Mentions (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;

  // User A (author)
  let tokenA: string;
  let tenantId: string;
  let userAId: string;

  // User B (to be mentioned)
  let tokenB: string;
  let userBId: string;

  // User C belongs to another tenant and must never be suggested or notified.
  let userCId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    dataSource = app.get(DataSource);
    connections = app.get(TenantConnectionProvider);

    // Register User A (creates tenant)
    const resA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'mention-a@example.com',
        password: 'password123',
        displayName: 'Alice Mention',
        orgName: 'Mention Test Org',
        orgSlug: 'mention-test-org',
      })
      .expect(201);

    tokenA = resA.body.accessToken;
    tenantId = resA.body.tenant?.id ?? resA.body.tenantId;
    userAId = resA.body.user.id;

    // Register User B (separate tenant, then add to tenant A)
    const resB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'mention-b@example.com',
        password: 'password123',
        displayName: 'Bob Mentioned',
        orgName: 'Mention Test Org B',
        orgSlug: 'mention-test-org-b',
      })
      .expect(201);

    tokenB = resB.body.accessToken;
    userBId = resB.body.user.id;

    const resC = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'mention-c@example.com',
        password: 'password123',
        displayName: 'Outside Collaborator',
        orgName: 'Mention Test Org C',
        orgSlug: 'mention-test-org-c',
      })
      .expect(201);

    userCId = resC.body.user.id;

    // Add User B to User A's tenant
    await dataSource.query(
      `INSERT INTO public.tenant_memberships (tenant_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
      [tenantId, userBId],
    );

    // Create workflow + initial status for the tenant
    const wfRes = await request(app.getHttpServer())
      .post('/api/v1/workflows')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Tenant-ID', tenantId)
      .send({ name: 'Mention Default WF', isDefault: true });
    await request(app.getHttpServer())
      .post(`/api/v1/workflows/${wfRes.body.id}/statuses`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Tenant-ID', tenantId)
      .send({ name: 'Open', category: 'todo', color: '#22c55e', isInitial: true })
      .expect(201);

    // Create a project
    await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Tenant-ID', tenantId)
      .send({ name: 'Mention Project', key: 'MNT' })
      .expect(201);
  });

  afterAll(async () => {
    await dataSource.query(`DROP SCHEMA IF EXISTS "tenant_mention_test_org" CASCADE`);
    await dataSource.query(`DROP SCHEMA IF EXISTS "tenant_mention_test_org_b" CASCADE`);
    await dataSource.query(`DROP SCHEMA IF EXISTS "tenant_mention_test_org_c" CASCADE`);
    await dataSource.query(
      `DELETE FROM public.tenant_memberships WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug IN ('mention-test-org', 'mention-test-org-b', 'mention-test-org-c'))`,
    );
    await dataSource.query(
      `DELETE FROM public.tenants WHERE slug IN ('mention-test-org', 'mention-test-org-b', 'mention-test-org-c')`,
    );
    await dataSource.query(
      `DELETE FROM public.users WHERE email IN ('mention-a@example.com', 'mention-b@example.com', 'mention-c@example.com')`,
    );
    await connections.closeAll();
    await app.close();
  });

  const authedA = () => ({
    get: (url: string) =>
      request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Tenant-ID', tenantId),
    post: (url: string) =>
      request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Tenant-ID', tenantId),
    patch: (url: string) =>
      request(app.getHttpServer())
        .patch(url)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Tenant-ID', tenantId),
  });

  const authedB = () => ({
    get: (url: string) =>
      request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Tenant-ID', tenantId),
  });

  describe('User Search', () => {
    it('GET /users/search?q=ali - should return matching users', async () => {
      const res = await authedA().get('/api/v1/users/search?q=Ali').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].displayName).toContain('Alice');
      expect(Object.keys(res.body[0]).sort()).toEqual(
        ['avatarUrl', 'displayName', 'email', 'id'].sort(),
      );
    });

    it('GET /users/search?q=bob - should return Bob', async () => {
      const res = await authedA().get('/api/v1/users/search?q=Bob').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].displayName).toContain('Bob');
    });

    it('GET /users/search?q=zzz - should return empty', async () => {
      const res = await authedA().get('/api/v1/users/search?q=zzz').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });

    it('GET /users/search is tenant-scoped and supports an empty typeahead query', async () => {
      const allMembers = await authedA().get('/api/v1/users/search?q=').expect(200);
      expect(allMembers.body.some((user: { id: string }) => user.id === userAId)).toBe(true);
      expect(allMembers.body.some((user: { id: string }) => user.id === userBId)).toBe(true);
      expect(allMembers.body).toHaveLength(2);

      const outside = await authedA().get('/api/v1/users/search?q=Outside').expect(200);
      expect(outside.body).toEqual([]);
    });
  });

  describe('Mention Notifications', () => {
    let issueKey: string;
    let mentionedCommentId: string;
    let mentionedCommentBody: Record<string, unknown>;

    beforeAll(async () => {
      // Create an issue
      const res = await authedA()
        .post('/api/v1/projects/MNT/issues')
        .send({ summary: 'Mention test issue' })
        .expect(201);
      issueKey = res.body.key;
      expect(issueKey).toBeDefined();
    });

    it('POST comment with mention → should create notification for mentioned user', async () => {
      mentionedCommentBody = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Hey ' },
              {
                type: 'mention',
                attrs: { id: userBId, label: 'Bob Mentioned' },
              },
              { type: 'text', text: ' check this out' },
            ],
          },
        ],
      };

      const commentRes = await authedA()
        .post(`/api/v1/issues/${issueKey}/comments`)
        .send({ body: mentionedCommentBody })
        .expect(201);
      mentionedCommentId = commentRes.body.id;

      // Check notifications for User B
      const notifRes = await authedB().get('/api/v1/notifications').expect(200);
      expect(notifRes.body.meta).toMatchObject({ page: 1, perPage: 20 });
      const mentions = notifRes.body.data.filter((n: any) => n.type === 'mention');
      expect(mentions.length).toBeGreaterThanOrEqual(1);
      expect(mentions[0].title).toContain(issueKey);
      expect(mentions[0].data).toEqual({ issueKey, commentId: mentionedCommentId });
    });

    it('PATCH comment with the same mention does not notify the user again', async () => {
      const beforeRes = await authedB().get('/api/v1/notifications').expect(200);
      const beforeMentions = beforeRes.body.data.filter(
        (notification: { type: string }) => notification.type === 'mention',
      );

      await authedA()
        .patch(`/api/v1/issues/${issueKey}/comments/${mentionedCommentId}`)
        .send({ body: mentionedCommentBody })
        .expect(200);

      const afterRes = await authedB().get('/api/v1/notifications').expect(200);
      const afterMentions = afterRes.body.data.filter(
        (notification: { type: string }) => notification.type === 'mention',
      );
      expect(afterMentions).toHaveLength(beforeMentions.length);
    });

    it('does not create notifications for users outside the tenant', async () => {
      await authedA()
        .post(`/api/v1/issues/${issueKey}/comments`)
        .send({
          body: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'mention',
                    attrs: { id: userCId, label: 'Outside Collaborator' },
                  },
                ],
              },
            ],
          },
        })
        .expect(201);

      const rows = await dataSource.query(
        `SELECT id FROM "tenant_mention_test_org".notifications WHERE user_id = $1 AND type = 'mention'`,
        [userCId],
      );
      expect(rows).toEqual([]);
    });

    it('Self-mention → should NOT create notification for author', async () => {
      const commentBody = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'mention',
                attrs: { id: userAId, label: 'Alice Mention' },
              },
              { type: 'text', text: ' self-referencing' },
            ],
          },
        ],
      };

      // Get current notification count for User A
      const beforeRes = await authedA().get('/api/v1/notifications').expect(200);
      const beforeMentions = beforeRes.body.data.filter((n: any) => n.type === 'mention');

      await authedA()
        .post(`/api/v1/issues/${issueKey}/comments`)
        .send({ body: commentBody })
        .expect(201);

      const afterRes = await authedA().get('/api/v1/notifications').expect(200);
      const afterMentions = afterRes.body.data.filter((n: any) => n.type === 'mention');

      // Should not have new mention notifications
      expect(afterMentions.length).toBe(beforeMentions.length);
    });
  });
});
