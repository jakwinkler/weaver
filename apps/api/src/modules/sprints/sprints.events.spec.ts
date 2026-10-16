import { ActivityLogEntity, IssueEntity, SprintEntity } from '@weaver/db';
import type { CreateSprintDto } from '@weaver/shared';
import type { TenantConnectionProvider } from '../../core/tenant';
import type { EventDispatcherService } from '../events';
import { SprintsService } from './sprints.service';

describe('SprintsService live events', () => {
  const sprintRepository = {
    create: jest.fn((value) => value),
    save: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    remove: jest.fn(),
  };
  const issueRepository = {
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
    save: jest.fn(async (value) => value),
  };
  const activityRepository = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };
  const manager: Record<string, jest.Mock> = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === SprintEntity) return sprintRepository;
      if (entity === IssueEntity) return issueRepository;
      if (entity === ActivityLogEntity) return activityRepository;
      throw new Error('Unexpected repository');
    }),
    query: jest.fn(),
  };
  manager.transaction = jest.fn(async (callback: (value: unknown) => unknown) => callback(manager));
  const tenantConnections = {
    getEntityManager: jest.fn().mockResolvedValue(manager),
    runInTenantTransaction: jest.fn(async (callback: (value: unknown) => unknown) => callback(manager)),
  };
  const eventDispatcher = { emit: jest.fn().mockResolvedValue(undefined) };
  let service: SprintsService;

  const plannedSprint = () => ({
    id: 'sprint-1',
    projectId: 'project-1',
    name: 'Sprint 4',
    status: 'planned',
    startDate: null,
    endDate: null,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    tenantConnections.getEntityManager.mockResolvedValue(manager);
    eventDispatcher.emit.mockResolvedValue(undefined);
    issueRepository.find.mockResolvedValue([]);
    sprintRepository.save.mockImplementation(async (value) => ({ id: 'sprint-1', ...value }));
    service = new SprintsService(
      tenantConnections as unknown as TenantConnectionProvider,
      eventDispatcher as unknown as EventDispatcherService,
    );
  });

  it('announces a new sprint to its project with the sprint name and creator', async () => {
    await service.create('project-1', { name: 'Sprint 4' } as CreateSprintDto, 'user-1');

    expect(eventDispatcher.emit).toHaveBeenCalledWith('sprint.created', {
      sprintId: 'sprint-1',
      projectId: 'project-1',
      name: 'Sprint 4',
      userId: 'user-1',
    });
  });

  it('announces an edited sprint', async () => {
    sprintRepository.findOneBy.mockResolvedValue(plannedSprint());

    await service.update('sprint-1', { name: 'Sprint 4b' }, 'user-1');

    expect(eventDispatcher.emit).toHaveBeenCalledWith('sprint.updated', {
      sprintId: 'sprint-1',
      projectId: 'project-1',
      name: 'Sprint 4b',
      userId: 'user-1',
    });
  });

  it('keeps the sprint ID in the delete event after the row is removed', async () => {
    const sprint = plannedSprint();
    sprintRepository.findOneBy.mockResolvedValue(sprint);
    // TypeORM clears the primary key of entities it removes.
    sprintRepository.remove.mockImplementation(async (value) => {
      value.id = undefined;
      return value;
    });

    await service.delete('sprint-1', 'user-1');

    expect(eventDispatcher.emit).toHaveBeenCalledWith('sprint.deleted', {
      sprintId: 'sprint-1',
      projectId: 'project-1',
      name: 'Sprint 4',
      userId: 'user-1',
    });
  });

  it('names the user who started a sprint', async () => {
    sprintRepository.findOne.mockResolvedValue(plannedSprint());
    sprintRepository.findOneBy.mockResolvedValue(null);

    await service.start('sprint-1', 'user-1');

    expect(eventDispatcher.emit).toHaveBeenCalledWith('sprint.started', {
      sprintId: 'sprint-1',
      projectId: 'project-1',
      name: 'Sprint 4',
      userId: 'user-1',
    });
  });

  it('names the user who completed a sprint', async () => {
    sprintRepository.findOne.mockResolvedValue({ ...plannedSprint(), status: 'active' });

    await service.complete('sprint-1', 'user-1');

    expect(eventDispatcher.emit).toHaveBeenCalledWith('sprint.completed', {
      sprintId: 'sprint-1',
      projectId: 'project-1',
      name: 'Sprint 4',
      userId: 'user-1',
    });
  });

  it('announces issues added to a sprint as one bulk update to their project', async () => {
    sprintRepository.findOne.mockResolvedValue(plannedSprint());
    issueRepository.find.mockResolvedValue([
      { id: 'issue-1', key: 'WEB-1', projectId: 'project-1', sprintId: null },
      { id: 'issue-2', key: 'WEB-2', projectId: 'project-1', sprintId: 'sprint-1' },
      { id: 'issue-3', key: 'WEB-3', projectId: 'project-1', sprintId: null },
    ]);

    await service.addIssues('sprint-1', ['issue-1', 'issue-2', 'issue-3'], 'user-1');

    expect(eventDispatcher.emit).toHaveBeenCalledTimes(1);
    expect(eventDispatcher.emit).toHaveBeenCalledWith('issue.bulk_updated', {
      updates: { sprintId: 'sprint-1' },
      userId: 'user-1',
      projectKey: 'WEB',
      projectKeys: ['WEB'],
      issueIds: ['issue-1', 'issue-3'],
      issueKeys: ['WEB-1', 'WEB-3'],
      count: 2,
    });
  });

  it('sends no event when every issue was already in the sprint', async () => {
    sprintRepository.findOne.mockResolvedValue(plannedSprint());
    issueRepository.find.mockResolvedValue([
      { id: 'issue-2', key: 'WEB-2', projectId: 'project-1', sprintId: 'sprint-1' },
    ]);

    await service.addIssues('sprint-1', ['issue-2'], 'user-1');

    expect(eventDispatcher.emit).not.toHaveBeenCalled();
  });

  it('does not announce issues a rejected request did not move', async () => {
    sprintRepository.findOne.mockResolvedValue(plannedSprint());
    issueRepository.find.mockResolvedValue([
      { id: 'issue-1', key: 'WEB-1', projectId: 'project-1', sprintId: 'sprint-9' },
    ]);

    await expect(service.addIssues('sprint-1', ['issue-1'], 'user-1')).rejects.toThrow(
      'An issue already belongs to another sprint',
    );
    expect(eventDispatcher.emit).not.toHaveBeenCalled();
  });

  it('does not announce a sprint that failed to save', async () => {
    sprintRepository.save.mockRejectedValue(new Error('constraint violation'));

    await expect(service.create('project-1', { name: 'Sprint 4' } as CreateSprintDto, 'user-1')).rejects.toThrow(
      'constraint violation',
    );
    expect(eventDispatcher.emit).not.toHaveBeenCalled();
  });
});
