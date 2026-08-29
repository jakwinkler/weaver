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
import { createPageSchema, updatePageSchema } from '@weaver/shared';
import {
  CurrentUser,
  JwtAuthGuard,
  PermissionGuard,
  RequestUser,
  RequirePermission,
} from '../../core/auth';
import { ZodValidationPipe } from '../../common';
import { PagesService } from './pages.service';

@Controller('projects/:projectKey/pages')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PagesController {
  constructor(private readonly pagesService: PagesService) {}

  @Post()
  @RequirePermission('pages', 'create')
  create(
    @Param('projectKey') projectKey: string,
    @Body(new ZodValidationPipe(createPageSchema)) dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    return this.pagesService.create(projectKey, dto, user.userId);
  }

  @Get()
  @RequirePermission('pages', 'read')
  findAll(@Param('projectKey') projectKey: string) {
    return this.pagesService.findAll(projectKey);
  }

  @Get('tree')
  @RequirePermission('pages', 'read')
  getTree(@Param('projectKey') projectKey: string) {
    return this.pagesService.getTree(projectKey);
  }

  @Get('search')
  @RequirePermission('pages', 'read')
  search(@Param('projectKey') projectKey: string, @Query('q') query = '') {
    return this.pagesService.search(projectKey, query);
  }

  @Get(':slug/history')
  @RequirePermission('pages', 'read')
  getHistory(
    @Param('projectKey') projectKey: string,
    @Param('slug') slug: string,
  ) {
    return this.pagesService.getHistory(projectKey, slug);
  }

  @Post(':slug/history/:versionId/restore')
  @RequirePermission('pages', 'update')
  restore(
    @Param('projectKey') projectKey: string,
    @Param('slug') slug: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.pagesService.restore(projectKey, slug, versionId, user.userId);
  }

  @Get(':slug')
  @RequirePermission('pages', 'read')
  findBySlug(
    @Param('projectKey') projectKey: string,
    @Param('slug') slug: string,
  ) {
    return this.pagesService.findBySlug(projectKey, slug);
  }

  @Patch(':slug')
  @RequirePermission('pages', 'update')
  update(
    @Param('projectKey') projectKey: string,
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(updatePageSchema)) dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    return this.pagesService.update(projectKey, slug, dto, user.userId);
  }

  @Delete(':slug')
  @RequirePermission('pages', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('projectKey') projectKey: string,
    @Param('slug') slug: string,
  ) {
    await this.pagesService.delete(projectKey, slug);
  }
}
