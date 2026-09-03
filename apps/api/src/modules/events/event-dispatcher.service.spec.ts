import { tenantStorage } from '../../core/tenant/tenant.context';
import { EventDispatcherService } from './event-dispatcher.service';
import { ProjectEntity, WebhookEntity } from '@weaver/db';

describe('EventDispatcherService project isolation', () => {
  it('resolves project-ID events to their authorized project channel', async () => {
    const gateway = { emitToTenant: jest.fn(), emitToProject: jest.fn() };
    const manager = { getRepository: (entity: unknown) => entity === ProjectEntity
      ? { findOneBy: jest.fn().mockResolvedValue({ key: 'PRIVATE' }) }
      : { find: jest.fn().mockResolvedValue([]) } };
    const service = new EventDispatcherService({ getEntityManager: async () => manager } as never, {} as never, gateway as never);
    await tenantStorage.run({ tenantId: 'tenant-a', schemaName: 'tenant_a' }, () => service.emit('sprint.started', { projectId: 'project-a', sprintId: 'sprint-a' }));
    expect(gateway.emitToTenant).not.toHaveBeenCalled();
    expect(gateway.emitToProject).toHaveBeenCalledWith('tenant-a', 'PRIVATE', 'sprint.started', expect.any(Object));
  });
  it('emits project events only to the authorized project channel', async () => {
    const gateway = {
      emitToTenant: jest.fn(),
      emitToProject: jest.fn(),
    };
    const entityManager = {
      getRepository: jest.fn().mockReturnValue({
        find: jest.fn().mockResolvedValue([]),
      }),
    };
    const service = new EventDispatcherService(
      { getEntityManager: jest.fn().mockResolvedValue(entityManager) } as never,
      { deliver: jest.fn() } as never,
      gateway as never,
    );

    await tenantStorage.run(
      { tenantId: 'tenant-a', schemaName: 'tenant_a' },
      () =>
        service.emit('issue.updated', {
          issueKey: 'PRIVATE-1',
          projectKey: 'PRIVATE',
          summary: 'restricted',
        }),
    );

    expect(gateway.emitToTenant).not.toHaveBeenCalled();
    expect(gateway.emitToProject).toHaveBeenCalledWith(
      'tenant-a',
      'PRIVATE',
      'issue.updated',
      expect.objectContaining({
        event: 'issue.updated',
        data: expect.objectContaining({ issueKey: 'PRIVATE-1' }),
      }),
    );
  });

  it('delivers project-scoped webhooks only for their project', async () => {
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const webhooks = [
      { id: 'global', projectId: null, active: true, events: ['issue.updated'] },
      { id: 'project-a', projectId: 'project-a-id', active: true, events: ['issue.updated'] },
      { id: 'project-b', projectId: 'project-b-id', active: true, events: ['issue.updated'] },
    ];
    const entityManager = {
      getRepository: jest.fn((entity) => {
        if (entity === WebhookEntity) {
          return { find: jest.fn().mockResolvedValue(webhooks) };
        }
        if (entity === ProjectEntity) {
          return { findOneBy: jest.fn().mockResolvedValue({ id: 'project-a-id' }) };
        }
        throw new Error('unexpected repository');
      }),
    };
    const service = new EventDispatcherService(
      { getEntityManager: jest.fn().mockResolvedValue(entityManager) } as never,
      { enqueue } as never,
      { emitToProject: jest.fn() } as never,
    );

    await tenantStorage.run(
      { tenantId: 'tenant-a', schemaName: 'tenant_a' },
      () => service.emit('issue.updated', { projectKey: 'A', issueKey: 'A-1' }),
    );

    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue).toHaveBeenCalledWith('global', 'issue.updated', expect.any(Object));
    expect(enqueue).toHaveBeenCalledWith('project-a', 'issue.updated', expect.any(Object));
    expect(enqueue).not.toHaveBeenCalledWith('project-b', expect.anything(), expect.anything());
  });
});
