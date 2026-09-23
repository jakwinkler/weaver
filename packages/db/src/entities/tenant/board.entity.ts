import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ProjectEntity } from './project.entity';

@Entity({ name: 'boards' })
export class BoardEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ length: 255 })
  name!: string;

  @Column({ length: 20 })
  type!: string;

  @Column({ type: 'jsonb', default: {} })
  config!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => ProjectEntity, (project) => project.boards, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'project_id' })
  project!: ProjectEntity;
}
