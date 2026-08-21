import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {RegisterUserDto} from './dto/register-user.dto';
import {UpdateUserDto} from './dto/update-user.dto';
import {InjectRepository} from '@nestjs/typeorm';
import {User} from './entities/user.entity';
import {UserReport} from './entities/user-report.entity';
import {Series} from 'src/series/entities/series.entity';
import {Story} from 'src/stories/entities/story.entity';
import {Bookmark} from 'src/bookmarks/entities/bookmark.entity';
import {Follow} from 'src/follows/entities/follow.entity';
import {ReadingProgress} from 'src/reading-progress/entities/reading-progress.entity';
import {SeasonalEventCompletion} from 'src/seasonal-events/entities/seasonal-event-completion.entity';
import {StoryStatus} from 'src/stories/enums/story-status.enum';
import type {ReportReason} from './enums/report-reason.enum';
import {Badge} from './enums/badge.enum';
import {
  ILike,
  In,
  IsNull,
  MoreThan,
  Not,
  Repository,
  type FindOptionsWhere,
} from 'typeorm';
import {
  MembershipTier,
  MEMBERSHIP_FOUNDING_LIMIT,
} from './enums/membership-tier.enum';
import {ConfigService} from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import {paginate} from 'src/utils/pagination';
import {handleQueryFailedError} from 'src/utils/handle-query-error';
import {buildSlug} from 'src/utils/slug';
import {syncReportCount} from 'src/utils/report-count';
import {
  applyFreeze,
  computeStreakUpdate,
  isEligibleForFreezeGrant,
  isOneDayGap,
  type StreakState,
} from './streak';
import {SettingsService} from 'src/settings/settings.service';
import {
  ACHIEVEMENT_DEFINITIONS,
  AchievementKey,
  type AchievementBadge,
  type AchievementProgress,
  unlockedTier,
} from './achievements';
import {
  ImageStorageService,
  type UploadedImage,
} from 'src/image-storage/image-storage.service';

// Thresholds for the "Prolific"/"Fan Favorite"/"Conversation Starter"
// badges. Prolific mirrors StoriesService.FREE_PUBLISH_LIMIT (10) — the
// same number that caps an author's publication pipeline is also where
// their public output starts looking prolific.
const PROLIFIC_STORY_COUNT = 10;
const FAN_FAVORITE_LIKES = 25;
const CONVERSATION_STARTER_COMMENTS = 25;
const WEEK_STREAK_DAYS = 7;
const MONTH_STREAK_DAYS = 30;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(UserReport)
    private readonly reportsRepository: Repository<UserReport>,
    // Read directly off the Story/Series/Bookmark/Follow repositories (not
    // StoriesService/SeriesService/FollowsService) for the badge/stats
    // computations below — those services already depend on UsersService, so
    // injecting them here would be a genuine circular provider dependency,
    // not just a circular module import. All are plain aggregate reads, no
    // business logic to reuse.
    @InjectRepository(Story)
    private readonly storiesRepository: Repository<Story>,
    @InjectRepository(Series)
    private readonly seriesRepository: Repository<Series>,
    @InjectRepository(Bookmark)
    private readonly bookmarksRepository: Repository<Bookmark>,
    @InjectRepository(Follow)
    private readonly followsRepository: Repository<Follow>,
    @InjectRepository(ReadingProgress)
    private readonly readingProgressRepository: Repository<ReadingProgress>,
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
    @Optional() private readonly imageStorage?: ImageStorageService,
    @Optional()
    @InjectRepository(SeasonalEventCompletion)
    private readonly eventCompletionsRepository?: Repository<SeasonalEventCompletion>
  ) {}

  async replaceProfileImage(userId: string, file: UploadedImage) {
    if (!(await this.settingsService.allowsProfileImageUpload())) {
      throw new ForbiddenException('Profile image uploads are disabled');
    }
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.profileImageFileId')
      .where('user.id = :userId', {userId})
      .getOne();
    if (!user) throw new NotFoundException(`User with ID ${userId} not found`);

    const uploaded = await this.imageStorage!.upload(file, `profile-${userId}`);
    const previousFileId = user.profileImageFileId;
    user.profileImageUrl = uploaded.url;
    user.profileImageFileId = uploaded.fileId;
    try {
      const saved = await this.usersRepository.save(user);
      if (previousFileId)
        void this.imageStorage!.delete(previousFileId).catch(() => undefined);
      return saved;
    } catch (error) {
      await this.imageStorage!.delete(uploaded.fileId).catch(() => undefined);
      throw error;
    }
  }

  async removeProfileImage(userId: string) {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.profileImageFileId')
      .where('user.id = :userId', {userId})
      .getOne();
    if (!user) throw new NotFoundException(`User with ID ${userId} not found`);
    const fileId = user.profileImageFileId;
    user.profileImageUrl = null;
    user.profileImageFileId = null;
    const saved = await this.usersRepository.save(user);
    if (fileId) void this.imageStorage!.delete(fileId).catch(() => undefined);
    return saved;
  }

  // Hash the password using bcrypt — public so callers that hash ahead of
  // creating the User row (e.g. RegistrationOtpService, which hashes at
  // registration-start time, before the OTP is even confirmed) can reuse it.
  hashPassword(password: string) {
    const saltRounds = parseInt(
      this.configService.get<string>('SALT_ROUNDS') || '10'
    );

    return bcrypt.hash(password, saltRounds);
  }

  private async _applyUserUpdates(user: User, updateUserDto: UpdateUserDto) {
    const {password, ...rest} = updateUserDto;

    // Captured before the mutation below so the slug only regenerates when
    // the name actually changes — not on every save (an admin granting
    // membership, verifying an account, etc. must not reshuffle the
    // profile's public URL).
    const previousName = user.name;

    Object.assign(user, rest);

    if (rest.name !== undefined && rest.name !== previousName) {
      user.slug = buildSlug(rest.name, 'member');
    }

    if (password) {
      user.password = await this.hashPassword(password);
    }

    try {
      return await this.usersRepository.save(user);
    } catch (error) {
      handleQueryFailedError(error, 'update');
    }
  }

  // Accepts RegisterUserDto (self-registration) or CreateUserDto (admin, extends it)
  async create(createUserDto: RegisterUserDto) {
    // referralCode here is an *inbound* code (see RegisterUserDto) — the
    // admin-create path doesn't run through the referral program at all, so
    // it's stripped rather than passed to _createUserWithHash, where it
    // would otherwise collide with User's own outbound referralCode column.
    const {password, referralCode, ...rest} = createUserDto;
    void referralCode;
    const hashedPassword = await this.hashPassword(password);
    return this._createUserWithHash(rest, hashedPassword);
  }

  // Used by registration-OTP confirm, where the password was already hashed
  // back at registration-start time (before the code was even sent) — the
  // PendingRegistration row only ever holds the hash, never the plaintext.
  // referredById is the *resolved* referrer's id (from
  // RegistrationOtpService/PendingRegistration.referredById), never the raw
  // inbound code — see the note on `create` above.
  async createFromVerifiedRegistration(
    dto: Omit<RegisterUserDto, 'password' | 'referralCode'>,
    hashedPassword: string,
    referredById: string | null = null
  ) {
    return this._createUserWithHash(dto, hashedPassword, referredById);
  }

  private async _createUserWithHash(
    dto: Omit<RegisterUserDto, 'password' | 'referralCode'>,
    hashedPassword: string,
    referredById: string | null = null
  ) {
    const user = this.usersRepository.create({
      ...dto,
      password: hashedPassword,
      referredById,
      // Creation never grants the public verified-author status. Admins may
      // still verify an existing account through update(), and qualifying
      // authors may earn it through the automatic verification rule.
      isVerified: false,
    });

    try {
      return await this.usersRepository.save(user);
    } catch (error) {
      // handleQueryFailedError maps duplicates to 409 and re-throws anything
      // else — never swallow, or create() would return undefined and callers
      // (register/admin create) would respond 201 with an empty body.
      return handleQueryFailedError(error, 'create');
    }
  }

  // Resolve the account for a verified Google profile: by googleId if already
  // linked, else link the Google identity onto an existing same-email (password)
  // account, else create a fresh OAuth-only account (no password). The caller
  // (AuthService) enforces email_verified before this runs.
  async findOrCreateGoogleUser(profile: {
    googleId: string;
    email: string;
    name: string;
    picture?: string;
  }): Promise<User> {
    // User.email is stored lowercased (see User.normalizeEmail) — Google's
    // own address is realistically already lowercase, but match its
    // guarantee rather than assume it.
    const email = profile.email.toLowerCase();

    const byGoogleId = await this.usersRepository.findOne({
      where: {googleId: profile.googleId},
    });
    if (byGoogleId) return byGoogleId;

    const byEmail = await this.usersRepository.findOne({
      where: {email},
    });
    if (byEmail) {
      byEmail.googleId = profile.googleId;
      // Backfill an avatar for an account that never set one.
      if (!byEmail.profileImageUrl && profile.picture) {
        byEmail.profileImageUrl = profile.picture;
      }
      return await this.usersRepository.save(byEmail);
    }

    // Neither an active account holds this identity. Self-deletion
    // (deactivateSelf) releases googleId/email before soft-deleting, so if a
    // *soft-deleted* row still holds either, it's an admin-removed account —
    // refuse re-registration under the same identity (a moderated user
    // shouldn't be able to dodge a ban by re-registering) with a clear message,
    // rather than letting the unique index reject the insert as a raw 409.
    const removed = await this.usersRepository.findOne({
      where: [{googleId: profile.googleId}, {email}],
      withDeleted: true,
    });
    if (removed) {
      throw new ForbiddenException('This account has been removed');
    }

    const user = this.usersRepository.create({
      name: profile.name,
      email,
      googleId: profile.googleId,
      password: null,
      // Google's email verification proves account ownership, not the
      // platform's public verified-author status.
      isVerified: false,
      ...(profile.picture ? {profileImageUrl: profile.picture} : {}),
    });

    try {
      return await this.usersRepository.save(user);
    } catch (error) {
      // Maps a duplicate (e.g. a googleId race) to 409 and re-throws; the
      // trailing throw is unreachable but satisfies the Promise<User> return.
      handleQueryFailedError(error, 'google sign-in');
      throw error;
    }
  }

  async findAll(
    page: number = 1,
    limit: number = 20,
    search?: string,
    reported?: boolean
  ) {
    const {skip, take} = paginate(page, limit);

    // The reported queue is a separate axis from the plain register: member-
    // reported users (reportCount > 0), most-reported first, regardless of
    // search. Otherwise the full register, newest first, optionally filtered.
    const base: FindOptionsWhere<User> = reported
      ? {reportCount: MoreThan(0)}
      : {};
    let where: FindOptionsWhere<User> | FindOptionsWhere<User>[] | undefined =
      reported ? base : undefined;

    if (search) {
      // ILIKE for case-insensitive matching (Postgres's default collation is
      // case-sensitive, unlike MySQL's).
      const like = ILike(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
      where = [
        {...base, name: like},
        {...base, email: like},
      ];
    }

    const [users, total] = await this.usersRepository.findAndCount({
      skip,
      take,
      where,
      withDeleted: true,
      order: reported
        ? {reportCount: 'DESC', createdAt: 'DESC'}
        : {createdAt: 'DESC'},
    });

    return {
      message: 'Success',
      data: users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // A member flags another member's profile (name/bio/avatar) for moderation.
  // Can't report yourself; the unique (reporter, reportedUser) constraint
  // blocks double-reporting (mapped to 409); reportCount is recomputed from
  // the rows so it never drifts. Mirrors StoriesService.report/CommentsService.report.
  // `reason` + optional `details` give the admin queue something to go on
  // beyond a bare count (see findOneWithReports).
  async report(
    reportedUserId: string,
    reporterId: string,
    reason: ReportReason,
    details?: string
  ) {
    if (reportedUserId === reporterId) {
      throw new BadRequestException('You cannot report yourself');
    }

    const reportedUser = await this.findOne(reportedUserId);
    const reporter = await this.findOne(reporterId);

    try {
      await this.reportsRepository.save(
        this.reportsRepository.create({
          reportedUser,
          reporter,
          reason,
          details: details ?? null,
        })
      );
    } catch (error) {
      handleQueryFailedError(error, 'report user');
    }

    const reportCount = await this.reportsRepository.countBy({
      reportedUser: {id: reportedUserId},
    });
    await syncReportCount(this.usersRepository, reportedUser, reportCount);
    return reportedUser;
  }

  // Admin dismisses the reports on a user (without blocking/deleting them):
  // drop the report rows and zero the count so they leave the reported queue.
  async resolveReports(userId: string) {
    const user = await this.findOne(userId);

    await this.reportsRepository.delete({reportedUser: {id: userId}});
    await syncReportCount(this.usersRepository, user, 0);
    return user;
  }

  async findOne(id: string) {
    return this.usersRepository.findOneByOrFail({id}).catch(() => {
      throw new NotFoundException(`User with ID ${id} not found`);
    });
  }

  // Backs the public author profile route — a clean cutover, not a dual
  // id-or-slug lookup, mirroring StoriesService.findOneVisibleBySlug.
  async findOneBySlug(slug: string) {
    return this.usersRepository.findOneByOrFail({slug}).catch(() => {
      throw new NotFoundException(`User '${slug}' not found`);
    });
  }

  // Registration-time lookup for an inbound referral code — a plain
  // nullable return, not the throwing findOneBySlug style above, since an
  // invalid/typo'd code must let registration proceed silently as "no
  // referrer" rather than error or reveal which codes exist.
  async findOneByReferralCode(code: string): Promise<User | null> {
    return this.usersRepository.findOneBy({referralCode: code});
  }

  // How many accounts this user has referred — self-only (see
  // PrivateUsersController), attached the same way as hasPassword: computed
  // fresh on each /users/me fetch rather than a denormalized counter, since
  // it's read far less often than it would need invalidating.
  async countReferredUsers(userId: string): Promise<number> {
    return this.usersRepository.count({where: {referredById: userId}});
  }

  // Records reading activity for today (UTC), extending/resetting the
  // user's streak via the pure computeStreakUpdate — triggered from
  // StoriesService.recordView on any story view. A no-op (no query beyond
  // the initial read) once today is already recorded, since a reader can
  // view many stories in one day. Uses a targeted `.update()`, not
  // `.save()`, to avoid touching unrelated fields (mirrors syncReportCount).
  async recordActivity(userId: string): Promise<void> {
    const user = await this.usersRepository.findOneBy({id: userId});
    if (!user) return;

    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();

    let streakFreezeCount = user.streakFreezeCount;
    let lastStreakFreezeUsedAt = user.lastStreakFreezeUsedAt;
    let freezeChanged = false;
    let effectiveState: StreakState = user;

    // isEligibleForFreezeGrant (cap, replenish window) and the tier check are
    // both cheap and synchronous; the site-wide toggle is the only part of
    // this condition that costs a settings lookup, called on every
    // view/comment/like. Checking it last means most calls — a Free-tier
    // member, or a Patron+ one already at the cap or mid-replenish-window —
    // never pay for it at all.
    const grantPossible =
      user.membershipTier !== MembershipTier.Free &&
      isEligibleForFreezeGrant(streakFreezeCount, lastStreakFreezeUsedAt, now);
    if (
      grantPossible &&
      (await this.settingsService.isMembershipFeaturesEnabled())
    ) {
      streakFreezeCount += 1;
      lastStreakFreezeUsedAt = now;
      freezeChanged = true;
    }

    // Spending a banked freeze is universal — it doesn't matter whether it
    // came from the Patron+ top-up above or a referral bonus, so this check
    // is deliberately not gated on membershipLive.
    if (
      streakFreezeCount > 0 &&
      user.lastActiveDate &&
      isOneDayGap(user.lastActiveDate, today)
    ) {
      effectiveState = {...user, ...applyFreeze(user, today)};
      streakFreezeCount -= 1;
      lastStreakFreezeUsedAt = now;
      freezeChanged = true;
    }

    const updated = computeStreakUpdate(effectiveState, today);
    if (!updated && !freezeChanged) return;

    await this.usersRepository.update(userId, {
      ...updated,
      ...(freezeChanged ? {streakFreezeCount, lastStreakFreezeUsedAt} : {}),
    });
  }

  // Shared by computeBadges/computeAchievements/computeProfileExtras so a
  // public profile view (which needs both badges and achievements) doesn't
  // run this identical approved-story aggregate twice.
  private async _approvedStoryStats(userId: string): Promise<{
    approvedCount: number;
    totalLikes: number;
    totalComments: number;
  }> {
    const raw = await this.storiesRepository
      .createQueryBuilder('story')
      .select('COUNT(*)', 'approvedCount')
      .addSelect('COALESCE(SUM(story.likeCount), 0)', 'totalLikes')
      .addSelect('COALESCE(SUM(story.commentCount), 0)', 'totalComments')
      .where('story.author = :authorId', {authorId: userId})
      .andWhere('story.status = :status', {status: StoryStatus.Approved})
      .getRawOne<{
        approvedCount: string;
        totalLikes: string;
        totalComments: string;
      }>();
    return {
      approvedCount: Number(raw?.approvedCount) || 0,
      totalLikes: Number(raw?.totalLikes) || 0,
      totalComments: Number(raw?.totalComments) || 0,
    };
  }

  private _badgesFromStats(
    stats: {approvedCount: number; totalLikes: number; totalComments: number},
    hasSeries: boolean,
    longestStreak: number
  ): Badge[] {
    const badges: Badge[] = [];
    if (stats.approvedCount >= 1) badges.push(Badge.Published);
    if (stats.approvedCount >= PROLIFIC_STORY_COUNT)
      badges.push(Badge.Prolific);
    if (stats.totalLikes >= FAN_FAVORITE_LIKES) badges.push(Badge.FanFavorite);
    if (stats.totalComments >= CONVERSATION_STARTER_COMMENTS) {
      badges.push(Badge.ConversationStarter);
    }
    if (hasSeries) badges.push(Badge.SeriesAuthor);
    // Based on longestStreak (permanent, like every other badge here), not
    // the fluctuating currentStreak — a lapsed streak doesn't take the
    // badge away.
    if (longestStreak >= WEEK_STREAK_DAYS) badges.push(Badge.WeekStreak);
    if (longestStreak >= MONTH_STREAK_DAYS) badges.push(Badge.MonthStreak);

    return badges;
  }

  async computeBadges(userId: string, longestStreak: number): Promise<Badge[]> {
    const [stats, hasSeries] = await Promise.all([
      this._approvedStoryStats(userId),
      this.seriesRepository.exists({where: {author: {id: userId}}}),
    ]);

    return this._badgesFromStats(stats, hasSeries, longestStreak);
  }

  // Shared by computeAchievements and computeProfileExtras once the caller
  // already has `user` and its approved-story aggregate — event completions
  // use the durable ledger so an earned tier remains after its limited event
  // ends.
  private async _achievementProgressFromStats(
    user: User,
    storyStats: {
      approvedCount: number;
      totalLikes: number;
      totalComments: number;
    }
  ): Promise<AchievementProgress[]> {
    const userId = user.id;
    const [seriesCount, completedStories, completedEvents] = await Promise.all([
      this.seriesRepository
        .createQueryBuilder('series')
        .innerJoin('series.stories', 'story')
        .where('series.author = :authorId', {authorId: userId})
        .andWhere('story.status = :status', {status: StoryStatus.Approved})
        .getCount(),
      this.readingProgressRepository
        .createQueryBuilder('progress')
        .innerJoin('progress.story', 'story')
        .where('progress.user = :userId', {userId})
        .andWhere('progress.percent = :completePercent', {
          completePercent: 100,
        })
        .andWhere('story.status = :status', {status: StoryStatus.Approved})
        .getCount(),
      this.eventCompletionsRepository?.countBy({user: {id: userId}}) ?? 0,
    ]);

    const progressByKey: Record<AchievementKey, number> = {
      [AchievementKey.Storyteller]: storyStats.approvedCount,
      [AchievementKey.CrowdFavorite]: storyStats.totalLikes,
      [AchievementKey.CampfireHost]: storyStats.totalComments,
      [AchievementKey.SerialStoryteller]: seriesCount,
      [AchievementKey.ReadingRitual]: user.longestStreak,
      [AchievementKey.NightExplorer]: completedStories,
      [AchievementKey.EventSeeker]: completedEvents,
    };

    // Tier 4 additionally requires the site-wide toggle live, like every
    // other membership perk — an account already tagged Patron+ before
    // rollout doesn't unlock it early.
    const isMember =
      user.membershipTier !== MembershipTier.Free &&
      (await this.settingsService.isMembershipFeaturesEnabled());

    return ACHIEVEMENT_DEFINITIONS.map((definition) => {
      const progress = progressByKey[definition.key];
      return {
        ...definition,
        progress,
        highestUnlockedTier: unlockedTier(
          progress,
          definition.thresholds,
          isMember
        ),
      };
    });
  }

  // Achievement progress for the private achievements view.
  async computeAchievements(userId: string): Promise<AchievementProgress[]> {
    const [user, storyStats] = await Promise.all([
      this.findOne(userId),
      this._approvedStoryStats(userId),
    ]);
    return this._achievementProgressFromStats(user, storyStats);
  }

  async computeAchievementBadges(userId: string): Promise<AchievementBadge[]> {
    const achievements = await this.computeAchievements(userId);
    return achievements.flatMap(({key, highestUnlockedTier}) =>
      highestUnlockedTier === 0 ? [] : [{key, tier: highestUnlockedTier}]
    );
  }

  // Public author profiles need both badges and achievement badges for the
  // same user in one request. Computing them via the independent
  // computeBadges/computeAchievementBadges methods above would run the
  // approved-story aggregate twice and re-fetch a user the caller (the
  // profile controller, which just resolved it via findOneBySlug) already
  // has loaded — this shares both.
  async computeProfileExtras(
    user: User
  ): Promise<{badges: Badge[]; achievementBadges: AchievementBadge[]}> {
    const [storyStats, hasSeries] = await Promise.all([
      this._approvedStoryStats(user.id),
      this.seriesRepository.exists({where: {author: {id: user.id}}}),
    ]);

    const achievements = await this._achievementProgressFromStats(
      user,
      storyStats
    );

    return {
      badges: this._badgesFromStats(storyStats, hasSeries, user.longestStreak),
      achievementBadges: achievements.flatMap(({key, highestUnlockedTier}) =>
        highestUnlockedTier === 0 ? [] : [{key, tier: highestUnlockedTier}]
      ),
    };
  }

  // Aggregate snapshot for the author's own dashboard (GET /users/me/stats).
  // Scoped to approved stories throughout, mirroring computeBadges — an
  // author's published output and the engagement on it are one coherent set;
  // draft/pending/rejected/flagged stories can't have accrued real
  // engagement anyway (views/likes/comments/bookmarks all require the story
  // to have been visible via findOneVisible). Followers/following are
  // user-level, so they're computed independent of story status — same
  // countBy shape as FollowsService.stats, reimplemented here against a
  // directly-injected Follow repository rather than injecting FollowsService
  // (FollowsModule imports UsersModule, so that would be a genuine circular
  // provider dependency).
  async computeAuthorStats(userId: string): Promise<{
    storiesPublished: number;
    totalViews: number;
    totalLikes: number;
    totalComments: number;
    totalBookmarks: number;
    followers: number;
    following: number;
  }> {
    const [storyStats, totalBookmarks, followers, following] =
      await Promise.all([
        this.storiesRepository
          .createQueryBuilder('story')
          .select('COUNT(*)', 'storiesPublished')
          .addSelect('COALESCE(SUM(story.viewCount), 0)', 'totalViews')
          .addSelect('COALESCE(SUM(story.likeCount), 0)', 'totalLikes')
          .addSelect('COALESCE(SUM(story.commentCount), 0)', 'totalComments')
          .where('story.author = :authorId', {authorId: userId})
          .andWhere('story.status = :status', {status: StoryStatus.Approved})
          .getRawOne<{
            storiesPublished: string;
            totalViews: string;
            totalLikes: string;
            totalComments: string;
          }>(),
        // A separate query, not joined onto the story aggregate above —
        // joining `bookmark` before the SUM/COUNT would fan out one row per
        // bookmark and multiply the story-side sums incorrectly.
        this.bookmarksRepository
          .createQueryBuilder('bookmark')
          .innerJoin('bookmark.story', 'story')
          .where('story.author = :authorId', {authorId: userId})
          .andWhere('story.status = :status', {status: StoryStatus.Approved})
          .getCount(),
        this.followsRepository.countBy({following: {id: userId}}),
        this.followsRepository.countBy({follower: {id: userId}}),
      ]);

    return {
      storiesPublished: Number(storyStats?.storiesPublished) || 0,
      totalViews: Number(storyStats?.totalViews) || 0,
      totalLikes: Number(storyStats?.totalLikes) || 0,
      totalComments: Number(storyStats?.totalComments) || 0,
      totalBookmarks,
      followers,
      following,
    };
  }

  // Unlike findOne, a miss is a valid outcome here — PasswordResetService
  // uses it to decide whether to actually mail a link, but must respond to
  // the caller identically either way (no account-enumeration signal).
  async findOneByEmail(email: string): Promise<User | null> {
    // User.email is stored lowercased (see User.normalizeEmail).
    return this.usersRepository.findOneBy({email: email.toLowerCase()});
  }

  // Sets a new password directly — used by password-reset, where a valid
  // single-use token (not the caller's current password) is the proof of
  // ownership. updatedAt bumps normally; this is a real account change,
  // unlike the report/resolve moderation-metadata updates elsewhere.
  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const hashedPassword = await this.hashPassword(newPassword);
    await this.usersRepository.update(userId, {password: hashedPassword});
  }

  async hasPassword(userId: string): Promise<boolean> {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :userId', {userId})
      .getOne();

    return Boolean(user?.password);
  }

  // Changes a signed-in member's password only after verifying the existing
  // one. Password-less OAuth accounts can establish one through the existing
  // email reset flow, where mailbox ownership replaces this proof.
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :userId', {userId})
      .getOne();

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    if (!user.password) {
      throw new BadRequestException(
        'This account does not have a password. Use password reset to create one.'
      );
    }
    if (!(await bcrypt.compare(currentPassword, user.password))) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (await bcrypt.compare(newPassword, user.password)) {
      throw new BadRequestException(
        'New password must be different from the current password'
      );
    }

    await this.updatePassword(userId, newPassword);
  }

  // Admin single-user detail (GET /admin/users/:id, e.g. the edit page): the
  // user plus the individual reports against them (reason, optional detail,
  // and who filed it) — the aggregate `reportCount` alone doesn't tell an
  // admin *why* someone was reported. Not used by the paginated register list,
  // so that response stays lean.
  async findOneWithReports(id: string) {
    const user = await this.findOne(id);

    user.reports = await this.reportsRepository.find({
      where: {reportedUser: {id}},
      relations: ['reporter'],
      order: {createdAt: 'DESC'},
    });

    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.findOne(id);

    // An admin explicitly deciding isVerified (either way) locks it — the
    // auto-verify check (SessionAuthGuard) never touches this account again,
    // so a later un-verify here isn't silently overwritten on the user's
    // next request. Self-service profile updates can never reach here with
    // isVerified set — UpdateProfileDto has no such field, so
    // ValidationPipe's whitelist strips it before this runs.
    if (updateUserDto.isVerified !== undefined) {
      user.verificationLocked = true;
    }

    let effectiveTier = updateUserDto.membershipTier;
    if (updateUserDto.membershipTier !== undefined) {
      effectiveTier = await this._resolveMembershipGrant(
        user,
        updateUserDto.membershipTier
      );
    }

    return this._applyUserUpdates(user, {
      ...updateUserDto,
      membershipTier: effectiveTier,
    });
  }

  // Granted either here (an admin's PATCH) or from
  // LemonSqueezyWebhookService via applyMembershipChange below — both
  // funnel through this one core so the founding-cap/premiumSince rules
  // never drift between the two grant sources. Mutates premiumSince/
  // foundingPatronSince directly on the entity (mirrors verificationLocked
  // above) rather than returning them, since UpdateUserDto has neither
  // field and Object.assign in _applyUserUpdates can't touch or overwrite
  // them. Does not persist — the caller owns the single save.
  private async _resolveMembershipGrant(
    user: User,
    requestedTier: MembershipTier
  ): Promise<MembershipTier> {
    // premiumSince (not the current tier) is the "ever been a member"
    // signal — a lapsed member's tier resets to Free too, which would be
    // indistinguishable from a true first grant if this checked the tier
    // instead. Immune to a later revoke-then-re-grant cycle.
    const isGenuineFirstGrant =
      !user.premiumSince && requestedTier !== MembershipTier.Free;
    const effectiveTier = await this._resolveGrantedTier(
      user,
      requestedTier,
      isGenuineFirstGrant
    );
    if (isGenuineFirstGrant) {
      user.premiumSince = new Date();
    }
    return effectiveTier;
  }

  // Admin grants and LemonSqueezy subscription webhooks both funnel here. A
  // genuine first-ever grant to Patron — while fewer than
  // MEMBERSHIP_FOUNDING_LIMIT accounts have ever held Patron+ — is
  // auto-upgraded to FoundingPatron, a status that's never re-evaluated or
  // lost even if membership later lapses and is re-granted. Explicitly
  // requesting FoundingPatron directly (e.g. a manual admin override) is
  // always honored as-is, without recomputing eligibility.
  //
  // The cap is counted off foundingPatronSince, not the current
  // membershipTier: counting current holders would let a churned Founding
  // Patron's slot silently be reissued (more than MEMBERSHIP_FOUNDING_LIMIT
  // lifetime grants), and — since this method's own first-grant guard
  // already prevents a lapsed member's re-grant from re-entering the count
  // at all — would leave no way back to FoundingPatron for someone
  // resubscribing via self-serve checkout, which only ever requests plain
  // Patron. Checking the latch first, before any of that, is what restores
  // it instead.
  private async _resolveGrantedTier(
    user: User,
    newTier: MembershipTier,
    isGenuineFirstGrant: boolean
  ): Promise<MembershipTier> {
    // An explicit Free — a lapse (subscription_expired) or an admin revoke —
    // must go through even for a latched Founding Patron. The latch means
    // "never lost on a later re-grant," not "can never become Free": the
    // account's tier really is Free for the lapsed period, which is exactly
    // what lets premiumSince (unaffected here) distinguish the eventual
    // re-grant from a genuine first grant.
    if (newTier === MembershipTier.Free) {
      return MembershipTier.Free;
    }

    if (user.foundingPatronSince) {
      return MembershipTier.FoundingPatron;
    }

    if (newTier !== MembershipTier.Patron || !isGenuineFirstGrant) {
      return newTier;
    }

    const foundingPatronCount = await this.usersRepository.count({
      where: {foundingPatronSince: Not(IsNull())},
    });

    if (foundingPatronCount < MEMBERSHIP_FOUNDING_LIMIT) {
      user.foundingPatronSince = new Date();
      return MembershipTier.FoundingPatron;
    }

    return MembershipTier.Patron;
  }

  // Entry point for LemonSqueezyWebhookService — the self-serve counterpart
  // to the admin PATCH path above, sharing the same grant core so the
  // founding cap and premiumSince rules apply identically regardless of
  // source. Uses findOneBy (not findOne, which throws NotFoundException)
  // since a webhook referencing an unknown or since-deleted account must be
  // a quiet no-op, not a 404 that LemonSqueezy would retry indefinitely.
  async applyMembershipChange(
    userId: string,
    requestedTier: MembershipTier,
    billing?: Partial<
      Pick<
        User,
        | 'lemonSqueezyCustomerId'
        | 'lemonSqueezySubscriptionId'
        | 'membershipStatus'
        | 'membershipRenewsAt'
      >
    >
  ): Promise<User | null> {
    const user = await this.usersRepository.findOneBy({id: userId});
    if (!user) return null;

    const effectiveTier = await this._resolveMembershipGrant(
      user,
      requestedTier
    );
    user.membershipTier = effectiveTier;
    Object.assign(user, billing);

    return this.usersRepository.save(user);
  }

  // Resolves the target account for a LemonSqueezy webhook: primarily by the
  // user id LemonSqueezy echoes back in checkout_data.custom (see
  // LemonSqueezyService.createCheckout), falling back to whatever
  // lemonSqueezyCustomerId is already on file — covers a subscription
  // created directly in the LemonSqueezy dashboard, which carries no custom
  // data at all. Caller is responsible for validating `userId` looks like a
  // real uuid before calling this — see LemonSqueezyWebhookService.
  async findForBillingWebhook(
    userId?: string,
    customerId?: string
  ): Promise<User | null> {
    if (userId) {
      const user = await this.usersRepository.findOneBy({id: userId});
      if (user) return user;
    }
    if (customerId) {
      return this.usersRepository.findOneBy({
        lemonSqueezyCustomerId: customerId,
      });
    }
    return null;
  }

  // Latches once — see User.hasPublishedStory. Called only from
  // StoriesService.updateStatus when a story reaches approved.
  async markHasPublishedStory(userId: string): Promise<void> {
    await this.usersRepository.update(userId, {hasPublishedStory: true});
  }

  // Same latch as markHasPublishedStory, batched for
  // StoriesService.bulkUpdateStatus — one UPDATE across every distinct
  // author in the batch instead of one per author.
  async markManyHasPublishedStory(userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    await this.usersRepository.update(
      {id: In(userIds)},
      {hasPublishedStory: true}
    );
  }

  // A member deleting their own account (as opposed to admin removal, see
  // `remove`). Releases the unique identifiers (email, googleId) *before*
  // soft-deleting, so the same person can register/sign-in fresh afterwards
  // instead of colliding with their old, now-inert row. The placeholder email
  // embeds the row's own id, so it can never collide with another user's;
  // `.invalid` is a reserved TLD guaranteed never to be a real address.
  // Content (stories/comments) stays attributed to the (now anonymous) row.
  async deactivateSelf(id: string) {
    const user = await this.findOne(id);

    user.googleId = null;
    user.email = `deleted-${id}@deleted.invalid`;
    await this.usersRepository.save(user);

    await this.remove(id);
  }

  async remove(id: string) {
    const result = await this.usersRepository.softDelete(id);

    if (result.affected === 0) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
  }

  async restore(id: string) {
    const user = await this.usersRepository.findOne({
      where: {id},
      withDeleted: true,
    });

    // A self-deleted identity was deliberately released and may already
    // belong to a new account. Restoring that tombstone would create a broken
    // account with no usable email/Google identity and misrepresent the
    // member's deletion choice.
    if (user?.email.endsWith('@deleted.invalid')) {
      throw new BadRequestException('Self-deleted accounts cannot be restored');
    }

    const result = await this.usersRepository.restore(id);

    if (result.affected === 0) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
  }
}
