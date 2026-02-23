import { Module } from '@nestjs/common';
import { IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';
import { ProjectsModule } from '../projects';
import { WorkflowsModule } from '../workflows';
import { EventsModule } from '../events';

@Module({
  imports: [ProjectsModule, WorkflowsModule, EventsModule],
  controllers: [IssuesController],
  providers: [IssuesService],
  exports: [IssuesService],
})
export class IssuesModule {}
