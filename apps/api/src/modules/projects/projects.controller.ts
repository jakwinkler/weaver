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
import { createProjectSchema, updateProjectSchema } from '@weaver/shared';
import { JwtAuthGuard, CurrentUser, RequestUser } from '../../core/auth';
import { ZodValidationPipe, parsePagination } from '../../common';
import { ProjectsService } from './projects.service';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  async create(
    @Body(new ZodValidationPipe(createProjectSchema)) dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    return this.projectsService.create(dto, user.userId);
  }

  @Get()
  async findAll(@Query() query: any) {
    const params = parsePagination(query);
    return this.projectsService.findAll(params);
  }

  @Get(':key')
  async findByKey(@Param('key') key: string) {
    return this.projectsService.findByKey(key);
  }

  @Patch(':key')
  async update(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) dto: any,
  ) {
    return this.projectsService.update(key, dto);
  }

  @Delete(':key')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('key') key: string) {
    await this.projectsService.delete(key);
  }
}
