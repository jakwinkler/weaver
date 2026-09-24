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
import { JwtAuthGuard, CurrentUser, RequestUser } from '../../core/auth';
import { ZodValidationPipe } from '../../common';
import { SavedFiltersService } from './saved-filters.service';

const createSavedFilterSchema = z.object({
  name: z.string().min(1).max(255),
  query: z.string().min(1).max(10000),
  isShared: z.boolean().default(false),
});

const updateSavedFilterSchema = createSavedFilterSchema.partial();

@Controller('saved-filters')
@UseGuards(JwtAuthGuard)
export class SavedFiltersController {
  constructor(private readonly savedFiltersService: SavedFiltersService) {}

  @Get()
  async findAll(@CurrentUser() user: RequestUser) {
    return this.savedFiltersService.findAllForUser(user.userId);
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(createSavedFilterSchema)) dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    return this.savedFiltersService.create(dto, user.userId);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSavedFilterSchema)) dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    return this.savedFiltersService.update(id, dto, user.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.savedFiltersService.delete(id, user.userId);
  }
}
