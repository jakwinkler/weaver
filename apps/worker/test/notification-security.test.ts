import { describe, expect, it, vi } from 'vitest';
import { createNotificationProcessor } from '../src/processors/notifications.processor';
describe('queued tenant SMTP security', () => {
  it('rejects private SMTP destinations before creating a transport', async () => {
    const transportFactory = vi.fn().mockReturnValue({ sendMail: vi.fn() });
    const processor = createNotificationProcessor({
      getTenantSmtpSettings: async () => ({ host: '127.0.0.1', port: 587, secure: false, user: '', pass: '', fromEmail: 'test@example.com', fromName: 'Test' }),
      getSystemSmtpSettings: () => null,
      transportFactory, rateLimiter: { wait: vi.fn() }, logger: { info: vi.fn(), warn: vi.fn() },
    });
    await expect(processor({ data: { type: 'email', tenantId: 't1', userId: 'u1', to: 'test@example.com', title: 'Test', body: 'Test' } } as never)).rejects.toThrow('private or reserved');
    expect(transportFactory).not.toHaveBeenCalled();
  });
});
