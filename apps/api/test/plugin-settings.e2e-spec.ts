import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import type { PluginManifest } from '@weaver/sdk';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';
import { PluginLoaderService } from '../src/plugins/plugin-loader.service';

describe('Plugin settings (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let accessToken: string;
  let tenantId: string;

  const pluginId = '@weaver/plugin-repository';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    dataSource = app.get(DataSource);
    connections = app.get(TenantConnectionProvider);

    const loader = app.get(PluginLoaderService);
    const originalGetManifest = loader.getManifest.bind(loader);
    jest.spyOn(loader, 'getManifest').mockImplementation((requestedPluginId) => {
      const manifest = originalGetManifest(requestedPluginId);
      if (!manifest || requestedPluginId !== pluginId) return manifest;

      return {
        ...manifest,
        migrations: [],
        settings: {
          schema: {
            ...manifest.settings?.schema,
            workspaceName: {
              type: 'string',
              label: 'Workspace name',
              required: true,
            },
            refreshInterval: {
              type: 'number',
              default: 15,
              description: 'Minutes between repository refreshes',
            },
          },
        },
      } satisfies PluginManifest;
    });
    jest.spyOn(loader, 'getModule').mockResolvedValue({
      onInstall: async () => undefined,
    });

    const res = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
      email: 'plugin-settings-test@example.com',
      password: 'password123',
      displayName: 'Plugin Settings Tester',
      orgName: 'Plugin Settings Test Org',
      orgSlug: 'plugin-settings-test-org',
    });

    accessToken = res.body.accessToken;
    tenantId = res.body.tenant.id;

    await authedRequest().post('/api/v1/plugins/install').send({ pluginId }).expect(201);
  });

  afterAll(async () => {
    await dataSource.query(`DROP SCHEMA IF EXISTS "tenant_plugin_settings_test_org" CASCADE`);
    await dataSource.query(
      `DELETE FROM public.tenant_memberships WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'plugin-settings-test-org')`,
    );
    await dataSource.query(
      `DELETE FROM public.installed_plugins WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'plugin-settings-test-org')`,
    );
    await dataSource.query(`DELETE FROM public.tenants WHERE slug = 'plugin-settings-test-org'`);
    await dataSource.query(
      `DELETE FROM public.users WHERE email = 'plugin-settings-test@example.com'`,
    );
    await connections.closeAll();
    await app.close();
  });

  const authedRequest = () => ({
    get: (url: string) =>
      request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId),
    post: (url: string) =>
      request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId),
    patch: (url: string) =>
      request(app.getHttpServer())
        .patch(url)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId),
  });

  it('merges manifest defaults when settings have not been changed', async () => {
    const res = await authedRequest()
      .get(`/api/v1/plugins/settings?pluginId=${encodeURIComponent(pluginId)}`)
      .expect(200);

    expect(res.body).toEqual({
      defaultProvider: 'github',
      refreshInterval: 15,
    });
  });

  it('rejects missing required settings with a field-specific error', async () => {
    const res = await authedRequest()
      .patch('/api/v1/plugins/settings')
      .send({ pluginId, settings: { refreshInterval: 20 } })
      .expect(400);

    expect(res.body.errors).toEqual({
      workspaceName: 'Workspace name is required',
    });
  });

  it('updates valid settings and returns the merged values', async () => {
    await authedRequest()
      .patch('/api/v1/plugins/settings')
      .send({
        pluginId,
        settings: {
          workspaceName: 'Product engineering',
          defaultProvider: 'gitlab',
          refreshInterval: 30,
        },
      })
      .expect(200);

    const res = await authedRequest()
      .get(`/api/v1/plugins/settings?pluginId=${encodeURIComponent(pluginId)}`)
      .expect(200);

    expect(res.body).toEqual({
      defaultProvider: 'gitlab',
      refreshInterval: 30,
      workspaceName: 'Product engineering',
    });
  });

  it('does not store explicit overrides that match manifest defaults', async () => {
    const res = await authedRequest()
      .patch('/api/v1/plugins/settings')
      .send({
        pluginId,
        settings: { defaultProvider: 'github', refreshInterval: 15 },
      })
      .expect(200);

    expect(res.body.settings).toEqual({
      workspaceName: 'Product engineering',
    });
  });

  it('rejects an invalid number with a field-specific error', async () => {
    const res = await authedRequest()
      .patch('/api/v1/plugins/settings')
      .send({ pluginId, settings: { refreshInterval: 'often' } })
      .expect(400);

    expect(res.body.message).toBe('Invalid plugin settings');
    expect(res.body.errors).toEqual({
      refreshInterval: 'Refresh interval must be a number',
    });
  });
});
