import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AutomationLogEntity, AutomationRuleEntity, ProjectEntity } from '@weaver/db';
import { requireTenantContext, TenantConnectionProvider } from '../../core/tenant';
import {
  AutomationAction,
  AutomationCondition,
  CreateAutomationRuleDto,
  createAutomationRuleSchema,
  UpdateAutomationRuleDto,
} from './automation.types';
import { AutomationSchedulerService } from './automation-scheduler.service';

@Injectable()
export class AutomationsService {
  constructor(
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly scheduler: AutomationSchedulerService,
  ) {}

  async create(dto: CreateAutomationRuleDto, createdBy: string): Promise<AutomationRuleEntity> {
    await this.validateProject(dto.projectId);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(AutomationRuleEntity);
    const rule = repo.create({
      projectId: dto.projectId ?? null,
      name: dto.name,
      enabled: dto.enabled,
      trigger: dto.trigger,
      conditions: dto.conditions,
      actions: dto.actions,
      createdBy,
    });
    const saved = await repo.save(rule);
    await this.scheduler.syncRule(saved);
    return saved;
  }

  async findAll(projectId?: string): Promise<AutomationRuleEntity[]> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(AutomationRuleEntity);
    return repo.find({
      where: projectId ? { projectId } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<AutomationRuleEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const rule = await em.getRepository(AutomationRuleEntity).findOneBy({ id });
    if (!rule) {
      throw new NotFoundException(`Automation rule "${id}" not found`);
    }
    return rule;
  }

  async update(id: string, dto: UpdateAutomationRuleDto): Promise<AutomationRuleEntity> {
    const rule = await this.findById(id);
    if (dto.projectId !== undefined) await this.validateProject(dto.projectId);

    const merged = createAutomationRuleSchema.safeParse({
      projectId: dto.projectId !== undefined ? dto.projectId : rule.projectId,
      name: dto.name ?? rule.name,
      enabled: dto.enabled ?? rule.enabled,
      trigger: dto.trigger ?? rule.trigger,
      conditions: dto.conditions ?? rule.conditions,
      actions: dto.actions ?? rule.actions,
    });
    if (!merged.success) {
      throw new BadRequestException(merged.error.flatten());
    }

    if (dto.projectId !== undefined) rule.projectId = dto.projectId;
    if (dto.name !== undefined) rule.name = dto.name;
    if (dto.enabled !== undefined) rule.enabled = dto.enabled;
    if (dto.trigger !== undefined) rule.trigger = dto.trigger;
    if (dto.conditions !== undefined) rule.conditions = dto.conditions;
    if (dto.actions !== undefined) rule.actions = dto.actions;

    const em = await this.tenantConnections.getEntityManager();
    const saved = await em.getRepository(AutomationRuleEntity).save(rule);
    await this.scheduler.syncRule(saved);
    return saved;
  }

  async delete(id: string): Promise<void> {
    const rule = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    await em.getRepository(AutomationRuleEntity).remove(rule);
    await this.scheduler.removeRule(id);
  }

  async runNow(id: string): Promise<{ queued: true }> {
    const rule = await this.findById(id);
    await this.scheduler.enqueueNow(rule);
    return { queued: true };
  }

  async findExecutions(ruleId: string): Promise<AutomationLogEntity[]> {
    await this.findById(ruleId);
    const em = await this.tenantConnections.getEntityManager();
    return em.getRepository(AutomationLogEntity).find({
      where: { ruleId },
      order: { triggeredAt: 'DESC' },
      take: 100,
    });
  }

  async recordExecution(input: {
    ruleId: string;
    event: string;
    payload: Record<string, unknown>;
    actionsExecuted: Array<AutomationAction | Record<string, unknown>>;
    success: boolean;
    error?: string;
  }): Promise<void> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(AutomationLogEntity);
    await repo.save(
      repo.create({
        ruleId: input.ruleId,
        triggeredBy: { event: input.event, payload: input.payload },
        actionsExecuted: input.actionsExecuted,
        success: input.success,
        error: input.error ?? null,
      }),
    );

    const schemaName = requireTenantContext().schemaName;
    const tablePath = `${em.connection.driver.escape(schemaName)}.${em.connection.driver.escape(
      repo.metadata.tableName,
    )}`;
    await em.query(
      `DELETE FROM ${tablePath}
       WHERE rule_id = $1
         AND id NOT IN (
           SELECT id FROM ${tablePath}
           WHERE rule_id = $1
           ORDER BY triggered_at DESC, id DESC
           LIMIT 100
         )`,
      [input.ruleId],
    );
  }

  private async validateProject(projectId: string | null | undefined): Promise<void> {
    if (!projectId) return;
    const em = await this.tenantConnections.getEntityManager();
    const exists = await em.getRepository(ProjectEntity).existsBy({ id: projectId });
    if (!exists) throw new NotFoundException(`Project "${projectId}" not found`);
  }
}

export function asAutomationConditions(rule: AutomationRuleEntity): AutomationCondition[] {
  return rule.conditions as AutomationCondition[];
}

export function asAutomationActions(rule: AutomationRuleEntity): AutomationAction[] {
  return rule.actions as AutomationAction[];
}
