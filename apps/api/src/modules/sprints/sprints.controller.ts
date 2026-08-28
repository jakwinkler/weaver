import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { z } from 'zod';
import { createSprintSchema } from '@weaver/shared';
import {
  CurrentUser,
  JwtAuthGuard,
  PermissionGuard,
  RequestUser,
  RequirePermission,
} from '../../core/auth';
import { ZodValidationPipe } from '../../common';
import { SprintsService } from './sprints.service';

const updateSprintSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  goal: z.string().max(1000).nullable().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const addIssuesSchema = z.object({
  issueIds: z.array(z.string().uuid()).min(1),
});

@Controller('sprints')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class SprintsController {
  constructor(private readonly sprintsService: SprintsService) {}

  @Post()
  @RequirePermission('sprints', 'create')
  async create(
    @Query('projectId') projectId: string,
    @Body(new ZodValidationPipe(createSprintSchema)) dto: any,
  ) {
    return this.sprintsService.create(projectId, dto);
  }

  @Get()
  @RequirePermission('sprints', 'read')
  async findAll(@Query('projectId') projectId: string) {
    return this.sprintsService.findAll(projectId);
  }

  @Get(':id')
  @RequirePermission('sprints', 'read')
  async findById(@Param('id') id: string) {
    return this.sprintsService.findById(id);
  }

  @Get(':id/stats')
  @RequirePermission('sprints', 'read')
  async getStats(@Param('id') id: string) {
    return this.sprintsService.getStats(id);
  }

  @Get(':id/burndown')
  @RequirePermission('sprints', 'read')
  async getBurndown(@Param('id') id: string) {
    return this.sprintsService.getBurndown(id);
  }

  @Get(':id/summary')
  @RequirePermission('sprints', 'read')
  async getSummary(@Param('id') id: string) {
    return this.sprintsService.getSummary(id);
  }

  @Patch(':id')
  @RequirePermission('sprints', 'update')
  async update(@Param('id') id: string, @Body(new ZodValidationPipe(updateSprintSchema)) dto: any) {
    return this.sprintsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('sprints', 'delete')
  async delete(@Param('id') id: string) {
    await this.sprintsService.delete(id);
  }

  @Post(':id/start')
  @RequirePermission('sprints', 'manage')
  async start(@Param('id') id: string) {
    return this.sprintsService.start(id);
  }

  @Post(':id/complete')
  @RequirePermission('sprints', 'manage')
  async complete(@Param('id') id: string) {
    return this.sprintsService.complete(id);
  }

  @Post(':id/issues')
  @RequirePermission('sprints', 'update')
  async addIssues(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addIssuesSchema)) dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    await this.sprintsService.addIssues(id, dto.issueIds, user.userId);
    return { success: true };
  }
}

@Controller('projects')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ProjectSprintReportsController {
  constructor(private readonly sprintsService: SprintsService) {}

  @Get(':projectKey/velocity')
  @RequirePermission('sprints', 'read')
  async getVelocity(@Param('projectKey') projectKey: string, @Query('limit') rawLimit?: string) {
    const parsedLimit = Number.parseInt(rawLimit ?? '10', 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(50, Math.max(1, parsedLimit)) : 10;
    return this.sprintsService.getVelocity(projectKey, limit);
  }
}
