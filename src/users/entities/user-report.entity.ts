import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import {User} from './user.entity';
import {ReportReason} from '../enums/report-reason.enum';

// A single member flagging another member's profile (name/bio/avatar) as
// offensive. The unique constraint keeps one person from inflating a target's
// report count; UsersService derives the count from these rows for the admin
// moderation queue. Mirrors CommentReport/StoryReport.
@Entity()
@Unique(['reporter', 'reportedUser'])
export class UserReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.reports, {
    onDelete: 'CASCADE',
  })
  reportedUser: User;

  @ManyToOne(() => User, {
    onDelete: 'CASCADE',
  })
  reporter: User;

  // Predefined category — required so the admin queue always has at least a
  // category to go on. Defaulted to `other` at the column level purely so the
  // migration can backfill rows that predate this field; new reports always
  // send one explicitly (see ReportUserDto).
  @Column({type: 'enum', enum: ReportReason, default: ReportReason.Other})
  reason: ReportReason;

  // Optional free-text detail the reporter adds on top of the category.
  @Column({type: 'varchar', length: 100, nullable: true})
  details: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
