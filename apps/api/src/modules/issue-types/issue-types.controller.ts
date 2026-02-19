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
import { JwtAuthGuard } from '../../core/auth';
import { ZodValidationPipe } from '../../common';
import { IssueTypesService } from './issue-types.service';

const createIssueTypeSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50),
  icon: z.string().max(50).optional(),
  isSubtask: z.boolean().default(false),
});

const updateIssueTypeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(50).optional(),
  icon: z.string().max(50).nullable().optional(),
  isSubtask: z.boolean().optional(),
});

@Controller('issue-types')
@UseGuards(JwtAuthGuard)
export class IssueTypesController {
  constructor(private readonly issueTypesService: IssueTypesService) {}

  @Post()
  async create(
    @Body(new ZodValidationPipe(createIssueTypeSchema)) dto: any,
  ) {
    return this.issueTypesService.create(dto);
  }

  @Get()
  async findAll() {
    return this.issueTypesService.findAll();
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateIssueTypeSchema)) dto: any,
  ) {
    return this.issueTypesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.issueTypesService.delete(id);
  }
}
