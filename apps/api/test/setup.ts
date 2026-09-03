// Global test setup - set env vars before any module loads
process.env.NODE_ENV = 'development';
process.env.DATABASE_HOST = 'localhost';
process.env.DATABASE_PORT = '5432';
process.env.DATABASE_USER = 'weaver';
process.env.DATABASE_PASSWORD = 'weaver_dev';
process.env.DATABASE_NAME = 'weaver';
process.env.JWT_SECRET = 'test-secret-key-for-e2e';
process.env.ATTACHMENT_MAX_BYTES = '1024';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6380';
process.env.RATE_LIMIT_RESET_ON_SHUTDOWN = 'true';
