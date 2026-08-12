import {User} from 'src/users/entities/user.entity';
import {Story} from 'src/stories/entities/story.entity';
import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

// How far a member has scrolled into a story (0-100), so reopening it can
// resume near the same spot, /me can list "Continue reading", and completed
// rows can provide a lightweight reading history. The unique
// constraint makes a write idempotent (one row per member per story); the
// composite index also serves the /users/me/reading-progress listing, which
// filters by user and orders by updatedAt (most-recently-read first). Both
// sides cascade-delete so removing a story or a member cleans up its rows.
//
// The unique constraint and both FKs are explicitly named (mirrors Bookmark)
// so TypeORM's diff engine doesn't propose renaming them on every
// `migration:generate`.
@Entity()
@Unique('IDX_reading_progress_user_story', ['user', 'story'])
@Index('IDX_reading_progress_user_updatedAt', ['user', 'updatedAt'])
// Postgres has no unsigned integer types — a CHECK constraint keeps the
// same "0-100, never negative" guarantee the old tinyint UNSIGNED gave us.
@Check('"percent" >= 0 AND "percent" <= 100')
export class ReadingProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, {onDelete: 'CASCADE'})
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'FK_reading_progress_user',
  })
  user: User;

  @ManyToOne(() => Story, {onDelete: 'CASCADE'})
  @JoinColumn({
    name: 'storyId',
    foreignKeyConstraintName: 'FK_reading_progress_story',
  })
  story: Story;

  @Column({type: 'smallint'})
  percent: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
