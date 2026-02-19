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
import { JwtAuthGuard } from '../../core/auth';
import { ZodValidationPipe } from '../../common';
import { IssueLinksService } from './issue-links.service';

const createIssueLinkSchema = z.object({
  linkType: z.enum(ISSUE_LINK_TYPES),
  sourceIssueId: z.string().uuid(),
  targetIssueId: z.string().uuid(),
});

@Controller('issue-links')
@UseGuards(JwtAuthGuard)
export class IssueLinksController {
  constructor(private readonly issueLinksService: IssueLinksService) {}

  @Post()
  async create(
    @Body(new ZodValidationPipe(createIssueLinkSchema)) dto: any,
  ) {
    return this.issueLinksService.create(dto);
  }

  @Get('by-issue/:issueId')
  async findByIssue(@Param('issueId') issueId: string) {
    return this.issueLinksService.findByIssue(issueId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.issueLinksService.delete(id);
  }
}
