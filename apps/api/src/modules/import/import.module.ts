import { Module } from '@nestjs/common';
import { FieldMapperService } from './field-mapper.service';
import { ImportController } from './import.controller';
import { ImportQueueService } from './import-queue.service';
import { ImportService } from './import.service';
import { JiraClientService } from './jira-client.service';

@Module({
  controllers: [ImportController],
  providers: [ImportService, ImportQueueService, JiraClientService, FieldMapperService],
  exports: [ImportService],
})
export class ImportModule {}
