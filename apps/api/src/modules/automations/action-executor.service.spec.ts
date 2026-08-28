import { BadRequestException } from '@nestjs/common';
import { tenantStorage } from '../../core/tenant';
import { AutomationActionExecutorService } from './action-executor.service';

describe('AutomationActionExecutorService', () => {
  const issuesService = {
    findByKey: jest.fn(),
    update: jest.fn(),
    transition: jest.fn(),
    addLabel: jest.fn(),
  };
  const commentsService = { create: jest.fn() };
  const notificationsService = { create: jest.fn() };
  const webhooksService = { deliverAutomation: jest.fn() };
  const membershipRepo = { existsBy: jest.fn().mockResolvedValue(true) };
  const transitionRepo = { findOneBy: jest.fn() };
  const tenantConnections = {
    getEntityManager: jest.fn().mockResolvedValue({
      getRepository: jest.fn().mockReturnValue(transitionRepo),
    }),
  };

  const service = new AutomationActionExecutorService(
    membershipRepo as never,
    tenantConnections as never,
    issuesService as never,
    commentsService as never,
    notificationsService as never,
    webhooksService as never,
  );

  const context = {
    issueKey: 'AUTO-1',
    actorId: '00000000-0000-4000-8000-000000000001',
    event: 'issue.created',
    payload: { issueKey: 'AUTO-1' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets an allowlisted field through IssuesService', async () => {
    await service.execute({ type: 'set_field', field: 'priority', value: 'high' }, context);

    expect(issuesService.update).toHaveBeenCalledWith(
      'AUTO-1',
      { priority: 'high' },
      context.actorId,
    );
  });

  it('rejects fields that bypass workflow transitions', async () => {
    await expect(
      service.execute(
        {
          type: 'set_field',
          field: 'statusId',
          value: '00000000-0000-4000-8000-000000000002',
        },
        context,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resolves a target status to a valid workflow transition', async () => {
    issuesService.findByKey.mockResolvedValue({ statusId: 'status-from' });
    transitionRepo.findOneBy.mockResolvedValue({ id: 'transition-1' });

    await service.execute(
      {
        type: 'transition',
        statusId: '00000000-0000-4000-8000-000000000002',
      },
      context,
    );

    expect(issuesService.transition).toHaveBeenCalledWith(
      'AUTO-1',
      'transition-1',
      context.actorId,
    );
  });

  it('delegates label updates to the atomic issue operation', async () => {
    await service.execute({ type: 'add_label', label: 'urgent' }, context);
    expect(issuesService.addLabel).toHaveBeenCalledWith('AUTO-1', 'urgent', context.actorId);
  });

  it('normalizes plain-text comments to rich-text documents', async () => {
    await service.execute({ type: 'add_comment', body: 'Automated comment' }, context);

    expect(commentsService.create).toHaveBeenCalledWith(
      'AUTO-1',
      {
        body: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Automated comment' }],
            },
          ],
        },
      },
      context.actorId,
    );
  });

  it('sends notifications and webhooks through their services', async () => {
    const userId = '00000000-0000-4000-8000-000000000003';
    await tenantStorage.run({ tenantId: 'tenant-1', schemaName: 'tenant_1' }, () =>
      service.execute({ type: 'send_notification', userId, title: 'Automation notice' }, context),
    );
    await service.execute({ type: 'webhook', url: 'https://example.com/automation' }, context);

    expect(notificationsService.create).toHaveBeenCalledWith(
      userId,
      'automation',
      'Automation notice',
      { issueKey: 'AUTO-1', event: 'issue.created' },
    );
    expect(webhooksService.deliverAutomation).toHaveBeenCalledWith(
      'https://example.com/automation',
      'issue.created',
      { issueKey: 'AUTO-1' },
    );
  });

  it('allows non-issue notifications but rejects issue-only actions', async () => {
    const sprintContext = {
      ...context,
      issueKey: null,
      event: 'sprint.started',
    };
    await tenantStorage.run({ tenantId: 'tenant-1', schemaName: 'tenant_1' }, () =>
      service.execute(
        {
          type: 'send_notification',
          userId: '00000000-0000-4000-8000-000000000003',
        },
        sprintContext,
      ),
    );
    await expect(
      service.execute({ type: 'add_label', label: 'invalid' }, sprintContext),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects notification recipients outside the active tenant', async () => {
    membershipRepo.existsBy.mockResolvedValueOnce(false);
    await expect(
      tenantStorage.run({ tenantId: 'tenant-1', schemaName: 'tenant_1' }, () =>
        service.execute(
          {
            type: 'send_notification',
            userId: '00000000-0000-4000-8000-000000000004',
          },
          context,
        ),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
