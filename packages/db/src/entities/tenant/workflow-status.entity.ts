import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { WorkflowEntity } from './workflow.entity';

@Entity({ name: 'workflow_statuses' })
export class WorkflowStatusEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'workflow_id', type: 'uuid' })
  workflowId!: string;

  @Column({ length: 100 })
  name!: string;

  @Column({ length: 20 })
  category!: string;

  @Column({ length: 7 })
  color!: string;

  @Column({ name: 'is_initial', type: 'boolean', default: false })
  isInitial!: boolean;

  @Column({ name: 'is_terminal', type: 'boolean', default: false })
  isTerminal!: boolean;

  @Column({ type: 'int', default: 0 })
  position!: number;

  @ManyToOne(() => WorkflowEntity, (workflow) => workflow.statuses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workflow_id' })
  workflow!: WorkflowEntity;
}
