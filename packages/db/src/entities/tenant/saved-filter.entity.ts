import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity({ name: 'saved_filters' })
export class SavedFilterEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 255 })
  name!: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  @Column({ type: 'text' })
  query!: string;

  @Column({ name: 'is_shared', type: 'boolean', default: false })
  isShared!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
