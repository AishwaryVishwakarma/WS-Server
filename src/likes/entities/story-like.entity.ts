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

// A member's like on a story. Named StoryLike (table `story_like`) because
// `like` is a MySQL reserved word. The unique constraint makes a like
// idempotent (one per member per story); the index serves the "which stories
// have I liked" id-set. Both sides cascade-delete. The story's likeCount is a
// denormalized counter maintained by LikesService (like commentCount).
@Entity()
@Unique(['user', 'story'])
@Index('IDX_story_like_user', ['user'])
export class StoryLike {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, {onDelete: 'CASCADE'})
  user: User;

  @ManyToOne(() => Story, {onDelete: 'CASCADE'})
  story: Story;

  @CreateDateColumn()
  createdAt: Date;
}
