import { validateSecurityConfiguration } from './runtime-config';

describe('runtime security configuration', () => {
  it.each([
    undefined,
    'CHANGE_ME_IN_PRODUCTION',
    'change-me-in-production',
    'too-short',
  ])('rejects unsafe production JWT secret %p', (jwtSecret) => {
    expect(() =>
      validateSecurityConfiguration({
        NODE_ENV: 'production',
        JWT_SECRET: jwtSecret,
      }),
    ).toThrow('JWT_SECRET');
  });

  it('accepts a sufficiently long non-placeholder production secret', () => {
    expect(() =>
      validateSecurityConfiguration({
        NODE_ENV: 'production',
        JWT_SECRET: 'd6f681c44a4f4ccfa85f7c4ab2d98c38ef87f9ba0f4cbbaa',
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
