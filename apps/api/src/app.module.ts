import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './core/database';
import { TenantModule } from './core/tenant';
import { AuthModule } from './core/auth';
import { UsersModule } from './modules/users';
import { ProjectsModule } from './modules/projects';
import { IssuesModule } from './modules/issues';
import { WorkflowsModule } from './modules/workflows';
import { IssueTypesModule } from './modules/issue-types';
import { IssueLinksModule } from './modules/issue-links';
import { BoardsModule } from './modules/boards';
import { SprintsModule } from './modules/sprints';
import { CommentsModule } from './modules/comments';
import { ActivityLogModule } from './modules/activity-log';
import { CustomFieldsModule } from './modules/custom-fields';
import { SavedFiltersModule } from './modules/saved-filters';
import { AttachmentsModule } from './modules/attachments';
import { TimeTrackingModule } from './modules/time-tracking';
import { SearchModule } from './modules/search';
import { PluginsModule } from './plugins';
import { WebSocketModule } from './core/websocket';
import { RateLimitingModule } from './core/rate-limiting';
import { NotificationsModule } from './modules/notifications';
import { WebhooksModule } from './modules/webhooks';
import { RolesModule } from './modules/roles';
import { TeamsModule } from './modules/teams';
import { DashboardModule } from './modules/dashboard';
import { SettingsModule } from './modules/settings';
import { FormsModule } from './modules/forms';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    DatabaseModule,
    TenantModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    IssuesModule,
    WorkflowsModule,
    IssueTypesModule,
    IssueLinksModule,
    BoardsModule,
    SprintsModule,
    CommentsModule,
    ActivityLogModule,
    CustomFieldsModule,
    SavedFiltersModule,
    AttachmentsModule,
    TimeTrackingModule,
    SearchModule,
    PluginsModule,
    WebSocketModule,
    RateLimitingModule,
    NotificationsModule,
    WebhooksModule,
    RolesModule,
    TeamsModule,
    DashboardModule,
    SettingsModule,
    FormsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
