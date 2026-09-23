import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookQueueService } from './webhook-queue.service';

@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookQueueService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
