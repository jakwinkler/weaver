import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  AuditLogEntity,
  InstalledPluginEntity,
  IssueEntity,
  ProjectEntity,
  RoleEntity,
  TenantEntity,
  TenantMembershipEntity,
  UserEntity,
  WebhookEntity,
  WorkflowEntity,
} from '@weaver/db';
import type { PaginatedResponse } from '@weaver/shared';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { Request } from 'express';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import type { PaginationParams } from '../../common';
import { TenantConnectionProvider } from '../../core/tenant';

const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_EXPORT_LIMIT = 50_000;
const RETENTION_JOB = 'delete-expired-audit-logs';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuditLogFilters {
  userId?: string;
  resource?: string;
  action?: string;
  from?: string;
  to?: string;
  search?: string;
}

export interface AuditLogRecord extends AuditLogEntity {
  user: { id: string; displayName: string; email: string } | null;
}

@Injectable()
export class AuditService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditService.name);
  private retentionQueue?: Queue;
  private retentionWorker?: Worker;

  constructor(
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly config: ConfigService,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(TenantEntity)
    private readonly tenants: Repository<TenantEntity>,
    @InjectRepository(TenantMembershipEntity)
    private readonly memberships: Repository<TenantMembershipEntity>,
    @InjectRepository(InstalledPluginEntity)
    private readonly installedPlugins: Repository<InstalledPluginEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get('AUDIT_LOG_RETENTION_ENABLED', 'true') === 'false') {
      return;
    }

    const queueName = this.config.get('AUDIT_LOG_RETENTION_QUEUE_NAME', 'audit-log-retention');
    const connection: ConnectionOptions = {
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6380),
      password: this.config.get('REDIS_PASSWORD') || undefined,
    };

    try {
      this.retentionQueue = new Queue(queueName, { connection });
      this.retentionWorker = new Worker(
        queueName,
        async (job) => {
          if (job.name === RETENTION_JOB) {
            await this.cleanupExpiredEntriesForAllTenants();
          }
        },
        { connection },
      );
      this.retentionWorker.on('failed', (job, error) => {
        this.logger.error(`Audit retention job ${job?.id ?? 'unknown'} failed`, error.stack);
      });

      await this.retentionQueue.upsertJobScheduler(
        'daily-audit-retention',
        { pattern: this.config.get('AUDIT_LOG_RETENTION_CRON', '0 3 * * *') },
        { name: RETENTION_JOB, data: {} },
      );
    } catch (error) {
      this.logger.error(
        'Unable to initialize the audit retention queue',
        error instanceof Error ? error.stack : String(error),
      );
      await this.closeRetentionConnections();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.closeRetentionConnections();
  }

  async log(
    userId: string | null,
    action: string,
    resource: string,
    resourceId: string,
    metadata: Record<string, unknown>,
    req: Request,
  ): Promise<AuditLogEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(AuditLogEntity);
    const entry = repo.create({
      userId,
      action,
      resource,
      resourceId,
      metadata: this.sanitize(metadata) as Record<string, unknown>,
      ipAddress: this.extractIpAddress(req),
      userAgent: req.get('user-agent') ?? null,
    });
    return repo.save(entry);
  }

  async snapshot(
    resource: string,
    identifier: string | undefined,
    tenantId: string,
  ): Promise<Record<string, unknown> | null> {
    if (!identifier) return null;

    try {
      if (resource === 'user') {
        const membership = await this.memberships.findOne({
          where: { tenantId, userId: identifier },
          relations: ['user'],
        });
        return membership
          ? (this.sanitize({
              id: membership.userId,
              role: membership.role,
              displayName: membership.user.displayName,
              email: membership.user.email,
            }) as Record<string, unknown>)
          : null;
      }

      if (resource === 'plugin') {
        const plugin = await this.installedPlugins.findOneBy({
          tenantId,
          pluginId: identifier,
        });
        return plugin ? (this.sanitize(plugin) as Record<string, unknown>) : null;
      }

      if (resource === 'settings') {
        const tenant = await this.tenants.findOneBy({ id: tenantId });
        return tenant
          ? (this.sanitize({ id: tenant.id, ...tenant.settings }) as Record<string, unknown>)
          : null;
      }

      const em = await this.tenantConnections.getEntityManager();
      let record: object | null = null;
      if (resource === 'project') {
        record = await em
          .getRepository(ProjectEntity)
          .findOneBy(UUID_RE.test(identifier) ? { id: identifier } : { key: identifier });
      } else if (resource === 'issue') {
        record = await em
          .getRepository(IssueEntity)
          .findOneBy(UUID_RE.test(identifier) ? { id: identifier } : { key: identifier });
      } else if (resource === 'role') {
        record = await em.getRepository(RoleEntity).findOneBy({ id: identifier });
      } else if (resource === 'workflow') {
        record = await em.getRepository(WorkflowEntity).findOneBy({ id: identifier });
      } else if (resource === 'webhook') {
        record = await em.getRepository(WebhookEntity).findOneBy({ id: identifier });
      }

      return record ? (this.sanitize(record) as Record<string, unknown>) : null;
    } catch (error) {
      this.logger.warn(
        `Could not capture ${resource} state for audit logging: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  async findAll(
    filters: AuditLogFilters,
    pagination: PaginationParams,
  ): Promise<PaginatedResponse<AuditLogRecord>> {
    const qb = await this.createFilteredQuery(filters);
    this.applySort(qb, pagination.sort);
    qb.skip((pagination.page - 1) * pagination.perPage).take(pagination.perPage);
    const [entries, total] = await qb.getManyAndCount();

    return {
      data: await this.attachUsers(entries),
      meta: {
        page: pagination.page,
        perPage: pagination.perPage,
        total,
        totalPages: Math.ceil(total / pagination.perPage),
      },
    };
  }

  async exportCsv(filters: AuditLogFilters): Promise<string> {
    const qb = await this.createFilteredQuery(filters);
    qb.orderBy('audit.createdAt', 'DESC').take(
      this.config.get<number>('AUDIT_LOG_EXPORT_LIMIT', DEFAULT_EXPORT_LIMIT),
    );
    const entries = await this.attachUsers(await qb.getMany());
    const headers = [
      'Timestamp',
      'User',
      'Email',
      'Action',
      'Resource',
      'Resource ID',
      'IP Address',
      'User Agent',
      'Details',
    ];
    const rows = entries.map((entry) => [
      entry.createdAt.toISOString(),
      entry.user?.displayName ?? 'Unknown user',
      entry.user?.email ?? '',
      entry.action,
      entry.resource,
      entry.resourceId,
      entry.ipAddress ?? '',
      entry.userAgent ?? '',
      JSON.stringify(entry.metadata),
    ]);
    return [
      headers.join(','),
      ...rows.map((row) => row.map((value) => this.csvCell(value)).join(',')),
    ].join('\n');
  }

  async cleanupExpiredEntries(
    schemaName: string,
    retentionDays = this.getRetentionDays(),
  ): Promise<number> {
    const connection = await this.tenantConnections.getConnection(schemaName);
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await connection
      .getRepository(AuditLogEntity)
      .createQueryBuilder()
      .delete()
      .where('created_at < :cutoff', { cutoff })
      .execute();
    return result.affected ?? 0;
  }

  async cleanupExpiredEntriesForAllTenants(): Promise<number> {
    const tenants = await this.tenants.find({ select: ['schemaName'] });
    let deleted = 0;
    for (const tenant of tenants) {
      deleted += await this.cleanupExpiredEntries(tenant.schemaName);
    }
    this.logger.log(`Deleted ${deleted} expired audit log entries`);
    return deleted;
  }

  sanitize(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map((item) => this.sanitize(item));
    if (typeof value !== 'object') return value;

    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        this.isSecretKey(key) ? '[REDACTED]' : this.sanitize(entry),
      ]),
    );
  }

  private async createFilteredQuery(
    filters: AuditLogFilters,
  ): Promise<SelectQueryBuilder<AuditLogEntity>> {
    const em = await this.tenantConnections.getEntityManager();
    const qb = em.getRepository(AuditLogEntity).createQueryBuilder('audit');
    const from = filters.from ? this.parseDate(filters.from, 'from') : undefined;
    const to = filters.to ? this.parseDate(filters.to, 'to') : undefined;
    if (from && to && from > to) {
      throw new BadRequestException('The from date must be before the to date');
    }

    if (filters.userId) {
      qb.andWhere('audit.userId = :userId', { userId: filters.userId });
    }
    if (filters.resource) {
      qb.andWhere('audit.resource = :resource', { resource: filters.resource });
    }
    if (filters.action) {
      qb.andWhere('audit.action = :action', { action: filters.action });
    }
    if (from) {
      qb.andWhere('audit.createdAt >= :from', { from });
    }
    if (to) {
      qb.andWhere('audit.createdAt <= :to', { to });
    }
    if (filters.search) {
      qb.andWhere(
        `(audit.action ILIKE :search OR audit.resource ILIKE :search OR audit.resourceId ILIKE :search OR CAST(audit.metadata AS TEXT) ILIKE :search)`,
        { search: `%${filters.search}%` },
      );
    }
    return qb;
  }

  private applySort(qb: SelectQueryBuilder<AuditLogEntity>, sort?: string): void {
    const allowed = new Set(['createdAt', 'action', 'resource', 'userId']);
    const descending = sort?.startsWith('-') ?? true;
    const field = sort ? (descending ? sort.slice(1) : sort) : 'createdAt';
    if (!allowed.has(field)) {
      throw new BadRequestException(`Invalid sort field: ${field}`);
    }
    qb.orderBy(`audit.${field}`, descending ? 'DESC' : 'ASC');
  }

  private async attachUsers(entries: AuditLogEntity[]): Promise<AuditLogRecord[]> {
    const ids = [...new Set(entries.map((entry) => entry.userId).filter(Boolean))] as string[];
    const users = ids.length ? await this.users.find({ where: { id: In(ids) } }) : [];
    const byId = new Map(users.map((user) => [user.id, user]));
    return entries.map((entry) => {
      const user = entry.userId ? byId.get(entry.userId) : undefined;
      return Object.assign(entry, {
        user: user
          ? {
              id: user.id,
              displayName: user.displayName,
              email: user.email,
            }
          : null,
      });
    });
  }

  private extractIpAddress(req: Request): string | null {
    const forwarded = req.headers['x-forwarded-for'];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return first?.split(',')[0]?.trim() || req.ip || req.socket.remoteAddress || null;
  }

  private parseDate(value: string, field: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid ${field} date`);
    }
    return date;
  }

  private getRetentionDays(): number {
    const configured = this.config.get<number>('AUDIT_LOG_RETENTION_DAYS', DEFAULT_RETENTION_DAYS);
    return Number.isFinite(Number(configured)) && Number(configured) > 0
      ? Number(configured)
      : DEFAULT_RETENTION_DAYS;
  }

  private csvCell(value: unknown): string {
    const raw = String(value ?? '');
    const text = /^\s*[=+@-]/.test(raw) ? `'${raw}` : raw;
    return `"${text.replace(/"/g, '""')}"`;
  }

  private isSecretKey(key: string): boolean {
    const normalized = key.replace(/[^a-z]/gi, '').toLowerCase();
    return (
      normalized === 'pass' ||
      normalized === 'authorization' ||
      normalized === 'cookie' ||
      normalized.endsWith('password') ||
      normalized.endsWith('passwordhash') ||
      normalized.endsWith('secret') ||
      normalized.endsWith('token') ||
      normalized.endsWith('apikey') ||
      normalized.endsWith('privatekey')
    );
  }

  private async closeRetentionConnections(): Promise<void> {
    await this.retentionWorker?.close();
    await this.retentionQueue?.close();
    this.retentionWorker = undefined;
    this.retentionQueue = undefined;
  }
}
