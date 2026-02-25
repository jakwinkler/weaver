import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard, CurrentUser, RequestUser, PermissionGuard, RequirePermission } from '../../core/auth';
import { AttachmentsService } from './attachments.service';

@Controller('issues/:issueKey/attachments')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @RequirePermission('issues', 'update')
  async create(
    @Param('issueKey') issueKey: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    return this.attachmentsService.create(issueKey, file, user.userId);
  }

  @Get()
  @RequirePermission('issues', 'read')
  async findByIssue(@Param('issueKey') issueKey: string) {
    return this.attachmentsService.findByIssue(issueKey);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('issues', 'update')
  async delete(@Param('id') id: string) {
    await this.attachmentsService.delete(id);
  }
}
