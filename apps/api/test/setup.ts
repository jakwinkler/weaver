// Global test setup - set env vars before any module loads
process.env.NODE_ENV = 'development';
process.env.DATABASE_HOST = 'localhost';
process.env.DATABASE_PORT = '5432';
process.env.DATABASE_USER = 'weaver';
process.env.DATABASE_PASSWORD = 'weaver_dev';
process.env.DATABASE_NAME = 'weaver';
process.env.JWT_SECRET = 'test-secret-key-for-e2e';
process.env.GOOGLE_CLIENT_ID = 'test-google-client';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
process.env.GITHUB_CLIENT_ID = 'test-github-client';
process.env.GITHUB_CLIENT_SECRET = 'test-github-secret';
process.env.API_PUBLIC_URL = 'http://localhost:3000';
process.env.WEB_URL = 'http://localhost:5173';
