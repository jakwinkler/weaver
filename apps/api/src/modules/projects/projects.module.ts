import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectMembersService } from './project-members.service';
import { ProjectIssueTypesService } from './project-issue-types.service';
import { WorkflowsModule } from '../workflows';
import { EventsModule } from '../events';

@Module({
  imports: [WorkflowsModule, EventsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectMembersService, ProjectIssueTypesService],
  exports: [ProjectsService, ProjectMembersService, ProjectIssueTypesService],
})
export class ProjectsModule {}
