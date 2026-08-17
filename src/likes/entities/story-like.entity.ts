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

// A member's like on a story. Named StoryLike (table `story_like`) because
// `like` is a SQL reserved word. The unique constraint makes a like
// idempotent (one per member per story); the index serves the "which stories
// have I liked" id-set. Both sides cascade-delete. The story's likeCount is a
// denormalized counter maintained by LikesService (like commentCount).
//
// The unique constraint and both FKs are explicitly named to match the names
// baked into the original migration (1785000000000-AddStoryLikes) — without
// this, TypeORM's diff engine computes its own hash-based names and proposes
// renaming them on every `migration:generate`, even though nothing changed.
@Entity()
@Unique('IDX_story_like_user_story', ['user', 'story'])
@Index('IDX_story_like_user', ['user'])
// Backs admin-analytics day-bucketed queries across all likes. Explicitly
// named to match the raw SQL that created it in AddAnalyticsEvents — without
// this, migration:generate can't see the index in entity metadata and
// proposes dropping it every time.
@Index('IDX_story_like_createdAt', ['createdAt'])
export class StoryLike {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, {onDelete: 'CASCADE'})
  @JoinColumn({name: 'userId', foreignKeyConstraintName: 'FK_story_like_user'})
  user: User;

  @ManyToOne(() => Story, {onDelete: 'CASCADE'})
  @JoinColumn({
    name: 'storyId',
    foreignKeyConstraintName: 'FK_story_like_story',
  })
  story: Story;

  @CreateDateColumn()
  createdAt: Date;
}
