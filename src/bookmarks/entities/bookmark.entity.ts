import {User} from 'src/users/entities/user.entity';
import {Story} from 'src/stories/entities/story.entity';
import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

// A reader saving a story to their reading list. The unique constraint makes a
// bookmark idempotent (one row per member per story); the composite index also
// serves the `/users/me/bookmarks` listing, which filters by user and orders by
// createdAt. Both sides cascade-delete so removing a story or a member cleans up
// its bookmarks.
//
// The unique constraint and both FKs are explicitly named to match the names
// baked into the original migration (1784500000000-AddBookmarks) — without
// this, TypeORM's diff engine computes its own hash-based names and proposes
// renaming them on every `migration:generate`, even though nothing changed.
@Entity()
@Unique('IDX_bookmark_user_story', ['user', 'story'])
@Index('IDX_bookmark_user_createdAt', ['user', 'createdAt'])
// Backs admin-analytics day-bucketed queries across all bookmarks. Explicitly
// named to match the raw SQL that created it in AddAnalyticsEvents — without
// this, migration:generate can't see the index in entity metadata and
// proposes dropping it every time.
@Index('IDX_bookmark_createdAt', ['createdAt'])
export class Bookmark {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, {onDelete: 'CASCADE'})
  @JoinColumn({name: 'userId', foreignKeyConstraintName: 'FK_bookmark_user'})
  user: User;

  @ManyToOne(() => Story, {onDelete: 'CASCADE'})
  @JoinColumn({name: 'storyId', foreignKeyConstraintName: 'FK_bookmark_story'})
  story: Story;

  @CreateDateColumn()
  createdAt: Date;
}
