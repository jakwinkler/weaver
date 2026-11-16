import { WebSocketModule } from '../../core/websocket';
import { IssueSecurityController } from './issue-security.controller';
import { ImportSourceController } from './import-source.controller';
import { ImportPeopleService } from './import-people.service';
import { ImportInvitationController } from './import-invitation.controller';
import { MailModule } from '../mail';
import { Module } from '@nestjs/common';
import { FieldMapperService } from './field-mapper.service';
import { ImportController } from './import.controller';
import { ImportQueueService } from './import-queue.service';
import { ImportService } from './import.service';
import { JiraClientService } from './jira-client.service';

@Module({
  imports: [MailModule, WebSocketModule],
  controllers: [
    IssueSecurityController,
    ImportController,
    ImportInvitationController,
    ImportSourceController,
  ],
  providers: [
    ImportPeopleService,
    ImportService,
    ImportQueueService,
    JiraClientService,
    FieldMapperService,
  ],
  exports: [ImportService],
})
export class ImportModule {}
