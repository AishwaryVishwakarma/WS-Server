import {User} from 'src/users/entities/user.entity';
import {
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import {Comment} from './comment.entity';

// A single member flagging a single comment. The unique constraint keeps one
// person from inflating a comment's report count; CommentsService derives the
// count from these rows for the admin moderation queue.
@Entity()
@Unique(['user', 'comment'])
export class CommentReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Comment, (comment) => comment.reports, {
    onDelete: 'CASCADE',
  })
  comment: Comment;

  @ManyToOne(() => User, {
    onDelete: 'CASCADE',
  })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
