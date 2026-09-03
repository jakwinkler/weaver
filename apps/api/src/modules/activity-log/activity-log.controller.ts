import {
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, PermissionGuard, RequirePermission } from '../../core/auth';
import { ActivityLogService } from './activity-log.service';
import { ProjectAccessGuard, RequireProjectAccess } from '../../core/tenant';

@Controller('issues/:issueKey/activity')
@UseGuards(JwtAuthGuard, PermissionGuard, ProjectAccessGuard)
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get()
  @RequirePermission('issues', 'read')
  @RequireProjectAccess('issue-key')
  async findByIssue(@Param('issueKey') issueKey: string) {
    return this.activityLogService.findByIssue(issueKey);
  }
}
