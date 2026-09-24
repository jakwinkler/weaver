import { CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'inbound_webhook_receipts' })
export class InboundWebhookReceiptEntity {
  @PrimaryColumn({ name: 'plugin_id', length: 255 })
  pluginId!: string;

  @PrimaryColumn({ length: 64 })
  digest!: string;

  @Index('IDX_inbound_webhook_receipts_processed_at')
  @CreateDateColumn({ name: 'processed_at', type: 'timestamptz' })
  processedAt!: Date;
}
