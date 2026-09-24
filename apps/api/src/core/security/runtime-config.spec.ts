import { validateSecurityConfiguration } from './runtime-config';

describe('runtime security configuration', () => {
  it.each([undefined, '', 'prod', 'staging', 'Production'])(
    'rejects unsupported environment %p',
    (NODE_ENV) => {
      expect(() => validateSecurityConfiguration({ NODE_ENV })).toThrow('NODE_ENV');
    },
  );
  it.each([undefined, 'CHANGE_ME_IN_PRODUCTION', 'change-me-in-production', 'too-short'])(
    'rejects unsafe production JWT secret %p',
    (jwtSecret) => {
      expect(() =>
        validateSecurityConfiguration({
          NODE_ENV: 'production',
          JWT_SECRET: jwtSecret,
        }),
      ).toThrow('JWT_SECRET');
    },
  );

  it('rejects a missing production refresh-token secret', () => {
    expect(() =>
      validateSecurityConfiguration({
        NODE_ENV: 'production',
        JWT_SECRET: 'd6f681c44a4f4ccfa85f7c4ab2d98c38ef87f9ba0f4cbbaa',
      }),
    ).toThrow('JWT_REFRESH_SECRET');
  });

  it('accepts distinct, sufficiently long production secrets', () => {
    expect(() =>
      validateSecurityConfiguration({
        NODE_ENV: 'production',
        JWT_SECRET: 'd6f681c44a4f4ccfa85f7c4ab2d98c38ef87f9ba0f4cbbaa',
        JWT_REFRESH_SECRET: '65b04e5cb780425d87e00418e658663de3f6a0c969ce43a1',
      }),
    ).not.toThrow();
  });

  it('does not enforce production requirements in development', () => {
    expect(() =>
      validateSecurityConfiguration({
        NODE_ENV: 'development',
        JWT_SECRET: 'dev-secret',
      }),
    ).not.toThrow();
  });
});
