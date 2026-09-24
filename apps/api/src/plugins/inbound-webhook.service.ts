import { BadRequestException, Injectable } from '@nestjs/common';
import { TenantConnectionProvider } from '../core/tenant';

@Injectable()
export class InboundWebhookService {
  constructor(private readonly connections: TenantConnectionProvider) {}

  async processOnce(
    pluginId: string,
    digest: string,
    process: () => Promise<void>,
  ): Promise<boolean> {
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new BadRequestException('Invalid webhook digest');
    return this.connections.runInTenantTransaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext(current_schema() || $1))', [
        `:webhook:${pluginId}:${digest}`,
      ]);
      const receipts = await manager.query(
        `SELECT digest FROM inbound_webhook_receipts
        WHERE plugin_id = $1 AND digest = $2 AND processed_at > now() - interval '7 days'`,
        [pluginId, digest],
      );
      if (receipts.length) return false;
      await process();
      await manager.query(
        `INSERT INTO inbound_webhook_receipts (plugin_id, digest) VALUES ($1, $2)
        ON CONFLICT (plugin_id, digest) DO UPDATE SET processed_at = now()`,
        [pluginId, digest],
      );
      // Incremental expiry keeps cleanup bounded without an unbounded DELETE per request.
      await manager.query(`DELETE FROM inbound_webhook_receipts WHERE (plugin_id, digest) IN
        (SELECT plugin_id, digest FROM inbound_webhook_receipts WHERE processed_at <= now() - interval '7 days'
         ORDER BY processed_at LIMIT 100 FOR UPDATE SKIP LOCKED)`);
      return true;
    });
  }
}
