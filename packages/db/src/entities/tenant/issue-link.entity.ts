import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { IssueEntity } from './issue.entity';

@Unique(['linkType', 'sourceIssueId', 'targetIssueId'])
@Entity({ name: 'issue_links' })
export class IssueLinkEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'link_type', length: 50 })
  linkType!: string;

  @Column({ name: 'source_issue_id', type: 'uuid' })
  sourceIssueId!: string;

  @Column({ name: 'target_issue_id', type: 'uuid' })
  targetIssueId!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => IssueEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'source_issue_id' })
  sourceIssue!: IssueEntity;

  @ManyToOne(() => IssueEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'target_issue_id' })
  targetIssue!: IssueEntity;
}
