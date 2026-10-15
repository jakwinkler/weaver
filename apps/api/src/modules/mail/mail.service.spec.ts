import { BadRequestException } from '@nestjs/common';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@weaver/shared';
import { MailService } from './mail.service';
import { resolveSafeOutboundHost } from '../../core/security/outbound-http';
jest.mock('../../core/security/outbound-http', () => ({ resolveSafeOutboundHost: jest.fn().mockResolvedValue([{ address: '8.8.8.8', family: 4 }]) }));

describe('MailService', () => {
  const smtp = {
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    user: 'smtp-user',
    pass: 'smtp-pass',
    fromName: 'Weaver',
    fromEmail: 'weaver@example.com',
  };

  let tenantService: { getSettings: jest.Mock };
  let userRepo: { findOneBy: jest.Mock; save: jest.Mock };
  let membershipRepo: { findOneBy: jest.Mock };
  let notificationQueue: { enqueue: jest.Mock };
  let accountMailQueue: { enqueue: jest.Mock };
  let config: { get: jest.Mock };
  let configValues: Record<string, string>;
  let transport: { sendMail: jest.Mock };
  let service: MailService;

  beforeEach(() => {
    tenantService = { getSettings: jest.fn().mockResolvedValue({ smtp }) };
    userRepo = {
      findOneBy: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'recipient@example.com',
        displayName: 'Recipient',
        notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
      }),
      save: jest.fn(async (user) => user),
    };
    membershipRepo = {
      findOneBy: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        userId: 'user-1',
      }),
    };
    notificationQueue = { enqueue: jest.fn().mockResolvedValue(undefined) };
    accountMailQueue = { enqueue: jest.fn().mockResolvedValue(undefined) };
    configValues = {
      WEB_APP_URL: 'https://weaver.example.com',
      API_PUBLIC_URL: 'https://api.weaver.example.com/api/v1',
      EMAIL_UNSUBSCRIBE_SECRET: 'unit-test-unsubscribe-secret',
    };
    config = {
      get: jest.fn((key: string, fallback?: string) => configValues[key] ?? fallback),
    };
    transport = { sendMail: jest.fn().mockResolvedValue({ messageId: 'mail-1' }) };

    service = new MailService(
      tenantService as never,
      userRepo as never,
      membershipRepo as never,
      notificationQueue as never,
      accountMailQueue as never,
      config as never,
      (() => transport) as never,
    );
  });

  it('renders responsive HTML and plain text with direct issue and unsubscribe links', () => {
    const rendered = service.renderTemplate('issue-assigned', {
      recipientName: 'Recipient',
      actorName: 'Alex',
      issueKey: 'WEB-42',
      issueSummary: 'Email the important people',
      projectName: 'Website',
      issueUrl: 'https://weaver.example.com/issues/WEB-42',
      unsubscribeUrl:
        'https://api.weaver.example.com/api/v1/notifications/unsubscribe?token=signed',
    });

    expect(rendered.subject).toContain('WEB-42');
    expect(rendered.html).toContain('https://weaver.example.com/issues/WEB-42');
    expect(rendered.html).toContain('unsubscribe?token');
    expect(rendered.html).toContain('@media');
    expect(rendered.text).toContain('https://weaver.example.com/issues/WEB-42');
    expect(rendered.text).toContain('unsubscribe?token=signed');
  });

  it('does not enqueue when the matching user preference is disabled', async () => {
    userRepo.findOneBy.mockResolvedValue({
      id: 'user-1',
      email: 'recipient@example.com',
      displayName: 'Recipient',
      notificationPreferences: {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        emailOnAssign: false,
      },
    });

    await expect(
      service.enqueueNotification({
        tenantId: 'tenant-1',
        userId: 'user-1',
        preference: 'emailOnAssign',
        template: 'issue-assigned',
        context: {
          actorName: 'Alex',
          issueKey: 'WEB-42',
          issueSummary: 'Email the important people',
          projectName: 'Website',
          issueUrl: 'https://weaver.example.com/issues/WEB-42',
        },
      }),
    ).resolves.toBe(false);
    expect(notificationQueue.enqueue).not.toHaveBeenCalled();
  });

  it('does not send tenant data to a user outside the tenant', async () => {
    membershipRepo.findOneBy.mockResolvedValue(null);

    await expect(
      service.enqueueNotification({
        tenantId: 'tenant-1',
        userId: 'user-1',
        preference: 'emailOnAssign',
        template: 'issue-assigned',
        context: {
          actorName: 'Alex',
          issueKey: 'WEB-42',
          issueSummary: 'Private issue',
          projectName: 'Website',
          issueUrl: 'https://weaver.example.com/issues/WEB-42',
        },
      }),
    ).resolves.toBe(false);
    expect(userRepo.findOneBy).not.toHaveBeenCalled();
    expect(notificationQueue.enqueue).not.toHaveBeenCalled();
  });

  it('enqueues rendered email with RFC 8058 unsubscribe headers', async () => {
    await expect(
      service.enqueueNotification({
        tenantId: 'tenant-1',
        userId: 'user-1',
        preference: 'emailOnAssign',
        template: 'issue-assigned',
        context: {
          actorName: 'Alex',
          issueKey: 'WEB-42',
          issueSummary: 'Email the important people',
          projectName: 'Website',
          issueUrl: 'https://weaver.example.com/issues/WEB-42',
        },
      }),
    ).resolves.toBe(true);

    expect(notificationQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'email',
        tenantId: 'tenant-1',
        userId: 'user-1',
        to: 'recipient@example.com',
        html: expect.stringContaining('WEB-42'),
        body: expect.stringContaining('WEB-42'),
        headers: expect.objectContaining({
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        }),
      }),
    );
  });

  it('sets only the signed preference to false when unsubscribing', async () => {
    const token = service.createUnsubscribeToken('user-1', 'emailOnComment');

    await expect(service.unsubscribe(token)).resolves.toEqual({
      preference: 'emailOnComment',
      success: true,
    });
    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationPreferences: {
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          emailOnComment: false,
        },
      }),
    );
  });

  it('rejects a tampered unsubscribe token', async () => {
    const token = service.createUnsubscribeToken('user-1', 'emailOnComment');

    await expect(service.unsubscribe(`${token}x`)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('tests unsaved SMTP settings synchronously through the supplied transport', async () => {
    await service.sendTestEmail('tenant-1', 'recipient@example.com', smtp);

    expect(transport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'recipient@example.com',
        subject: expect.stringContaining('SMTP Test'),
        text: expect.stringContaining('recipient@example.com'),
      }),
    );
  });

  describe('account emails', () => {
    const recipient = { id: 'user-1', email: 'owner@example.com', displayName: 'Owner <script>' };

    beforeEach(() => {
      configValues.SMTP_HOST = 'smtp.example.com';
      configValues.SMTP_FROM = 'weaver@example.com';
    });

    it('queues on the account queue, never the organization notification queue', async () => {
      await expect(
        service.enqueueAccountEmail(recipient, 'password-reset', {
          resetUrl: 'https://weaver.example.com/reset-password/abc',
          expiresInMinutes: 30,
        }),
      ).resolves.toBe(true);

      expect(notificationQueue.enqueue).not.toHaveBeenCalled();
      const job = accountMailQueue.enqueue.mock.calls[0][0];
      expect(job).toMatchObject({
        userId: 'user-1',
        to: 'owner@example.com',
        template: 'password-reset',
        title: 'Reset your Weaver password',
      });
      expect(job).not.toHaveProperty('tenantId');
      expect(job.body).toContain('https://weaver.example.com/reset-password/abc');
      expect(job.body).toContain('expires in 30 minutes');
      expect(job.html).toContain("href='https://weaver.example.com/reset-password/abc'");
      expect(job.html).toContain('Owner &lt;script&gt;');
    });

    it('sends nothing without the installation SMTP server, even if an organization has one', async () => {
      delete configValues.SMTP_HOST;
      await expect(
        service.enqueueAccountEmail(recipient, 'password-changed', { changedAt: 'now', forgotPasswordUrl: 'x' }),
      ).resolves.toBe(false);
      expect(accountMailQueue.enqueue).not.toHaveBeenCalled();
      expect(tenantService.getSettings).not.toHaveBeenCalled();
    });

    it('renders every account template in HTML and text', () => {
      for (const template of ['password-reset', 'password-changed', 'password-reset-unavailable'] as const) {
        const rendered = service.renderAccountTemplate(template, {
          recipientName: 'Owner',
          resetUrl: 'https://weaver.example.com/reset-password/abc',
          expiresInMinutes: 30,
          changedAt: 'Thu, 15 Oct 2026 18:00:00 GMT',
          forgotPasswordUrl: 'https://weaver.example.com/forgot-password',
          providers: 'Google',
          loginUrl: 'https://weaver.example.com/login',
        });
        expect(rendered.subject).toMatch(/Weaver/);
        expect(rendered.html).toContain('Hi Owner,');
        expect(rendered.text).toContain('Hi Owner,');
        expect(rendered.text).not.toContain('{{');
      }
    });
  });

  describe('test email through the installation SMTP server', () => {
    beforeEach(() => {
      tenantService.getSettings.mockResolvedValue({ smtp: null });
      configValues.SMTP_HOST = '10.0.0.25';
      configValues.SMTP_FROM = 'weaver@example.com';
      (resolveSafeOutboundHost as jest.Mock).mockClear();
    });

    it('connects to a private relay only when the operator opts in', async () => {
      const factory = jest.fn(() => transport);
      (service as any).transportFactory = factory;
      configValues.SMTP_ALLOW_PRIVATE_HOST = 'true';
      await service.sendTestEmail('tenant-1', 'recipient@example.com');
      expect(resolveSafeOutboundHost).not.toHaveBeenCalled();
      expect(factory).toHaveBeenCalledWith(expect.objectContaining({ host: '10.0.0.25' }));
    });

    it('still checks the host without the opt-in', async () => {
      await service.sendTestEmail('tenant-1', 'recipient@example.com');
      expect(resolveSafeOutboundHost).toHaveBeenCalledWith('10.0.0.25');
    });

    it('still checks organization SMTP hosts with the opt-in', async () => {
      configValues.SMTP_ALLOW_PRIVATE_HOST = 'true';
      await service.sendTestEmail('tenant-1', 'recipient@example.com', smtp);
      expect(resolveSafeOutboundHost).toHaveBeenCalledWith('smtp.example.com');
    });
  });
});
