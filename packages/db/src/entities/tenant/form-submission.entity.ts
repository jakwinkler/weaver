import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { FormEntity } from './form.entity';
import { IssueEntity } from './issue.entity';

@Entity({ name: 'form_submissions' })
@Index(['formId'])
export class FormSubmissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'form_id', type: 'uuid' })
  formId!: string;

  @Column({ name: 'issue_id', type: 'uuid', nullable: true })
  issueId!: string | null;

  @Column({ name: 'issue_key', length: 20 })
  issueKey!: string;

  @CreateDateColumn({ name: 'submitted_at' })
  submittedAt!: Date;

  @ManyToOne(() => FormEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'form_id' })
  form!: FormEntity;

  @ManyToOne(() => IssueEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'issue_id' })
  issue!: IssueEntity | null;
}
