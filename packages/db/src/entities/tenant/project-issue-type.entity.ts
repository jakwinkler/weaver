import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { ProjectEntity } from './project.entity';
import { IssueTypeEntity } from './issue-type.entity';

@Entity({ name: 'project_issue_types' })
@Unique(['projectId', 'issueTypeId'])
export class ProjectIssueTypeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'issue_type_id', type: 'uuid' })
  issueTypeId!: string;

  @ManyToOne(() => ProjectEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: ProjectEntity;

  @ManyToOne(() => IssueTypeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issue_type_id' })
  issueType!: IssueTypeEntity;
}
