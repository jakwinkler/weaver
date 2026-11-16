import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity({ name: 'issue_access_policies' })
@Unique('issue_access_policy_source_project_level', [
  'sourceInstance',
  'sourceProjectId',
  'securityLevelId',
])
export class IssueAccessPolicyEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'source_instance', type: 'text' }) sourceInstance!: string;
  @Column({ name: 'source_project_id', type: 'text' }) sourceProjectId!: string;
  @Column({ name: 'security_level_id', type: 'text' }) securityLevelId!: string;
  @Column({ name: 'project_id', type: 'uuid' }) projectId!: string;
  @Column({ type: 'text' }) name!: string;
  @Column({ name: 'user_ids', type: 'uuid', array: true, default: () => "'{}'" })
  userIds!: string[];
  @Column({ type: 'boolean', default: false }) reviewed!: boolean;
  @Column({ type: 'integer', default: 1 }) revision!: number;
  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true }) reviewedBy!: string | null;
  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true }) reviewedAt!: Date | null;
}
