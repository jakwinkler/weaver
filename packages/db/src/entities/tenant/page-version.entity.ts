import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { PageEntity } from './page.entity';

@Entity({ name: 'page_versions' })
@Index('IDX_page_versions_page_created', ['pageId', 'createdAt'])
export class PageVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'page_id', type: 'uuid' })
  pageId!: string;

  @Column({ length: 255 })
  title!: string;

  @Column({ length: 255 })
  slug!: string;

  @Column({ type: 'jsonb' })
  body!: Record<string, unknown>;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId!: string | null;

  @Column({ name: 'sort_order', type: 'int' })
  sortOrder!: number;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => PageEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'page_id' })
  page!: PageEntity;
}
