import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity({ name: 'imported_audiences' })
@Unique(['sourceInstance', 'kind', 'identifier'])
export class ImportedAudienceEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'source_instance', type: 'text' }) sourceInstance!: string;
  @Column({ length: 30 }) kind!: string;
  @Column({ type: 'text' }) identifier!: string;
  @Column({ type: 'text' }) name!: string;
  @Column({ name: 'user_ids', type: 'uuid', array: true, default: () => "'{}'" })
  userIds!: string[];
}

export interface ImportedVisibility {
  sourceInstance: string;
  type: string;
  identifier: string;
  value: string;
}
