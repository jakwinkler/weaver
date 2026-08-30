import { ConflictException, NotFoundException } from '@nestjs/common';
import { IssueEntity, TimeEntryEntity } from '@weaver/db';
import { TimeTrackingService } from './time-tracking.service';

describe('TimeTrackingService manual worklog contract', () => {
  const issueRepository = {
    findOneBy: jest.fn(),
  };
  const timeEntryRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOneBy: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const entityManager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === IssueEntity) return issueRepository;
      if (entity === TimeEntryEntity) return timeEntryRepository;
      throw new Error('Unexpected repository');
    }),
    transaction: jest.fn(),
  };
  const tenantConnections = {
    getEntityManager: jest.fn().mockResolvedValue(entityManager),
  };
  const eventDispatcher = {
    emit: jest.fn().mockResolvedValue(undefined),
  };

  let service: TimeTrackingService;

  beforeEach(() => {
    jest.clearAllMocks();
    tenantConnections.getEntityManager.mockResolvedValue(entityManager);
    eventDispatcher.emit.mockResolvedValue(undefined);
    entityManager.transaction.mockImplementation(async (callback) => callback(entityManager));
    service = new TimeTrackingService(tenantConnections as any, eventDispatcher as any);
  });

  it('creates an issue-linked entry and emits the existing time.logged event', async () => {
    issueRepository.findOneBy.mockResolvedValue({ id: 'issue-1', key: 'WEB-1' });
    timeEntryRepository.create.mockImplementation((value) => value);
    timeEntryRepository.save.mockImplementation(async (value) => ({
      id: 'entry-1',
      createdAt: new Date('2026-08-29T12:00:00Z'),
      ...value,
    }));

    const result = await service.create(
      'WEB-1',
      { minutes: 45, description: 'Review plugin architecture' },
      'user-1',
    );

    expect(issueRepository.findOneBy).toHaveBeenCalledWith({ key: 'WEB-1' });
    expect(timeEntryRepository.create).toHaveBeenCalledWith({
      issueId: 'issue-1',
      userId: 'user-1',
      minutes: 45,
      description: 'Review plugin architecture',
      loggedAt: expect.any(Date),
      startedAt: null,
      endedAt: null,
      source: 'manual',
      sourcePluginId: null,
      sourceReference: null,
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 'entry-1',
        issueId: 'issue-1',
        userId: 'user-1',
        minutes: 45,
      }),
    );
    expect(eventDispatcher.emit).toHaveBeenCalledWith('time.logged', {
      issueKey: 'WEB-1',
      minutes: 45,
      description: 'Review plugin architecture',
      userId: 'user-1',
    });
  });

  it('stores an omitted manual description as null', async () => {
    issueRepository.findOneBy.mockResolvedValue({ id: 'issue-1', key: 'WEB-1' });
    timeEntryRepository.create.mockImplementation((value) => value);
    timeEntryRepository.save.mockImplementation(async (value) => value);

    await service.create('WEB-1', { minutes: 15 }, 'user-1');

    expect(timeEntryRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ description: null }),
    );
  });

  it('records entries created by the existing timer with the timer source', async () => {
    issueRepository.findOneBy.mockResolvedValue({ id: 'issue-1', key: 'WEB-1' });
    timeEntryRepository.create.mockImplementation((value) => value);
    timeEntryRepository.save.mockImplementation(async (value) => value);

    await service.create(
      'WEB-1',
      { minutes: 15, description: 'Timer session', source: 'timer' },
      'user-1',
    );

    expect(timeEntryRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'timer' }),
    );
  });

  it('rejects manual time for an issue that does not exist', async () => {
    issueRepository.findOneBy.mockResolvedValue(null);

    await expect(service.create('MISSING-1', { minutes: 15 }, 'user-1')).rejects.toThrow(
      new NotFoundException('Issue "MISSING-1" not found'),
    );
    expect(timeEntryRepository.save).not.toHaveBeenCalled();
  });

  it('lists issue entries newest first', async () => {
    issueRepository.findOneBy.mockResolvedValue({ id: 'issue-1', key: 'WEB-1' });
    const entries = [{ id: 'entry-2' }, { id: 'entry-1' }];
    timeEntryRepository.find.mockResolvedValue(entries);

    await expect(service.findByIssue('WEB-1')).resolves.toBe(entries);
    expect(timeEntryRepository.find).toHaveBeenCalledWith({
      where: { issueId: 'issue-1' },
      order: { createdAt: 'DESC' },
    });
  });

  it('updates only fields supplied by the caller', async () => {
    const entry = {
      id: 'entry-1',
      minutes: 30,
      description: 'Original',
    } as TimeEntryEntity;
    timeEntryRepository.findOneBy.mockResolvedValue(entry);
    timeEntryRepository.save.mockImplementation(async (value) => value);

    await expect(service.update('entry-1', { minutes: 60 })).resolves.toEqual({
      id: 'entry-1',
      minutes: 60,
      description: 'Original',
    });
    expect(timeEntryRepository.save).toHaveBeenCalledWith(entry);
  });

  it('rejects updates to locked official time', async () => {
    timeEntryRepository.findOneBy.mockResolvedValue({
      id: 'entry-1',
      minutes: 30,
      description: 'Locked',
      lockedAt: new Date('2026-08-29T12:00:00Z'),
      lockReason: 'Invoiced',
    } as TimeEntryEntity);

    await expect(service.update('entry-1', { minutes: 60 })).rejects.toThrow(
      new ConflictException('Time entry "entry-1" is locked: Invoiced'),
    );
    expect(timeEntryRepository.save).not.toHaveBeenCalled();
  });

  it('deletes an existing manual entry', async () => {
    const entry = { id: 'entry-1' } as TimeEntryEntity;
    timeEntryRepository.findOneBy.mockResolvedValue(entry);

    await service.delete('entry-1');

    expect(timeEntryRepository.remove).toHaveBeenCalledWith(entry);
  });

  it('rejects deletion of locked official time', async () => {
    timeEntryRepository.findOneBy.mockResolvedValue({
      id: 'entry-1',
      lockedAt: new Date('2026-08-29T12:00:00Z'),
      lockReason: null,
    } as TimeEntryEntity);

    await expect(service.delete('entry-1')).rejects.toThrow(
      new ConflictException('Time entry "entry-1" is locked'),
    );
    expect(timeEntryRepository.remove).not.toHaveBeenCalled();
  });

  it('creates an atomic plugin batch and returns the original entries on retry', async () => {
    const savedEntry = {
      id: 'entry-1',
      issueId: 'issue-1',
      userId: 'user-1',
      minutes: 45,
      description: 'Automatic draft',
      source: 'plugin',
      sourcePluginId: '@weaver/plugin-automatic-time',
      sourceReference: 'draft-1',
      startedAt: new Date('2026-08-29T13:00:00Z'),
      endedAt: new Date('2026-08-29T13:45:00Z'),
      loggedAt: new Date('2026-08-29T13:00:00Z'),
    } as TimeEntryEntity;

    issueRepository.findOneBy.mockResolvedValue({ id: 'issue-1', key: 'WEB-1' });
    timeEntryRepository.findOneBy.mockResolvedValueOnce(null).mockResolvedValueOnce(savedEntry);
    timeEntryRepository.create.mockImplementation((value) => value);
    timeEntryRepository.save.mockResolvedValue(savedEntry);

    const request = {
      entries: [
        {
          issueKey: 'WEB-1',
          sourceReference: 'draft-1',
          minutes: 45,
          description: 'Automatic draft',
          startedAt: '2026-08-29T13:00:00Z',
          endedAt: '2026-08-29T13:45:00Z',
        },
      ],
    };

    await expect(
      service.createBatch('@weaver/plugin-automatic-time', request, 'user-1'),
    ).resolves.toEqual({ entries: [savedEntry], created: 1 });
    await expect(
      service.createBatch('@weaver/plugin-automatic-time', request, 'user-1'),
    ).resolves.toEqual({ entries: [savedEntry], created: 0 });

    expect(entityManager.transaction).toHaveBeenCalledTimes(2);
    expect(timeEntryRepository.save).toHaveBeenCalledTimes(1);
    expect(timeEntryRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        issueId: 'issue-1',
        userId: 'user-1',
        source: 'plugin',
        sourcePluginId: '@weaver/plugin-automatic-time',
        sourceReference: 'draft-1',
      }),
    );
  });

  it('returns a numeric total for the issue summary', async () => {
    issueRepository.findOneBy.mockResolvedValue({ id: 'issue-1', key: 'WEB-1' });
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ totalMinutes: '105' }),
    };
    timeEntryRepository.createQueryBuilder.mockReturnValue(queryBuilder);

    await expect(service.getSummary('WEB-1')).resolves.toEqual({
      totalMinutes: 105,
    });
    expect(queryBuilder.where).toHaveBeenCalledWith('te.issue_id = :issueId', {
      issueId: 'issue-1',
    });
  });
});
