// Global test setup - set env vars before any module loads
// Match the UTC deployment runtime when reading legacy timestamp-without-zone columns.
process.env.TZ = 'UTC';
process.env.NODE_ENV = 'development';
process.env.DATABASE_HOST = 'localhost';
process.env.DATABASE_PORT = process.env.WEAVER_E2E_DATABASE_PORT ?? '5432';
process.env.DATABASE_USER = 'weaver';
process.env.DATABASE_PASSWORD = 'weaver_dev';
process.env.DATABASE_NAME = process.env.WEAVER_E2E_DATABASE ?? 'weaver_e2e';
if (!/^weaver_e2e(?:_[a-z0-9_]+)?$/.test(process.env.DATABASE_NAME)) {
  throw new Error('E2E tests require an isolated weaver_e2e database');
}
process.env.JWT_SECRET = 'test-secret-key-for-e2e';
process.env.RECURRENCE_SCHEDULER_ENABLED = 'false';
process.env.AUDIT_LOG_RETENTION_ENABLED = 'false';
process.env.GOOGLE_CLIENT_ID = 'test-google-client';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
process.env.GITHUB_CLIENT_ID = 'test-github-client';
process.env.GITHUB_CLIENT_SECRET = 'test-github-secret';
process.env.API_PUBLIC_URL = 'http://localhost:3000';
process.env.WEB_URL = 'http://localhost:5173';
process.env.ATTACHMENT_MAX_BYTES = '1024';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = process.env.WEAVER_E2E_REDIS_PORT ?? '6380';
process.env.RATE_LIMIT_RESET_ON_SHUTDOWN = 'true';
process.env.RATE_LIMIT_PREFIX = `weaver:e2e:${process.env.DATABASE_NAME}:rate-limit`;
