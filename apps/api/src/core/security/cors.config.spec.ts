import { getAllowedCorsOrigins, isCorsOriginAllowed } from './cors.config';

describe('CORS configuration', () => {
  it('allows only configured browser origins', () => {
    const configured = 'https://weaver.example.com, https://admin.example.com/';

    expect(getAllowedCorsOrigins(configured)).toEqual([
      'https://weaver.example.com',
      'https://admin.example.com',
    ]);
    expect(isCorsOriginAllowed('https://weaver.example.com', configured)).toBe(true);
    expect(isCorsOriginAllowed('https://evil.example.com', configured)).toBe(false);
  });

  it('allows requests without an Origin header', () => {
    expect(isCorsOriginAllowed(undefined, 'https://weaver.example.com')).toBe(true);
  });

  it('rejects wildcard and non-origin configuration values', () => {
    expect(() => getAllowedCorsOrigins('*')).toThrow('Wildcard CORS origins are not allowed');
    expect(() => getAllowedCorsOrigins('https://weaver.example.com/path')).toThrow(
      'Invalid CORS origin',
    );
  });
});
