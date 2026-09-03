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
      });

    tokenA = resA.body.accessToken;
    tenantId = resA.body.tenantId;
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
      });

    userBId = resB.body.user.id;

    // Add User B to User A's tenant
    await dataSource.query(
      `INSERT INTO public.tenant_memberships (tenant_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
      [tenantId, userBId],
    );

    tokenB = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'mention-b@example.com',
          password: 'password123',
          tenantId,
        })
        .expect(201)
    ).body.accessToken;

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
    await dataSource.query(
      `DELETE FROM public.tenant_memberships WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug IN ('mention-test-org', 'mention-test-org-b'))`,
    );
    await dataSource.query(`DELETE FROM public.tenants WHERE slug IN ('mention-test-org', 'mention-test-org-b')`);
    await dataSource.query(`DELETE FROM public.users WHERE email IN ('mention-a@example.com', 'mention-b@example.com')`);
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
  });

  describe('Mention Notifications', () => {
    let issueKey: string;

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
      const commentBody = {
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

      await authedA()
        .post(`/api/v1/issues/${issueKey}/comments`)
        .send({ body: commentBody })
        .expect(201);

      // Check notifications for User B
      const notifRes = await authedB().get('/api/v1/notifications').expect(200);
      const mentions = (notifRes.body.items || notifRes.body.data || []).filter(
        (n: any) => n.type === 'mention',
      );
      expect(mentions.length).toBeGreaterThanOrEqual(1);
      expect(mentions[0].title).toContain(issueKey);
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
      const beforeMentions = (beforeRes.body.items || beforeRes.body.data || []).filter(
        (n: any) => n.type === 'mention',
      );

      await authedA()
        .post(`/api/v1/issues/${issueKey}/comments`)
        .send({ body: commentBody })
        .expect(201);

      const afterRes = await authedA().get('/api/v1/notifications').expect(200);
      const afterMentions = (afterRes.body.items || afterRes.body.data || []).filter(
        (n: any) => n.type === 'mention',
      );

      // Should not have new mention notifications
      expect(afterMentions.length).toBe(beforeMentions.length);
    });
  });
});
