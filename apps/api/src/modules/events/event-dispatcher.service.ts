import { Injectable, Logger } from '@nestjs/common';
import { WebhookEntity } from '@weaver/db';
import { TenantConnectionProvider, getTenantContext } from '../../core/tenant';
import { WeaverGateway } from '../../core/websocket';
import { WebhooksService } from '../webhooks';

export type PluginDispatcherFn = (event: string, payload: Record<string, unknown>) => Promise<void>;

@Injectable()
export class EventDispatcherService {
  private readonly logger = new Logger(EventDispatcherService.name);
  private pluginDispatchers: PluginDispatcherFn[] = [];

  constructor(
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly webhooksService: WebhooksService,
    private readonly gateway: WeaverGateway,
  ) {}

  registerPluginDispatcher(fn: PluginDispatcherFn): void {
    this.pluginDispatchers.push(fn);
  }

  async emit(
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    // Push to WebSocket for real-time updates
    const tenantCtx = getTenantContext();
    if (tenantCtx) {
      const wsPayload = { event, data: payload, timestamp: new Date().toISOString() };
      this.gateway.emitToTenant(tenantCtx.tenantId, event, wsPayload);

      // Also emit to project room if projectKey is present
      if (payload.projectKey) {
        this.gateway.emitToProject(
          tenantCtx.tenantId,
          payload.projectKey as string,
          event,
          wsPayload,
        );
      }

      this.logger.debug(`WS event "${event}" sent to tenant ${tenantCtx.tenantId}`);
    }

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
