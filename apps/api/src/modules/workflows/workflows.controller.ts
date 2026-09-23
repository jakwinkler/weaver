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
import {
  createWorkflowSchema,
  createWorkflowStatusSchema,
  createWorkflowTransitionSchema,
} from '@weaver/shared';
import {
  JwtAuthGuard,
  PermissionGuard,
  RequirePermission,
} from '../../core/auth';
import { ZodValidationPipe } from '../../common';
import { WorkflowsService } from './workflows.service';
import { Audit } from '../audit';

@Controller('workflows')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Post()
  @RequirePermission('workflows', 'create')
  @Audit({ action: 'workflow.created', resource: 'workflow' })
  async create(@Body(new ZodValidationPipe(createWorkflowSchema)) dto: any) {
    return this.workflowsService.create(dto);
  }

  @Get()
  @RequirePermission('workflows', 'read')
  async findAll() {
    return this.workflowsService.findAll();
  }

  @Get(':id')
  @RequirePermission('workflows', 'read')
  async findById(@Param('id') id: string) {
    return this.workflowsService.findById(id);
  }

  @Patch(':id')
  @RequirePermission('workflows', 'update')
  @Audit({ action: 'workflow.updated', resource: 'workflow', captureBefore: true })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createWorkflowSchema.partial())) dto: any,
  ) {
    return this.workflowsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('workflows', 'delete')
  @Audit({ action: 'workflow.deleted', resource: 'workflow', captureBefore: true })
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.workflowsService.delete(id);
  }

  // ── Statuses ──

  @Post(':id/statuses')
  @RequirePermission('workflows', 'update')
  @Audit({
    action: 'workflow.status_created',
    resource: 'workflow',
    captureBefore: true,
    resourceId: ({ request }) => String(request.params.id),
  })
  async addStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createWorkflowStatusSchema)) dto: any,
  ) {
    return this.workflowsService.addStatus(id, dto);
  }

  @Patch(':id/statuses/:statusId')
  @RequirePermission('workflows', 'update')
  @Audit({
    action: 'workflow.status_updated',
    resource: 'workflow',
    captureBefore: true,
    resourceId: ({ request }) => String(request.params.id),
  })
  async updateStatus(
    @Param('id') id: string,
    @Param('statusId') statusId: string,
    @Body(new ZodValidationPipe(createWorkflowStatusSchema.partial())) dto: any,
  ) {
    return this.workflowsService.updateStatus(id, statusId, dto);
  }

  @Delete(':id/statuses/:statusId')
  @RequirePermission('workflows', 'delete')
  @Audit({
    action: 'workflow.status_deleted',
    resource: 'workflow',
    captureBefore: true,
    resourceId: ({ request }) => String(request.params.id),
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteStatus(
    @Param('id') id: string,
    @Param('statusId') statusId: string,
  ) {
    await this.workflowsService.deleteStatus(id, statusId);
  }

  // ── Transitions ──

  @Post(':id/transitions')
  @RequirePermission('workflows', 'update')
  @Audit({
    action: 'workflow.transition_created',
    resource: 'workflow',
    captureBefore: true,
    resourceId: ({ request }) => String(request.params.id),
  })
  async addTransition(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createWorkflowTransitionSchema)) dto: any,
  ) {
    return this.workflowsService.addTransition(id, dto);
  }

  @Patch(':id/transitions/:transitionId')
  @RequirePermission('workflows', 'update')
  @Audit({
    action: 'workflow.transition_updated',
    resource: 'workflow',
    captureBefore: true,
    resourceId: ({ request }) => String(request.params.id),
  })
  async updateTransition(
    @Param('id') id: string,
    @Param('transitionId') transitionId: string,
    @Body(new ZodValidationPipe(createWorkflowTransitionSchema.partial())) dto: any,
  ) {
    return this.workflowsService.updateTransition(id, transitionId, dto);
  }

  @Delete(':id/transitions/:transitionId')
  @RequirePermission('workflows', 'delete')
  @Audit({
    action: 'workflow.transition_deleted',
    resource: 'workflow',
    captureBefore: true,
    resourceId: ({ request }) => String(request.params.id),
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTransition(
    @Param('id') id: string,
    @Param('transitionId') transitionId: string,
  ) {
    await this.workflowsService.deleteTransition(id, transitionId);
  }

  // ── Engine ──

  @Get(':id/transitions/available/:statusId')
  @RequirePermission('workflows', 'read')
  async getAvailableTransitions(
    @Param('id') id: string,
    @Param('statusId') statusId: string,
  ) {
    return this.workflowsService.getAvailableTransitions(id, statusId);
  }
}
