import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity({ name: 'issue_types' })
export class IssueTypeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 100 })
  name!: string;

  @Column({ length: 100, unique: true })
  slug!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  icon!: string | null;

  @Column({ name: 'is_subtask', type: 'boolean', default: false })
  isSubtask!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
