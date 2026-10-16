import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import type { ImportedVisibility } from './imported-audience.entity';
import { IssueEntity } from './issue.entity';

@Entity({ name: 'comments' })
export class CommentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'issue_id', type: 'uuid' })
  issueId!: string;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId!: string;

  @Column({ type: 'jsonb' })
  body!: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  visibility!: ImportedVisibility | null;

  @Column({ name: 'source_id', type: 'varchar', nullable: true })
  sourceId!: string | null;

  @Column({ name: 'parent_comment_id', type: 'uuid', nullable: true })
  parentCommentId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => IssueEntity, (issue) => issue.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issue_id' })
  issue!: IssueEntity;
}
