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

const createTimeEntrySchema = z.object({
  minutes: z.number().int().min(1),
  description: z.string().max(500).optional(),
  source: z.enum(['manual', 'timer']).optional(),
});

const updateTimeEntrySchema = createTimeEntrySchema.partial();

@Controller('issues/:issueKey/time-entries')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class TimeTrackingController {
  constructor(private readonly timeTrackingService: TimeTrackingService) {}

  @Post()
  @RequirePermission('issues', 'update')
  async create(
    @Param('issueKey') issueKey: string,
    @Body(new ZodValidationPipe(createTimeEntrySchema)) dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    return this.timeTrackingService.create(issueKey, dto, user.userId);
  }

  @Get()
  @RequirePermission('issues', 'read')
  async findByIssue(@Param('issueKey') issueKey: string) {
    return this.timeTrackingService.findByIssue(issueKey);
  }

  @Get('summary')
  @RequirePermission('issues', 'read')
  async getSummary(@Param('issueKey') issueKey: string) {
    return this.timeTrackingService.getSummary(issueKey);
  }

  @Patch(':id')
  @RequirePermission('issues', 'update')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTimeEntrySchema)) dto: any,
  ) {
    return this.timeTrackingService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('issues', 'update')
  async delete(@Param('id') id: string) {
    await this.timeTrackingService.delete(id);
  }
}
