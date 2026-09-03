import { BadRequestException, Injectable } from '@nestjs/common';
import { TenantMembershipEntity, WorkflowTransitionEntity } from '@weaver/db';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { updateIssueSchema, UpdateIssueDto } from '@weaver/shared';
import { requireTenantContext, TenantConnectionProvider } from '../../core/tenant';
import { CommentsService } from '../comments';
import { IssuesService } from '../issues';
import { NotificationsService } from '../notifications';
import { WebhooksService } from '../webhooks';
import {
  AutomationAction,
  automationActionSchema,
  AUTOMATION_SETTABLE_FIELDS,
} from './automation.types';

const SETTABLE_FIELDS = new Set<string>(AUTOMATION_SETTABLE_FIELDS);

export interface AutomationActionContext {
  issueKey: string | null;
  actorId: string;
  event: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class AutomationActionExecutorService {
  constructor(
    @InjectRepository(TenantMembershipEntity)
    private readonly membershipRepo: Repository<TenantMembershipEntity>,
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly issuesService: IssuesService,
    private readonly commentsService: CommentsService,
    private readonly notificationsService: NotificationsService,
    private readonly webhooksService: WebhooksService,
  ) {}

  async execute(
    rawAction: AutomationAction | Record<string, unknown>,
    context: AutomationActionContext,
  ): Promise<void> {
    const parsedAction = automationActionSchema.safeParse(rawAction);
    if (!parsedAction.success) {
      throw new BadRequestException('Invalid automation action');
    }
    const action = parsedAction.data;

    switch (action.type) {
      case 'set_field':
        await this.setField(
          this.requireIssueKey(context),
          context.actorId,
          action.field,
          action.value,
        );
        return;
      case 'transition':
        await this.transition(this.requireIssueKey(context), context.actorId, action.statusId);
        return;
      case 'add_label':
        await this.addLabel(this.requireIssueKey(context), context.actorId, action.label);
        return;
      case 'add_comment':
        await this.commentsService.create(
          this.requireIssueKey(context),
          { body: this.normalizeCommentBody(action.body) },
          context.actorId,
          requireTenantContext().tenantId,
        );
        return;
      case 'send_notification':
        await this.assertTenantMember(action.userId);
        await this.notificationsService.create(
          action.userId,
          'automation',
          action.title ??
            (context.issueKey
              ? `Automation triggered for ${context.issueKey}`
              : `Automation triggered by ${context.event}`),
          { ...(context.issueKey ? { issueKey: context.issueKey } : {}), event: context.event },
        );
        return;
      case 'webhook':
        await this.webhooksService.deliverAutomation(action.url, context.event, {
          ...context.payload,
          ...(context.issueKey ? { issueKey: context.issueKey } : {}),
        });
        return;
    }
  }

  private requireIssueKey(context: AutomationActionContext): string {
    if (!context.issueKey) {
      throw new BadRequestException(
        `Action requires an issue but event "${context.event}" has none`,
      );
    }
    return context.issueKey;
  }

  private async assertTenantMember(userId: string): Promise<void> {
    const { tenantId } = requireTenantContext();
    const isMember = await this.membershipRepo.existsBy({ tenantId, userId });
    if (!isMember) {
      throw new BadRequestException(`Notification recipient "${userId}" is not a tenant member`);
    }
  }

  private async setField(
    issueKey: string,
    actorId: string,
    field: string,
    value: unknown,
  ): Promise<void> {
    if (!SETTABLE_FIELDS.has(field)) {
      throw new BadRequestException(`Field "${field}" cannot be set by automation`);
    }

    const parsed = updateIssueSchema.strict().safeParse({ [field]: value });
    if (!parsed.success) {
      throw new BadRequestException(`Invalid value for automation field "${field}"`);
    }

    await this.issuesService.update(issueKey, parsed.data as UpdateIssueDto, actorId);
  }

  private async transition(
    issueKey: string,
    actorId: string,
    targetStatusId: string,
  ): Promise<void> {
    const issue = await this.issuesService.findByKey(issueKey);
    const em = await this.tenantConnections.getEntityManager();
    const transition = await em.getRepository(WorkflowTransitionEntity).findOneBy({
      fromStatusId: issue.statusId,
      toStatusId: targetStatusId,
    });
    if (!transition) {
      throw new BadRequestException(
        `No transition exists from the current status to "${targetStatusId}"`,
      );
    }
    await this.issuesService.transition(issueKey, transition.id, actorId);
  }

  private async addLabel(issueKey: string, actorId: string, label: string): Promise<void> {
    await this.issuesService.addLabel(issueKey, label, actorId);
  }

  private normalizeCommentBody(body: string | Record<string, unknown>): Record<string, unknown> {
    if (typeof body !== 'string') return body;
    return {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: body }],
        },
      ],
    };
  }
}
