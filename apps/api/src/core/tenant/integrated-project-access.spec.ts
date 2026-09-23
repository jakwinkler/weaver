import 'reflect-metadata';
import { IssuesController } from '../../modules/issues/issues.controller';
import { SprintsController, ProjectSprintReportsController } from '../../modules/sprints/sprints.controller';
import { ProjectAccessGuard } from './project-access.guard';
import { PagesController } from '../../modules/pages/pages.controller';
import { FormsController } from '../../modules/forms/forms.controller';

describe('integrated feature project authorization', () => {
  it.each([
    [IssuesController, 'findBacklog', 'project-key', 'read'],
    [IssuesController, 'findEpicsByProject', 'project-key', 'read'],
    [IssuesController, 'bulkUpdate', 'issue-ids', 'write'],
    [IssuesController, 'bulkDelete', 'issue-ids', 'write'],
    [IssuesController, 'findRecurrence', 'issue-key', 'read'],
    [IssuesController, 'moveToSprint', 'issue-key', 'write'],
    [SprintsController, 'getStats', 'sprint-id', 'read'],
    [SprintsController, 'getBurndown', 'sprint-id', 'read'],
    [SprintsController, 'getSummary', 'sprint-id', 'read'],
    [ProjectSprintReportsController, 'getVelocity', 'project-key', 'read'],
    [PagesController, 'findAll', 'project-key', 'read'],
    [PagesController, 'create', 'project-key', 'write'],
    [FormsController, 'create', 'project-key', 'write'],
  ] as const)('%p.%s is project-scoped', (controller, method, target, mode) => {
    expect(Reflect.getMetadata('__guards__', controller)).toContain(ProjectAccessGuard);
    expect(Reflect.getMetadata('project-access', (controller.prototype as any)[method]) ?? Reflect.getMetadata('project-access', controller)).toEqual({ target, mode });
  });
  it('authorizes the IDs used by bulk endpoints', async () => {
    const access = { assertIssueIds: jest.fn() };
    const guard = new ProjectAccessGuard({ getAllAndOverride: () => ({ target: 'issue-ids', mode: 'write' }) } as never, access as never);
    const user = { userId: 'u' };
    await guard.canActivate({ getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => ({ user, params: {}, query: {}, body: { issueIds: ['i1', 'i2'] } }) }) } as never);
    expect(access.assertIssueIds).toHaveBeenCalledWith(['i1', 'i2'], user, 'write');
  });
});
