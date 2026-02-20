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
import { createIssueSchema, updateIssueSchema } from '@weaver/shared';
import { JwtAuthGuard, CurrentUser, RequestUser } from '../../core/auth';
import { ZodValidationPipe, parsePagination } from '../../common';
import { IssuesService } from './issues.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class IssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  @Post('projects/:projectKey/issues')
  async create(
    @Param('projectKey') projectKey: string,
    @Body(new ZodValidationPipe(createIssueSchema)) dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    return this.issuesService.create(projectKey, dto, user.userId);
  }

  @Get('projects/:projectKey/issues')
  async findByProject(
    @Param('projectKey') projectKey: string,
    @Query() query: any,
  ) {
    const params = parsePagination(query);
    return this.issuesService.findByProject(projectKey, params);
  }

  @Get('issues/:issueKey')
  async findByKey(@Param('issueKey') issueKey: string) {
    return this.issuesService.findByKey(issueKey);
  }

  @Patch('issues/:issueKey')
  async update(
    @Param('issueKey') issueKey: string,
    @Body(new ZodValidationPipe(updateIssueSchema)) dto: any,
  ) {
    return this.issuesService.update(issueKey, dto);
  }

  @Post('issues/:issueKey/transition')
  async transition(
    @Param('issueKey') issueKey: string,
    @Body() body: { transitionId: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.issuesService.transition(issueKey, body.transitionId, user.userId);
  }

  @Delete('issues/:issueKey')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('issueKey') issueKey: string) {
    await this.issuesService.delete(issueKey);
  }
}
