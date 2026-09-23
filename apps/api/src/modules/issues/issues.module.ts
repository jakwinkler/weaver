import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '@weaver/db';
import { IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';
import { ProjectsModule } from '../projects';
import { WorkflowsModule } from '../workflows';
import { EventsModule } from '../events';
import { MailModule } from '../mail';
import { RecurrenceService } from './recurrence.service';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    ProjectsModule,
    WorkflowsModule,
    EventsModule,
    MailModule,
    CustomFieldsModule,
  ],
  controllers: [IssuesController],
  providers: [IssuesService, RecurrenceService],
  exports: [IssuesService, RecurrenceService],
})
export class IssuesModule {}
