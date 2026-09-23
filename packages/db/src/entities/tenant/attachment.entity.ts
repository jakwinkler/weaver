import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { IssueEntity } from './issue.entity';

@Entity({ name: 'attachments' })
export class AttachmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'issue_id', type: 'uuid', nullable: true })
  issueId!: string | null;

  @Column({ name: 'uploader_id', type: 'uuid' })
  uploaderId!: string;

  @Column({ length: 255 })
  filename!: string;

  @Column({ name: 'mime_type', length: 100 })
  mimeType!: string;

  @Column({ type: 'bigint' })
  size!: string;

  @Column({ name: 'storage_key', length: 500 })
  storageKey!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => IssueEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issue_id' })
  issue!: IssueEntity | null;
}
