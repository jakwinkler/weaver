import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus, INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';
import { WeaverGateway } from '../src/core/websocket';
import { WebhooksService } from '../src/modules/webhooks';

describe('Real-Time WebSocket (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let accessToken: string;
  let tenantId: string;
  let userId: string;
  let gateway: WeaverGateway;
  let httpServer: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');

    httpServer = app.getHttpServer();
    dataSource = app.get(DataSource);
    connections = app.get(TenantConnectionProvider);
    gateway = app.get(WeaverGateway);

    // Register a user to get auth token and tenant
    const res = await request(httpServer).post('/api/v1/auth/register').send({
      email: 'ws-test@example.com',
      password: 'password123',
      displayName: 'WS Tester',
      orgName: 'WS Test Org',
      orgSlug: 'ws-test-org',
    });

    accessToken = res.body.accessToken;
    tenantId = res.body.tenantId;
    userId = res.body.user.id;
    await request(httpServer)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Tenant-ID', tenantId)
      .send({ key: 'WS', name: 'WS Test Project' })
      .expect(201);
  });

  afterAll(async () => {
    await dataSource.query(`DROP SCHEMA IF EXISTS "tenant_ws_test_org" CASCADE`);
    await dataSource.query(
      `DELETE FROM public.tenant_memberships WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'ws-test-org')`,
    );
    await dataSource.query(`DELETE FROM public.tenants WHERE slug = 'ws-test-org'`);
    await dataSource.query(`DELETE FROM public.users WHERE email = 'ws-test@example.com'`);
    await connections.closeAll();
    await app.close();
  });

  function getWsUrl(): string {
    const addr = httpServer.address();
    return `http://127.0.0.1:${addr.port}/ws`;
  }

  function connectSocket(token?: string): Socket {
    return io(getWsUrl(), {
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
  }

  /**
   * Wait for socket to stabilize. Socket.IO connects at transport level first,
   * then the gateway may disconnect the client. We wait for connect, then check
   * if a disconnect follows shortly after.
   */
  function waitForStableConnection(socket: Socket, timeoutMs = 3000): Promise<boolean> {
    return new Promise((resolve) => {
      let connected = false;
      let disconnected = false;

      const timer = setTimeout(() => {
        // If we connected and never disconnected, connection is stable
        resolve(connected && !disconnected);
      }, timeoutMs);

      socket.on('connect', () => {
        connected = true;
      });

      socket.on('disconnect', () => {
        disconnected = true;
        clearTimeout(timer);
        resolve(false);
      });

      socket.on('connect_error', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
  }

  describe('Authentication', () => {
    it('should disconnect clients without a token', async () => {
      const socket = connectSocket();
      const stable = await waitForStableConnection(socket, 2000);
      socket.close();
      expect(stable).toBe(false);
    });

    it('should disconnect clients with an invalid token', async () => {
      const socket = connectSocket('invalid-jwt-token');
      const stable = await waitForStableConnection(socket, 2000);
      socket.close();
      expect(stable).toBe(false);
    });

    it('should connect and stay connected with a valid token', async () => {
      const socket = connectSocket(accessToken);
      const stable = await waitForStableConnection(socket, 2000);
      socket.close();
      expect(stable).toBe(true);
    });

    it('should scope project rooms to the authenticated tenant', async () => {
      const socket = connectSocket(accessToken);
      const stable = await waitForStableConnection(socket, 2000);
      expect(stable).toBe(true);

      const subscription = await socket
        .timeout(3000)
        .emitWithAck('join:project', { projectKey: 'WS' });
      expect(subscription.joined).toBe(true);

      const room = gateway.server.adapter.rooms.get(`tenant:${tenantId}:project:WS`);
      expect(room?.has(socket.id!)).toBe(true);
      socket.close();
    });
  });

  describe('Events', () => {
    let projectKey: string;
    let projectId: string;

    beforeAll(async () => {
      // Reuse the project created before the room authorization tests.
      const createProjectRes = await request(httpServer)
        .get('/api/v1/projects/WS')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId)
        .expect(200);

      projectKey = createProjectRes.body.key;
      projectId = createProjectRes.body.id;

      // Create a default workflow and status
      const wfRes = await request(httpServer)
        .post('/api/v1/workflows')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId)
        .send({ name: 'WS Default Workflow', isDefault: true });

      await request(httpServer)
        .post(`/api/v1/workflows/${wfRes.body.id}/statuses`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId)
        .send({
          name: 'Open',
          category: 'todo',
          color: '#64748b',
          isInitial: true,
        });
    });

    /** Helper: connect, listen for event, run action, return payload */
    async function waitForEvent(
      eventName: string,
      action: () => Promise<void>,
      timeoutMs = 8000,
    ): Promise<any> {
      const socket = connectSocket(accessToken);

      // Wait for stable connection first
      const stable = await waitForStableConnection(socket, 2000);
      if (!stable) {
        socket.close();
        throw new Error('Socket did not connect');
      }

      const subscription = await socket.timeout(3000).emitWithAck('join:project', { projectKey });
      if (!subscription?.joined) {
        socket.close();
        throw new Error(`Socket was not authorized for project ${projectKey}`);
      }

      const domainEvents: unknown[] = [];
      socket.onAny((name, payload) => {
        if (name !== 'project:invalidate') domainEvents.push({ name, payload });
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      const invalidation = new Promise((resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`No invalidation after ${eventName}`)),
          timeoutMs,
        );
        socket.on('project:invalidate', resolve);
      });
      try {
        const [payload] = await Promise.all([invalidation, action()]);
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(payload).toEqual({ projectKey });
        expect(domainEvents).toEqual([]);
      } finally {
        clearTimeout(timer);
        socket.close();
      }
    }

    it('should invalidate the project after issue.created: creating an issue', async () => {
      await waitForEvent('issue.created', async () => {
        await request(httpServer)
          .post(`/api/v1/projects/${projectKey}/issues`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .send({ summary: 'Real-time test issue' });
      });
    }, 15000);

    it('should invalidate the project after issue.updated: updating an issue', async () => {
      // Create an issue first
      const issueRes = await request(httpServer)
        .post(`/api/v1/projects/${projectKey}/issues`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId)
        .send({ summary: 'Update test issue' });

      const issueKey = issueRes.body.key;

      await waitForEvent('issue.updated', async () => {
        await request(httpServer)
          .patch(`/api/v1/issues/${issueKey}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .send({ summary: 'Updated summary' });
      });
    }, 15000);

    it('should invalidate the project after comment.created: adding a comment', async () => {
      // Create an issue first
      const issueRes = await request(httpServer)
        .post(`/api/v1/projects/${projectKey}/issues`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId)
        .send({ summary: 'Comment test issue' });

      const issueKey = issueRes.body.key;

      await waitForEvent('comment.created', async () => {
        await request(httpServer)
          .post(`/api/v1/issues/${issueKey}/comments`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .send({
            body: {
              type: 'doc',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Test comment' }] }],
            },
          });
      });
    }, 15000);

    it('should queue new comments for a webhook saved with the retired comment.added name', async () => {
      const webhook = await request(httpServer)
        .post('/api/v1/webhooks')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId)
        .send({
          url: 'https://example.com/legacy-comments',
          events: ['comment.added'],
          secret: 'legacy-comment-secret-legacy-comment',
        })
        .expect(201);
      const enqueue = jest.spyOn(app.get(WebhooksService), 'enqueue');
      try {
        const issueRes = await request(httpServer)
          .post(`/api/v1/projects/${projectKey}/issues`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .send({ summary: 'Legacy webhook comment' })
          .expect(201);
        const comment = await request(httpServer)
          .post(`/api/v1/issues/${issueRes.body.key}/comments`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .send({
            body: {
              type: 'doc',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'For the old webhook' }] },
              ],
            },
          })
          .expect(201);

        // The comment service emits without awaiting the dispatch.
        const deadline = Date.now() + 5000;
        while (
          !enqueue.mock.calls.some(([id]) => id === webhook.body.id) &&
          Date.now() < deadline
        ) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        expect(enqueue.mock.calls.filter(([id]) => id === webhook.body.id)).toEqual([
          [
            webhook.body.id,
            'comment.created',
            expect.objectContaining({ commentId: comment.body.id, issueKey: issueRes.body.key }),
          ],
        ]);
      } finally {
        enqueue.mockRestore();
        await request(httpServer)
          .delete(`/api/v1/webhooks/${webhook.body.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .expect(204);
      }
    }, 15000);

    it('should invalidate the project after comment.updated: editing a comment', async () => {
      const issueRes = await request(httpServer)
        .post(`/api/v1/projects/${projectKey}/issues`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId)
        .send({ summary: 'Comment update test issue' });

      const issueKey = issueRes.body.key;
      const commentRes = await request(httpServer)
        .post(`/api/v1/issues/${issueKey}/comments`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId)
        .send({ body: { type: 'doc', content: [] } });

      await waitForEvent('comment.updated', async () => {
        await request(httpServer)
          .patch(`/api/v1/issues/${issueKey}/comments/${commentRes.body.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .send({
            body: {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Edited comment' }],
                },
              ],
            },
          });
      });
    }, 15000);

    it('should invalidate without disclosing the actor when an issue is deleted', async () => {
      const issueRes = await request(httpServer)
        .post(`/api/v1/projects/${projectKey}/issues`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId)
        .send({ summary: 'Delete event test issue' });

      const issueKey = issueRes.body.key;
      await waitForEvent('issue.deleted', async () => {
        await request(httpServer)
          .delete(`/api/v1/issues/${issueKey}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId);
      });
    }, 15000);

    it('should invalidate the project after issue.reordered after changing issue order', async () => {
      const firstIssue = await request(httpServer)
        .post(`/api/v1/projects/${projectKey}/issues`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId)
        .send({ summary: 'First reorder issue' });
      const secondIssue = await request(httpServer)
        .post(`/api/v1/projects/${projectKey}/issues`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId)
        .send({ summary: 'Second reorder issue' });

      await waitForEvent('issue.reordered', async () => {
        await request(httpServer)
          .patch('/api/v1/issues/reorder')
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .send({
            issues: [
              { id: firstIssue.body.id, sortOrder: 1 },
              { id: secondIssue.body.id, sortOrder: 0 },
            ],
          });
      });
    }, 15000);

    it('should announce a new sprint to the project room', async () => {
      const name = `Live sprint ${Date.now()}`;
      await waitForEvent('sprint.created', async () => {
        await request(httpServer)
          .post(`/api/v1/sprints?projectId=${projectId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .send({ name })
          .expect(201);
      });
    }, 15000);

    it('should invalidate without sprint details when a sprint starts and completes', async () => {
      const name = `Started sprint ${Date.now()}`;
      const sprint = await request(httpServer)
        .post(`/api/v1/sprints?projectId=${projectId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId)
        .send({ name })
        .expect(201);

      await waitForEvent('sprint.started', async () => {
        await request(httpServer)
          .post(`/api/v1/sprints/${sprint.body.id}/start`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .expect(201);
      });

      await waitForEvent('sprint.completed', async () => {
        await request(httpServer)
          .post(`/api/v1/sprints/${sprint.body.id}/complete`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .expect(201);
      });
    }, 30000);

    it('should announce issues added to a sprint as one bulk update', async () => {
      const sprint = await request(httpServer)
        .post(`/api/v1/sprints?projectId=${projectId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId)
        .send({ name: `Planned sprint ${Date.now()}` })
        .expect(201);
      const issues = await Promise.all(
        ['First sprint issue', 'Second sprint issue'].map((summary) =>
          request(httpServer)
            .post(`/api/v1/projects/${projectKey}/issues`)
            .set('Authorization', `Bearer ${accessToken}`)
            .set('X-Tenant-ID', tenantId)
            .send({ summary })
            .expect(201),
        ),
      );

      await waitForEvent('issue.bulk_updated', async () => {
        await request(httpServer)
          .post(`/api/v1/sprints/${sprint.body.id}/issues`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .send({ issueIds: issues.map((issue) => issue.body.id) })
          .expect(201);
      });
    }, 15000);

    it('should route logged, edited, and deleted time to the issue project room', async () => {
      const issueRes = await request(httpServer)
        .post(`/api/v1/projects/${projectKey}/issues`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId)
        .send({ summary: 'Time event test issue' });
      const issueKey = issueRes.body.key;
      let entryId = '';

      await waitForEvent('time.logged', async () => {
        const entry = await request(httpServer)
          .post(`/api/v1/issues/${issueKey}/time-entries`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .send({ minutes: 30 })
          .expect(201);
        entryId = entry.body.id;
      });

      await waitForEvent('time.updated', async () => {
        await request(httpServer)
          .patch(`/api/v1/issues/${issueKey}/time-entries/${entryId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .send({ minutes: 45 })
          .expect(200);
      });

      await waitForEvent('time.deleted', async () => {
        await request(httpServer)
          .delete(`/api/v1/issues/${issueKey}/time-entries/${entryId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .expect(204);
      });
    }, 30000);

    it('keeps restricted issue summaries and identifiers out of project sockets', async () => {
      const issue = await request(httpServer)
        .post(`/api/v1/projects/${projectKey}/issues`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId)
        .send({ summary: 'Restricted socket source' })
        .expect(201);
      await dataSource.query(
        `UPDATE "tenant_ws_test_org".issues SET access_state = 'quarantined' WHERE id = $1`,
        [issue.body.id],
      );
      await waitForEvent('issue.updated', async () => {
        await request(httpServer)
          .patch(`/api/v1/issues/${issue.body.key}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .send({ summary: 'Restricted socket secret' })
          .expect(200);
      });
    }, 15000);

    it('should emit one invalidation to a client in tenant and project rooms', async () => {
      const socket = connectSocket(accessToken);
      const stable = await waitForStableConnection(socket, 2000);
      expect(stable).toBe(true);

      socket.emit('join:project', { projectKey });
      await new Promise((resolve) => setTimeout(resolve, 100));

      const summary = `Single delivery ${Date.now()}`;
      let deliveryCount = 0;
      socket.on('project:invalidate', (payload: any) => {
        if (payload.projectKey === projectKey) {
          deliveryCount += 1;
        }
      });

      await request(httpServer)
        .post(`/api/v1/projects/${projectKey}/issues`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId)
        .send({ summary });

      await new Promise((resolve) => setTimeout(resolve, 750));
      socket.close();

      expect(deliveryCount).toBe(1);
    }, 15000);
  });

  describe('Tenant Isolation', () => {
    let tenantBToken: string;
    let tenantBId: string;

    beforeAll(async () => {
      // Register a second tenant
      const res = await request(httpServer).post('/api/v1/auth/register').send({
        email: 'ws-test-b@example.com',
        password: 'password123',
        displayName: 'WS Tester B',
        orgName: 'WS Test Org B',
        orgSlug: 'ws-test-org-b',
      });

      tenantBToken = res.body.accessToken;
      tenantBId = res.body.tenantId;

      // Create workflow for tenant B
      const wfRes = await request(httpServer)
        .post('/api/v1/workflows')
        .set('Authorization', `Bearer ${tenantBToken}`)
        .set('X-Tenant-ID', tenantBId)
        .send({ name: 'WS B Default', isDefault: true });

      await request(httpServer)
        .post(`/api/v1/workflows/${wfRes.body.id}/statuses`)
        .set('Authorization', `Bearer ${tenantBToken}`)
        .set('X-Tenant-ID', tenantBId)
        .send({
          name: 'Open',
          category: 'todo',
          color: '#64748b',
          isInitial: true,
        });

      await request(httpServer)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${tenantBToken}`)
        .set('X-Tenant-ID', tenantBId)
        .send({ key: 'WSB', name: 'WS Test B Project' });
    });

    afterAll(async () => {
      await dataSource.query(`DROP SCHEMA IF EXISTS "tenant_ws_test_org_b" CASCADE`);
      await dataSource.query(
        `DELETE FROM public.tenant_memberships WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'ws-test-org-b')`,
      );
      await dataSource.query(`DELETE FROM public.tenants WHERE slug = 'ws-test-org-b'`);
      await dataSource.query(`DELETE FROM public.users WHERE email = 'ws-test-b@example.com'`);
    });

    it('should NOT receive events from a different tenant', async () => {
      // Connect socket for tenant A
      const socketA = connectSocket(accessToken);
      const stable = await waitForStableConnection(socketA, 2000);
      expect(stable).toBe(true);

      let receivedCrossTenantEvent = false;

      socketA.on('project:invalidate', (payload: any) => {
        if (payload.projectKey === 'WSB') {
          receivedCrossTenantEvent = true;
        }
      });

      // Tenant B creates an issue
      await request(httpServer)
        .post('/api/v1/projects/WSB/issues')
        .set('Authorization', `Bearer ${tenantBToken}`)
        .set('X-Tenant-ID', tenantBId)
        .send({ summary: 'Tenant B issue' });

      // Wait to ensure the event would have arrived if leaking
      await new Promise((resolve) => setTimeout(resolve, 1500));

      expect(receivedCrossTenantEvent).toBe(false);
      socketA.close();
    }, 15000);

    it('should keep project rooms isolated across tenants', async () => {
      const socketA = connectSocket(accessToken);
      const stable = await waitForStableConnection(socketA, 2000);
      expect(stable).toBe(true);

      socketA.emit('join:project', { projectKey: 'WSB' });
      await new Promise((resolve) => setTimeout(resolve, 100));

      const summary = `Tenant B same-key issue ${Date.now()}`;
      let receivedCrossTenantEvent = false;
      socketA.on('project:invalidate', (payload: any) => {
        if (payload.projectKey === 'WSB') {
          receivedCrossTenantEvent = true;
        }
      });

      const createIssueResponse = await request(httpServer)
        .post('/api/v1/projects/WSB/issues')
        .set('Authorization', `Bearer ${tenantBToken}`)
        .set('X-Tenant-ID', tenantBId)
        .send({ summary });

      expect(createIssueResponse.status).toBe(HttpStatus.CREATED);

      await new Promise((resolve) => setTimeout(resolve, 750));
      socketA.close();

      expect(receivedCrossTenantEvent).toBe(false);
    }, 15000);
  });
});
