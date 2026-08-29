// Global test setup - set env vars before any module loads
process.env.NODE_ENV = 'development';
process.env.DATABASE_HOST = 'localhost';
process.env.DATABASE_PORT = '5432';
process.env.DATABASE_USER = 'weaver';
process.env.DATABASE_PASSWORD = 'weaver_dev';
process.env.DATABASE_NAME = 'weaver';
process.env.JWT_SECRET = 'test-secret-key-for-e2e';
process.env.RECURRENCE_SCHEDULER_ENABLED = 'false';
