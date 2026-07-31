import {User} from 'src/users/entities/user.entity';
import {Comment} from 'src/comments/entities/comment.entity';
import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

// A member's lightweight "this crept me out" reaction on a comment — a plain
// boolean toggle with a live count, structurally identical to StoryLike, just
// scoped to a comment instead of a story. The unique constraint makes a
// reaction idempotent (one per member per comment); the index serves the
// "which comments have I reacted to" id-set. Both sides cascade-delete. The
// comment's reactionCount is a denormalized counter maintained by
// CommentReactionsService (mirrors StoryLike.likeCount).
//
// The unique constraint and both FKs are explicitly named from the start
// (this codebase's own lesson from StoryLike/ScareVote/MutedAuthor — unnamed
// constraints make TypeORM's diff engine propose renames on later
// `migration:generate` runs, even with no real change).
@Entity()
@Unique('IDX_comment_reaction_user_comment', ['user', 'comment'])
@Index('IDX_comment_reaction_user', ['user'])
export class CommentReaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, {onDelete: 'CASCADE'})
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'FK_comment_reaction_user',
  })
  user: User;

  @ManyToOne(() => Comment, {onDelete: 'CASCADE'})
  @JoinColumn({
    name: 'commentId',
    foreignKeyConstraintName: 'FK_comment_reaction_comment',
  })
  comment: Comment;

  @CreateDateColumn()
  createdAt: Date;
}
