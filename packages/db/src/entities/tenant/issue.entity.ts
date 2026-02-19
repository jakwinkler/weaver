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

@Index(['projectId'])
@Index(['statusId'])
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

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => ProjectEntity, (project) => project.issues)
  @JoinColumn({ name: 'project_id' })
  project!: ProjectEntity;

  @ManyToOne(() => IssueEntity, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent!: IssueEntity | null;

  @OneToMany(() => IssueEntity, (issue) => issue.parent)
  children!: IssueEntity[];

  @OneToMany(() => CommentEntity, (comment) => comment.issue)
  comments!: CommentEntity[];
}
