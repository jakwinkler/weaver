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
import { InstalledPluginEntity } from './installed-plugin.entity';

@Entity({ name: 'tenants', schema: 'public' })
export class TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 255 })
  name!: string;

  @Index({ unique: true })
  @Column({ length: 63 })
  slug!: string;

  @Index({ unique: true })
  @Column({ name: 'schema_name', length: 63 })
  schemaName!: string;

  @Column({ length: 20, default: 'free' })
  plan!: string;

  @Column({ type: 'jsonb', default: {} })
  settings!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => TenantMembershipEntity, (m) => m.tenant)
  memberships!: TenantMembershipEntity[];

  @OneToMany(() => InstalledPluginEntity, (p) => p.tenant)
  installedPlugins!: InstalledPluginEntity[];
}
