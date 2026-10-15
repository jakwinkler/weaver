import { AuthController } from '../auth/auth.controller';
import { AuditService } from '../../modules/audit/audit.service';
import { TenantService } from '../tenant/tenant.service';
import { updateTenantSettingsSchema } from '@weaver/shared';
import { jiraConnectionSchema } from '../../modules/import/import.schemas';
import { JiraClient } from '@weaver/jira-import';

describe('September session and settings regressions', () => {
  it('bootstraps the existing session without issuing credentials or changing cookies', async () => {
    const user = { id: 'user', role: 'member' };
    const service = {
      getProfile: jest.fn().mockResolvedValue(user),
      createSessionForUser: jest
        .fn()
        .mockResolvedValue({ accessToken: 'new-access', refreshToken: 'new-refresh' }),
    };
    const response = { cookie: jest.fn(), json: jest.fn((value) => value) };
    const controller = new AuthController(service as never, {} as never);
    const result = await controller.session(
      { userId: 'user', tenantId: 'tenant' } as never,
      response as never,
    );
    expect(service.createSessionForUser).not.toHaveBeenCalled();
    expect(response.cookie).not.toHaveBeenCalled();
    expect(result).toEqual({ user, tenantId: 'tenant' });
  });

  it('records the proxy-resolved audit IP instead of an attacker-supplied header', () => {
    const service = Object.create(AuditService.prototype);
    expect(
      service.extractIpAddress({
        headers: { 'x-forwarded-for': '203.0.113.99' },
        ip: '192.0.2.10',
        socket: { remoteAddress: '192.0.2.11' },
      }),
    ).toBe('192.0.2.10');
    expect(service.extractIpAddress({ headers: {}, socket: { remoteAddress: '192.0.2.11' } })).toBe(
      '192.0.2.11',
    );
  });

  it('rejects the unsupported domain policy instead of pretending to enforce it', () => {
    expect(updateTenantSettingsSchema.safeParse({ allowedDomains: ['example.com'] }).success).toBe(
      false,
    );
    expect(updateTenantSettingsSchema.safeParse({ allowedDomains: [] }).success).toBe(false);
    expect(updateTenantSettingsSchema.safeParse({ timezone: 'UTC' }).success).toBe(true);
  });

  it('hides legacy domain settings while preserving them on unrelated updates', async () => {
    const tenant = { settings: { allowedDomains: ['legacy.example'] } };
    const repo = { findOneByOrFail: jest.fn().mockResolvedValue(tenant), save: jest.fn() };
    const service = new TenantService(repo as never);
    expect(await service.getSettings('tenant')).not.toHaveProperty('allowedDomains');
    expect(await service.updateSettings('tenant', { timezone: 'UTC' })).not.toHaveProperty(
      'allowedDomains',
    );
    expect(tenant.settings.allowedDomains).toEqual(['legacy.example']);
  });

  it('rejects credential-bearing HTTP Jira URLs in validation and shared client', async () => {
    const config = {
      source: 'jira_server' as const,
      baseUrl: 'http://jira.example',
      auth: { type: 'api_token' as const, token: 'synthetic' },
    };
    expect(jiraConnectionSchema.safeParse(config).success).toBe(false);
    const fetcher = jest.fn().mockResolvedValue(new Response('{}'));
    await expect(new JiraClient(fetcher).testConnection(config)).rejects.toThrow('HTTPS');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
