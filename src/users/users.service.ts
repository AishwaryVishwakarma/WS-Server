import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
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
import {StoryStatus} from 'src/stories/enums/story-status.enum';
import type {ReportReason} from './enums/report-reason.enum';
import {Badge} from './enums/badge.enum';
import {Like, MoreThan, Repository, type FindOptionsWhere} from 'typeorm';
import {ConfigService} from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import {paginate} from 'src/utils/pagination';
import {handleQueryFailedError} from 'src/utils/handle-query-error';
import {syncReportCount} from 'src/utils/report-count';

// Thresholds for the "Prolific"/"Fan Favorite"/"Conversation Starter"
// badges. Prolific mirrors StoriesService.FREE_PUBLISH_LIMIT (10) — the
// same number that caps an author's publication pipeline is also where
// their public output starts looking prolific.
const PROLIFIC_STORY_COUNT = 10;
const FAN_FAVORITE_LIKES = 25;
const CONVERSATION_STARTER_COMMENTS = 25;

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
    private readonly configService: ConfigService
  ) {}

  // Hash the password using bcrypt
  private _generateHash(password: string) {
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
      user.password = await this._generateHash(password);
    }

    try {
      return await this.usersRepository.save(user);
    } catch (error) {
      handleQueryFailedError(error, 'update');
    }
  }

  // Accepts RegisterUserDto (self-registration) or CreateUserDto (admin, extends it)
  async create(createUserDto: RegisterUserDto) {
    const hashedPassword = await this._generateHash(createUserDto.password);

    const user = this.usersRepository.create({
      ...createUserDto,
      password: hashedPassword,
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
    const byGoogleId = await this.usersRepository.findOne({
      where: {googleId: profile.googleId},
    });
    if (byGoogleId) return byGoogleId;

    const byEmail = await this.usersRepository.findOne({
      where: {email: profile.email},
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
      where: [{googleId: profile.googleId}, {email: profile.email}],
      withDeleted: true,
    });
    if (removed) {
      throw new ForbiddenException('This account has been removed');
    }

    const user = this.usersRepository.create({
      name: profile.name,
      email: profile.email,
      googleId: profile.googleId,
      password: null,
      // Google already verified the address.
      isVerified: true,
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
      const like = Like(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
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
  async computeBadges(userId: string): Promise<Badge[]> {
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

    return badges;
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
    return this.usersRepository.findOneBy({email});
  }

  // Sets a new password directly — used by password-reset, where a valid
  // single-use token (not the caller's current password) is the proof of
  // ownership. updatedAt bumps normally; this is a real account change,
  // unlike the report/resolve moderation-metadata updates elsewhere.
  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const hashedPassword = await this._generateHash(newPassword);
    await this.usersRepository.update(userId, {password: hashedPassword});
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
    const result = await this.usersRepository.restore(id);

    if (result.affected === 0) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
  }
}
