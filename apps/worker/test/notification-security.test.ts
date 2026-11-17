import { describe, expect, it, vi } from 'vitest';
import { createNotificationProcessor } from '../src/processors/notifications.processor';
describe('queued tenant SMTP security', () => {
  it('rejects private SMTP destinations before creating a transport', async () => {
    const transportFactory = vi.fn().mockReturnValue({ sendMail: vi.fn() });
    const processor = createNotificationProcessor({
      getTenantSmtpSettings: async () => ({
        host: '127.0.0.1',
        port: 587,
        secure: false,
        user: '',
        pass: '',
        fromEmail: 'test@example.com',
        fromName: 'Test',
      }),
      getSystemSmtpSettings: () => null,
      transportFactory,
      rateLimiter: { wait: vi.fn() },
      logger: { info: vi.fn(), warn: vi.fn() },
    });
    await expect(
      processor({
        data: {
          type: 'email',
          tenantId: 't1',
          userId: 'u1',
          to: 'test@example.com',
          title: 'Test',
          body: 'Test',
        },
      } as never),
    ).rejects.toThrow('private or reserved');
    expect(transportFactory).not.toHaveBeenCalled();
  });
  it('rechecks secondary references and suppresses queued mail after revocation', async () => {
    const sendMail = vi.fn();
    const canDeliverIssue = vi.fn(
      async (_tenant: string, _user: string, key: string) => key === 'EPD-1',
    );
    const processor = createNotificationProcessor({
      getTenantSmtpSettings: async () => null,
      getSystemSmtpSettings: () => ({
        host: '127.0.0.1',
        port: 587,
        secure: false,
        user: '',
        pass: '',
        fromEmail: 'test@example.com',
        fromName: 'Test',
      }),
      allowPrivateSystemHost: true,
      canDeliverIssue,
      transportFactory: () => ({ sendMail }),
      rateLimiter: { wait: vi.fn() },
      logger: { info: vi.fn(), warn: vi.fn() },
    });
    await processor({
      data: {
        type: 'email',
        tenantId: 't1',
        userId: 'u1',
        to: 'test@example.com',
        title: 'EPD-1 updated',
        body: 'Related to EPD-31',
        data: {
          issueKey: 'EPD-1',
          referenceVersion: 1,
          issueReferences: { keys: ['EPD-1', 'EPD-31'], ids: [] },
        },
      },
    } as never);
    expect(canDeliverIssue).toHaveBeenCalledWith('t1', 'u1', 'EPD-31');
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('fails closed for legacy or malformed jobs and revoked issue IDs without parsing HTML as prose', async () => {
    const sendMail = vi.fn();
    const canDeliverIssue = vi.fn(async () => true);
    const canDeliverIssueId = vi.fn(async () => false);
    const processor = createNotificationProcessor({
      getTenantSmtpSettings: async () => null,
      getSystemSmtpSettings: () => ({
        host: '127.0.0.1',
        port: 587,
        secure: false,
        user: '',
        pass: '',
        fromEmail: 'test@example.com',
        fromName: 'Test',
      }),
      allowPrivateSystemHost: true,
      canDeliverIssue,
      canDeliverIssueId,
      transportFactory: () => ({ sendMail }),
      rateLimiter: { wait: vi.fn() },
      logger: { info: vi.fn(), warn: vi.fn() },
    });
    const job = {
      type: 'email',
      tenantId: 't1',
      userId: 'u1',
      to: 'test@example.com',
      title: 'EPD-1 updated',
      body: 'Ordinary message',
      html: '<meta charset="utf-8"/><p>Ordinary message</p>',
    };
    for (const data of [
      undefined,
      { issueKey: 'EPD-1' },
      { issueKey: 'EPD-1', referenceVersion: 1, issueReferences: { keys: [42], ids: [] } },
    ]) {
      await processor({ data: { ...job, data } } as never);
    }
    expect(sendMail).not.toHaveBeenCalled();
    const metadata = {
      issueKey: 'EPD-1',
      referenceVersion: 1,
      issueReferences: { keys: ['EPD-1'], ids: ['revoked-id'] },
    };
    await processor({ data: { ...job, data: metadata } } as never);
    expect(canDeliverIssueId).toHaveBeenCalledWith('t1', 'u1', 'revoked-id');
    expect(sendMail).not.toHaveBeenCalled();
    await processor({
      data: { ...job, data: { ...metadata, issueReferences: { keys: ['EPD-1'], ids: [] } } },
    } as never);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(canDeliverIssue).not.toHaveBeenCalledWith('t1', 'u1', 'utf-8');
  });
});
