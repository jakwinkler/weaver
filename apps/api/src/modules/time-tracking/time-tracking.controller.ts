import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard, CurrentUser, RequestUser, PermissionGuard, RequirePermission } from '../../core/auth';
import { ZodValidationPipe } from '../../common';
import { TimeTrackingService } from './time-tracking.service';
import { ProjectAccessGuard, RequireProjectAccess } from '../../core/tenant';

const createTimeEntrySchema = z.object({
  minutes: z.number().int().min(1),
  description: z.string().max(500).optional(),
  source: z.enum(['manual', 'timer']).optional(),
});

const updateTimeEntrySchema = createTimeEntrySchema.partial();

@Controller('issues/:issueKey/time-entries')
@UseGuards(JwtAuthGuard, PermissionGuard, ProjectAccessGuard)
export class TimeTrackingController {
  constructor(private readonly timeTrackingService: TimeTrackingService) {}

  @Post()
  @RequirePermission('issues', 'update')
  @RequireProjectAccess('issue-key', 'write')
  async create(
    @Param('issueKey') issueKey: string,
    @Body(new ZodValidationPipe(createTimeEntrySchema)) dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    return this.timeTrackingService.create(issueKey, dto, user.userId);
  }

  @Get()
  @RequirePermission('issues', 'read')
  @RequireProjectAccess('issue-key')
  async findByIssue(@Param('issueKey') issueKey: string) {
    return this.timeTrackingService.findByIssue(issueKey);
  }

  @Get('summary')
  @RequirePermission('issues', 'read')
  @RequireProjectAccess('issue-key')
  async getSummary(@Param('issueKey') issueKey: string) {
    return this.timeTrackingService.getSummary(issueKey);
  }

  @Patch(':id')
  @RequirePermission('issues', 'update')
  @RequireProjectAccess('issue-key', 'write')
  async update(
    @Param('issueKey') issueKey: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTimeEntrySchema)) dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    return this.timeTrackingService.update(issueKey, id, dto, user.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('issues', 'update')
  @RequireProjectAccess('issue-key', 'write')
  async delete(
    @Param('issueKey') issueKey: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.timeTrackingService.delete(issueKey, id, user.userId);
  }
}
