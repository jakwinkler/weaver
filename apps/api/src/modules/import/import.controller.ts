import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AdminGuard, CurrentUser, JwtAuthGuard, RequestUser } from '../../core/auth';
import { ZodValidationPipe } from '../../common';
import { ImportService } from './import.service';
import {
  discoverJiraProjectsSchema,
  DiscoverJiraProjectsDto,
  startJiraImportSchema,
  StartJiraImportDto,
} from './import.schemas';

@Controller('import')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  @Post('jira/projects')
  @HttpCode(200)
  discoverProjects(
    @Body(new ZodValidationPipe(discoverJiraProjectsSchema)) dto: DiscoverJiraProjectsDto,
  ) {
    return this.imports.discoverProjects(dto.config);
  }

  @Post('jira/start')
  start(
    @Body(new ZodValidationPipe(startJiraImportSchema)) dto: StartJiraImportDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.imports.start(dto, user.userId);
  }

  @Get('status/:id')
  status(@Param('id') id: string) {
    return this.imports.getStatus(id);
  }

  @Post('jira/cancel/:id')
  @HttpCode(200)
  cancel(@Param('id') id: string) {
    return this.imports.cancel(id);
  }
}
