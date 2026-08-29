import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { ProjectEntity } from './project.entity';
import { CommentEntity } from './comment.entity';
import { IssueTypeEntity } from './issue-type.entity';
import type { RecurrenceRule } from '@weaver/shared';

@Index(['projectId'])
@Index(['statusId'])
@Index(['recurrenceParentId', 'recurrenceOccurrence'], { unique: true })
@Entity({ name: 'issues' })
export class IssueEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ length: 20, unique: true })
  key!: string;

  @Column({ length: 500 })
  summary!: string;

  @Column({ type: 'jsonb', nullable: true })
  description!: Record<string, unknown> | null;

  @Column({ name: 'status_id', type: 'uuid' })
  statusId!: string;

  @Column({ name: 'issue_type_id', type: 'uuid', nullable: true })
  issueTypeId!: string | null;

  @Column({ length: 20, default: 'medium' })
  priority!: string;

  @Column({ name: 'assignee_id', type: 'uuid', nullable: true })
  assigneeId!: string | null;

  @Column({ name: 'reporter_id', type: 'uuid' })
  reporterId!: string;

  @Column({ name: 'custom_fields', type: 'jsonb', default: {} })
  customFields!: Record<string, unknown>;

  @Column({ name: 'sprint_id', type: 'uuid', nullable: true })
  sprintId!: string | null;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId!: string | null;

  @Column({ name: 'epic_id', type: 'uuid', nullable: true })
  epicId!: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  labels!: string[];

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate!: string | null;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate!: string | null;

  @Column({ name: 'percent_done', type: 'int', default: 0 })
  percentDone!: number;

  @Column({ name: 'recurrence_rule', type: 'jsonb', nullable: true })
  recurrenceRule!: RecurrenceRule | null;

  @Column({ name: 'recurrence_parent_id', type: 'uuid', nullable: true })
  recurrenceParentId!: string | null;

  @Column({ name: 'recurrence_occurrence', type: 'int', default: 0 })
  recurrenceOccurrence!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => ProjectEntity, (project) => project.issues)
  @JoinColumn({ name: 'project_id' })
  project!: ProjectEntity;

  @ManyToOne(() => IssueTypeEntity, { nullable: true })
  @JoinColumn({ name: 'issue_type_id' })
  issueType!: IssueTypeEntity | null;

  @ManyToOne(() => IssueEntity, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent!: IssueEntity | null;

  @OneToMany(() => IssueEntity, (issue) => issue.parent)
  children!: IssueEntity[];

  @ManyToOne(() => IssueEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'recurrence_parent_id' })
  recurrenceParent!: IssueEntity | null;

  @OneToMany(() => IssueEntity, (issue) => issue.recurrenceParent)
  recurrenceChildren!: IssueEntity[];

  @OneToMany(() => CommentEntity, (comment) => comment.issue)
  comments!: CommentEntity[];
}
