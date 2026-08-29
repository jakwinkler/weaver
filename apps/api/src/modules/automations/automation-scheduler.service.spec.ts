import { Queue } from 'bullmq';
import { AutomationSchedulerService } from './automation-scheduler.service';

const scheduledQueue = {
  on: jest.fn(),
  upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
  removeJobScheduler: jest.fn().mockResolvedValue(true),
  getJobSchedulers: jest.fn().mockResolvedValue([]),
  close: jest.fn().mockResolvedValue(undefined),
};
const automationQueue = {
  on: jest.fn(),
  add: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
};

jest.mock('bullmq', () => ({ Queue: jest.fn() }));

describe('AutomationSchedulerService', () => {
  const tenants = {
    findAll: jest.fn().mockResolvedValue([
      { id: 'tenant-1', schemaName: 'tenant_one' },
      { id: 'tenant-2', schemaName: 'tenant_two' },
    ]),
  };
  const rules = {
    'tenant-1': [
      {
        id: 'rule-daily',
        enabled: true,
        trigger: { type: 'schedule', schedule: 'daily_9am' },
      },
    ],
    'tenant-2': [
      {
        id: 'rule-custom',
        enabled: true,
        trigger: { type: 'schedule', cron: '15 14 * * 2' },
      },
    ],
  } as const;
  const tenantConnections = {
    getEntityManager: jest.fn().mockImplementation(async () => ({
      getRepository: () => ({
        createQueryBuilder: () => ({
          where() {
            return this;
          },
          andWhere() {
            return this;
          },
          getMany: async () => {
            const calls = tenantConnections.getEntityManager.mock.calls.length;
            return calls === 1 ? rules['tenant-1'] : rules['tenant-2'];
          },
        }),
      }),
    })),
  };
  const config = {
    get: jest.fn((key: string, fallback: unknown) => {
      if (key === 'SCHEDULED_AUTOMATIONS_QUEUE_NAME') return 'scheduled-automations-test';
      if (key === 'AUTOMATIONS_QUEUE_NAME') return 'automations-test';
      return fallback;
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    scheduledQueue.getJobSchedulers.mockResolvedValue([]);
    (Queue as unknown as jest.Mock).mockImplementation((name: string) =>
      name === 'scheduled-automations-test' ? scheduledQueue : automationQueue,
    );
  });

  it('registers enabled scheduled rules from every tenant on startup', async () => {
    const service = new AutomationSchedulerService(
      config as never,
      tenants as never,
      tenantConnections as never,
    );

    await service.onModuleInit();

    expect(Queue).toHaveBeenCalledTimes(2);
    expect(scheduledQueue.upsertJobScheduler).toHaveBeenCalledWith(
      'weaver:automation:tenant-1:rule-daily',
      { pattern: '0 9 * * *', tz: 'UTC' },
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 'tenant-1', schemaName: 'tenant_one' }),
      }),
    );
    expect(scheduledQueue.upsertJobScheduler).toHaveBeenCalledWith(
      'weaver:automation:tenant-2:rule-custom',
      { pattern: '15 14 * * 2', tz: 'UTC' },
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 'tenant-2', schemaName: 'tenant_two' }),
      }),
    );
  });
});
