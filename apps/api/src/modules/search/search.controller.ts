import {
  Controller,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, JwtAuthGuard, PermissionGuard, RequestUser } from '../../core/auth';
import { ZodValidationPipe } from '../../common';
import { SearchService } from './search.service';

const searchSchema = z.object({
  query: z.string().min(1).max(10000),
  page: z.number().int().min(1).optional(),
  perPage: z.number().int().min(1).max(200).optional(),
  sort: z.string().optional(),
});

@Controller('search')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post()
  async search(
    @Body(new ZodValidationPipe(searchSchema)) dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    return this.searchService.search(dto, user);
  }
}
