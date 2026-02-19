import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { WorkflowStatusEntity } from './workflow-status.entity';
import { WorkflowTransitionEntity } from './workflow-transition.entity';

@Entity({ name: 'workflows' })
export class WorkflowEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 255 })
  name!: string;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => WorkflowStatusEntity, (status) => status.workflow)
  statuses!: WorkflowStatusEntity[];

  @OneToMany(() => WorkflowTransitionEntity, (transition) => transition.workflow)
  transitions!: WorkflowTransitionEntity[];
}
