import { describe, expect, it, vi } from 'vitest';
import {
  createAccountMailProcessor,
  createNotificationProcessor,
} from '../src/processors/notifications.processor';

const systemSmtp = {
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  user: 'relay-user',
  pass: 'relay-pass',
  fromName: 'Weaver',
  fromEmail: 'weaver@example.com',
};

const job = {
  data: {
    userId: 'user-1',
    to: 'owner@example.com',
    template: 'password-reset',
    title: 'Reset your Weaver password',
    body: 'https://weaver.example.com/reset-password/0123abcd',
    html: '<a href="https://weaver.example.com/reset-password/0123abcd">Reset</a>',
  },
} as never;

function dependencies(overrides: Record<string, unknown> = {}) {
  const sendMail = vi.fn().mockResolvedValue({ messageId: 'm1' });
  return {
    sendMail,
    deps: {
      getSystemSmtpSettings: () => systemSmtp,
      transportFactory: vi.fn().mockReturnValue({ sendMail }),
      rateLimiter: { wait: vi.fn() },
      logger: { info: vi.fn(), warn: vi.fn() },
      ...overrides,
    },
  };
}

describe('account mail processor', () => {
  it('sends through the installation SMTP server with no unsubscribe headers', async () => {
    const { deps, sendMail } = dependencies({
      getSystemSmtpSettings: () => ({ ...systemSmtp, host: '8.8.8.8' }),
    });
    await createAccountMailProcessor(deps)(job);

    expect(deps.transportFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '8.8.8.8',
        auth: { user: 'relay-user', pass: 'relay-pass' },
      }),
    );
    expect(sendMail).toHaveBeenCalledWith({
      from: '"Weaver" <weaver@example.com>',
      to: 'owner@example.com',
      subject: 'Reset your Weaver password',
      text: 'https://weaver.example.com/reset-password/0123abcd',
      html: '<a href="https://weaver.example.com/reset-password/0123abcd">Reset</a>',
    });
    expect(deps.rateLimiter.wait).toHaveBeenCalledWith('system');
  });

  it('logs the template and user, never the link or the address', async () => {
    const { deps } = dependencies({
      getSystemSmtpSettings: () => ({ ...systemSmtp, host: '8.8.8.8' }),
    });
    await createAccountMailProcessor(deps)(job);
    const logged = JSON.stringify([deps.logger.info.mock.calls, deps.logger.warn.mock.calls]);
    expect(logged).toContain('Sent password-reset email to user user-1');
    expect(logged).not.toContain('0123abcd');
    expect(logged).not.toContain('owner@example.com');
  });

  it('skips the job when SMTP_HOST and SMTP_FROM are not set', async () => {
    const { deps } = dependencies({ getSystemSmtpSettings: () => null });
    await createAccountMailProcessor(deps)(job);
    expect(deps.transportFactory).not.toHaveBeenCalled();
    expect(deps.logger.warn).toHaveBeenCalledWith(
      '[account-mail] SMTP_HOST and SMTP_FROM are not set; the password-reset email for user user-1 was not sent',
    );
  });

  it('refuses a private SMTP host unless the operator opts in', async () => {
    const blocked = dependencies({
      getSystemSmtpSettings: () => ({ ...systemSmtp, host: '127.0.0.1' }),
    });
    await expect(createAccountMailProcessor(blocked.deps)(job)).rejects.toThrow(
      'private or reserved',
    );
    expect(blocked.deps.transportFactory).not.toHaveBeenCalled();

    const allowed = dependencies({
      getSystemSmtpSettings: () => ({ ...systemSmtp, host: '127.0.0.1' }),
      allowPrivateSystemHost: true,
    });
    await createAccountMailProcessor(allowed.deps)(job);
    expect(allowed.deps.transportFactory).toHaveBeenCalledWith(
      expect.objectContaining({ host: '127.0.0.1', tls: { servername: '127.0.0.1' } }),
    );
  });
});

describe('organization notification processor with a private relay opt-in', () => {
  const emailJob = {
    data: {
      type: 'email',
      tenantId: 't1',
      userId: 'u1',
      to: 'a@example.com',
      title: 'T',
      body: 'B',
      html: 'H',
      headers: {},
    },
  } as never;

  it('still refuses private organization SMTP hosts', async () => {
    const { deps } = dependencies({
      getTenantSmtpSettings: async () => ({ ...systemSmtp, host: '10.0.0.5' }),
      allowPrivateSystemHost: true,
    });
    await expect(createNotificationProcessor(deps as never)(emailJob)).rejects.toThrow(
      'private or reserved',
    );
    expect(deps.transportFactory).not.toHaveBeenCalled();
  });

  it('allows the private installation relay as the fallback', async () => {
    const { deps } = dependencies({
      getTenantSmtpSettings: async () => null,
      getSystemSmtpSettings: () => ({ ...systemSmtp, host: '10.0.0.5' }),
      allowPrivateSystemHost: true,
    });
    await createNotificationProcessor(deps as never)(emailJob);
    expect(deps.transportFactory).toHaveBeenCalledWith(
      expect.objectContaining({ host: '10.0.0.5' }),
    );
  });
});
