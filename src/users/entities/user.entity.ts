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
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {Role} from '../enums/role';
import {MembershipTier} from '../enums/membership-tier.enum';
import {Comment} from 'src/comments/entities/comment.entity';
import {UserReport} from './user-report.entity';
import {Series} from 'src/series/entities/series.entity';
import type {Badge} from '../enums/badge.enum';
import type {AchievementBadge} from '../achievements';
import type {ContentWarning} from 'src/stories/enums/content-warning.enum';
import {
  NOTIFICATION_TYPES,
  type NotificationType,
} from 'src/notifications/notification.types';
import {buildSlug, shortId} from 'src/utils/slug';

@Entity()
// One Google identity maps to at most one account. Named + nullable-unique so
// password-only accounts (googleId NULL) coexist — a unique index permits
// many NULLs (standard SQL: NULL is never equal to another NULL).
@Index('IDX_user_googleId', ['googleId'], {unique: true})
// The admin reported-users queue filters reportCount > 0 and sorts by it —
// index it so the queue is a range scan, not a table scan.
@Index('IDX_user_reportCount', ['reportCount'])
// Backs admin-analytics day-bucketed queries over active accounts. Partial
// (excludes soft-deleted rows) and explicitly named to match the raw SQL that
// created it in AddAnalyticsEvents — without this, migration:generate can't
// see the index in entity metadata and proposes dropping it every time.
@Index('IDX_user_createdAt', ['createdAt'], {where: '"deletedAt" IS NULL'})
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({length: 100})
  name: string;

  // Derived from name on creation (see assignSlug below); UsersService's
  // update() regenerates it when the name actually changes, since a plain
  // @BeforeUpdate hook would reshuffle the profile URL on every save,
  // including edits that never touch the name.
  @Column({length: 100, unique: true})
  slug: string;

  // A permanent, shareable invite code — assigned once (see assignReferralCode
  // below) and deliberately *not* derived from name/slug, since slug
  // regenerates on a name change and would silently break a previously-shared
  // referral link.
  @Column({length: 12, unique: true})
  referralCode: string;

  // Set once, at registration, when this account was created via someone
  // else's referral code (see RegistrationOtpService.start/AuthService.
  // confirmRegistration). ON DELETE SET NULL: a referrer's account deletion
  // shouldn't cascade into deleting everyone they referred.
  @Column({type: 'uuid', nullable: true})
  referredById: string | null;

  @ManyToOne(() => User, {nullable: true, onDelete: 'SET NULL'})
  @JoinColumn({name: 'referredById'})
  referredBy: User | null;

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

  // Granted either by an admin (UsersService.update) or by a LemonSqueezy
  // subscription webhook (UsersService.applyMembershipChange) — both funnel
  // through the same _resolveMembershipGrant/_resolveGrantedTier core.
  // `premiumSince` is set once on the first-ever grant and never cleared by
  // a later lapse/re-grant, so it keeps meaning "when this account first
  // became a member" regardless of any gap in between.
  @Column({
    type: 'enum',
    enum: MembershipTier,
    default: MembershipTier.Free,
  })
  membershipTier: MembershipTier;

  @Column({type: 'timestamp', nullable: true})
  premiumSince: Date | null;

  // Latched the first time this account is ever awarded FoundingPatron and
  // never cleared afterward — mirrors premiumSince's own philosophy, for
  // the same reason. Fixes two bugs a churn-and-rejoin cycle would otherwise
  // hit if the founding cap were still counted off current membershipTier:
  // a lapsed Founding Patron's slot silently freeing up for reassignment,
  // and that same member losing founding status for good on resubscribing
  // (a self-serve checkout only ever requests Patron, so without this latch
  // there is no way back to FoundingPatron once premiumSince is already
  // set). See UsersService._resolveGrantedTier.
  @Column({type: 'timestamp', nullable: true})
  foundingPatronSince: Date | null;

  // The reconciliation key for LemonSqueezy subscription webhooks — a
  // webhook only applies a state change when its subscription id matches
  // this column (or the account has none yet), so a late/retried event for
  // an already-superseded subscription can never downgrade a current
  // member. Unique: one LemonSqueezy subscription belongs to one account.
  @Column({type: 'varchar', length: 64, nullable: true, unique: true})
  lemonSqueezySubscriptionId: string | null;

  // Fallback reconciliation when a webhook carries no custom_data (e.g. a
  // subscription created directly in the LemonSqueezy dashboard), and the
  // handle used for support lookups. Not unique — a customer can plausibly
  // hold more than one subscription across their lifetime.
  @Column({type: 'varchar', length: 64, nullable: true})
  lemonSqueezyCustomerId: string | null;

  // Raw mirror of the LemonSqueezy subscription's own `status` (active,
  // on_trial, past_due, paused, unpaid, cancelled, expired). membershipTier
  // alone can't express "cancelled but still active until period end" — a
  // cancelled member keeps their tier till then (see LemonSqueezyWebhookService)
  // — and the /me copy and manage-vs-upgrade CTA both depend on knowing which.
  @Column({type: 'varchar', length: 32, nullable: true})
  membershipStatus: string | null;

  // From the subscription's renews_at (still billing) or ends_at (cancelled,
  // winding down) — lets the UI say "renews {date}" or "perks end {date}".
  @Column({type: 'timestamp', nullable: true})
  membershipRenewsAt: Date | null;

  @Column({type: 'varchar', length: 500, nullable: true})
  profileImageUrl: string | null;

  @Exclude()
  @Column({type: 'varchar', length: 36, nullable: true, select: false})
  profileImageFileId: string | null;

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

  @Column({type: 'smallint', default: 3})
  weeklyReadingGoal: number;

  @Column({type: 'varchar', length: 10, nullable: true})
  lastActiveDate: string | null;

  // Patron+ perk: spend one to protect currentStreak on a day with no
  // activity, instead of it resetting to 0. Replenished monthly (see
  // UsersService.useStreakFreeze) rather than accumulating indefinitely.
  @Column({type: 'int', default: 0})
  streakFreezeCount: number;

  @Column({type: 'timestamp', nullable: true})
  lastStreakFreezeUsedAt: Date | null;

  // Weekly digest delivery is opt-in. New accounts remain unsubscribed until
  // the member explicitly enables it from settings.
  @Column({default: false})
  digestEmailEnabled: boolean;

  // When this user was last sent a digest — the window start for "what's
  // new" in their next one (see DigestService).
  @Column({type: 'timestamp', nullable: true})
  lastDigestSentAt: Date | null;

  // Win-back email is opt-out (unlike the weekly digest) — most readers
  // would want a "we miss you" nudge if they lapse, so this defaults true.
  @Column({default: true})
  winbackEmailEnabled: boolean;

  // Last time a win-back email was sent — compared against lastActiveDate so
  // exactly one is sent per lapse episode (see WinbackService).
  @Column({type: 'timestamp', nullable: true})
  winbackEmailSentAt: Date | null;

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

  /** Tiered achievement badges computed for a public profile. */
  achievementBadges?: AchievementBadge[];

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

  @BeforeInsert()
  assignSlug() {
    if (!this.slug) {
      this.slug = buildSlug(this.name, 'member');
    }
  }

  @BeforeInsert()
  assignReferralCode() {
    if (!this.referralCode) {
      this.referralCode = shortId();
    }
  }
}
