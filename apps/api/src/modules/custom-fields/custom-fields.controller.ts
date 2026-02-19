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
import { CUSTOM_FIELD_TYPES } from '@weaver/shared';
import { JwtAuthGuard } from '../../core/auth';
import { ZodValidationPipe } from '../../common';
import { CustomFieldsService } from './custom-fields.service';

const createCustomFieldSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100),
  fieldType: z.enum(CUSTOM_FIELD_TYPES),
  options: z.record(z.unknown()).nullable().default(null),
  validation: z.record(z.unknown()).nullable().default(null),
  required: z.boolean().default(false),
});

const updateCustomFieldSchema = createCustomFieldSchema.partial();

@Controller('custom-fields')
@UseGuards(JwtAuthGuard)
export class CustomFieldsController {
  constructor(private readonly customFieldsService: CustomFieldsService) {}

  @Get()
  async findAll() {
    return this.customFieldsService.findAll();
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(createCustomFieldSchema)) dto: any,
  ) {
    return this.customFieldsService.create(dto);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCustomFieldSchema)) dto: any,
  ) {
    return this.customFieldsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.customFieldsService.delete(id);
  }
}
