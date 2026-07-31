import {User} from 'src/users/entities/user.entity';
import {Story} from 'src/stories/entities/story.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

// A reader's own "how scary was this, really?" vote on a story — separate
// from the author's self-assigned Story.scareLevel. The unique constraint
// makes voting idempotent per member per story (a repeat cast just updates
// `value`); the index serves the "my votes" lookup. Both sides cascade-delete.
// Story.scareRatingSum/scareRatingCount are denormalized counters maintained
// by ScareRatingsService (mirrors likeCount).
//
// The unique constraint and both FKs are explicitly named so TypeORM's diff
// engine doesn't propose renaming them on every `migration:generate` (the
// same gotcha StoryLike's own comment documents).
@Entity()
@Unique('IDX_scare_vote_user_story', ['user', 'story'])
@Index('IDX_scare_vote_user', ['user'])
export class ScareVote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, {onDelete: 'CASCADE'})
  @JoinColumn({name: 'userId', foreignKeyConstraintName: 'FK_scare_vote_user'})
  user: User;

  @ManyToOne(() => Story, {onDelete: 'CASCADE'})
  @JoinColumn({
    name: 'storyId',
    foreignKeyConstraintName: 'FK_scare_vote_story',
  })
  story: Story;

  @Column({type: 'int'})
  value: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
