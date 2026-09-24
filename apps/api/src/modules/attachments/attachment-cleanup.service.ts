import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantConnectionProvider, TenantService, tenantStorage } from '../../core/tenant';
import { StorageService } from '../../core/storage';

@Injectable()
export class AttachmentCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AttachmentCleanupService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;

  constructor(
    private readonly connections: TenantConnectionProvider,
    private readonly tenants: TenantService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get('ATTACHMENT_CLEANUP_ENABLED') === 'false') return;
    this.timer = setInterval(() => {
      if (!this.running) {
        this.running = this.sweep()
          .catch(() => this.logger.error('Attachment cleanup sweep failed; will retry'))
          .finally(() => {
            this.running = undefined;
          });
      }
    }, 60_000);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.running;
  }

  async sweep(): Promise<void> {
    for (const tenant of await this.tenants.findAll()) {
      try {
        await tenantStorage.run({ tenantId: tenant.id, schemaName: tenant.schemaName }, () =>
          this.drainTenant(),
        );
      } catch {
        this.logger.warn(
          `Attachment cleanup failed for tenant ${tenant.id}; pending files retained for retry`,
        );
      }
    }
  }

  async drainTenant(): Promise<void> {
    // Lock one intent at a time so another API replica cannot remove it mid-delete.
    // Storage deletion is idempotent: a crash before COMMIT leaves a retryable intent.
    for (let count = 0; count < 100; count++) {
      const processed = await this.connections.runInTenantTransaction(async (manager) => {
        const rows = await manager.query(`SELECT storage_key FROM attachment_cleanup
          ORDER BY created_at, storage_key LIMIT 1 FOR UPDATE SKIP LOCKED`);
        if (!rows[0]) return false;
        const key = rows[0].storage_key;
        const references = await manager.query(
          'SELECT id FROM attachments WHERE storage_key = $1 LIMIT 1',
          [key],
        );
        if (references.length) throw new Error('Cleanup intent still references a live attachment');
        await this.storage.delete(key);
        await manager.query('DELETE FROM attachment_cleanup WHERE storage_key = $1', [key]);
        return true;
      });
      if (!processed) break;
    }
  }
}
