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
import { createBoardSchema, updateBoardSchema } from '@weaver/shared';
import { JwtAuthGuard, PermissionGuard, RequirePermission } from '../../core/auth';
import { ZodValidationPipe } from '../../common';
import { BoardsService } from './boards.service';
import { ProjectAccessGuard, RequireProjectAccess } from '../../core/tenant';

@Controller('boards')
@UseGuards(JwtAuthGuard, PermissionGuard, ProjectAccessGuard)
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  @Post()
  @RequirePermission('projects', 'update')
  @RequireProjectAccess('project-id', 'write')
  async create(
    @Query('projectId') projectId: string,
    @Body(new ZodValidationPipe(createBoardSchema)) dto: any,
  ) {
    return this.boardsService.create(projectId, dto);
  }

  @Get()
  @RequirePermission('projects', 'read')
  @RequireProjectAccess('project-id')
  async findAll(@Query('projectId') projectId: string) {
    return this.boardsService.findAll(projectId);
  }

  @Get(':id')
  @RequirePermission('projects', 'read')
  @RequireProjectAccess('board-id')
  async findById(@Param('id') id: string) {
    return this.boardsService.findById(id);
  }

  @Get(':id/issues')
  @RequirePermission('projects', 'read')
  @RequireProjectAccess('board-id')
  async findByIdWithIssues(@Param('id') id: string) {
    return this.boardsService.findByIdWithIssues(id);
  }

  @Patch(':id')
  @RequirePermission('projects', 'update')
  @RequireProjectAccess('board-id', 'write')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBoardSchema)) dto: any,
  ) {
    return this.boardsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('projects', 'update')
  @RequireProjectAccess('board-id', 'write')
  async delete(@Param('id') id: string) {
    await this.boardsService.delete(id);
  }
}
