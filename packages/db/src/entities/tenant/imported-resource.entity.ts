import { Column, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import type { ImportedVisibility } from './imported-audience.entity';

/** Original source payloads are available only through administrator import endpoints. */
@Entity({ name: 'imported_resources' })
@Unique('imported_resources_source_instance_kind_external_id_key', [
  'sourceInstance',
  'kind',
  'externalId',
])
@Index('IDX_imported_resources_job', ['importJobId'])
export class ImportedResourceEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'source_instance', type: 'text' }) sourceInstance!: string;
  @Column({ length: 30 }) kind!: string;
  @Column({ name: 'external_id', length: 255 }) externalId!: string;
  @Column({ name: 'import_job_id', type: 'uuid' }) importJobId!: string;
  @Column({ name: 'project_id', type: 'uuid' }) projectId!: string;
  @Column({ name: 'issue_id', type: 'uuid', nullable: true }) issueId!: string | null;
  @Column({ type: 'jsonb' }) payload!: Record<string, any>;
  @Column({ name: 'native_snapshot', type: 'jsonb', nullable: true }) nativeSnapshot!: Record<
    string,
    any
  > | null;
  @Column({ type: 'jsonb', nullable: true }) visibility!: ImportedVisibility | null;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
