import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantMembershipEntity, UserEntity } from '@weaver/db';
import { createTransport } from 'nodemailer';
import { MAIL_TRANSPORT_FACTORY, MailService } from './mail.service';
import { NotificationQueueService } from './notification-queue.service';
import { AccountMailQueueService } from './account-mail-queue.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, TenantMembershipEntity])],
  providers: [
    MailService,
    NotificationQueueService,
    AccountMailQueueService,
    {
      provide: MAIL_TRANSPORT_FACTORY,
      useValue: createTransport,
    },
  ],
  exports: [MailService, NotificationQueueService, AccountMailQueueService],
})
export class MailModule {}
