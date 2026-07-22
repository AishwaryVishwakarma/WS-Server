import {User} from 'src/users/entities/user.entity';
import {
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

// One member following another. The unique constraint makes a follow
// idempotent (one row per pair); the two indexes serve the two directions —
// "who do I follow" (follower) drives the Following feed and id-set, "who
// follows this author" (following) drives the follower count. Both sides
// cascade-delete so removing a member cleans up their follows and followers.
@Entity()
@Unique(['follower', 'following'])
@Index('IDX_follow_follower', ['follower'])
@Index('IDX_follow_following', ['following'])
export class Follow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // The member doing the following.
  @ManyToOne(() => User, {onDelete: 'CASCADE'})
  follower: User;

  // The author being followed.
  @ManyToOne(() => User, {onDelete: 'CASCADE'})
  following: User;

  @CreateDateColumn()
  createdAt: Date;
}
