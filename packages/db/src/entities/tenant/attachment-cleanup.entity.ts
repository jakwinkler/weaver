import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Durable storage deletion intent, committed together with attachment removal. */
@Entity({ name: 'attachment_cleanup' })
export class AttachmentCleanupEntity {
  @PrimaryColumn({ name: 'storage_key', length: 500 })
  storageKey!: string;

  @Column({ name: 'attachment_id', type: 'uuid' })
  attachmentId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
