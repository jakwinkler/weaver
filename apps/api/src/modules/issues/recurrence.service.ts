import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IssueEntity, ProjectEntity } from '@weaver/db';
import { recurrenceRuleSchema, type CreateIssueDto, type RecurrenceRule } from '@weaver/shared';
import { Job, Queue, Worker } from 'bullmq';
import { TenantConnectionProvider, TenantService, tenantStorage } from '../../core/tenant';
import { IssuesService } from './issues.service';

interface RecurrenceJobData {
  through?: string;
}

const DAILY_RECURRENCE_JOB = 'daily-recurrence-scan';

@Injectable()
export class RecurrenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecurrenceService.name);
  private queue?: Queue<RecurrenceJobData>;
  private worker?: Worker<RecurrenceJobData>;

  constructor(
    private readonly config: ConfigService,
    private readonly tenants: TenantService,
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly issuesService: IssuesService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get('RECURRENCE_SCHEDULER_ENABLED', 'true') === 'false') {
      return;
    }

    const queueName = this.config.get('RECURRENCE_QUEUE_NAME', 'recurring-tasks');
    const baseConnection = {
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6380),
      password: this.config.get<string>('REDIS_PASSWORD') || undefined,
    };

    this.queue = new Queue<RecurrenceJobData>(queueName, {
      connection: { ...baseConnection, maxRetriesPerRequest: 1 },
    });
    this.queue.on('error', (error) => {
      this.logger.error(`Recurrence queue error: ${error.message}`);
    });

    this.worker = new Worker<RecurrenceJobData>(queueName, (job) => this.runJob(job), {
      connection: { ...baseConnection, maxRetriesPerRequest: null },
      concurrency: 1,
    });
    this.worker.on('error', (error) => {
      this.logger.error(`Recurrence worker error: ${error.message}`);
    });

    await this.queue.add(
      DAILY_RECURRENCE_JOB,
      {},
      {
        jobId: DAILY_RECURRENCE_JOB,
        repeat: { pattern: '0 0 * * *' },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  async processAllTenants(through = new Date()): Promise<IssueEntity[]> {
    const created: IssueEntity[] = [];
    for (const tenant of await this.tenants.findAll()) {
      const tenantIssues = await tenantStorage.run(
        { tenantId: tenant.id, schemaName: tenant.schemaName },
        () => this.processDueRecurrences(through),
      );
      created.push(...tenantIssues);
    }
    return created;
  }

  async processDueRecurrences(through = new Date()): Promise<IssueEntity[]> {
    const em = await this.tenantConnections.getEntityManager();
    const roots = await em
      .getRepository(IssueEntity)
      .createQueryBuilder('issue')
      .where('issue.recurrenceRule IS NOT NULL')
      .andWhere('issue.recurrenceParentId IS NULL')
      .orderBy('issue.createdAt', 'ASC')
      .getMany();
    const created: IssueEntity[] = [];

    for (const root of roots) {
      created.push(...(await this.createDueInstances(root, through)));
    }

    return created;
  }

  private async runJob(job: Job<RecurrenceJobData>): Promise<void> {
    const through = job.data.through ? new Date(job.data.through) : new Date();
    await this.processAllTenants(through);
  }

  private async createDueInstances(root: IssueEntity, through: Date): Promise<IssueEntity[]> {
    const parsedRule = recurrenceRuleSchema.safeParse(root.recurrenceRule);
    if (!parsedRule.success) {
      this.logger.warn(`Skipping invalid recurrence rule on ${root.key}`);
      return [];
    }

    const em = await this.tenantConnections.getEntityManager();
    const issueRepo = em.getRepository(IssueEntity);
    const project = await em.getRepository(ProjectEntity).findOneBy({ id: root.projectId });
    if (!project) {
      this.logger.warn(`Skipping recurring issue ${root.key}: project not found`);
      return [];
    }

    const latest = await issueRepo.findOne({
      where: { recurrenceParentId: root.id },
      order: { recurrenceOccurrence: 'DESC' },
    });
    let occurrence = (latest?.recurrenceOccurrence ?? 0) + 1;
    const created: IssueEntity[] = [];
    const throughDate = startOfUtcDay(through);

    while (true) {
      if (
        parsedRule.data.maxOccurrences !== undefined &&
        occurrence > parsedRule.data.maxOccurrences
      ) {
        await this.stopRecurrence(root);
        break;
      }

      const occurrenceDate = getOccurrenceDate(root, parsedRule.data, occurrence);
      if (parsedRule.data.endDate && occurrenceDate > parseDateOnly(parsedRule.data.endDate)) {
        await this.stopRecurrence(root);
        break;
      }
      if (occurrenceDate > throughDate) break;

      const shiftDays = daysBetween(getAnchorDate(root), occurrenceDate);
      const dto: CreateIssueDto = {
        summary: root.summary,
        description: root.description ?? undefined,
        priority: root.priority as CreateIssueDto['priority'],
        issueTypeId: root.issueTypeId ?? undefined,
        assigneeId: root.assigneeId ?? undefined,
        labels: root.labels,
        parentId: root.parentId ?? undefined,
        epicId: root.epicId ?? undefined,
        customFields: root.customFields,
        startDate: root.startDate
          ? formatDateOnly(addUtcDays(parseDateOnly(root.startDate), shiftDays))
          : formatDateOnly(occurrenceDate),
        dueDate: root.dueDate
          ? formatDateOnly(addUtcDays(parseDateOnly(root.dueDate), shiftDays))
          : undefined,
        percentDone: 0,
        storyPoints: root.storyPoints ?? undefined,
        recurrenceRule: null,
      };

      const instance = await this.issuesService.create(project.key, dto, root.reporterId, {
        parentId: root.id,
        occurrence,
      });
      created.push(instance);
      occurrence += 1;
    }

    return created;
  }

  private async stopRecurrence(root: IssueEntity): Promise<void> {
    if (!root.recurrenceRule) return;
    await this.issuesService.update(root.key, { recurrenceRule: null });
    root.recurrenceRule = null;
  }
}

export function getOccurrenceDate(
  issue: Pick<IssueEntity, 'startDate' | 'dueDate' | 'createdAt'>,
  rule: RecurrenceRule,
  occurrence: number,
): Date {
  const anchor = getAnchorDate(issue);
  if (rule.frequency === 'daily') {
    return addUtcDays(anchor, rule.interval * occurrence);
  }
  if (rule.frequency === 'weekly') {
    if (!rule.daysOfWeek?.length) {
      return addUtcDays(anchor, rule.interval * occurrence * 7);
    }
    return getWeeklyOccurrence(anchor, rule.interval, rule.daysOfWeek, occurrence);
  }
  return addUtcMonthsAtDay(
    anchor,
    rule.interval * occurrence,
    rule.dayOfMonth ?? anchor.getUTCDate(),
  );
}

function getAnchorDate(issue: Pick<IssueEntity, 'startDate' | 'dueDate' | 'createdAt'>): Date {
  if (issue.startDate) return parseDateOnly(issue.startDate);
  if (issue.dueDate) return parseDateOnly(issue.dueDate);
  return startOfUtcDay(issue.createdAt);
}

function getWeeklyOccurrence(
  anchor: Date,
  interval: number,
  configuredDays: number[],
  occurrence: number,
): Date {
  const days = [...configuredDays].sort((a, b) => a - b);
  const weekStart = addUtcDays(anchor, -anchor.getUTCDay());
  const firstWeek = days.map((day) => addUtcDays(weekStart, day)).filter((date) => date > anchor);

  if (occurrence <= firstWeek.length) {
    return firstWeek[occurrence - 1];
  }

  const remaining = occurrence - firstWeek.length - 1;
  const activeWeek = Math.floor(remaining / days.length) + 1;
  const day = days[remaining % days.length];
  return addUtcDays(weekStart, activeWeek * interval * 7 + day);
}

function addUtcMonthsAtDay(date: Date, months: number, dayOfMonth: number): Date {
  const firstOfMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(
      firstOfMonth.getUTCFullYear(),
      firstOfMonth.getUTCMonth(),
      Math.min(dayOfMonth, lastDay),
    ),
  );
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}
