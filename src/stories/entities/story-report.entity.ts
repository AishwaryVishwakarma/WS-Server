import {User} from 'src/users/entities/user.entity';
import {
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import {Story} from './story.entity';

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

  @CreateDateColumn()
  createdAt: Date;
}
