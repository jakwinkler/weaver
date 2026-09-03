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
import { JwtAuthGuard, PermissionGuard, RequirePermission } from '../../core/auth';
import { ZodValidationPipe } from '../../common';
import { SprintsService } from './sprints.service';
import { ProjectAccessGuard, RequireProjectAccess } from '../../core/tenant';

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
@UseGuards(JwtAuthGuard, PermissionGuard, ProjectAccessGuard)
export class SprintsController {
  constructor(private readonly sprintsService: SprintsService) {}

  @Post()
  @RequirePermission('sprints', 'create')
  @RequireProjectAccess('project-id', 'write')
  async create(
    @Query('projectId') projectId: string,
    @Body(new ZodValidationPipe(createSprintSchema)) dto: any,
  ) {
    return this.sprintsService.create(projectId, dto);
  }

  @Get()
  @RequirePermission('sprints', 'read')
  @RequireProjectAccess('project-id')
  async findAll(@Query('projectId') projectId: string) {
    return this.sprintsService.findAll(projectId);
  }

  @Get(':id')
  @RequirePermission('sprints', 'read')
  @RequireProjectAccess('sprint-id')
  async findById(@Param('id') id: string) {
    return this.sprintsService.findById(id);
  }

  @Patch(':id')
  @RequirePermission('sprints', 'update')
  @RequireProjectAccess('sprint-id', 'write')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSprintSchema)) dto: any,
  ) {
    return this.sprintsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('sprints', 'delete')
  @RequireProjectAccess('sprint-id', 'write')
  async delete(@Param('id') id: string) {
    await this.sprintsService.delete(id);
  }

  @Post(':id/start')
  @RequirePermission('sprints', 'manage')
  @RequireProjectAccess('sprint-id', 'write')
  async start(@Param('id') id: string) {
    return this.sprintsService.start(id);
  }

  @Post(':id/complete')
  @RequirePermission('sprints', 'manage')
  @RequireProjectAccess('sprint-id', 'write')
  async complete(@Param('id') id: string) {
    return this.sprintsService.complete(id);
  }

  @Post(':id/issues')
  @RequirePermission('sprints', 'update')
  @RequireProjectAccess('sprint-id', 'write')
  async addIssues(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addIssuesSchema)) dto: any,
  ) {
    await this.sprintsService.addIssues(id, dto.issueIds);
    return { success: true };
  }
}
