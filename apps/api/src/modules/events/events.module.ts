import { Module } from '@nestjs/common';
import { WebhooksModule } from '../webhooks';
import { EventDispatcherService } from './event-dispatcher.service';

@Module({
  imports: [WebhooksModule],
  providers: [EventDispatcherService],
  exports: [EventDispatcherService],
})
export class EventsModule {}
