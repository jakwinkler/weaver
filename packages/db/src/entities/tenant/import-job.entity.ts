import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

type StoredImportError = {
  itemType: string;
  itemId?: string;
  message: string;
};

@Entity({ name: 'import_jobs' })
export class ImportJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 30 })
  source!: 'jira_cloud' | 'jira_server';

  @Column({ name: 'source_url', type: 'text' })
  sourceUrl!: string;

  @Column({ length: 20, default: 'queued' })
  status!: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

  @Column({ type: 'int', default: 0 })
  progress!: number;

  @Column({ name: 'current_step', length: 100, default: 'Queued' })
  currentStep!: string;

  @Column({ name: 'total_items', type: 'int', default: 0 })
  totalItems!: number;

  @Column({ name: 'imported_items', type: 'int', default: 0 })
  importedItems!: number;

  @Column({ name: 'skipped_items', type: 'int', default: 0 })
  skippedItems!: number;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  errors!: StoredImportError[];

  @Column({ name: 'selected_project_keys', type: 'jsonb', nullable: true })
  selectedProjectKeys!: string[] | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
