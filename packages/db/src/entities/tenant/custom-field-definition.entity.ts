import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
} from 'typeorm';

@Entity({ name: 'custom_field_definitions' })
@Unique(['slug', 'entityType'])
export class CustomFieldDefinitionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 255 })
  name!: string;

  @Column({ length: 100 })
  slug!: string;

  @Column({ name: 'field_type', length: 20 })
  fieldType!: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 20, default: 'issue' })
  entityType!: string;

  @Column({ name: 'plugin_id', type: 'varchar', length: 255, nullable: true })
  pluginId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  options!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  validation!: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: false })
  required!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
