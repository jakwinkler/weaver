import { IssueTypeEntity, WorkflowStatusEntity } from '@weaver/db';
import { AutomationConditionEvaluatorService } from './condition-evaluator.service';

describe('AutomationConditionEvaluatorService', () => {
  const statusRepo = { findOneBy: jest.fn() };
  const issueTypeRepo = { findOneBy: jest.fn() };
  const entityManager = {
    getRepository: jest.fn((entity) =>
      entity === WorkflowStatusEntity ? statusRepo : issueTypeRepo,
    ),
  };
  const tenantConnections = {
    getEntityManager: jest.fn().mockResolvedValue(entityManager),
  };
  const service = new AutomationConditionEvaluatorService(tenantConnections as never);
  const issue = {
    priority: 'high',
    assigneeId: null,
    labels: [],
    statusId: 'status-1',
    issueTypeId: 'type-1',
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('evaluates field equality and empty values', async () => {
    await expect(
      service.evaluate({ type: 'field_equals', field: 'priority', value: 'high' }, issue),
    ).resolves.toBe(true);
    await expect(
      service.evaluate({ type: 'field_empty', field: 'assigneeId' }, issue),
    ).resolves.toBe(true);
    await expect(service.evaluate({ type: 'field_empty', field: 'labels' }, issue)).resolves.toBe(
      true,
    );
  });

  it('evaluates inequality and contains for strings and arrays', async () => {
    await expect(
      service.evaluate({ type: 'field_not_equals', field: 'priority', value: 'low' }, issue),
    ).resolves.toBe(true);
    await expect(
      service.evaluate({ type: 'field_contains', field: 'labels', value: 'urgent' }, {
        ...issue,
        labels: ['urgent', 'customer'],
      } as never),
    ).resolves.toBe(true);
    await expect(
      service.evaluate({ type: 'field_contains', field: 'summary', value: 'release' }, {
        ...issue,
        summary: 'Prepare release notes',
      } as never),
    ).resolves.toBe(true);
  });

  it('evaluates status categories from the tenant workflow', async () => {
    statusRepo.findOneBy.mockResolvedValue({ category: 'done' });
    await expect(service.evaluate({ type: 'status_category', value: 'done' }, issue)).resolves.toBe(
      true,
    );
  });

  it('matches issue types by slug or display name', async () => {
    issueTypeRepo.findOneBy.mockResolvedValue({ slug: 'bug', name: 'Bug' });
    await expect(service.evaluate({ type: 'issue_type', value: 'bug' }, issue)).resolves.toBe(true);
    await expect(service.evaluate({ type: 'issue_type', value: 'Bug' }, issue)).resolves.toBe(true);
  });

  it('short-circuits when one condition does not match', async () => {
    await expect(
      service.evaluateAll(
        [
          { type: 'field_equals', field: 'priority', value: 'high' },
          { type: 'field_equals', field: 'priority', value: 'low' },
        ],
        issue,
      ),
    ).resolves.toBe(false);
  });
});
