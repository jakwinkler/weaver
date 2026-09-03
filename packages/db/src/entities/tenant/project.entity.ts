import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { IssueEntity } from './issue.entity';
import { BoardEntity } from './board.entity';
import { SprintEntity } from './sprint.entity';
import { WorkflowEntity } from './workflow.entity';

@Entity({ name: 'projects' })
export class ProjectEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 10, unique: true })
  key!: string;

  @Column({ length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'workflow_id', type: 'uuid', nullable: true })
  workflowId!: string | null;

  @Column({ name: 'lead_user_id', type: 'uuid', nullable: true })
  leadUserId!: string | null;

  @Column({ name: 'issue_counter', type: 'int', default: 0 })
  issueCounter!: number;

  @Column({ name: 'icon_attachment_id', type: 'uuid', nullable: true })
  iconAttachmentId!: string | null;

  @Column({ name: 'custom_fields', type: 'jsonb', default: '{}' })
  customFields!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 20, default: 'private' })
  visibility!: 'private' | 'public';

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => IssueEntity, (issue) => issue.project)
  issues!: IssueEntity[];

  @OneToMany(() => BoardEntity, (board) => board.project)
  boards!: BoardEntity[];

  @OneToMany(() => SprintEntity, (sprint) => sprint.project)
  sprints!: SprintEntity[];

  @ManyToOne(() => WorkflowEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'workflow_id' })
  workflow!: WorkflowEntity | null;
}
