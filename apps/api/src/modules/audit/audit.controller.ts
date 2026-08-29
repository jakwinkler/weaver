import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { parsePagination } from '../../common';
import { AdminGuard, JwtAuthGuard } from '../../core/auth';
import { AuditService, type AuditLogFilters } from './audit.service';

@Controller('audit-log')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(
    @Query() query: Record<string, string>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const filename = `weaver-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return this.auditService.exportCsv(this.filters(query));
  }

  @Get()
  async findAll(@Query() query: Record<string, string>) {
    return this.auditService.findAll(this.filters(query), parsePagination(query));
  }

  private filters(query: Record<string, string>): AuditLogFilters {
    return {
      userId: query.userId || undefined,
      resource: query.resource || undefined,
      action: query.action || undefined,
      from: query.from || undefined,
      to: query.to || undefined,
      search: query.search?.trim() || undefined,
    };
  }
}
