import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Durable record of import objects awaiting database commit or orphan cleanup. */
@Entity({ name: 'import_storage_writes' })
export class ImportStorageWriteEntity {
  @PrimaryColumn({
    name: 'storage_key',
    type: 'text',
    primaryKeyConstraintName: 'import_storage_writes_pkey',
  })
  storageKey!: string;

  @Column({ name: 'import_job_id', type: 'uuid' })
  importJobId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
