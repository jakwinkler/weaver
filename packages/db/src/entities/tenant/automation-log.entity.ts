import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { AutomationRuleEntity } from './automation-rule.entity';

@Index(['ruleId', 'triggeredAt'])
@Entity({ name: 'automation_logs' })
export class AutomationLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'rule_id', type: 'uuid' })
  ruleId!: string;

  @Column({ name: 'triggered_by', type: 'jsonb' })
  triggeredBy!: Record<string, unknown>;

  @CreateDateColumn({ name: 'triggered_at' })
  triggeredAt!: Date;

  @Column({ name: 'actions_executed', type: 'jsonb', default: [] })
  actionsExecuted!: Record<string, unknown>[];

  @Column({ type: 'boolean' })
  success!: boolean;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @ManyToOne(() => AutomationRuleEntity, (rule) => rule.logs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'rule_id' })
  rule!: AutomationRuleEntity;
}
