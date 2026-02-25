import { Module } from '@nestjs/common';
import { WebhooksModule } from '../webhooks';
import { WebSocketModule } from '../../core/websocket';
import { EventDispatcherService } from './event-dispatcher.service';

@Module({
  imports: [WebhooksModule, WebSocketModule],
  providers: [EventDispatcherService],
  exports: [EventDispatcherService],
})
export class EventsModule {}
