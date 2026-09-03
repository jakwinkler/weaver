import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { createCommentSchema } from '@weaver/shared';
import { JwtAuthGuard, CurrentUser, RequestUser, PermissionGuard, RequirePermission } from '../../core/auth';
import { ZodValidationPipe } from '../../common';
import { CommentsService } from './comments.service';
import { ProjectAccessGuard, RequireProjectAccess } from '../../core/tenant';

@Controller('issues/:issueKey/comments')
@UseGuards(JwtAuthGuard, PermissionGuard, ProjectAccessGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @RequirePermission('comments', 'create')
  @RequireProjectAccess('issue-key', 'write')
  async create(
    @Param('issueKey') issueKey: string,
    @Body(new ZodValidationPipe(createCommentSchema)) dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    return this.commentsService.create(issueKey, dto, user.userId);
  }

  @Get()
  @RequirePermission('comments', 'read')
  @RequireProjectAccess('issue-key')
  async findByIssue(@Param('issueKey') issueKey: string) {
    return this.commentsService.findByIssue(issueKey);
  }

  @Patch(':id')
  @RequirePermission('comments', 'update')
  @RequireProjectAccess('issue-key', 'write')
  async update(
    @Param('issueKey') issueKey: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createCommentSchema)) dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    return this.commentsService.update(issueKey, id, dto, user.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('comments', 'delete')
  @RequireProjectAccess('issue-key', 'write')
  async delete(
    @Param('issueKey') issueKey: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.commentsService.delete(issueKey, id, user.userId);
  }
}
