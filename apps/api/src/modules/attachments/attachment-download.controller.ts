import {
  Controller,
  Get,
  Post,
  Param,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard, CurrentUser, RequestUser, PermissionGuard, RequirePermission } from '../../core/auth';
import { AttachmentsService } from './attachments.service';
import * as fs from 'fs';
import * as path from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/weaver-uploads';

@Controller('attachments')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AttachmentDownloadController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @RequirePermission('issues', 'update')
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    return this.attachmentsService.upload(file, user.userId);
  }

  @Get(':id/download')
  @RequirePermission('issues', 'read')
  async download(@Param('id') id: string, @Res() res: Response) {
    const attachment = await this.attachmentsService.findById(id);
    const filePath = path.join(UPLOAD_DIR, attachment.storageKey);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('File not found on disk');
    }

    res.set({
      'Content-Type': attachment.mimeType,
      'Content-Disposition': `inline; filename="${attachment.filename}"`,
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  }
}
