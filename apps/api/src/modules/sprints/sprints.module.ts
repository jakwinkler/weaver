import { Module } from '@nestjs/common';
import { ProjectSprintReportsController, SprintsController } from './sprints.controller';
import { SprintsService } from './sprints.service';

@Module({
  controllers: [SprintsController, ProjectSprintReportsController],
  providers: [SprintsService],
  exports: [SprintsService],
})
export class SprintsModule {}
