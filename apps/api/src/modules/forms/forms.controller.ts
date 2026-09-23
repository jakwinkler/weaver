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
import { createFormSchema, updateFormSchema } from '@weaver/shared';
import {
  CurrentUser,
  JwtAuthGuard,
  PermissionGuard,
  RequestUser,
  RequirePermission,
} from '../../core/auth';
import { ZodValidationPipe } from '../../common';
import { FormsService } from './forms.service';
import { ProjectAccessGuard, RequireProjectAccess } from '../../core/tenant';

@Controller('projects/:projectKey/forms')
@UseGuards(JwtAuthGuard, PermissionGuard, ProjectAccessGuard)
@RequirePermission('projects', 'update')
@RequireProjectAccess('project-key', 'write')
export class FormsController {
  constructor(private readonly formsService: FormsService) {}

  @Post()
  create(
    @Param('projectKey') projectKey: string,
    @Body(new ZodValidationPipe(createFormSchema)) dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    return this.formsService.create(projectKey, dto, user.userId);
  }

  @Get()
  findAll(@Param('projectKey') projectKey: string) {
    return this.formsService.findAll(projectKey);
  }

  @Get(':formId')
  findOne(@Param('projectKey') projectKey: string, @Param('formId') formId: string) {
    return this.formsService.findOne(projectKey, formId);
  }

  @Patch(':formId')
  update(
    @Param('projectKey') projectKey: string,
    @Param('formId') formId: string,
    @Body(new ZodValidationPipe(updateFormSchema)) dto: any,
  ) {
    return this.formsService.update(projectKey, formId, dto);
  }

  @Delete(':formId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('projectKey') projectKey: string, @Param('formId') formId: string) {
    await this.formsService.delete(projectKey, formId);
  }

  @Get(':formId/submissions')
  findSubmissions(
    @Param('projectKey') projectKey: string,
    @Param('formId') formId: string,
    @Query('limit') limit?: string,
  ) {
    return this.formsService.findSubmissions(projectKey, formId, limit ? Number(limit) : 20);
  }
}
