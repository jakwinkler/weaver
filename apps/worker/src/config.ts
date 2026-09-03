export const config = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6380', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USER || 'weaver',
    password: process.env.DATABASE_PASSWORD || 'weaver_dev',
    database: process.env.DATABASE_NAME || 'weaver',
  },
  queues: {
    events: { name: 'events', concurrency: 10 },
    webhooks: { name: 'webhooks', concurrency: 5 },
    notifications: { name: 'notifications', concurrency: 10 },
    scmSync: { name: 'scm-sync', concurrency: 3 },
    tenantOps: { name: 'tenant-ops', concurrency: 1 },
  },
};
