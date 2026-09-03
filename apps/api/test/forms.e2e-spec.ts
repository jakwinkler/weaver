import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RateLimitingGuard } from '../src/core/rate-limiting';
import { TenantConnectionProvider } from '../src/core/tenant';

describe('External intake forms (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let rateLimitingGuard: RateLimitingGuard;
  let accessToken: string;
  let tenantId: string;
  let formId: string;
  let issueTypeId: string;

  const tenantSlug = 'forms-test-org';
  const projectKey = 'FORM';
  const formSlug = 'support-request';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    dataSource = app.get(DataSource);
    connections = app.get(TenantConnectionProvider);
    rateLimitingGuard = app.get(RateLimitingGuard);

    const registerResponse = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
      email: 'forms-test@example.com',
      password: 'password123',
      displayName: 'Forms Tester',
      orgName: 'Forms Test Org',
      orgSlug: tenantSlug,
    });

    accessToken = registerResponse.body.accessToken;
    tenantId = registerResponse.body.tenantId;

    await authed()
      .post('/api/v1/projects')
      .send({ name: 'Form Intake', key: projectKey })
      .expect(201);
    const issueTypesResponse = await authed().get('/api/v1/issue-types').expect(200);
    issueTypeId = issueTypesResponse.body.find((issueType: any) => issueType.slug === 'bug').id;
    for (const slug of ['requester_email', 'product_area']) {
      await authed().post('/api/v1/custom-fields').send({ name: slug, slug, fieldType: 'text' }).expect(201);
    }
  });

  afterAll(async () => {
    await connections.closeAll();
    await dataSource.query('DROP SCHEMA IF EXISTS "tenant_forms_test_org" CASCADE');
    await dataSource.query(
      `DELETE FROM public.tenant_memberships WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = '${tenantSlug}')`,
    );
    await dataSource.query(`DELETE FROM public.tenants WHERE slug = '${tenantSlug}'`);
    await dataSource.query("DELETE FROM public.users WHERE email = 'forms-test@example.com'");
    await app.close();
  });

  function authed() {
    const withAuth = (verb: 'get' | 'post' | 'patch' | 'delete', url: string) =>
      request(app.getHttpServer())
        [verb](url)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId);

    return {
      get: (url: string) => withAuth('get', url),
      post: (url: string) => withAuth('post', url),
      patch: (url: string) => withAuth('patch', url),
      delete: (url: string) => withAuth('delete', url),
    };
  }

  const validSubmission = (summary = 'Checkout fails on Safari') => ({
    values: {
      summary: summary,
      details: 'The payment button remains disabled after entering a valid card.',
      email: 'reporter@example.com',
      area: 'Checkout',
    },
    website: '',
  });

  it('creates and lists a form', async () => {
    const createResponse = await authed()
      .post(`/api/v1/projects/${projectKey}/forms`)
      .send({
        name: 'Support request',
        slug: formSlug,
        description: 'Tell us what happened and we will investigate.',
        active: true,
        fields: [
          { id: 'summary', type: 'text', label: 'Summary', required: true, mapping: 'summary' },
          {
            id: 'details',
            type: 'textarea',
            label: 'Details',
            required: true,
            mapping: 'description',
          },
          {
            id: 'email',
            type: 'email',
            label: 'Email',
            required: true,
            mapping: 'custom-field',
            customFieldKey: 'requester_email',
          },
          {
            id: 'area',
            type: 'select',
            label: 'Area',
            required: true,
            mapping: 'custom-field',
            customFieldKey: 'product_area',
            options: ['Checkout', 'Catalog'],
          },
        ],
        issueDefaults: { issueTypeId, priority: 'high', labels: ['external', 'support'] },
      })
      .expect(201);

    formId = createResponse.body.id;
    expect(createResponse.body.tenantSlug).toBe(tenantSlug);
    expect(createResponse.body.fields).toHaveLength(4);

    const listResponse = await authed().get(`/api/v1/projects/${projectKey}/forms`).expect(200);
    expect(listResponse.body).toHaveLength(1);
    expect(listResponse.body[0].slug).toBe(formSlug);
  });

  it('returns only public rendering data without authentication', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/public/${tenantSlug}/forms/${formSlug}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        name: 'Support request',
        description: 'Tell us what happened and we will investigate.',
      }),
    );
    expect(response.body.fields).toHaveLength(4);
    expect(response.body.issueDefaults).toBeUndefined();
    expect(response.body.createdBy).toBeUndefined();
  });

  it('creates an issue from a public submission with mapped values and defaults', async () => {
    const submitResponse = await request(app.getHttpServer())
      .post(`/api/v1/public/${tenantSlug}/forms/${formSlug}/submit`)
      .send(validSubmission())
      .expect(201);

    expect(submitResponse.body.issueKey).toBe(`${projectKey}-1`);

    const issueResponse = await authed()
      .get(`/api/v1/issues/${submitResponse.body.issueKey}`)
      .expect(200);
    expect(issueResponse.body).toEqual(
      expect.objectContaining({
        summary: 'Checkout fails on Safari',
        priority: 'high',
        issueTypeId,
        labels: ['external', 'support'],
        customFields: {
          requester_email: 'reporter@example.com',
          product_area: 'Checkout',
        },
      }),
    );
    expect(issueResponse.body.description.content[0].content[0].text).toContain('payment button');

    const submissionsResponse = await authed()
      .get(`/api/v1/projects/${projectKey}/forms/${formId}/submissions`)
      .expect(200);
    expect(submissionsResponse.body[0].issueKey).toBe(`${projectKey}-1`);

    const notificationsResponse = await authed().get('/api/v1/notifications').expect(200);
    expect(notificationsResponse.body.data[0]).toEqual(
      expect.objectContaining({
        type: 'form_submission',
        title: `New form submission: ${projectKey}-1`,
      }),
    );
  });

  it('rejects invalid field values and honeypot submissions', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/public/${tenantSlug}/forms/${formSlug}/submit`)
      .send({
        ...validSubmission(),
        values: { ...validSubmission().values, email: 'not-an-email' },
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/v1/public/${tenantSlug}/forms/${formSlug}/submit`)
      .send({ ...validSubmission(), website: 'https://spam.example.com' })
      .expect(400);
  });

  it('rejects submissions while a form is inactive', async () => {
    const updateResponse = await authed()
      .patch(`/api/v1/projects/${projectKey}/forms/${formId}`)
      .send({ name: 'Customer support request', active: false })
      .expect(200);
    expect(updateResponse.body.active).toBe(false);

    await request(app.getHttpServer())
      .post(`/api/v1/public/${tenantSlug}/forms/${formSlug}/submit`)
      .send(validSubmission())
      .expect(404);

    await authed()
      .patch(`/api/v1/projects/${projectKey}/forms/${formId}`)
      .send({ active: true })
      .expect(200);
  });

  it('limits public submissions to 10 per IP per minute', async () => {
    const guard = rateLimitingGuard as any;
    if (guard.touchedKeys.size) await guard.redis.del(...guard.touchedKeys);
    guard.touchedKeys.clear();

    for (let index = 1; index <= 10; index += 1) {
      await request(app.getHttpServer())
        .post(`/api/v1/public/${tenantSlug}/forms/${formSlug}/submit`)
        .send(validSubmission(`Rate limit submission ${index}`))
        .expect(201);
    }

    await request(app.getHttpServer())
      .post(`/api/v1/public/${tenantSlug}/forms/${formSlug}/submit`)
      .send(validSubmission('Rate limit submission 11'))
      .expect(429);
  });

  it('deletes the form and removes its public endpoint', async () => {
    await authed().delete(`/api/v1/projects/${projectKey}/forms/${formId}`).expect(204);
    const listResponse = await authed().get(`/api/v1/projects/${projectKey}/forms`).expect(200);
    expect(listResponse.body).toEqual([]);

    await request(app.getHttpServer())
      .get(`/api/v1/public/${tenantSlug}/forms/${formSlug}`)
      .expect(404);
  });
});
