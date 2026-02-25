import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '@weaver/db';
import { IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';
import { ProjectsModule } from '../projects';
import { WorkflowsModule } from '../workflows';
import { EventsModule } from '../events';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity]), ProjectsModule, WorkflowsModule, EventsModule],
  controllers: [IssuesController],
  providers: [IssuesService],
  exports: [IssuesService],
})
export class IssuesModule {}
