import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantMembershipEntity } from '@weaver/db';
import { CommentsModule } from '../comments';
import { EventsModule } from '../events';
import { IssuesModule } from '../issues';
import { NotificationsModule } from '../notifications';
import { WebhooksModule } from '../webhooks';
import { WorkflowsModule } from '../workflows';
import { AutomationActionExecutorService } from './action-executor.service';
import { AutomationEngineService } from './automation-engine.service';
import { AutomationSchedulerService } from './automation-scheduler.service';
import { AutomationsController } from './automations.controller';
import { AutomationsService } from './automations.service';
import { AutomationConditionEvaluatorService } from './condition-evaluator.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TenantMembershipEntity]),
    CommentsModule,
    EventsModule,
    IssuesModule,
    NotificationsModule,
    WebhooksModule,
    WorkflowsModule,
  ],
  controllers: [AutomationsController],
  providers: [
    AutomationsService,
    AutomationConditionEvaluatorService,
    AutomationActionExecutorService,
    AutomationSchedulerService,
    AutomationEngineService,
  ],
  exports: [AutomationsService],
})
export class AutomationsModule {}
