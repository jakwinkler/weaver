import { Injectable, Logger } from '@nestjs/common';
import { WebhookEntity } from '@weaver/db';
import { TenantConnectionProvider } from '../../core/tenant';
import { WebhooksService } from '../webhooks';

export type PluginDispatcherFn = (event: string, payload: Record<string, unknown>) => Promise<void>;

@Injectable()
export class EventDispatcherService {
  private readonly logger = new Logger(EventDispatcherService.name);
  private pluginDispatchers: PluginDispatcherFn[] = [];

  constructor(
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly webhooksService: WebhooksService,
  ) {}

  registerPluginDispatcher(fn: PluginDispatcherFn): void {
    this.pluginDispatchers.push(fn);
  }

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

      if (matching.length > 0) {
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
      } else {
        this.logger.debug(`No webhooks subscribed to event: ${event}`);
      }

      // Dispatch to plugin handlers
      for (const dispatcher of this.pluginDispatchers) {
        try {
          await dispatcher(event, payload);
        } catch (err) {
          this.logger.warn(`Plugin dispatcher failed for event ${event}: ${err}`);
        }
      }
    } catch (err) {
      this.logger.error(`Failed to dispatch event ${event}: ${err}`);
    }
  }
}
