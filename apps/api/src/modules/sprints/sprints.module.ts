import { Module } from '@nestjs/common';
import { ProjectSprintReportsController, SprintsController } from './sprints.controller';
import { SprintsService } from './sprints.service';
import { EventsModule } from '../events';

@Module({
  imports: [EventsModule],
  controllers: [SprintsController, ProjectSprintReportsController],
  providers: [SprintsService],
  exports: [SprintsService],
})
export class SprintsModule {}
