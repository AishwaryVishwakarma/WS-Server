import {User} from 'src/users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import {Story} from './story.entity';
import {StoryReportReason} from '../enums/story-report-reason.enum';

// A single member flagging a single story. The unique constraint keeps one
// person from inflating a story's report count; StoriesService derives the
// count from these rows for the admin moderation queue. Mirrors CommentReport.
@Entity()
@Unique(['user', 'story'])
export class StoryReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Story, (story) => story.reports, {
    onDelete: 'CASCADE',
  })
  story: Story;

  @ManyToOne(() => User, {
    onDelete: 'CASCADE',
  })
  user: User;

  // Predefined category — required so the admin queue always has at least a
  // category to go on. Defaulted to `other` at the column level purely so the
  // migration can backfill rows that predate this field; new reports always
  // send one explicitly (see ReportStoryDto).
  @Column({
    type: 'enum',
    enum: StoryReportReason,
    default: StoryReportReason.Other,
  })
  reason: StoryReportReason;

  // Optional free-text detail the reporter adds on top of the category.
  @Column({type: 'varchar', length: 100, nullable: true})
  details: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
