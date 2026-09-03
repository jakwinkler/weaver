import {
  Controller,
  Get,
  Post,
  Param,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard, CurrentUser, RequestUser, PermissionGuard, RequirePermission } from '../../core/auth';
import { AttachmentsService } from './attachments.service';
import { getMaxAttachmentBytes } from './attachment-storage';
import { ProjectAccessGuard, RequireProjectAccess } from '../../core/tenant';

@Controller('attachments')
@UseGuards(JwtAuthGuard, PermissionGuard, ProjectAccessGuard)
export class AttachmentDownloadController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: getMaxAttachmentBytes() } }),
  )
  @RequirePermission('issues', 'update')
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    return this.attachmentsService.upload(file, user.userId);
  }

  @Get(':id/download')
  @RequirePermission('issues', 'read')
  @RequireProjectAccess('attachment-id')
  async download(@Param('id') id: string, @Res() res: Response) {
    const attachment = await this.attachmentsService.findById(id);
    const data = await this.attachmentsService.getData(attachment.storageKey);

    res.attachment(attachment.filename);
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Security-Policy': "sandbox; default-src 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });

    res.send(data);
  }
}
