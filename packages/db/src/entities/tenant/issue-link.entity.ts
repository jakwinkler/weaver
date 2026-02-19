import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
} from 'typeorm';

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
}
