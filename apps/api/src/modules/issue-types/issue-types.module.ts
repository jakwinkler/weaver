import { Module } from '@nestjs/common';
import { IssueTypesController } from './issue-types.controller';
import { IssueTypesService } from './issue-types.service';

@Module({
  controllers: [IssueTypesController],
  providers: [IssueTypesService],
  exports: [IssueTypesService],
})
export class IssueTypesModule {}
