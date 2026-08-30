import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '@weaver/db';
import { IssuesModule } from '../issues';
import { MailModule } from '../mail';
import { NotificationsModule } from '../notifications';
import { ProjectsModule } from '../projects';
import { FormsController } from './forms.controller';
import { FormsService } from './forms.service';
import { PublicFormController } from './public-form.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    ProjectsModule,
    IssuesModule,
    NotificationsModule,
    MailModule,
  ],
  controllers: [FormsController, PublicFormController],
  providers: [FormsService],
  exports: [FormsService],
})
export class FormsModule {}
