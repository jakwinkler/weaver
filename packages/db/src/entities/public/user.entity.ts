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

@Entity({ name: 'users', schema: 'public' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ length: 255 })
  email!: string;

  @Column({ name: 'display_name', length: 255 })
  displayName!: string;

  @Column({ name: 'password_hash', nullable: true })
  passwordHash!: string | null;

  @Column({ name: 'auth_provider', length: 20, default: 'local' })
  authProvider!: string;

  @Column({ name: 'avatar_url', nullable: true })
  avatarUrl!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => TenantMembershipEntity, (m) => m.user)
  memberships!: TenantMembershipEntity[];
}
