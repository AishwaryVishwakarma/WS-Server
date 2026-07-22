import {User} from 'src/users/entities/user.entity';
import {Story} from 'src/stories/entities/story.entity';
import {
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

// A reader saving a story to their reading list. The unique constraint makes a
// bookmark idempotent (one row per member per story); the composite index also
// serves the `/users/me/bookmarks` listing, which filters by user and orders by
// createdAt. Both sides cascade-delete so removing a story or a member cleans up
// its bookmarks.
@Entity()
@Unique(['user', 'story'])
@Index('IDX_bookmark_user_createdAt', ['user', 'createdAt'])
export class Bookmark {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, {onDelete: 'CASCADE'})
  user: User;

  @ManyToOne(() => Story, {onDelete: 'CASCADE'})
  story: Story;

  @CreateDateColumn()
  createdAt: Date;
}
