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
import { JwtAuthGuard } from '../../core/auth';
import { ZodValidationPipe } from '../../common';
import { WorkflowsService } from './workflows.service';

@Controller('workflows')
@UseGuards(JwtAuthGuard)
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Post()
  async create(@Body(new ZodValidationPipe(createWorkflowSchema)) dto: any) {
    return this.workflowsService.create(dto);
  }

  @Get()
  async findAll() {
    return this.workflowsService.findAll();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.workflowsService.findById(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createWorkflowSchema.partial())) dto: any,
  ) {
    return this.workflowsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.workflowsService.delete(id);
  }

  // ── Statuses ──

  @Post(':id/statuses')
  async addStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createWorkflowStatusSchema)) dto: any,
  ) {
    return this.workflowsService.addStatus(id, dto);
  }

  @Patch(':id/statuses/:statusId')
  async updateStatus(
    @Param('id') id: string,
    @Param('statusId') statusId: string,
    @Body(new ZodValidationPipe(createWorkflowStatusSchema.partial())) dto: any,
  ) {
    return this.workflowsService.updateStatus(id, statusId, dto);
  }

  @Delete(':id/statuses/:statusId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteStatus(
    @Param('id') id: string,
    @Param('statusId') statusId: string,
  ) {
    await this.workflowsService.deleteStatus(id, statusId);
  }

  // ── Transitions ──

  @Post(':id/transitions')
  async addTransition(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createWorkflowTransitionSchema)) dto: any,
  ) {
    return this.workflowsService.addTransition(id, dto);
  }

  @Patch(':id/transitions/:transitionId')
  async updateTransition(
    @Param('id') id: string,
    @Param('transitionId') transitionId: string,
    @Body(new ZodValidationPipe(createWorkflowTransitionSchema.partial())) dto: any,
  ) {
    return this.workflowsService.updateTransition(id, transitionId, dto);
  }

  @Delete(':id/transitions/:transitionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTransition(
    @Param('id') id: string,
    @Param('transitionId') transitionId: string,
  ) {
    await this.workflowsService.deleteTransition(id, transitionId);
  }

  // ── Engine ──

  @Get(':id/transitions/available/:statusId')
  async getAvailableTransitions(
    @Param('id') id: string,
    @Param('statusId') statusId: string,
  ) {
    return this.workflowsService.getAvailableTransitions(id, statusId);
  }
}
