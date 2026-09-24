import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ProjectEntity, WebhookEntity } from '@weaver/db';
import { getTenantContext, TenantConnectionProvider } from '../../core/tenant';
import * as crypto from 'crypto';
import type { CreateWebhookDto, UpdateWebhookDto } from '@weaver/shared';
import {
  assertSafeOutboundUrl,
  fetchWithSafeRedirects,
  readLimitedResponseText,
} from '../../core/security/outbound-http';
import { WebhookQueueService } from './webhook-queue.service';

export interface WebhookDeliveryRecord {
  id: string;
  webhook_id: string;
  event: string;
  payload: Record<string, unknown>;
  response_status: number | null;
  response_body: string | null;
  success: boolean;
  delivered_at: Date;
}

type WebhookResponse = Omit<WebhookEntity, 'secret' | 'tenant'>;

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly webhookQueue: WebhookQueueService,
  ) {}

  async enqueue(
    webhookId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const context = getTenantContext();
    if (!context) {
      throw new Error('Tenant context is required to enqueue a webhook');
    }
    await this.webhookQueue.enqueue({
      tenantId: context.tenantId,
      schemaName: context.schemaName,
      webhookId,
      eventType,
      payload,
    });
  }

  async create(dto: CreateWebhookDto): Promise<WebhookEntity> {
    await assertSafeOutboundUrl(dto.url);
    const em = await this.tenantConnections.getEntityManager();
    if (dto.projectId && !await em.getRepository(ProjectEntity).findOneBy({ id: dto.projectId })) {
      throw new BadRequestException('Webhook project does not exist');
    }
    const repo = em.getRepository(WebhookEntity);

    const webhook = repo.create({
      url: dto.url,
      secret: dto.secret || crypto.randomBytes(32).toString('hex'),
      events: dto.events,
      projectId: dto.projectId ?? null,
      active: true,
    });

    return repo.save(webhook);
  }

  async findAll(projectId?: string): Promise<WebhookResponse[]> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(WebhookEntity);

    const where: Record<string, unknown> = {};
    if (projectId) {
      where.projectId = projectId;
    }

    const webhooks = await repo.find({ where, order: { createdAt: 'DESC' } });
    return webhooks.map((webhook) => this.toResponse(webhook));
  }

  async findById(id: string): Promise<WebhookResponse> {
    return this.toResponse(await this.findEntityById(id));
  }

  private async findEntityById(id: string): Promise<WebhookEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(WebhookEntity);

    const webhook = await repo.findOneBy({ id });
    if (!webhook) {
      throw new NotFoundException(`Webhook "${id}" not found`);
    }

    return webhook;
  }

  async update(
    id: string,
    dto: UpdateWebhookDto,
  ): Promise<WebhookResponse> {
    if (dto.url) {
      await assertSafeOutboundUrl(dto.url);
    }
    const webhook = await this.findEntityById(id);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(WebhookEntity);

    Object.assign(webhook, dto);
    return this.toResponse(await repo.save(webhook));
  }

  async delete(id: string): Promise<void> {
    const webhook = await this.findEntityById(id);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(WebhookEntity);

    await repo.remove(webhook);
  }

  async deliver(
    webhookId: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<{ success: boolean; statusCode: number | null }> {
    const webhook = await this.findEntityById(webhookId);

    if (!webhook.active) {
      return { success: false, statusCode: null };
    }

    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');

    let responseStatus: number | null = null;
    let responseBody: string | null = null;
    let success = false;

    try {
      const response = await fetchWithSafeRedirects(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Timestamp': timestamp,
          'X-Webhook-Event': event,
        },
        body,
        signal: AbortSignal.timeout(10000),
      });

      responseStatus = response.status;
      responseBody = await readLimitedResponseText(response, 64 * 1024);
      success = response.ok;
    } catch (err) {
      this.logger.warn(`Webhook delivery failed for ${webhookId}: ${err}`);
      responseBody = err instanceof Error ? err.message : String(err);
    }

    // Store delivery record via raw SQL
    await this.tenantConnections.runInTenantTransaction((em) =>
      em.query(
        `INSERT INTO webhook_deliveries (webhook_id, event, payload, response_status, response_body, success, delivered_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [webhookId, event, JSON.stringify(payload), responseStatus, responseBody, success],
      ),
    );

    return { success, statusCode: responseStatus };
  }

  async getDeliveries(webhookId: string): Promise<WebhookDeliveryRecord[]> {
    await this.findById(webhookId);

    const rows = await this.tenantConnections.runInTenantTransaction((em) =>
      em.query(
        `SELECT id, webhook_id, event, payload, response_status, response_body, success, delivered_at
         FROM webhook_deliveries
         WHERE webhook_id = $1
         ORDER BY delivered_at DESC
         LIMIT 50`,
        [webhookId],
      ),
    );

    return rows;
  }

  async deliverAutomation(
    url: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const target = new URL(url);
    if (target.protocol !== 'https:' && target.protocol !== 'http:') {
      throw new Error('Automation webhooks require an HTTP or HTTPS URL');
    }

    const response = await fetchWithSafeRedirects(target.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Event': event,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Automation webhook returned HTTP ${response.status}`);
    }
  }

  private toResponse(webhook: WebhookEntity): WebhookResponse {
    const { secret: _secret, ...response } = webhook;
    return response;
  }
}
