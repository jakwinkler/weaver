import { ImportPeopleService } from './import-people.service';
import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';
import { Audit } from '../audit';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
  constructor(
    private readonly imports: ImportService,
    private readonly people: ImportPeopleService,
  ) {}

  @Get('people') listPeople() {
    return this.people.people();
  }
  @Get('audiences') listAudiences() {
    return this.people.audiences();
  }
  @Post('audiences/:id')
  @Audit({ action: 'import.audience_updated', resource: 'import' })
  mapAudience(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = z.object({ userIds: z.array(z.string().uuid()).max(1000) }).safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid audience selection');
    return this.people.mapAudience(id, parsed.data.userIds);
  }
  @Post('invitations')
  @Audit({ action: 'import.invitations_created', resource: 'import' })
  invite(@Body() body: unknown) {
    const parsed = z
      .object({
        invitations: z
          .array(
            z.object({
              personId: z.string().uuid(),
              email: z.string().trim().email().max(255),
              role: z.enum(['member', 'viewer']),
              projectIds: z.array(z.string().uuid()).min(1).max(100),
              delivery: z.enum(['email', 'link']),
            }),
          )
          .min(1)
          .max(100),
      })
      .safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid invitation selection');
    return this.people.invite(parsed.data.invitations);
  }
  @Post('people/:id/link')
  @Audit({ action: 'import.person_linked', resource: 'import' })
  link(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = z.object({ userId: z.string().uuid() }).safeParse(body);
    if (!parsed.success) throw new BadRequestException('Choose a member to link');
    return this.people.link(id, parsed.data.userId);
  }
  @Post('people/:id/revoke')
  @Audit({ action: 'import.invitation_revoked', resource: 'import' })
  revoke(@Param('id', ParseUUIDPipe) id: string) {
    return this.people.revoke(id);
  }

  @Post('attachments/:id/visibility')
  @Audit({ action: 'import.attachment_access_reviewed', resource: 'import' })
  reviewAttachment(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = z.object({ audienceId: z.string().uuid().nullable() }).safeParse(body);
    if (!parsed.success) throw new BadRequestException('Choose file access');
    return this.people.reviewAttachment(id, parsed.data.audienceId);
  }

  @Get('resources')
  resources(@Query('jobId') jobId: string, @Query('page') page = '1') {
    if (!z.string().uuid().safeParse(jobId).success || !/^\d+$/.test(page))
      throw new BadRequestException('Invalid source record request');
    return this.imports.resources(jobId, Number(page));
  }
  @Post('jira/preview')
  @HttpCode(200)
  preview(@Body(new ZodValidationPipe(startJiraImportSchema)) dto: StartJiraImportDto) {
    return this.imports.preview(dto);
  }

  @Post('jira/projects')
  @HttpCode(200)
  discoverProjects(
    @Body(new ZodValidationPipe(discoverJiraProjectsSchema)) dto: DiscoverJiraProjectsDto,
  ) {
    return this.imports.discoverProjects(dto.config);
  }

  @Post('jira/start')
  @Audit({ action: 'import.started', resource: 'import' })
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
  @Audit({ action: 'import.cancelled', resource: 'import' })
  @HttpCode(200)
  cancel(@Param('id') id: string) {
    return this.imports.cancel(id);
  }
}
