import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { TenantEntity } from './tenant.entity';

@Entity({ name: 'installed_plugins', schema: 'public' })
@Index(['tenantId', 'pluginId'], { unique: true })
export class InstalledPluginEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'plugin_id', length: 255 })
  pluginId!: string;

  @Column({ length: 50 })
  version!: string;

  @Column({ default: true })
  enabled!: boolean;

  @Column({ type: 'jsonb', default: {} })
  settings!: Record<string, unknown>;

  @CreateDateColumn({ name: 'installed_at' })
  installedAt!: Date;

  @ManyToOne(() => TenantEntity, (t) => t.installedPlugins, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: TenantEntity;
}
