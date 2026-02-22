import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller';
import { AttachmentDownloadController } from './attachment-download.controller';
import { AttachmentsService } from './attachments.service';

@Module({
  controllers: [AttachmentsController, AttachmentDownloadController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
