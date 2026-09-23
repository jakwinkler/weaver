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
} from '@nestjs/common';
import { createIssueSchema, updateIssueSchema, reorderIssuesSchema } from '@weaver/shared';
import {
  JwtAuthGuard,
  PermissionGuard,
  RequirePermission,
  CurrentUser,
  RequestUser,
} from '../../core/auth';
import { ZodValidationPipe, parsePagination } from '../../common';
import { IssuesService } from './issues.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionGuard)
export class IssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  @Post('projects/:projectKey/issues')
  @RequirePermission('issues', 'create')
  async create(
    @Param('projectKey') projectKey: string,
    @Body(new ZodValidationPipe(createIssueSchema)) dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    return this.issuesService.create(projectKey, dto, user.userId);
  }

  @Get('projects/:projectKey/issues')
  @RequirePermission('issues', 'read')
  async findByProject(
    @Param('projectKey') projectKey: string,
    @Query() query: any,
  ) {
    const params = parsePagination(query);
    const filters: Record<string, string | undefined> = {};
    if (query.statusId) filters.statusId = query.statusId;
    if (query.assigneeId) filters.assigneeId = query.assigneeId;
    if (query.priority) filters.priority = query.priority;
    if (query.startDateFrom) filters.startDateFrom = query.startDateFrom;
    if (query.startDateTo) filters.startDateTo = query.startDateTo;
    if (query.dueDateFrom) filters.dueDateFrom = query.dueDateFrom;
    if (query.dueDateTo) filters.dueDateTo = query.dueDateTo;
    return this.issuesService.findByProject(projectKey, params, filters);
  }

  @Patch('issues/reorder')
  @RequirePermission('issues', 'update')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reorder(
    @Body(new ZodValidationPipe(reorderIssuesSchema)) dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    await this.issuesService.reorder(dto, user.userId);
  }

  @Get('issues/:issueKey')
  @RequirePermission('issues', 'read')
  async findByKey(@Param('issueKey') issueKey: string) {
    return this.issuesService.findByKey(issueKey);
  }

  @Patch('issues/:issueKey')
  @RequirePermission('issues', 'update')
  async update(
    @Param('issueKey') issueKey: string,
    @Body(new ZodValidationPipe(updateIssueSchema)) dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    return this.issuesService.update(issueKey, dto, user.userId);
  }

  @Post('issues/:issueKey/transition')
  @RequirePermission('issues', 'transition')
  async transition(
    @Param('issueKey') issueKey: string,
    @Body() body: { transitionId: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.issuesService.transition(issueKey, body.transitionId, user.userId);
  }

  @Delete('issues/:issueKey')
  @RequirePermission('issues', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('issueKey') issueKey: string, @CurrentUser() user: RequestUser) {
    await this.issuesService.delete(issueKey, user.userId);
  }
}
