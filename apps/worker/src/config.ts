export const config = {
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    user: process.env.DATABASE_USER || 'weaver',
    password: process.env.DATABASE_PASSWORD || 'weaver_dev',
    name: process.env.DATABASE_NAME || 'weaver',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6380', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  queues: {
    events: { name: 'events', concurrency: 10 },
    webhooks: { name: 'webhooks', concurrency: 5 },
    notifications: {
      name: process.env.NOTIFICATIONS_QUEUE_NAME || 'notifications',
      concurrency: 10,
    },
    automations: {
      name: process.env.AUTOMATIONS_QUEUE_NAME || 'automations',
    },
    scheduledAutomations: {
      name: process.env.SCHEDULED_AUTOMATIONS_QUEUE_NAME || 'scheduled-automations',
      concurrency: parseInt(process.env.SCHEDULED_AUTOMATIONS_CONCURRENCY || '5', 10),
    },
    scmSync: { name: 'scm-sync', concurrency: 3 },
    tenantOps: { name: 'tenant-ops', concurrency: 1 },
    imports: { name: 'jira-import', concurrency: 1 },
  },
};
