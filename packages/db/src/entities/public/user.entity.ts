import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { TenantMembershipEntity } from './tenant-membership.entity';

const DEFAULT_NOTIFICATION_PREFERENCES = {
  emailOnAssign: true,
  emailOnMention: true,
  emailOnComment: true,
  emailOnStatusChange: true,
};

@Entity({ name: 'users', schema: 'public' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ length: 255 })
  email!: string;

  @Column({ name: 'display_name', length: 255 })
  displayName!: string;

  @Column({ name: 'password_hash', type: 'varchar', nullable: true })
  passwordHash!: string | null;

  @Column({ name: 'auth_provider', length: 20, default: 'local' })
  authProvider!: string;

  @Column({ name: 'avatar_url', type: 'varchar', nullable: true })
  avatarUrl!: string | null;

  @Column({
    name: 'notification_preferences',
    type: 'jsonb',
    default: DEFAULT_NOTIFICATION_PREFERENCES,
  })
  notificationPreferences!: typeof DEFAULT_NOTIFICATION_PREFERENCES;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => TenantMembershipEntity, (m) => m.user)
  memberships!: TenantMembershipEntity[];
}
