import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AutomationRuleEntity } from '@weaver/db';
import { Queue } from 'bullmq';
import {
  requireTenantContext,
  tenantStorage,
  TenantConnectionProvider,
  TenantService,
} from '../../core/tenant';
import {
  AutomationJobData,
  automationTriggerSchema,
  cronForScheduleTrigger,
} from './automation.types';

export interface CronAutomationJobData {
  tenantId: string;
  schemaName: string;
  ruleId: string;
}

const SCHEDULER_KEY_PREFIX = 'weaver:automation:';

@Injectable()
export class AutomationSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationSchedulerService.name);
  private scheduledQueue?: Queue<CronAutomationJobData>;
  private automationQueue?: Queue<AutomationJobData>;

  constructor(
    private readonly config: ConfigService,
    private readonly tenants: TenantService,
    private readonly tenantConnections: TenantConnectionProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    const connection = {
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6380),
      password: this.config.get<string>('REDIS_PASSWORD') || undefined,
      maxRetriesPerRequest: 1,
    };
    this.scheduledQueue = new Queue<CronAutomationJobData>(
      this.config.get('SCHEDULED_AUTOMATIONS_QUEUE_NAME', 'scheduled-automations'),
      { connection },
    );
    this.automationQueue = new Queue<AutomationJobData>(
      this.config.get('AUTOMATIONS_QUEUE_NAME', 'automations'),
      { connection },
    );
    this.scheduledQueue.on('error', (error) =>
      this.logger.error(`Scheduled automation queue error: ${error.message}`),
    );
    this.automationQueue.on('error', (error) =>
      this.logger.error(`Automation queue error: ${error.message}`),
    );

    await this.syncAllTenants();
  }

  async onModuleDestroy(): Promise<void> {
    await this.scheduledQueue?.close();
    await this.automationQueue?.close();
  }

  async syncAllTenants(): Promise<void> {
    if (!this.scheduledQueue) return;
    const desiredSchedulerKeys = new Set<string>();
    const syncedTenantIds = new Set<string>();
    const tenants = await this.tenants.findAll();
    const currentTenantIds = new Set(tenants.map((tenant) => tenant.id));

    for (const tenant of tenants) {
      try {
        await tenantStorage.run(
          { tenantId: tenant.id, schemaName: tenant.schemaName },
          async () => {
            const em = await this.tenantConnections.getEntityManager();
            const rules = await em
              .getRepository(AutomationRuleEntity)
              .createQueryBuilder('rule')
              .where('rule.enabled = true')
              .andWhere("rule.trigger ->> 'type' = 'schedule'")
              .getMany();
            for (const rule of rules) {
              const key = this.schedulerKey(tenant.id, rule.id);
              if (await this.syncRule(rule)) desiredSchedulerKeys.add(key);
            }
          },
        );
        syncedTenantIds.add(tenant.id);
      } catch (error) {
        this.logger.warn(
          `Could not synchronize scheduled automations for tenant ${tenant.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    for (const scheduler of await this.scheduledQueue.getJobSchedulers(0, -1, true)) {
      const tenantId = scheduler.key.slice(SCHEDULER_KEY_PREFIX.length).split(':', 1)[0];
      if (
        scheduler.key.startsWith(SCHEDULER_KEY_PREFIX) &&
        (!currentTenantIds.has(tenantId) || syncedTenantIds.has(tenantId)) &&
        !desiredSchedulerKeys.has(scheduler.key)
      ) {
        await this.scheduledQueue.removeJobScheduler(scheduler.key);
      }
    }
  }

  async syncRule(rule: AutomationRuleEntity): Promise<boolean> {
    const tenant = requireTenantContext();
    const schedulerKey = this.schedulerKey(tenant.tenantId, rule.id);
    if (!this.scheduledQueue) return false;

    const trigger = automationTriggerSchema.safeParse(rule.trigger);
    if (!rule.enabled || !trigger.success || trigger.data.type !== 'schedule') {
      await this.scheduledQueue.removeJobScheduler(schedulerKey);
      return false;
    }

    await this.scheduledQueue.upsertJobScheduler(
      schedulerKey,
      { pattern: cronForScheduleTrigger(trigger.data), tz: 'UTC' },
      {
        name: 'scheduled-automation',
        data: {
          tenantId: tenant.tenantId,
          schemaName: tenant.schemaName,
          ruleId: rule.id,
        },
        opts: { removeOnComplete: true, removeOnFail: 100 },
      },
    );
    return true;
  }

  async removeRule(ruleId: string): Promise<void> {
    const { tenantId } = requireTenantContext();
    await this.scheduledQueue?.removeJobScheduler(this.schedulerKey(tenantId, ruleId));
  }

  async enqueueNow(rule: AutomationRuleEntity): Promise<void> {
    const tenant = requireTenantContext();
    const trigger = automationTriggerSchema.safeParse(rule.trigger);
    if (!rule.enabled || !trigger.success || trigger.data.type !== 'schedule') {
      throw new BadRequestException('Only enabled scheduled rules can be run manually');
    }
    if (!this.automationQueue) throw new Error('Automation queue is not available');

    await this.automationQueue.add(
      'evaluate-schedule',
      {
        kind: 'schedule',
        tenantId: tenant.tenantId,
        schemaName: tenant.schemaName,
        ruleId: rule.id,
        scheduledAt: new Date().toISOString(),
      },
      { removeOnComplete: true, removeOnFail: 100 },
    );
  }

  private schedulerKey(tenantId: string, ruleId: string): string {
    return `${SCHEDULER_KEY_PREFIX}${tenantId}:${ruleId}`;
  }
}
