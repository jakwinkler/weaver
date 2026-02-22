import { Injectable, Logger } from '@nestjs/common';
import { WebhookEntity } from '@weaver/db';
import { TenantConnectionProvider } from '../../core/tenant';
import { WebhooksService } from '../webhooks';

@Injectable()
export class EventDispatcherService {
  private readonly logger = new Logger(EventDispatcherService.name);

  constructor(
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly webhooksService: WebhooksService,
  ) {}

  async emit(
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const em = await this.tenantConnections.getEntityManager();
      const repo = em.getRepository(WebhookEntity);

      const webhooks = await repo.find({ where: { active: true } });

      const matching = webhooks.filter(
        (wh) => wh.events.includes(event) || wh.events.includes('*'),
      );

      if (matching.length === 0) {
        this.logger.debug(`No webhooks subscribed to event: ${event}`);
        return;
      }

      const deliveries = matching.map((wh) =>
        this.webhooksService
          .deliver(wh.id, event, payload)
          .catch((err) =>
            this.logger.warn(
              `Failed to deliver event ${event} to webhook ${wh.id}: ${err}`,
            ),
          ),
      );

      await Promise.allSettled(deliveries);
    } catch (err) {
      this.logger.error(`Failed to dispatch event ${event}: ${err}`);
    }
  }
}
