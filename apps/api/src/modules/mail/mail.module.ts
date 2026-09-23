import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantMembershipEntity, UserEntity } from '@weaver/db';
import { createTransport } from 'nodemailer';
import { MAIL_TRANSPORT_FACTORY, MailService } from './mail.service';
import { NotificationQueueService } from './notification-queue.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, TenantMembershipEntity])],
  providers: [
    MailService,
    NotificationQueueService,
    {
      provide: MAIL_TRANSPORT_FACTORY,
      useValue: createTransport,
    },
  ],
  exports: [MailService, NotificationQueueService],
})
export class MailModule {}
