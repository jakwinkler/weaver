import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { WorkflowEntity } from './workflow.entity';
import { WorkflowStatusEntity } from './workflow-status.entity';

@Entity({ name: 'workflow_transitions' })
export class WorkflowTransitionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'workflow_id', type: 'uuid' })
  workflowId!: string;

  @Column({ name: 'from_status_id', type: 'uuid' })
  fromStatusId!: string;

  @Column({ name: 'to_status_id', type: 'uuid' })
  toStatusId!: string;

  @Column({ length: 255 })
  name!: string;

  @Column({ type: 'jsonb', default: [] })
  conditions!: unknown[];

  @Column({ type: 'jsonb', default: [] })
  validators!: unknown[];

  @Column({ name: 'post_functions', type: 'jsonb', default: [] })
  postFunctions!: unknown[];

  @ManyToOne(() => WorkflowEntity, (workflow) => workflow.transitions)
  @JoinColumn({ name: 'workflow_id' })
  workflow!: WorkflowEntity;

  @ManyToOne(() => WorkflowStatusEntity)
  @JoinColumn({ name: 'from_status_id' })
  fromStatus!: WorkflowStatusEntity;

  @ManyToOne(() => WorkflowStatusEntity)
  @JoinColumn({ name: 'to_status_id' })
  toStatus!: WorkflowStatusEntity;
}
