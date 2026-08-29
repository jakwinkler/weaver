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
import {
  JwtAuthGuard,
  CurrentUser,
  RequestUser,
  PermissionGuard,
  RequirePermission,
} from '../../core/auth';
import { ZodValidationPipe } from '../../common';
import { CommentsService } from './comments.service';

@Controller('issues/:issueKey/comments')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @RequirePermission('comments', 'create')
  async create(
    @Param('issueKey') issueKey: string,
    @Body(new ZodValidationPipe(createCommentSchema)) dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    return this.commentsService.create(issueKey, dto, user.userId, user.tenantId);
  }

  @Get()
  @RequirePermission('comments', 'read')
  async findByIssue(@Param('issueKey') issueKey: string) {
    return this.commentsService.findByIssue(issueKey);
  }

  @Patch(':id')
  @RequirePermission('comments', 'update')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createCommentSchema)) dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    return this.commentsService.update(id, dto, user.userId, user.tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('comments', 'delete')
  async delete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.commentsService.delete(id, user.userId);
  }
}
