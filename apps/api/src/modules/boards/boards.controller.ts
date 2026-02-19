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
import { createBoardSchema, BOARD_TYPES } from '@weaver/shared';
import { JwtAuthGuard } from '../../core/auth';
import { ZodValidationPipe } from '../../common';
import { BoardsService } from './boards.service';

const updateBoardSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  type: z.enum(BOARD_TYPES).optional(),
  config: z.record(z.unknown()).optional(),
});

@Controller('boards')
@UseGuards(JwtAuthGuard)
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  @Post()
  async create(
    @Query('projectId') projectId: string,
    @Body(new ZodValidationPipe(createBoardSchema)) dto: any,
  ) {
    return this.boardsService.create(projectId, dto);
  }

  @Get()
  async findAll(@Query('projectId') projectId: string) {
    return this.boardsService.findAll(projectId);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.boardsService.findById(id);
  }

  @Get(':id/issues')
  async findByIdWithIssues(@Param('id') id: string) {
    return this.boardsService.findByIdWithIssues(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBoardSchema)) dto: any,
  ) {
    return this.boardsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.boardsService.delete(id);
  }
}
