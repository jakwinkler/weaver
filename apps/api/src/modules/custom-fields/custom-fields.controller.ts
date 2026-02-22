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
import { CUSTOM_FIELD_TYPES } from '@weaver/shared';
import {
  JwtAuthGuard,
  PermissionGuard,
  RequirePermission,
} from '../../core/auth';
import { ZodValidationPipe } from '../../common';
import { CustomFieldsService } from './custom-fields.service';

const ENTITY_TYPES = ['issue', 'project', 'user', 'team'] as const;

const createCustomFieldSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100),
  fieldType: z.enum(CUSTOM_FIELD_TYPES),
  entityType: z.enum(ENTITY_TYPES).default('issue'),
  options: z.record(z.unknown()).nullable().default(null),
  validation: z.record(z.unknown()).nullable().default(null),
  required: z.boolean().default(false),
});

const updateCustomFieldSchema = createCustomFieldSchema.partial();

@Controller('custom-fields')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class CustomFieldsController {
  constructor(private readonly customFieldsService: CustomFieldsService) {}

  @Get()
  @RequirePermission('custom_fields', 'read')
  async findAll(@Query('entityType') entityType?: string) {
    return this.customFieldsService.findAll(entityType);
  }

  @Post()
  @RequirePermission('custom_fields', 'create')
  async create(
    @Body(new ZodValidationPipe(createCustomFieldSchema)) dto: any,
  ) {
    return this.customFieldsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('custom_fields', 'update')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCustomFieldSchema)) dto: any,
  ) {
    return this.customFieldsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('custom_fields', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.customFieldsService.delete(id);
  }
}
