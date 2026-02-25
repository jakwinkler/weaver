import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  controllers: [SettingsController],
})
export class SettingsModule {}
