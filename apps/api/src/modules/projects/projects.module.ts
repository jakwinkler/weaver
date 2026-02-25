import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { PublicProjectsController } from './public-projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectMembersService } from './project-members.service';
import { ProjectIssueTypesService } from './project-issue-types.service';
import { ProjectPluginsService } from './project-plugins.service';
import { WorkflowsModule } from '../workflows';
import { EventsModule } from '../events';

@Module({
  imports: [WorkflowsModule, EventsModule],
  controllers: [ProjectsController, PublicProjectsController],
  providers: [ProjectsService, ProjectMembersService, ProjectIssueTypesService, ProjectPluginsService],
  exports: [ProjectsService, ProjectMembersService, ProjectIssueTypesService, ProjectPluginsService],
})
export class ProjectsModule {}
