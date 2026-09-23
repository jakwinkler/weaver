import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { ProjectEntity } from './project.entity';

@Entity({ name: 'pages' })
@Index('UQ_pages_project_slug', ['projectId', 'slug'], { unique: true })
@Index('IDX_pages_project_parent_order', ['projectId', 'parentId', 'sortOrder'])
export class PageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ length: 255 })
  title!: string;

  @Column({ length: 255 })
  slug!: string;

  @Column({ type: 'jsonb', default: { type: 'doc', content: [] } })
  body!: Record<string, unknown>;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId!: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => ProjectEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: ProjectEntity;

  @ManyToOne(() => PageEntity, (page) => page.children, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parent_id' })
  parent!: PageEntity | null;

  @OneToMany(() => PageEntity, (page) => page.parent)
  children!: PageEntity[];
}
