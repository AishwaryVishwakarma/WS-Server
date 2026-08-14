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
import {StoryStatus} from 'src/stories/enums/story-status.enum';
import type {ReportReason} from './enums/report-reason.enum';
import {Badge} from './enums/badge.enum';
import {ILike, MoreThan, Repository, type FindOptionsWhere} from 'typeorm';
import {ConfigService} from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import {paginate} from 'src/utils/pagination';
import {handleQueryFailedError} from 'src/utils/handle-query-error';
import {syncReportCount} from 'src/utils/report-count';
import {computeStreakUpdate} from './streak';
import {SettingsService} from 'src/settings/settings.service';
import {
  ACHIEVEMENT_DEFINITIONS,
  AchievementKey,
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
  // Inject the User repository to interact with the database
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
    @Optional() private readonly imageStorage?: ImageStorageService
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

  // Update the user entity with the new data
  private async _applyUserUpdates(user: User, updateUserDto: UpdateUserDto) {
    const {password, ...rest} = updateUserDto;

    Object.assign(user, rest);

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
    const {password, ...rest} = createUserDto;
    const hashedPassword = await this.hashPassword(password);
    return this._createUserWithHash(rest, hashedPassword);
  }

  // Used by registration-OTP confirm, where the password was already hashed
  // back at registration-start time (before the code was even sent) — the
  // PendingRegistration row only ever holds the hash, never the plaintext.
  async createFromVerifiedRegistration(
    dto: Omit<RegisterUserDto, 'password'>,
    hashedPassword: string
  ) {
    return this._createUserWithHash(dto, hashedPassword);
  }

  private async _createUserWithHash(
    dto: Omit<RegisterUserDto, 'password'>,
    hashedPassword: string
  ) {
    const user = this.usersRepository.create({
      ...dto,
      password: hashedPassword,
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

  // Achievement badges for the public profile (GET /users/:id). Computed on
  // read from stats that already exist elsewhere — approved story count,
  // likes/comments received, and series ownership — rather than stored and
  // kept in sync via triggers scattered across StoriesService/LikesService/
  // CommentsService/SeriesService.
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
    const updated = computeStreakUpdate(user, today);
    if (!updated) return;

    await this.usersRepository.update(userId, updated);
  }

  async computeBadges(userId: string, longestStreak: number): Promise<Badge[]> {
    const [raw, hasSeries] = await Promise.all([
      this.storiesRepository
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
        }>(),
      this.seriesRepository.exists({where: {author: {id: userId}}}),
    ]);

    const stats = {
      approvedCount: Number(raw?.approvedCount) || 0,
      totalLikes: Number(raw?.totalLikes) || 0,
      totalComments: Number(raw?.totalComments) || 0,
    };

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

  async computeAchievements(userId: string): Promise<AchievementProgress[]> {
    const user = await this.findOne(userId);
    const [storyStats, seriesCount, completedStories] = await Promise.all([
      this.storiesRepository
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
        }>(),
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
    ]);

    const progressByKey: Record<AchievementKey, number> = {
      [AchievementKey.Storyteller]: Number(storyStats?.approvedCount) || 0,
      [AchievementKey.CrowdFavorite]: Number(storyStats?.totalLikes) || 0,
      [AchievementKey.CampfireHost]: Number(storyStats?.totalComments) || 0,
      [AchievementKey.SerialStoryteller]: seriesCount,
      [AchievementKey.ReadingRitual]: user.longestStreak,
      [AchievementKey.NightExplorer]: completedStories,
    };

    return ACHIEVEMENT_DEFINITIONS.map((definition) => {
      const progress = progressByKey[definition.key];
      return {
        ...definition,
        progress,
        highestUnlockedTier: unlockedTier(progress, definition.thresholds),
      };
    });
  }

  async computeAchievementBadges(userId: string) {
    const achievements = await this.computeAchievements(userId);
    return achievements.flatMap(({key, highestUnlockedTier}) =>
      highestUnlockedTier === 0 ? [] : [{key, tier: highestUnlockedTier}]
    );
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

    return this._applyUserUpdates(user, updateUserDto);
  }

  // Latches once — see User.hasPublishedStory. Called only from
  // StoriesService.updateStatus when a story reaches approved.
  async markHasPublishedStory(userId: string): Promise<void> {
    await this.usersRepository.update(userId, {hasPublishedStory: true});
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
