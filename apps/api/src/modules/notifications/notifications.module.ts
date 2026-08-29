import { Module } from '@nestjs/common';
import { WebSocketModule } from '../../core/websocket';
import { MailModule } from '../mail';
import { EmailUnsubscribeController, NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [WebSocketModule, MailModule],
  controllers: [NotificationsController, EmailUnsubscribeController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
