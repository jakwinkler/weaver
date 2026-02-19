import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity({ name: 'time_entries' })
export class TimeEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'issue_id', type: 'uuid' })
  issueId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'int' })
  minutes!: number;

  @Column({ length: 500, nullable: true })
  description!: string | null;

  @Column({ name: 'logged_at', type: 'timestamptz' })
  loggedAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
