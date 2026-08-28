import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AutomationRuleEntity, IssueEntity, ProjectEntity } from '@weaver/db';
import { Job, Queue, Worker } from 'bullmq';
import { randomUUID } from 'crypto';
import { tenantStorage, getTenantContext, TenantConnectionProvider } from '../../core/tenant';
import { EventDispatcherService } from '../events';
import { ConditionEvaluatorRegistry, PostFunctionRegistry } from '../workflows';
import { AutomationActionExecutorService } from './action-executor.service';
import {
  automationExecutionStorage,
  getAutomationExecutionContext,
} from './automation-execution.context';
import {
  AutomationAction,
  AutomationCondition,
  AutomationEventJobData,
  automationTriggerSchema,
} from './automation.types';
import {
  asAutomationActions,
  asAutomationConditions,
  AutomationsService,
} from './automations.service';
import { AutomationConditionEvaluatorService } from './condition-evaluator.service';

const MAX_CHAIN_DEPTH = 5;
const CONDITION_TYPES = [
  'field_equals',
  'field_not_equals',
  'field_empty',
  'field_contains',
  'status_category',
  'issue_type',
] as const;
const ACTION_TYPES = [
  'set_field',
  'transition',
  'add_label',
  'add_comment',
  'send_notification',
  'webhook',
] as const;

@Injectable()
export class AutomationEngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationEngineService.name);
  private queue?: Queue<AutomationEventJobData>;
  private worker?: Worker<AutomationEventJobData>;
  private unregisterDispatcher?: () => void;

  constructor(
    private readonly config: ConfigService,
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly eventDispatcher: EventDispatcherService,
    private readonly automationsService: AutomationsService,
    private readonly conditionEvaluator: AutomationConditionEvaluatorService,
    private readonly actionExecutor: AutomationActionExecutorService,
    private readonly conditionRegistry: ConditionEvaluatorRegistry,
    private readonly postFunctionRegistry: PostFunctionRegistry,
  ) {}

  onModuleInit(): void {
    const queueName = this.config.get('AUTOMATIONS_QUEUE_NAME', 'automations');
    const baseConnection = {
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6380),
      password: this.config.get<string>('REDIS_PASSWORD') || undefined,
    };

    this.queue = new Queue<AutomationEventJobData>(queueName, {
      connection: { ...baseConnection, maxRetriesPerRequest: 1 },
    });
    this.queue.on('error', (error) => {
      this.logger.error(`Automation queue error: ${error.message}`);
    });
    this.worker = new Worker<AutomationEventJobData>(queueName, (job) => this.runJob(job), {
      connection: { ...baseConnection, maxRetriesPerRequest: null },
      concurrency: this.config.get<number>('AUTOMATIONS_CONCURRENCY', 5),
    });
    this.worker.on('error', (error) => {
      this.logger.error(`Automation worker error: ${error.message}`);
    });

    this.unregisterDispatcher = this.eventDispatcher.registerDomainDispatcher((event, payload) =>
      this.enqueue(event, payload),
    );
    this.registerWorkflowExtensions();
  }

  async onModuleDestroy(): Promise<void> {
    this.unregisterDispatcher?.();
    for (const type of CONDITION_TYPES) this.conditionRegistry.unregister(type);
    for (const type of ACTION_TYPES) this.postFunctionRegistry.unregister(type);
    await this.worker?.close();
    await this.queue?.close();
  }

  private async enqueue(event: string, payload: Record<string, unknown>): Promise<void> {
    const tenant = getTenantContext();
    if (!tenant || !this.queue) return;

    const execution = getAutomationExecutionContext();
    const depth = execution?.depth ?? 0;
    if (depth >= MAX_CHAIN_DEPTH) {
      this.logger.warn(
        `Automation chain ${execution?.chainId ?? 'unknown'} stopped at depth ${depth}`,
      );
      return;
    }

    await this.queue.add(
      'evaluate-event',
      {
        tenantId: tenant.tenantId,
        schemaName: tenant.schemaName,
        event,
        payload,
        depth,
        chainId: execution?.chainId ?? randomUUID(),
      },
      {
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }

  private async runJob(job: Job<AutomationEventJobData>): Promise<void> {
    const data = job.data;
    await tenantStorage.run({ tenantId: data.tenantId, schemaName: data.schemaName }, () =>
      this.evaluateEvent(data),
    );
  }

  private async evaluateEvent(data: AutomationEventJobData): Promise<void> {
    const rules = await this.findMatchingRules(data.event, data.payload);
    const issue = await this.loadIssue(data.payload);

    for (const rule of rules) {
      const actionsExecuted: AutomationAction[] = [];
      let success = true;
      let executionError: string | undefined;
      try {
        const conditions = asAutomationConditions(rule);
        if (conditions.length > 0) {
          if (!issue || !(await this.conditionEvaluator.evaluateAll(conditions, issue))) {
            continue;
          }
        }

        await automationExecutionStorage.run(
          { depth: data.depth + 1, chainId: data.chainId },
          async () => {
            for (const action of asAutomationActions(rule)) {
              await this.actionExecutor.execute(action, {
                issueKey: issue?.key ?? null,
                actorId: this.resolveActorId(data.payload, rule.createdBy),
                event: data.event,
                payload: data.payload,
              });
              actionsExecuted.push(action);
            }
          },
        );
      } catch (error) {
        success = false;
        executionError = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Automation rule ${rule.id} failed: ${executionError}`);
      }

      await this.automationsService.recordExecution({
        ruleId: rule.id,
        event: data.event,
        payload: data.payload,
        actionsExecuted,
        success,
        error: executionError,
      });
    }
  }

  private async findMatchingRules(
    event: string,
    payload: Record<string, unknown>,
  ): Promise<AutomationRuleEntity[]> {
    const em = await this.tenantConnections.getEntityManager();
    const projectId = await this.resolveProjectId(payload, em);
    const query = em
      .getRepository(AutomationRuleEntity)
      .createQueryBuilder('rule')
      .where('rule.enabled = true')
      .andWhere("rule.trigger ->> 'type' = :event", { event })
      .orderBy('rule.createdAt', 'ASC');
    if (projectId) {
      query.andWhere('(rule.project_id IS NULL OR rule.project_id = :projectId)', {
        projectId,
      });
    } else {
      query.andWhere('rule.project_id IS NULL');
    }
    const rules = await query.getMany();

    return rules.filter((rule) => {
      const parsed = automationTriggerSchema.safeParse(rule.trigger);
      if (!parsed.success || parsed.data.type === 'schedule') return false;
      if (parsed.data.type !== event) return false;
      if (parsed.data.type !== 'issue.updated' || !parsed.data.field) return true;
      const fields = payload.fields;
      return (
        fields !== null &&
        typeof fields === 'object' &&
        Object.prototype.hasOwnProperty.call(fields, parsed.data.field)
      );
    });
  }

  private async resolveProjectId(
    payload: Record<string, unknown>,
    em: import('typeorm').EntityManager,
  ): Promise<string | null> {
    if (typeof payload.projectId === 'string') return payload.projectId;
    if (typeof payload.projectKey !== 'string') return null;
    const project = await em.getRepository(ProjectEntity).findOneBy({ key: payload.projectKey });
    return project?.id ?? null;
  }

  private async loadIssue(payload: Record<string, unknown>): Promise<IssueEntity | null> {
    if (typeof payload.issueKey !== 'string') return null;
    const em = await this.tenantConnections.getEntityManager();
    return em.getRepository(IssueEntity).findOneBy({ key: payload.issueKey });
  }

  private resolveActorId(payload: Record<string, unknown>, fallback: string): string {
    return typeof payload.userId === 'string' ? payload.userId : fallback;
  }

  private registerWorkflowExtensions(): void {
    for (const type of CONDITION_TYPES) {
      this.conditionRegistry.register(type, async (context, params) =>
        this.conditionEvaluator.evaluate(
          { type, ...params } as AutomationCondition,
          context.issueData as unknown as IssueEntity,
        ),
      );
    }

    for (const type of ACTION_TYPES) {
      this.postFunctionRegistry.register(type, async (context, params) => {
        const issueKey = context.issueData.key;
        const execution = getAutomationExecutionContext();
        const depth = execution?.depth ?? 0;
        if (depth >= MAX_CHAIN_DEPTH) {
          throw new Error(`Workflow action chain stopped at depth ${depth}`);
        }
        await automationExecutionStorage.run(
          { depth: depth + 1, chainId: execution?.chainId ?? randomUUID() },
          () =>
            this.actionExecutor.execute({ type, ...params } as AutomationAction, {
              issueKey: typeof issueKey === 'string' ? issueKey : null,
              actorId: context.userId,
              event: 'workflow.transitioned',
              payload: {
                issueKey,
                fromStatus: context.fromStatusId,
                toStatus: context.toStatusId,
                userId: context.userId,
              },
            }),
        );
      });
    }
  }
}
