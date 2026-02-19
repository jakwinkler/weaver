import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity({ name: 'custom_field_definitions' })
export class CustomFieldDefinitionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 255 })
  name!: string;

  @Column({ length: 100, unique: true })
  slug!: string;

  @Column({ name: 'field_type', length: 20 })
  fieldType!: string;

  @Column({ type: 'jsonb', nullable: true })
  options!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  validation!: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: false })
  required!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
