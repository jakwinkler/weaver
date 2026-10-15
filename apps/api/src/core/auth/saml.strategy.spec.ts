import { SamlStrategy } from './saml.strategy';
import { ConfigService } from '@nestjs/config';

describe('SAML request binding configuration', () => {
  it('requires a recent request and a distinct tenant-scoped shared cache for each callback', async () => {
    const cache = {
      forTenant: jest.fn(() => ({
        saveAsync: jest.fn(),
        getAsync: jest.fn(),
        removeAsync: jest.fn(),
      })),
    };
    const tenant = {
      findBySlug: jest.fn(async (slug: string) => ({ id: slug, slug })),
      getSettings: jest
        .fn()
        .mockResolvedValue({
          sso: { saml: { enabled: true, idpUrl: 'https://idp.example', cert: 'synthetic' } },
        }),
    };
    const strategy: any = Reflect.construct(SamlStrategy, [tenant, new ConfigService(), cache]);
    const options = (tenantSlug: string) =>
      new Promise<any>((resolve, reject) =>
        strategy._options.getSamlOptions(
          { params: { tenantSlug } },
          (error: Error, config: unknown) => (error ? reject(error) : resolve(config)),
        ),
      );
    const first = await options('one');
    const second = await options('two');
    expect(first.validateInResponseTo).toBe('always');
    expect(first.requestIdExpirationPeriodMs).toBe(600000);
    expect(first.cacheProvider).toBeDefined();
    expect(second.cacheProvider).not.toBe(first.cacheProvider);
    expect(cache.forTenant.mock.calls).toEqual([['one'], ['two']]);
  });
});
