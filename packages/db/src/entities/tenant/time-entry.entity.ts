import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { IssueEntity } from './issue.entity';

@Entity({ name: 'time_entries' })
@Index('UQ_time_entries_plugin_source_reference', ['sourcePluginId', 'sourceReference'], {
  unique: true,
  where: '"source_plugin_id" IS NOT NULL AND "source_reference" IS NOT NULL',
})
export class TimeEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'issue_id', type: 'uuid' })
  issueId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'int' })
  minutes!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ name: 'logged_at', type: 'timestamptz' })
  loggedAt!: Date;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  @Column({ type: 'varchar', length: 20, default: 'manual' })
  source!: 'manual' | 'timer' | 'plugin';

  @Column({ name: 'source_plugin_id', type: 'varchar', length: 255, nullable: true })
  sourcePluginId!: string | null;

  @Column({ name: 'source_reference', type: 'varchar', length: 255, nullable: true })
  sourceReference!: string | null;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt!: Date | null;

  @Column({ name: 'lock_reason', type: 'varchar', length: 500, nullable: true })
  lockReason!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
  @ManyToOne(() => IssueEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issue_id' })
  issue!: IssueEntity;
}
