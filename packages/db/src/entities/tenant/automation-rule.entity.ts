import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { ProjectEntity } from './project.entity';
import { AutomationLogEntity } from './automation-log.entity';

@Index(['projectId', 'enabled'])
@Entity({ name: 'automation_rules' })
export class AutomationRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId!: string | null;

  @Column({ length: 255 })
  name!: string;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'jsonb' })
  trigger!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: [] })
  conditions!: Record<string, unknown>[];

  @Column({ type: 'jsonb', default: [] })
  actions!: Record<string, unknown>[];

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => ProjectEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: ProjectEntity | null;

  @OneToMany(() => AutomationLogEntity, (log) => log.rule)
  logs!: AutomationLogEntity[];
}
