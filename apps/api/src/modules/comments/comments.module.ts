import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { MentionService } from './mention.service';
import { UsersModule } from '../users';
import { EventsModule } from '../events';
import { NotificationsModule } from '../notifications';
import { MailModule } from '../mail';

@Module({
  imports: [UsersModule, EventsModule, NotificationsModule, MailModule],
  controllers: [CommentsController],
  providers: [CommentsService, MentionService],
  exports: [CommentsService],
})
export class CommentsModule {}
