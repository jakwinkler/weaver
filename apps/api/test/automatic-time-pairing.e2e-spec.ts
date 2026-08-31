import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

describe('Automatic Time Phase 3 companion pairing (e2e)', () => {
  jest.setTimeout(30_000);

  const pluginId = '@weaver/plugin-automatic-time';
  const pluginRouteId = '@weaver~plugin-automatic-time';
  const email = 'automatic-time-pairing-e2e@example.com';
  const tenantSlug = 'automatic-time-pairing-e2e';
  const schemaName = 'tenant_automatic_time_pairing_e2e';
  const localDate = '2026-08-29';

  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let accessToken: string;
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    dataSource = app.get(DataSource);
    connections = app.get(TenantConnectionProvider);
    await cleanupTestData();

    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'password123',
        displayName: 'Automatic Time Pairing Tester',
        orgName: 'Automatic Time Pairing E2E',
        orgSlug: tenantSlug,
      })
      .expect(201);

    accessToken = registration.body.accessToken;
    tenantId = registration.body.tenant.id;
    userId = registration.body.user.id;

    await authedRequest().post('/api/v1/plugins/install').send({ pluginId }).expect(201);
    await authedRequest().post('/api/v1/plugins/enable').send({ pluginId }).expect(201);
  });

  afterAll(async () => {
    if (connections) await connections.closeAll();
    if (dataSource?.isInitialized) await cleanupTestData();
    if (app) await app.close();
  });

  async function cleanupTestData(): Promise<void> {
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await dataSource.query(
      `DELETE FROM public.installed_plugins
        WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = $1)`,
      [tenantSlug],
    );
    await dataSource.query(
      `DELETE FROM public.tenant_memberships
        WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = $1)`,
      [tenantSlug],
    );
    await dataSource.query('DELETE FROM public.tenants WHERE slug = $1', [tenantSlug]);
    await dataSource.query('DELETE FROM public.users WHERE email = $1', [email]);
  }

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
  });

  const companionRequest = () => ({
    post: (url: string) => request(app.getHttpServer()).post(url).set('X-Tenant-ID', tenantId),
  });

  const deviceRequest = (token: string) => ({
    get: (url: string) =>
      request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', tenantId)
        .set('X-Companion-Version', '0.1.1'),
    post: (url: string) =>
      request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', tenantId)
        .set('X-Companion-Version', '0.1.1'),
  });

  const browserRoute = (path: string) => `/api/v1/plugin-routes/${pluginRouteId}${path}`;
  const companionRoute = (path: string) =>
    `/api/v1/plugin-companion-routes/${pluginRouteId}${path}`;

  async function pairDevice(displayName: string): Promise<{
    deviceId: string;
    deviceToken: string;
  }> {
    const pairing = await companionRequest()
      .post(companionRoute('/pairing/requests'))
      .send({
        displayName,
        platform: 'macos',
        companionVersion: '0.1.0',
      })
      .expect(201);

    expect(pairing.body).toEqual(
      expect.objectContaining({
        pairingCode: expect.any(String),
        userCode: expect.stringMatching(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/),
        verificationUri: expect.stringContaining('/apps/automatic-time/settings?pairing='),
        expiresAt: expect.any(String),
        intervalSeconds: 2,
      }),
    );

    const storedPairing = await dataSource.query(
      `SELECT code_hash, status
         FROM "${schemaName}".automatic_time_pairing_requests
        WHERE user_code = $1`,
      [pairing.body.userCode],
    );
    expect(storedPairing[0]).toEqual(
      expect.objectContaining({ code_hash: expect.any(String), status: 'pending' }),
    );
    expect(storedPairing[0].code_hash).not.toBe(pairing.body.pairingCode);

    const approvalDetails = await authedRequest()
      .get(browserRoute(`/pairing/requests/${pairing.body.userCode}`))
      .expect(200);
    expect(approvalDetails.body).toEqual(
      expect.objectContaining({
        displayName,
        platform: 'macos',
        companionVersion: '0.1.0',
        status: 'pending',
        requestedScopes: expect.arrayContaining([
          'automatic-time:candidates:read',
          'automatic-time:drafts:write',
          'automatic-time:device:heartbeat',
        ]),
      }),
    );

    await authedRequest()
      .post(browserRoute(`/pairing/requests/${pairing.body.userCode}/approve`))
      .expect(200);

    const exchange = await companionRequest()
      .post(companionRoute('/pairing/exchange'))
      .send({ pairingCode: pairing.body.pairingCode })
      .expect(201);
    expect(exchange.body).toEqual(
      expect.objectContaining({
        deviceId: expect.any(String),
        deviceToken: expect.any(String),
        expiresAt: expect.any(String),
        scopes: expect.arrayContaining(['automatic-time:drafts:write']),
      }),
    );

    await companionRequest()
      .post(companionRoute('/pairing/exchange'))
      .send({ pairingCode: pairing.body.pairingCode })
      .expect(409);

    const storedDevice = await dataSource.query(
      `SELECT token_hash, user_id, revoked_at
         FROM "${schemaName}".automatic_time_devices
        WHERE id = $1::uuid`,
      [exchange.body.deviceId],
    );
    expect(storedDevice[0].token_hash).not.toBe(exchange.body.deviceToken);
    expect(storedDevice[0].user_id).toBe(userId);
    expect(storedDevice[0].revoked_at).toBeNull();

    return exchange.body;
  }

  it('pairs a scoped device, syncs a derived draft, and revokes access immediately', async () => {
    const project = await authedRequest()
      .post('/api/v1/projects')
      .send({ name: 'Automatic Time Pairing', key: 'APG' })
      .expect(201);
    const issue = await authedRequest()
      .post(`/api/v1/projects/${project.body.key}/issues`)
      .send({ summary: 'Pair the Automatic Time companion', assigneeId: userId })
      .expect(201);

    const paired = await pairDevice("Matt's Mac");

    const status = await deviceRequest(paired.deviceToken)
      .get(companionRoute('/device/status'))
      .expect(200);
    expect(status.body).toEqual(
      expect.objectContaining({
        deviceId: paired.deviceId,
        displayName: "Matt's Mac",
        companionVersion: '0.1.1',
        status: 'active',
      }),
    );

    const candidates = await deviceRequest(paired.deviceToken)
      .get(companionRoute('/device/issue-candidates'))
      .expect(200);
    expect(candidates.body).toEqual([
      expect.objectContaining({ key: issue.body.key, summary: issue.body.summary }),
    ]);

    const sync = await deviceRequest(paired.deviceToken)
      .post(companionRoute('/device/drafts'))
      .send({
        drafts: [
          {
            sourceReference: 'paired-synthetic-draft',
            localDate,
            startedAt: '2026-08-29T15:00:00.000Z',
            endedAt: '2026-08-29T15:30:00.000Z',
            proposedMinutes: 30,
            description: 'Synthetic derived draft from paired companion',
            confidence: 0.98,
            assignmentMethod: 'exact-issue-key',
            assignmentReasons: ['Synthetic branch metadata contained APG-1'],
            evidenceDigest: 'sha256:paired-synthetic-draft',
            issueKey: issue.body.key,
          },
        ],
      })
      .expect(201);
    expect(sync.body).toEqual([
      expect.objectContaining({
        sourceReference: 'paired-synthetic-draft',
        issueKey: issue.body.key,
        proposedMinutes: 30,
      }),
    ]);

    await deviceRequest(paired.deviceToken)
      .post(companionRoute('/device/drafts'))
      .send({
        drafts: [
          {
            sourceReference: 'raw-signal-rejected',
            localDate,
            startedAt: '2026-08-29T16:00:00.000Z',
            endedAt: '2026-08-29T16:05:00.000Z',
            proposedMinutes: 5,
            description: 'Must not sync',
            confidence: 0,
            assignmentMethod: 'unassigned',
            assignmentReasons: [],
            evidenceDigest: 'sha256:raw-signal-rejected',
            windowTitle: 'Raw window titles cannot cross the companion boundary',
          },
        ],
      })
      .expect(400);

    await deviceRequest(paired.deviceToken)
      .post(companionRoute(`/review/${localDate}/release`))
      .send({ idempotencyKey: 'device-cannot-release' })
      .expect(404);

    await authedRequest()
      .post(browserRoute(`/review/${localDate}/release`))
      .send({ idempotencyKey: 'browser-release-for-retention' })
      .expect(200);
    const releasedDays = await deviceRequest(paired.deviceToken)
      .get(companionRoute('/device/released-days'))
      .expect(200);
    expect(releasedDays.body).toEqual([
      expect.objectContaining({ localDate, releasedAt: expect.any(String) }),
    ]);

    await request(app.getHttpServer())
      .get('/api/v1/projects')
      .set('Authorization', `Bearer ${paired.deviceToken}`)
      .set('X-Tenant-ID', tenantId)
      .expect(401);

    const devices = await authedRequest().get(browserRoute('/devices')).expect(200);
    expect(devices.body).toEqual([
      expect.objectContaining({
        id: paired.deviceId,
        displayName: "Matt's Mac",
        companionVersion: '0.1.1',
        status: 'active',
        lastSeenAt: expect.any(String),
      }),
    ]);

    await dataSource.query(
      `UPDATE "${schemaName}".automatic_time_devices
          SET scopes = '["automatic-time:device:heartbeat"]'::jsonb
        WHERE id = $1::uuid`,
      [paired.deviceId],
    );
    await deviceRequest(paired.deviceToken)
      .get(companionRoute('/device/issue-candidates'))
      .expect(403);

    await authedRequest()
      .post(browserRoute(`/devices/${paired.deviceId}/revoke`))
      .expect(200);
    await deviceRequest(paired.deviceToken).get(companionRoute('/device/status')).expect(401);
  });

  it('rejects expired pairing requests and expired device credentials', async () => {
    const expiredPairing = await companionRequest()
      .post(companionRoute('/pairing/requests'))
      .send({
        displayName: 'Expired Pairing Mac',
        platform: 'macos',
        companionVersion: '0.1.0',
      })
      .expect(201);
    await dataSource.query(
      `UPDATE "${schemaName}".automatic_time_pairing_requests
          SET expires_at = now() - interval '1 minute'
        WHERE user_code = $1`,
      [expiredPairing.body.userCode],
    );
    await authedRequest()
      .post(browserRoute(`/pairing/requests/${expiredPairing.body.userCode}/approve`))
      .expect(410);

    const expiredDevice = await pairDevice('Expired Credential Mac');
    await dataSource.query(
      `UPDATE "${schemaName}".automatic_time_devices
          SET expires_at = now() - interval '1 minute'
        WHERE id = $1::uuid`,
      [expiredDevice.deviceId],
    );
    await deviceRequest(expiredDevice.deviceToken)
      .get(companionRoute('/device/status'))
      .expect(401);
  });
});
