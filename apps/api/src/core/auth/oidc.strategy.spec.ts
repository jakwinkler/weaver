import { OidcStrategy } from './oidc.strategy';
import { loadOpenIdClient } from './oidc-client';
import { TenantService } from '../tenant/tenant.service';
import * as dns from 'dns/promises';
import { ConfigService } from '@nestjs/config';
jest.mock('dns/promises', () => ({ ...jest.requireActual('dns/promises'), lookup: jest.fn() }));
jest.mock('./oidc-client', () => ({ loadOpenIdClient: jest.fn() }));

describe('OIDC outbound boundaries', () => {
  const customFetch = Symbol('customFetch');
  const settings = (discoveryUrl: string) => ({
    sso: {
      oidc: { enabled: true, discoveryUrl, clientId: 'synthetic', clientSecret: 'synthetic' },
    },
  });
  const tenant = {
    findBySlug: jest.fn().mockResolvedValue({ id: 'tenant' }),
    getSettings: jest.fn(),
  };
  const jwt = {
    sign: jest.fn().mockReturnValue('state'),
    verify: jest.fn().mockReturnValue({ purpose: 'oidc-state', tenantSlug: 'team' }),
  };
  let requestUrl: string;
  beforeEach(() => {
    jest.restoreAllMocks();
    requestUrl = 'https://8.8.8.8';
    tenant.getSettings.mockResolvedValue(settings(requestUrl));
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}'));
    const discovery = jest.fn(async (url, _id, _secret, _auth, options) => {
      const transport = options?.[customFetch] ?? fetch;
      await transport(url, { redirect: 'manual' });
      return { [customFetch]: transport };
    });
    (loadOpenIdClient as jest.Mock).mockResolvedValue({
      customFetch,
      discovery,
      randomPKCECodeVerifier: () => 'verifier',
      randomState: () => 'state',
      randomNonce: () => 'nonce',
      calculatePKCECodeChallenge: async () => 'challenge',
      buildAuthorizationUrl: () => new URL('https://provider.example/authorize'),
      authorizationCodeGrant: async (configuration: any) => {
        await configuration[customFetch](requestUrl, {
          method: 'POST',
          body: 'client_secret=synthetic',
        });
        return { claims: () => ({ email: 'member@example.com', email_verified: true }) };
      },
    });
  });
  const strategy = () =>
    new OidcStrategy(tenant as never, new ConfigService({ NODE_ENV: 'production' }), jwt as never);
  it.each(['https://127.0.0.1', 'https://169.254.169.254'])(
    'blocks private discovery %s before fetching',
    async (url) => {
      tenant.getSettings.mockResolvedValue(settings(url));
      await expect(strategy().begin('team')).rejects.toThrow('private or reserved');
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it('applies the same transport to token/JWKS requests after discovery', async () => {
    requestUrl = 'https://127.0.0.1/token';
    await expect(
      strategy().complete('team', new URL('https://app.example/callback'), 'state'),
    ).rejects.toThrow('private or reserved');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('bounds metadata response size', async () => {
    (fetch as jest.Mock).mockResolvedValue(new Response('x'.repeat(1024 * 1024 + 1)));
    await expect(strategy().begin('team')).rejects.toThrow('size limit');
  });
  it('pins DNS and retains the library redirect policy and deadline', async () => {
    await strategy().begin('team');
    expect(fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        redirect: 'manual',
        dispatcher: expect.anything(),
        signal: expect.any(AbortSignal),
      }),
    );
  });
  it('coalesces discovery, expires it, and invalidates changed credentials', async () => {
    const instance = strategy();
    const client = await loadOpenIdClient();
    await Promise.all([instance.begin('team'), instance.begin('team')]);
    expect(client.discovery).toHaveBeenCalledTimes(1);
    const changed = settings('https://8.8.8.8');
    changed.sso.oidc.clientSecret = 'rotated';
    tenant.getSettings.mockResolvedValue(changed);
    await instance.begin('team');
    expect(client.discovery).toHaveBeenCalledTimes(2);
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + 5 * 60_000 + 1);
    await instance.begin('team');
    expect(client.discovery).toHaveBeenCalledTimes(3);
  });
  it('retries failed discovery rather than caching the failure', async () => {
    const instance = strategy();
    (fetch as jest.Mock).mockRejectedValueOnce(new Error('provider offline'));
    await expect(instance.begin('team')).rejects.toThrow('provider offline');
    await expect(instance.begin('team')).resolves.toHaveProperty('authorizationUrl');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('reports unresolvable settings as invalid input without saving', async () => {
    (dns.lookup as jest.Mock).mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND'));
    const repo = {
      findOneByOrFail: jest.fn().mockResolvedValue({ settings: {} }),
      save: jest.fn(),
    };
    await expect(
      new TenantService(repo as never).updateSettings(
        'tenant',
        settings('https://missing.example') as never,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('rejects unsafe discovery settings before saving them', async () => {
    const repo = {
      findOneByOrFail: jest.fn().mockResolvedValue({ settings: {} }),
      save: jest.fn(),
    };
    const service = new TenantService(repo as never);
    await expect(
      service.updateSettings('tenant', settings('https://127.0.0.1') as never),
    ).rejects.toThrow('private or reserved');
    expect(repo.save).not.toHaveBeenCalled();
  });
});
