import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { z } from 'zod';
import { ISSUE_LINK_TYPES } from '@weaver/shared';
import { JwtAuthGuard, PermissionGuard, RequirePermission } from '../../core/auth';
import { ZodValidationPipe } from '../../common';
import { IssueLinksService } from './issue-links.service';
import { ProjectAccessGuard, RequireProjectAccess } from '../../core/tenant';

const createIssueLinkSchema = z.object({
  linkType: z.enum(ISSUE_LINK_TYPES),
  sourceIssueId: z.string().uuid(),
  targetIssueId: z.string().uuid(),
});

@Controller('issue-links')
@UseGuards(JwtAuthGuard, PermissionGuard, ProjectAccessGuard)
export class IssueLinksController {
  constructor(private readonly issueLinksService: IssueLinksService) {}

  @Post()
  @RequirePermission('issues', 'update')
  @RequireProjectAccess('issue-link-body', 'write')
  async create(
    @Body(new ZodValidationPipe(createIssueLinkSchema)) dto: any,
  ) {
    return this.issueLinksService.create(dto);
  }

  @Get('by-issue/:issueId')
  @RequirePermission('issues', 'read')
  @RequireProjectAccess('issue-id')
  async findByIssue(@Param('issueId') issueId: string) {
    return this.issueLinksService.findByIssue(issueId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('issues', 'update')
  @RequireProjectAccess('issue-link-id', 'write')
  async delete(@Param('id') id: string) {
    await this.issueLinksService.delete(id);
  }
}
