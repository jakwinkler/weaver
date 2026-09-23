import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';
import { getAttachmentStorageDirectory } from '../src/modules/attachments/attachment-storage';

describe('Tenant request security (e2e)', () => {
  const tenants = [
    {
      email: 'tenant-security-a@example.com',
      orgName: 'Tenant Security A',
      orgSlug: 'tenant-security-a',
      schemaName: 'tenant_tenant_security_a',
    },
    {
      email: 'tenant-security-b@example.com',
      orgName: 'Tenant Security B',
      orgSlug: 'tenant-security-b',
      schemaName: 'tenant_tenant_security_b',
    },
  ];

  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let tenantAId: string;
  let tenantBId: string;
  let tenantAToken: string;
  const uploadedStorageKeys: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    dataSource = app.get(DataSource);
    connections = app.get(TenantConnectionProvider);

    const registrations = await Promise.all(
      tenants.map((tenant) =>
        request(app.getHttpServer())
          .post('/api/v1/auth/register')
          .send({
            email: tenant.email,
            password: 'password123',
            displayName: tenant.orgName,
            orgName: tenant.orgName,
            orgSlug: tenant.orgSlug,
          })
          .expect(201),
      ),
    );

    tenantAId = registrations[0].body.tenantId;
    tenantAToken = registrations[0].body.accessToken;
    tenantBId = registrations[1].body.tenantId;
  });

  afterAll(async () => {
    for (const storageKey of uploadedStorageKeys) {
      const filePath = path.join(getAttachmentStorageDirectory(), storageKey);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    for (const tenant of tenants) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${tenant.schemaName}" CASCADE`);
    }
    await dataSource.query(
      `DELETE FROM public.tenant_memberships
       WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = ANY($1))`,
      [tenants.map((tenant) => tenant.orgSlug)],
    );
    await dataSource.query(
      `DELETE FROM public.tenants WHERE slug = ANY($1)`,
      [tenants.map((tenant) => tenant.orgSlug)],
    );
    await dataSource.query(
      `DELETE FROM public.users WHERE email = ANY($1)`,
      [tenants.map((tenant) => tenant.email)],
    );
    await connections.closeAll();
    await app.close();
  });

  it('rejects a tenant header that differs from the verified JWT tenant', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/projects')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .set('X-Tenant-ID', tenantBId)
      .expect(403);
  });

  it('resolves tenant context from a verified bearer token', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/projects')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .expect(200);

    expect(response.body).toEqual({
      data: [],
      meta: { page: 1, perPage: 50, total: 0, totalPages: 0 },
    });
    expect(tenantAId).not.toBe(tenantBId);
  });

  it('allocates unique issue keys across concurrent creates', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .send({ key: 'SEC', name: 'Security Regression Project' })
      .expect(201);

    const responses = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        request(app.getHttpServer())
          .post('/api/v1/projects/SEC/issues')
          .set('Authorization', `Bearer ${tenantAToken}`)
          .send({ summary: `Concurrent issue ${index + 1}` }),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual(
      Array(12).fill(201),
    );
    expect(new Set(responses.map((response) => response.body.key)).size).toBe(12);
  });

  it('stores uploads under opaque keys and forces potentially active content to download', async () => {
    const upload = await request(app.getHttpServer())
      .post('/api/v1/attachments/upload')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .attach('file', Buffer.from('<script>document.cookie</script>'), {
        filename: '../../evil.html',
        contentType: 'text/html',
      })
      .expect(201);

    uploadedStorageKeys.push(upload.body.storageKey);
    expect(upload.body.storageKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const download = await request(app.getHttpServer())
      .get(`/api/v1/attachments/${upload.body.id}/download`)
      .set('Authorization', `Bearer ${tenantAToken}`)
      .expect(200);

    expect(download.headers['content-disposition']).toMatch(/^attachment;/);
    expect(download.headers['content-type']).toMatch(/^application\/octet-stream/);
    expect(download.headers['content-security-policy']).toBe("sandbox; default-src 'none'");
    expect(download.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejects uploads over the configured size limit', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/attachments/upload')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .attach('file', Buffer.alloc(1025), { filename: 'too-large.bin' });

    if (response.body.storageKey) {
      uploadedStorageKeys.push(response.body.storageKey);
    }
    expect(response.status).toBe(413);
  });
});
