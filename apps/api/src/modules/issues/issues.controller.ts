import { Audit } from '../audit';
import { z } from 'zod';
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  bulkDeleteIssuesSchema,
  bulkUpdateIssuesSchema,
  createIssueSchema,
  moveIssueSprintSchema,
  updateIssueSchema,
  reorderIssuesSchema,
} from '@weaver/shared';
import {
  JwtAuthGuard,
  PermissionGuard,
  PermissionService,
  RequirePermission,
  CurrentUser,
  RequestUser,
} from '../../core/auth';
import { ZodValidationPipe, parsePagination } from '../../common';
import { IssueChangeAuthorizer, IssuesService } from './issues.service';
import { MemberVisibilityService, ProjectAccessGuard, RequireProjectAccess } from '../../core/tenant';

@Controller()
@UseGuards(JwtAuthGuard, PermissionGuard, ProjectAccessGuard)
export class IssuesController {
  constructor(
    private readonly issuesService: IssuesService,
    private readonly memberVisibility: MemberVisibilityService,
    private readonly permissions: PermissionService,
  ) {}

  /** Status changes need issues.transition and assignee changes need issues.assign, on top of issues.update. */
  private authorizeIssueChanges(user: RequestUser): IssueChangeAuthorizer {
    return ({ status, assignee }) => this.permissions.assertPermissions(user, [
      ...(status ? [{ category: 'issues', action: 'transition' }] : []),
      ...(assignee ? [{ category: 'issues', action: 'assign' }] : []),
    ]);
  }

  @Post('projects/:projectKey/issues')
  @RequirePermission('issues', 'create')
  @RequireProjectAccess('project-key', 'write')
  async create(
    @Param('projectKey') projectKey: string,
    @Body(new ZodValidationPipe(createIssueSchema)) dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    await this.authorizeIssueChanges(user)({ status: false, assignee: !!dto.assigneeId });
    await this.memberVisibility.assertVisibleMember(user, dto.assigneeId);
    return this.issuesService.create(projectKey, dto, user.userId);
  }

  @Get('projects/:projectKey/issues')
  @RequirePermission('issues', 'read')
  @RequireProjectAccess('project-key')
  async findByProject(
    @Param('projectKey') projectKey: string,
    @Query() query: any,
  ) {
    const params = parsePagination(query);
    const filters: Record<string, string | undefined> = {};
    if (query.statusId) filters.statusId = query.statusId;
    if (query.assigneeId) filters.assigneeId = query.assigneeId;
    if (query.priority) filters.priority = query.priority;
    if (query.parentId) {
      if (!z.string().uuid().safeParse(query.parentId).success) {
        throw new BadRequestException('parentId must be an issue ID');
      }
      filters.parentId = query.parentId;
    }
    if (query.startDateFrom) filters.startDateFrom = query.startDateFrom;
    if (query.startDateTo) filters.startDateTo = query.startDateTo;
    if (query.dueDateFrom) filters.dueDateFrom = query.dueDateFrom;
    if (query.dueDateTo) filters.dueDateTo = query.dueDateTo;
    return this.issuesService.findByProject(projectKey, params, filters);
  }

  @Get('projects/:projectKey/backlog')
  @RequirePermission('issues', 'read')
  @RequireProjectAccess('project-key')
  async findBacklog(@Param('projectKey') projectKey: string, @Query() query: any) {
    const params = parsePagination(query);
    return this.issuesService.findBacklog(projectKey, params, {
      priority: query.priority,
      assigneeId: query.assigneeId,
      issueTypeId: query.issueTypeId,
    });
  }

  @Get('projects/:projectKey/epics')
  @RequirePermission('issues', 'read')
  @RequireProjectAccess('project-key')
  async findEpicsByProject(@Param('projectKey') projectKey: string) {
    return this.issuesService.findEpicsByProject(projectKey);
  }

  @Patch('issues/reorder')
  @RequirePermission('issues', 'update')
  @RequireProjectAccess('issue-ids', 'write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reorder(
    @Body(new ZodValidationPipe(reorderIssuesSchema)) dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    await this.issuesService.reorder(dto, user.userId);
  }

  @Patch('issues/bulk')
  @RequirePermission('issues', 'update')
  @RequireProjectAccess('issue-ids', 'write')
  async bulkUpdate(
    @Body(new ZodValidationPipe(bulkUpdateIssuesSchema)) dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    await this.memberVisibility.assertVisibleMember(user, dto.updates.assigneeId);
    return this.issuesService.bulkUpdate(dto.issueIds, dto.updates, user.userId, this.authorizeIssueChanges(user));
  }

  @Delete('issues/bulk')
  @Audit({ action: 'issue.bulk_deleted', resource: 'issue' })
  @RequirePermission('issues', 'delete')
  @RequireProjectAccess('issue-ids', 'write')
  async bulkDelete(
    @Body(new ZodValidationPipe(bulkDeleteIssuesSchema)) dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    return this.issuesService.bulkDelete(dto.issueIds, user.userId);
  }

  @Get('issues/:issueKey')
  @RequirePermission('issues', 'read')
  @RequireProjectAccess('issue-key')
  async findByKey(@Param('issueKey') issueKey: string) {
    return this.issuesService.findByKey(issueKey);
  }

  @Get('issues/:issueKey/recurrence')
  @RequirePermission('issues', 'read')
  @RequireProjectAccess('issue-key')
  async findRecurrence(@Param('issueKey') issueKey: string) {
    return this.issuesService.findRecurrence(issueKey);
  }

  @Patch('issues/:issueKey')
  @RequirePermission('issues', 'update')
  @RequireProjectAccess('issue-key', 'write')
  async update(
    @Param('issueKey') issueKey: string,
    @Body(new ZodValidationPipe(updateIssueSchema)) dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    await this.memberVisibility.assertVisibleMember(user, dto.assigneeId);
    return this.issuesService.update(issueKey, dto, user.userId, {
      authorizeChanges: this.authorizeIssueChanges(user),
    });
  }

  @Patch('issues/:issueKey/sprint')
  @RequirePermission('issues', 'update')
  @RequireProjectAccess('issue-key', 'write')
  async moveToSprint(
    @Param('issueKey') issueKey: string,
    @Body(new ZodValidationPipe(moveIssueSprintSchema)) dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    return this.issuesService.moveToSprint(issueKey, dto, user.userId);
  }

  @Post('issues/:issueKey/transition')
  @RequirePermission('issues', 'transition')
  @RequireProjectAccess('issue-key', 'write')
  async transition(
    @Param('issueKey') issueKey: string,
    @Body(new ZodValidationPipe(z.object({ transitionId: z.string().uuid() }).strict())) body: { transitionId: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.issuesService.transition(issueKey, body.transitionId, user.userId);
  }

  @Delete('issues/:issueKey')
  @Audit({ action: 'issue.deleted', resource: 'issue', resourceId: ({ request }) => String(request.params.issueKey) })
  @RequirePermission('issues', 'delete')
  @RequireProjectAccess('issue-key', 'write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('issueKey') issueKey: string, @CurrentUser() user: RequestUser) {
    await this.issuesService.delete(issueKey, user.userId);
  }
}
