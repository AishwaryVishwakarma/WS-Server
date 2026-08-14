import {Exclude} from 'class-transformer';
import {Story} from 'src/stories/entities/story.entity';
import {
  BeforeInsert,
  BeforeUpdate,
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
import {AvatarIcon} from '../enums/avatar-icon.enum';
import {AvatarColor} from '../enums/avatar-color.enum';
import {Comment} from 'src/comments/entities/comment.entity';
import {UserReport} from './user-report.entity';
import {Series} from 'src/series/entities/series.entity';
import type {Badge} from '../enums/badge.enum';
import type {ContentWarning} from 'src/stories/enums/content-warning.enum';
import {
  NOTIFICATION_TYPES,
  type NotificationType,
} from 'src/notifications/notification.types';

@Entity()
// One Google identity maps to at most one account. Named + nullable-unique so
// password-only accounts (googleId NULL) coexist — a unique index permits
// many NULLs (standard SQL: NULL is never equal to another NULL).
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

  @Column({type: 'varchar', length: 500, nullable: true})
  profileImageUrl: string | null;

  // A chosen themed icon avatar — always available (unlike profileImageUrl,
  // not gated by allowProfileImageUpload) since it's curated, not an
  // arbitrary external URL. Avatar's precedence: profileImageUrl > avatarIcon.
  // UsersService assigns a random one at creation, but only when the account
  // has no profileImageUrl to fall back on instead — an account created with
  // a photo (e.g. Google sign-in) stays null here until/unless its owner
  // deliberately picks an icon, since the photo already covers rendering.
  @Column({type: 'enum', enum: AvatarIcon, nullable: true})
  avatarIcon: AvatarIcon | null;

  // A background-color pairing for the avatar icon — same conditional
  // random-at-creation, same nullable treatment as avatarIcon.
  @Column({type: 'enum', enum: AvatarColor, nullable: true})
  avatarColor: AvatarColor | null;

  @Column({length: 500, nullable: true})
  bio: string;

  // A signed-in reader's own persistent "hide stories carrying these"
  // preference — distinct from Story.contentWarnings (what a story carries).
  // Same transformer as that column: simple-array forces an unbounded TEXT
  // column, so this uses a bounded varchar(255) instead for this small fixed
  // vocabulary.
  @Column({
    type: 'varchar',
    length: 255,
    default: '',
    transformer: {
      to: (value: ContentWarning[] = []) => value.join(','),
      from: (value: string | ContentWarning[]): ContentWarning[] => {
        if (Array.isArray(value)) return value;
        return value ? (value.split(',') as ContentWarning[]) : [];
      },
    },
  })
  mutedContentWarnings: ContentWarning[];

  // Recomputed from the user_report rows on every report/resolve (see
  // UsersService) — an orderable, drift-free mirror of the report count so the
  // admin queue can sort most-reported-first. Covers an offensive name/bio/
  // avatar — content the text filter (IsClean) can't fully catch (evasions)
  // and can't see at all (images).
  @Column({type: 'int', default: 0})
  reportCount: number;

  // Reading-streak state, maintained by UsersService.recordActivity
  // (triggered from StoriesService.recordView on any story view). Permanent
  // once earned — longestStreak never decreases, mirroring how every other
  // badge milestone works. lastActiveDate is a plain UTC 'YYYY-MM-DD'
  // string, not a native date column — sidesteps driver timezone conversion
  // entirely; "yesterday" is just string-date arithmetic (see streak.ts).
  @Column({type: 'int', default: 0})
  currentStreak: number;

  @Column({type: 'int', default: 0})
  longestStreak: number;

  @Column({type: 'varchar', length: 10, nullable: true})
  lastActiveDate: string | null;

  // Weekly digest delivery is opt-in. New accounts remain unsubscribed until
  // the member explicitly enables it from settings.
  @Column({default: false})
  digestEmailEnabled: boolean;

  // When this user was last sent a digest — the window start for "what's
  // new" in their next one (see DigestService).
  @Column({type: 'timestamp', nullable: true})
  lastDigestSentAt: Date | null;

  // Set by authenticated provider webhooks after a permanent bounce, spam
  // complaint, or provider suppression. Digest delivery is disabled at the
  // same time; admins can see why an address stopped receiving mail.
  @Column({type: 'timestamp', nullable: true})
  emailSuppressedAt: Date | null;

  @Column({type: 'varchar', length: 20, nullable: true})
  emailSuppressionReason: string | null;

  @Column({
    type: 'varchar',
    length: 80,
    default: NOTIFICATION_TYPES.join(','),
    transformer: {
      to: (value: NotificationType[] = [...NOTIFICATION_TYPES]) =>
        value.join(','),
      from: (value: string): NotificationType[] =>
        value ? (value.split(',') as NotificationType[]) : [],
    },
  })
  notificationInAppTypes: NotificationType[];

  @Column({
    type: 'varchar',
    length: 80,
    default: '',
    transformer: {
      to: (value: NotificationType[] = []) => value.join(','),
      from: (value: string): NotificationType[] =>
        value ? (value.split(',') as NotificationType[]) : [],
    },
  })
  notificationEmailTypes: NotificationType[];

  @Column({type: 'varchar', length: 5, nullable: true})
  notificationQuietStart: string | null;

  @Column({type: 'varchar', length: 5, nullable: true})
  notificationQuietEnd: string | null;

  @Column({type: 'int', default: 0})
  notificationTimezoneOffset: number;

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

  // Postgres's default collation is case-sensitive, unlike MySQL's default —
  // without this, `Foo@x.com` and `foo@x.com` would collide on the unique
  // index but the wrong one could win, and login-by-different-casing would
  // silently fail. Mirrors Tag.normalizeName's lowercasing hook. Only fixes
  // newly-written rows — every email *lookup* site (login, register's
  // existing-account check, RegistrationOtpService's pending-registration
  // lookups) must also lowercase its input; see those call sites.
  @BeforeInsert()
  @BeforeUpdate()
  normalizeEmail() {
    if (this.email) {
      this.email = this.email.trim().toLowerCase();
    }
  }
}
