import { Module } from '@nestjs/common';
import { IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';
import { ProjectsModule } from '../projects';
import { WorkflowsModule } from '../workflows';

@Module({
  imports: [ProjectsModule, WorkflowsModule],
  controllers: [IssuesController],
  providers: [IssuesService],
  exports: [IssuesService],
})
export class IssuesModule {}
