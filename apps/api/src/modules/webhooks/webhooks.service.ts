import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { WebhookEntity } from '@weaver/db';
import { TenantConnectionProvider } from '../../core/tenant';
import * as crypto from 'crypto';

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

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly tenantConnections: TenantConnectionProvider) {}

  async create(dto: {
    url: string;
    secret: string;
    events: string[];
    projectId?: string;
  }): Promise<WebhookEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(WebhookEntity);

    const webhook = repo.create({
      url: dto.url,
      secret: dto.secret,
      events: dto.events,
      projectId: dto.projectId ?? null,
      active: true,
    });

    return repo.save(webhook);
  }

  async findAll(projectId?: string): Promise<WebhookEntity[]> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(WebhookEntity);

    const where: Record<string, unknown> = {};
    if (projectId) {
      where.projectId = projectId;
    }

    return repo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findById(id: string): Promise<WebhookEntity> {
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
    dto: Partial<{ url: string; secret: string; events: string[]; active: boolean }>,
  ): Promise<WebhookEntity> {
    const webhook = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(WebhookEntity);

    Object.assign(webhook, dto);
    return repo.save(webhook);
  }

  async delete(id: string): Promise<void> {
    const webhook = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(WebhookEntity);

    await repo.remove(webhook);
  }

  async deliver(
    webhookId: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<{ success: boolean; statusCode: number | null }> {
    const webhook = await this.findById(webhookId);

    if (!webhook.active) {
      return { success: false, statusCode: null };
    }

    const body = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(body)
      .digest('hex');

    let responseStatus: number | null = null;
    let responseBody: string | null = null;
    let success = false;

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event,
        },
        body,
        signal: AbortSignal.timeout(10000),
      });

      responseStatus = response.status;
      responseBody = await response.text();
      success = response.ok;
    } catch (err) {
      this.logger.warn(`Webhook delivery failed for ${webhookId}: ${err}`);
      responseBody = err instanceof Error ? err.message : String(err);
    }

    // Store delivery record via raw SQL
    const em = await this.tenantConnections.getEntityManager();
    await em.query(
      `INSERT INTO webhook_deliveries (webhook_id, event, payload, response_status, response_body, success, delivered_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [webhookId, event, JSON.stringify(payload), responseStatus, responseBody, success],
    );

    return { success, statusCode: responseStatus };
  }

  async getDeliveries(webhookId: string): Promise<WebhookDeliveryRecord[]> {
    await this.findById(webhookId);

    const em = await this.tenantConnections.getEntityManager();
    const rows = await em.query(
      `SELECT id, webhook_id, event, payload, response_status, response_body, success, delivered_at
       FROM webhook_deliveries
       WHERE webhook_id = $1
       ORDER BY delivered_at DESC
       LIMIT 50`,
      [webhookId],
    );

    return rows;
  }
}
