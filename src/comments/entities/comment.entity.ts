import {Story} from 'src/stories/entities/story.entity';
import {User} from 'src/users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {CommentReport} from './comment-report.entity';

@Entity()
// The moderation queue filters isFlagged and sorts by reportCount; a story's
// thread reads its comments ordered by createdAt. Index both so neither scans
// the whole comment table.
@Index('IDX_comment_isFlagged_reportCount', ['isFlagged', 'reportCount'])
@Index('IDX_comment_story_createdAt', ['story', 'createdAt'])
export class Comment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  content: string;

  @ManyToOne(() => User, (user) => user.comments, {
    onDelete: 'CASCADE',
  })
  user: User;

  @ManyToOne(() => Story, (story) => story.comments, {
    onDelete: 'CASCADE',
  })
  story: Story;

  // Self-referential one-level threading: a reply points at its top-level
  // parent. Deleting a parent cascades to its replies (the service adjusts the
  // story's commentCount accordingly). Replies never nest further — the service
  // re-roots a reply-to-a-reply onto the same top-level parent.
  @ManyToOne(() => Comment, (comment) => comment.replies, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  parent: Comment | null;

  @OneToMany(() => Comment, (comment) => comment.parent)
  replies: Comment[];

  // Set true when a member reports this comment; the admin moderation queue
  // filters on it, and an admin clears it (dropping the reports) on resolve.
  @Column({default: false})
  isFlagged: boolean;

  // Recomputed from the reports rows on every report/resolve (see
  // CommentsService) — an orderable mirror of the source-of-truth report count
  // so the moderation queue can sort most-reported-first without raw SQL.
  @Column({type: 'int', default: 0})
  reportCount: number;

  @OneToMany(() => CommentReport, (report) => report.comment)
  reports: CommentReport[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
