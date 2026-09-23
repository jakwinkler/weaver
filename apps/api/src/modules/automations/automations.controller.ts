import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard, CurrentUser, JwtAuthGuard, RequestUser } from '../../core/auth';
import { ZodValidationPipe } from '../../common';
import {
  automationProjectIdQuerySchema,
  CreateAutomationRuleDto,
  createAutomationRuleSchema,
  UpdateAutomationRuleDto,
  updateAutomationRuleSchema,
} from './automation.types';
import { AutomationsService } from './automations.service';

@Controller('automations')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AutomationsController {
  constructor(private readonly automationsService: AutomationsService) {}

  @Post()
  async create(
    @Body(new ZodValidationPipe(createAutomationRuleSchema)) dto: CreateAutomationRuleDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.automationsService.create(dto, user.userId);
  }

  @Get()
  async findAll(
    @Query('projectId', new ZodValidationPipe(automationProjectIdQuerySchema))
    projectId?: string,
  ) {
    return this.automationsService.findAll(projectId);
  }

  @Get(':id/executions')
  async findExecutions(@Param('id') id: string) {
    return this.automationsService.findExecutions(id);
  }

  @Post(':id/run')
  @HttpCode(HttpStatus.ACCEPTED)
  async runNow(@Param('id') id: string) {
    return this.automationsService.runNow(id);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.automationsService.findById(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAutomationRuleSchema)) dto: UpdateAutomationRuleDto,
  ) {
    return this.automationsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.automationsService.delete(id);
  }
}
