import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ProjectEntity } from './project.entity';
import type { SprintInitialScope } from '@weaver/shared';

@Entity({ name: 'sprints' })
export class SprintEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  goal!: string | null;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate!: string | null;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate!: string | null;

  @Column({ length: 20, default: 'planned' })
  status!: string;

  @Column({ type: 'int', nullable: true })
  capacity!: number | null;

  @Column({ name: 'initial_scope', type: 'jsonb', nullable: true })
  initialScope!: SprintInitialScope | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => ProjectEntity, (project) => project.sprints)
  @JoinColumn({ name: 'project_id' })
  project!: ProjectEntity;
}
