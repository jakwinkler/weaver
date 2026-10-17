import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/** An attribution identity, never an authentication account or membership. */
@Entity({ name: 'imported_people' })
@Unique('imported_people_source_instance_external_id_key', ['sourceInstance', 'externalId'])
export class ImportedPersonEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'source_instance', type: 'text' }) sourceInstance!: string;
  @Column({ name: 'external_id', length: 255 }) externalId!: string;
  @Column({ name: 'display_name', length: 255 }) displayName!: string;
  @Column({ type: 'varchar', length: 255, nullable: true }) email!: string | null;
  @Column({ name: 'account_type', length: 30, default: 'atlassian' }) accountType!: string;
  @Column({ name: 'source_active', type: 'boolean', default: true }) sourceActive!: boolean;
  @Column({ name: 'linked_user_id', type: 'uuid', nullable: true }) linkedUserId!: string | null;
  @Column({ name: 'project_ids', type: 'uuid', array: true, default: () => "'{}'" })
  projectIds!: string[];
  @Column({ name: 'invite_token_hash', type: 'varchar', length: 64, nullable: true, select: false })
  inviteTokenHash!: string | null;
  @Column({ name: 'invite_email', type: 'varchar', length: 255, nullable: true }) inviteEmail!:
    string | null;
  @Column({ name: 'invite_role', length: 20, default: 'viewer' }) inviteRole!: string;
  @Column({ name: 'invite_project_ids', type: 'uuid', array: true, default: () => "'{}'" })
  inviteProjectIds!: string[];
  @Column({ name: 'invite_expires_at', type: 'timestamptz', nullable: true })
  inviteExpiresAt!: Date | null;
  @Column({ name: 'invited_at', type: 'timestamptz', nullable: true }) invitedAt!: Date | null;
  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true }) acceptedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
