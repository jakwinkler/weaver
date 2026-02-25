import {
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, PermissionGuard, RequirePermission } from '../../core/auth';
import { ActivityLogService } from './activity-log.service';

@Controller('issues/:issueKey/activity')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get()
  @RequirePermission('issues', 'read')
  async findByIssue(@Param('issueKey') issueKey: string) {
    return this.activityLogService.findByIssue(issueKey);
  }
}
