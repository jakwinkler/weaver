import { Injectable, Logger } from '@nestjs/common';
import { ProjectEntity, WebhookEntity } from '@weaver/db';
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
    if (tenantCtx && typeof payload.projectKey === 'string') {
      const wsPayload = { event, data: payload, timestamp: new Date().toISOString() };
      this.gateway.emitToProject(
        tenantCtx.tenantId,
        payload.projectKey,
        event,
        wsPayload,
      );

      this.logger.debug(
        `WS event "${event}" sent to project ${payload.projectKey} in tenant ${tenantCtx.tenantId}`,
      );
    }

    try {
      const em = await this.tenantConnections.getEntityManager();
      const repo = em.getRepository(WebhookEntity);

      const webhooks = await repo.find({ where: { active: true } });

      let projectId = typeof payload.projectId === 'string'
        ? payload.projectId
        : null;
      if (
        !projectId &&
        typeof payload.projectKey === 'string' &&
        webhooks.some((webhook) => webhook.projectId !== null)
      ) {
        projectId = (
          await em.getRepository(ProjectEntity).findOneBy({ key: payload.projectKey })
        )?.id ?? null;
      }

      const matching = webhooks.filter(
        (wh) =>
          (wh.events.includes(event) || wh.events.includes('*')) &&
          (wh.projectId === null || wh.projectId === projectId),
      );

      if (matching.length > 0) {
        const deliveries = matching.map((wh) =>
          this.webhooksService
            .enqueue(wh.id, event, payload)
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
