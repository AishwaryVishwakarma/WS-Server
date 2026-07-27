import {Exclude} from 'class-transformer';
import {Story} from 'src/stories/entities/story.entity';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {Role} from '../enums/role';
import {Comment} from 'src/comments/entities/comment.entity';
import {UserReport} from './user-report.entity';
import {Series} from 'src/series/entities/series.entity';
import type {Badge} from '../enums/badge.enum';

@Entity()
// One Google identity maps to at most one account. Named + nullable-unique so
// password-only accounts (googleId NULL) coexist — MySQL permits many NULLs
// under a unique index.
@Index('IDX_user_googleId', ['googleId'], {unique: true})
// The admin reported-users queue filters reportCount > 0 and sorts by it —
// index it so the queue is a range scan, not a table scan.
@Index('IDX_user_reportCount', ['reportCount'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({length: 100})
  name: string;

  @Column({unique: true})
  email: string;

  // Nullable: OAuth-only accounts (Google sign-in) have no local password.
  // Explicit `type` because TypeORM can't infer `string | null` from reflection.
  @Column({type: 'varchar', length: 255, select: false, nullable: true})
  @Exclude()
  password: string | null;

  // The Google account subject (`sub`) once linked, else null. Uniqueness is
  // enforced by the named index on the class (IDX_user_googleId).
  @Column({type: 'varchar', length: 255, nullable: true})
  @Exclude()
  googleId: string | null;

  @Column({type: 'enum', enum: Role, default: Role.User})
  role: Role;

  @Column({default: false})
  isVerified: boolean;

  // Set once an author's first story ever reaches `approved` (see
  // StoriesService.updateStatus) and never cleared — including if that
  // story is later deleted (a hard delete; see Story, which carries no
  // @DeleteDateColumn). Feeds auto-verification (SessionAuthGuard); has no
  // other reader.
  @Column({default: false})
  hasPublishedStory: boolean;

  // Set once `isVerified` has been decided one way or the other — either by
  // the auto-verify check firing (SessionAuthGuard) or by an admin
  // explicitly setting `isVerified` (UsersService.update). Once set, the
  // auto-check never touches this account again, so an admin's later
  // un-verify (or early manual verify) always wins over the automatic path.
  @Column({default: false})
  verificationLocked: boolean;

  @Column({default: false})
  isBlocked: boolean;

  @Column({length: 500, nullable: true})
  profileImageUrl: string;

  @Column({length: 500, nullable: true})
  bio: string;

  // Recomputed from the user_report rows on every report/resolve (see
  // UsersService) — an orderable, drift-free mirror of the report count so the
  // admin queue can sort most-reported-first. Covers an offensive name/bio/
  // avatar — content the text filter (IsClean) can't fully catch (evasions)
  // and can't see at all (images).
  @Column({type: 'int', default: 0})
  reportCount: number;

  @OneToMany(() => Story, (story) => story.author)
  stories: Story[];

  @OneToMany(() => Series, (series) => series.author)
  seriesList: Series[];

  @OneToMany(() => Comment, (comment) => comment.user)
  comments: Comment[];

  @OneToMany(() => UserReport, (report) => report.reportedUser)
  reports: UserReport[];

  /** Not a column — computed by UsersService.computeBadges and attached
   *  before serializing the single-profile fetch (GET /users/:id). */
  badges?: Badge[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
