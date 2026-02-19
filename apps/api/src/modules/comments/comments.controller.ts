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
import { JwtAuthGuard, CurrentUser, RequestUser } from '../../core/auth';
import { ZodValidationPipe } from '../../common';
import { CommentsService } from './comments.service';

@Controller('issues/:issueKey/comments')
@UseGuards(JwtAuthGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  async create(
    @Param('issueKey') issueKey: string,
    @Body(new ZodValidationPipe(createCommentSchema)) dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    return this.commentsService.create(issueKey, dto, user.userId);
  }

  @Get()
  async findByIssue(@Param('issueKey') issueKey: string) {
    return this.commentsService.findByIssue(issueKey);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createCommentSchema)) dto: any,
  ) {
    return this.commentsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.commentsService.delete(id);
  }
}
