import {User} from 'src/users/entities/user.entity';
import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

// One member muting another author's stories out of their own feeds — a
// private reading preference, not a social action (no notification, no
// visible status anywhere, distinct from unfollowing/reporting). The unique
// constraint makes muting idempotent; the single index serves the only
// direction this is ever queried ("who has this user muted"). Both FKs
// cascade-delete so removing a member cleans up their mutes and any mutes
// targeting them.
//
// The unique constraint and both FKs are explicitly named from the start
// (this codebase's own lesson from Follow/StoryLike/Bookmark: unnamed
// constraints make TypeORM's diff engine propose spurious renames on later
// `migration:generate` runs, even with no real change).
@Entity()
@Unique('IDX_muted_author_user_muted', ['user', 'mutedAuthor'])
@Index('IDX_muted_author_user', ['user'])
export class MutedAuthor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // The member doing the muting.
  @ManyToOne(() => User, {onDelete: 'CASCADE'})
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'FK_muted_author_user',
  })
  user: User;

  // The author being muted.
  @ManyToOne(() => User, {onDelete: 'CASCADE'})
  @JoinColumn({
    name: 'mutedAuthorId',
    foreignKeyConstraintName: 'FK_muted_author_muted',
  })
  mutedAuthor: User;

  @CreateDateColumn()
  createdAt: Date;
}
