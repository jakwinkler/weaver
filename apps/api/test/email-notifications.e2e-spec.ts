import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EmailNotificationJobData } from '@weaver/shared';
import { AddressInfo, createServer, Server, Socket } from 'node:net';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/core/auth/auth.service';
import { TenantConnectionProvider } from '../src/core/tenant';
import { NotificationQueueService } from '../src/modules/mail/notification-queue.service';

jest.setTimeout(60_000);

// Only the in-process SMTP transport fixture bypasses public-DNS resolution.
// The outbound-http security suite exercises the real private-address rejection.
jest.mock('../src/core/security/outbound-http', () => {
  const actual = jest.requireActual('../src/core/security/outbound-http');
  return { ...actual, resolveSafeOutboundHost: (host: string) => host === '127.0.0.1'
    ? Promise.resolve([{ address: host, family: 4 }]) : actual.resolveSafeOutboundHost(host) };
});

class MockSmtpServer {
  readonly messages: string[] = [];
  private readonly server: Server;

  constructor() {
    this.server = createServer((socket) => this.handleConnection(socket));
  }

  async listen(): Promise<number> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => resolve());
    });
    return (this.server.address() as AddressInfo).port;
  }

  async close(): Promise<void> {
    if (!this.server.listening) return;
    await new Promise<void>((resolve, reject) =>
      this.server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  private handleConnection(socket: Socket): void {
    socket.setEncoding('utf8');
    socket.write('220 localhost ESMTP Weaver Test\r\n');
    let buffer = '';
    let receivingData = false;

    socket.on('data', (chunk: string) => {
      buffer += chunk;

      while (buffer.length > 0) {
        if (receivingData) {
          const terminator = buffer.indexOf('\r\n.\r\n');
          if (terminator === -1) return;
          this.messages.push(buffer.slice(0, terminator));
          buffer = buffer.slice(terminator + 5);
          receivingData = false;
          socket.write('250 2.0.0 queued\r\n');
          continue;
        }

        const lineEnd = buffer.indexOf('\r\n');
        if (lineEnd === -1) return;
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);
        const command = line.toUpperCase();

        if (command.startsWith('EHLO') || command.startsWith('HELO')) {
          socket.write('250-localhost\r\n250 8BITMIME\r\n');
        } else if (command.startsWith('MAIL FROM')) {
          socket.write('250 2.1.0 ok\r\n');
        } else if (command.startsWith('RCPT TO')) {
          socket.write('250 2.1.5 ok\r\n');
        } else if (command === 'DATA') {
          receivingData = true;
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (command === 'QUIT') {
          socket.end('221 2.0.0 bye\r\n');
        } else {
          socket.write('250 2.0.0 ok\r\n');
        }
      }
    });
  }
}

describe('Email notifications (e2e)', () => {
  const ownerEmail = 'email-owner@example.com';
  const recipientEmail = 'email-recipient@example.com';
  const ownerSlug = 'email-notification-owner';
  const recipientSlug = 'email-notification-recipient';
  const ownerSchema = 'tenant_email_notification_owner';
  const recipientSchema = 'tenant_email_notification_recipient';
  const jobs: EmailNotificationJobData[] = [];

  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let ownerToken: string;
  let recipientToken: string;
  let tenantId: string;
  let recipientId: string;
  let issueKey: string;
  let transitionId: string;
  let smtpServer: MockSmtpServer;
  let smtpPort: number;

  const smtp = {
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    user: 'smtp-user',
    pass: 'smtp-pass',
    fromName: 'Weaver Test',
    fromEmail: 'weaver@example.com',
  };

  beforeAll(async () => {
    smtpServer = new MockSmtpServer();
    smtpPort = await smtpServer.listen();

    const fakeQueue = {
      enqueue: jest.fn(async (job: EmailNotificationJobData) => {
        jobs.push(job);
      }),
    };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NotificationQueueService)
      .useValue(fakeQueue)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    dataSource = app.get(DataSource);
    connections = app.get(TenantConnectionProvider);

    const ownerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: ownerEmail,
        password: 'password123',
        displayName: 'Email Owner',
        orgName: 'Email Notification Owner',
        orgSlug: ownerSlug,
      })
      .expect(201);
    ownerToken = ownerResponse.body.accessToken;
    tenantId = ownerResponse.body.tenantId;

    const recipientResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: recipientEmail,
        password: 'password123',
        displayName: 'Email Recipient',
        orgName: 'Email Notification Recipient',
        orgSlug: recipientSlug,
      })
      .expect(201);
    recipientToken = recipientResponse.body.accessToken;
    recipientId = recipientResponse.body.user.id;

    await dataSource.query(
      `INSERT INTO public.tenant_memberships (tenant_id, user_id, role)
       VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
      [tenantId, recipientId],
    );
    recipientToken = (await app.get(AuthService).createSessionForUser(recipientId, tenantId)).accessToken;

    await authedOwner().patch('/api/v1/settings').send({ smtp }).expect(200);

    await authedOwner()
      .post('/api/v1/projects')
      .send({ name: 'Email Project', key: 'MAIL' })
      .expect(201);

    const issueResponse = await authedOwner()
      .post('/api/v1/projects/MAIL/issues')
      .send({ summary: 'Send useful email notifications' })
      .expect(201);
    issueKey = issueResponse.body.key;

    const transitionRows = await dataSource.query(
      `SELECT transition.id
       FROM "${ownerSchema}".workflow_transitions transition
       JOIN "${ownerSchema}".issues issue
         ON issue.status_id = transition.from_status_id
       WHERE issue.key = $1
       ORDER BY transition.name
       LIMIT 1`,
      [issueKey],
    );
    transitionId = transitionRows[0].id;
  });

  afterAll(async () => {
    if (dataSource) {
      await connections?.closeAll();
      await dataSource.query(`DROP SCHEMA IF EXISTS "${ownerSchema}" CASCADE`);
      await dataSource.query(`DROP SCHEMA IF EXISTS "${recipientSchema}" CASCADE`);
      await dataSource.query(
        `DELETE FROM public.tenant_memberships
         WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug IN ($1, $2))`,
        [ownerSlug, recipientSlug],
      );
      await dataSource.query(`DELETE FROM public.tenants WHERE slug IN ($1, $2)`, [
        ownerSlug,
        recipientSlug,
      ]);
      await dataSource.query(`DELETE FROM public.users WHERE email IN ($1, $2)`, [
        ownerEmail,
        recipientEmail,
      ]);
    }
    await app?.close();
    await smtpServer?.close();
  });

  const authedOwner = () => ({
    get: (url: string) =>
      request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', tenantId),
    post: (url: string) =>
      request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', tenantId),
    patch: (url: string) =>
      request(app.getHttpServer())
        .patch(url)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', tenantId),
  });

  const authedRecipient = () => ({
    patch: (url: string) =>
      request(app.getHttpServer())
        .patch(url)
        .set('Authorization', `Bearer ${recipientToken}`)
        .set('X-Tenant-ID', tenantId),
  });

  beforeEach(() => {
    jobs.length = 0;
    smtpServer.messages.length = 0;
  });

  it('enqueues an assignment email for the new assignee', async () => {
    await authedOwner()
      .patch(`/api/v1/issues/${issueKey}`)
      .send({ assigneeId: recipientId })
      .expect(200);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      type: 'email',
      tenantId,
      userId: recipientId,
      to: recipientEmail,
      data: { template: 'issue-assigned', preference: 'emailOnAssign' },
    });
    expect(jobs[0].html).toContain(`/issues/${issueKey}`);
  });

  it('does not enqueue assignment email when the preference is disabled', async () => {
    await authedRecipient()
      .patch('/api/v1/users/me/notification-preferences')
      .send({ emailOnAssign: false })
      .expect(200);
    await authedOwner().patch(`/api/v1/issues/${issueKey}`).send({ assigneeId: null }).expect(200);
    jobs.length = 0;

    await authedOwner()
      .patch(`/api/v1/issues/${issueKey}`)
      .send({ assigneeId: recipientId })
      .expect(200);

    expect(jobs).toHaveLength(0);

    await authedRecipient()
      .patch('/api/v1/users/me/notification-preferences')
      .send({ emailOnAssign: true })
      .expect(200);
  });

  it('enqueues comment and mention emails without duplicating a recipient', async () => {
    await authedOwner()
      .post(`/api/v1/issues/${issueKey}/comments`)
      .send({
        body: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'A regular comment' }],
            },
          ],
        },
      })
      .expect(201);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].data).toMatchObject({ template: 'comment-added' });

    jobs.length = 0;
    await authedOwner()
      .post(`/api/v1/issues/${issueKey}/comments`)
      .send({
        body: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Please review ' },
                {
                  type: 'mention',
                  attrs: { id: recipientId, label: 'Email Recipient' },
                },
              ],
            },
          ],
        },
      })
      .expect(201);

    expect(jobs).toHaveLength(1);
    expect(jobs[0].data).toMatchObject({
      template: 'mentioned-in-comment',
      preference: 'emailOnMention',
    });
    expect(jobs[0].body).toContain('@Email Recipient');
  });

  it('enqueues status-change emails for the reporter and assignee', async () => {
    await authedOwner()
      .post(`/api/v1/issues/${issueKey}/transition`)
      .send({ transitionId })
      .expect(201);

    const statusJobs = jobs.filter((job) => job.data?.template === 'issue-status-changed');
    expect(statusJobs.map((job) => job.to).sort()).toEqual([ownerEmail, recipientEmail].sort());
    expect(statusJobs[0].body).toMatch(/To Do|In Progress|Done/);
  });

  it('tests the SMTP values currently entered, before they are saved', async () => {
    await authedOwner()
      .post('/api/v1/settings/smtp/test')
      .send({
        smtp: {
          ...smtp,
          host: '127.0.0.1',
          port: smtpPort,
          user: '',
          pass: '',
        },
      })
      .expect(201)
      .expect({ success: true, message: 'Test email sent' });

    expect(smtpServer.messages).toHaveLength(1);
    expect(smtpServer.messages[0]).toContain(`To: ${ownerEmail}`);
    expect(smtpServer.messages[0]).toContain('Subject: Weaver SMTP Test');
  });

  it('supports unauthenticated one-click unsubscribe with a signed token', async () => {
    await authedOwner().patch(`/api/v1/issues/${issueKey}`).send({ assigneeId: null }).expect(200);
    await authedOwner()
      .patch(`/api/v1/issues/${issueKey}`)
      .send({ assigneeId: recipientId })
      .expect(200);

    const assignment = jobs.find((job) => job.data?.template === 'issue-assigned');
    const unsubscribeHeader = assignment?.headers['List-Unsubscribe'];
    expect(unsubscribeHeader).toBeDefined();
    const url = new URL(unsubscribeHeader!.slice(1, -1));
    const token = url.searchParams.get('token');
    expect(token).toBeTruthy();

    await request(app.getHttpServer())
      .post(`/api/v1/notifications/unsubscribe?token=${encodeURIComponent(token!)}`)
      .type('form')
      .send({ 'List-Unsubscribe': 'One-Click' })
      .expect(201)
      .expect({ success: true, preference: 'emailOnAssign' });

    jobs.length = 0;
    await authedOwner().patch(`/api/v1/issues/${issueKey}`).send({ assigneeId: null }).expect(200);
    await authedOwner()
      .patch(`/api/v1/issues/${issueKey}`)
      .send({ assigneeId: recipientId })
      .expect(200);
    expect(jobs).toHaveLength(0);
  });
});
