import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity({ name: 'import_records' })
@Unique(['sourceInstance', 'externalType', 'externalId'])
@Index(['localId'])
export class ImportRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'import_job_id', type: 'uuid' })
  importJobId!: string;

  @Column({ name: 'source_instance', type: 'text' })
  sourceInstance!: string;

  @Column({ name: 'external_type', length: 30 })
  externalType!: string;

  @Column({ name: 'external_id', length: 255 })
  externalId!: string;

  @Column({ name: 'local_id', type: 'uuid' })
  localId!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
