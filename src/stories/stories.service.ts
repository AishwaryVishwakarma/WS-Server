import {
  BadRequestException,
  forwardRef,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  NotFoundException,
} from '@nestjs/common';
import {CreateStoryDto} from './dto/create-story.dto';
import {UpdateStoryDto} from './dto/update-story.dto';
import {InjectRepository} from '@nestjs/typeorm';
import {Story} from './entities/story.entity';
import {StoryReport} from './entities/story-report.entity';
import {StoryRevision} from './entities/story-revision.entity';
import {StoryLike} from 'src/likes/entities/story-like.entity';
import {Bookmark} from 'src/bookmarks/entities/bookmark.entity';
import {ReadingProgress} from 'src/reading-progress/entities/reading-progress.entity';
import {
  ILike,
  In,
  IsNull,
  LessThanOrEqual,
  MoreThan,
  Not,
  Repository,
  type FindOptionsWhere,
  type SelectQueryBuilder,
} from 'typeorm';
import {getPaginatedResponse, paginate} from 'src/utils/pagination';
import {syncReportCount} from 'src/utils/report-count';
import {TagsService} from 'src/tags/tags.service';
import {Role} from 'src/users/enums/role';
import {UsersService} from 'src/users/users.service';
import {MembershipTier} from 'src/users/enums/membership-tier.enum';
import {SeriesService} from 'src/series/series.service';
import {MutesService} from 'src/mutes/mutes.service';
import {SettingsService} from 'src/settings/settings.service';
import {AnalyticsEventsService} from 'src/admin-analytics/analytics-events.service';
import {AnalyticsEventType} from 'src/admin-analytics/entities/analytics-event.entity';
import type {User} from 'src/users/entities/user.entity';
import {StoryStatus} from './enums/story-status.enum';
import {handleQueryFailedError} from 'src/utils/handle-query-error';
import type {StorySortOption} from './dto/story-query.dto';
import {
  decodeStoryCursor,
  encodeStoryCursor,
  type DecodedCursor,
} from './story-cursor';
import {toBooleanFulltextQuery} from './story-search';
import {StoryReportReason} from './enums/story-report-reason.enum';
import {
  ImageStorageService,
  type UploadedImage,
} from 'src/image-storage/image-storage.service';

interface StoryFilters {
  tag?: string;
  /** The /stories feed's multi-select tag filter — OR semantics (a story
   *  matching any one of these matches), distinct from the single-slug
   *  `tag` above (which stays the shelf page's own). */
  tags?: string[];
  search?: string;
  scareLevel?: number;
  sort?: StorySortOption;
  /** For You feed only: restrict to stories carrying any of these tag ids. */
  forYouTagIds?: string[];
  /** For You feed only: exclude stories the reader has already engaged with. */
  excludeStoryIds?: string[];
  /** For You feed: the reader's own id. Everywhere else (main feed, Following
   *  feed): muted author ids. Carries both together for the For You feed. */
  excludeAuthorIds?: string[];
}

// The slice of session state recordView reads/writes. Structural so the service
// stays decoupled from express-session (and trivially fakeable in unit tests).
interface ViewSession {
  viewedStoryIds?: string[];
}

// Cap the per-session viewed-id list so a long-lived session can't grow it
// without bound; dropping the oldest ids just means a re-read could recount.
const MAX_TRACKED_VIEWS = 200;

// Sorts that order by a numeric counter (DESC) rather than createdAt. Maps to
// the story column; used by the order-by, the keyset predicate, and the cursor
// key so all three stay consistent. `newest`/`oldest` are absent (they sort on
// createdAt).
const COUNT_SORT_COLUMN: Partial<
  Record<StorySortOption, 'commentCount' | 'viewCount' | 'likeCount'>
> = {
  'most-commented': 'commentCount',
  'most-read': 'viewCount',
  'most-liked': 'likeCount',
};

// "Trending" = the most-engaged approved stories from a recent window. Recency
// is a fixed window (not a decaying score), so the ordering key stays a stable
// integer — keyset-pageable exactly like the count sorts (a decaying score
// would drift between page fetches and duplicate the boundary row). The window
// also keeps the (status, createdAt) index in play to bound the sort. Comments
// weigh most (the most effortful engagement), then likes, then views.
export const TRENDING_WINDOW_DAYS = 14;

// Free accounts can have up to this many stories in the publication pipeline
// (submitted, live, or flagged) at once. Drafts and rejected stories don't
// count, so authors can keep working — the cap is on how much they push to the
// keepers, both a fair-use limit and basic spam protection.
export const FREE_PUBLISH_LIMIT = 10;

// Free accounts can also have up to this many private drafts at once — a
// separate bucket from FREE_PUBLISH_LIMIT (a free author could have up to 20
// stories total: 10 drafts + 10 in the pipeline). Drafts are never reviewed,
// but they're still rows in the database, so they get their own bound rather
// than being unlimited.
export const FREE_DRAFT_LIMIT = 10;

const PUBLISH_PIPELINE_STATUSES = [
  StoryStatus.Pending,
  StoryStatus.Approved,
  StoryStatus.Flagged,
];

const SELECTED_FIELDS = {
  id: true,
  title: true,
  coverImageUrl: true,
  scareLevel: true,
  contentWarnings: true,
  isFlagged: true,
  rejectionReason: true,
  scheduledFor: true,
  status: true,
  excerpt: true,
  wordCount: true,
  commentCount: true,
  viewCount: true,
  likeCount: true,
  scareRatingSum: true,
  scareRatingCount: true,
  reportCount: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class StoriesService {
  constructor(
    @InjectRepository(Story)
    private readonly storiesRepository: Repository<Story>,
    @InjectRepository(StoryReport)
    private readonly reportsRepository: Repository<StoryReport>,
    @InjectRepository(StoryRevision)
    private readonly revisionsRepository: Repository<StoryRevision>,
    // Read directly rather than injecting LikesService/BookmarksService/
    // ReadingProgressService — all three already inject StoriesService, so
    // the reverse would be a circular provider dependency (same reasoning as
    // UsersService.computeBadges reading Story/Series repositories directly).
    @InjectRepository(StoryLike)
    private readonly storyLikeRepository: Repository<StoryLike>,
    @InjectRepository(Bookmark)
    private readonly bookmarkRepository: Repository<Bookmark>,
    @InjectRepository(ReadingProgress)
    private readonly readingProgressRepository: Repository<ReadingProgress>,
    private readonly usersService: UsersService,
    private readonly tagsService: TagsService,
    @Inject(forwardRef(() => SeriesService))
    private readonly seriesService: SeriesService,
    private readonly mutesService: MutesService,
    private readonly settingsService: SettingsService,
    @Optional() private readonly imageStorage?: ImageStorageService,
    @Optional() private readonly analyticsEvents?: AnalyticsEventsService
  ) {}

  async replaceCoverImage(
    storyId: string,
    file: UploadedImage,
    userId: string,
    role: Role
  ) {
    if (!(await this.settingsService.allowsStoryCoverImage())) {
      throw new ForbiddenException('Story cover image uploads are disabled');
    }
    await this._getStoryIfAuthorized(storyId, userId, role);
    const storedStory = await this.storiesRepository
      .createQueryBuilder('story')
      .addSelect('story.coverImageFileId')
      .where('story.id = :storyId', {storyId})
      .getOneOrFail();
    const uploaded = await this.imageStorage!.upload(file, `cover-${storyId}`);
    const previousFileId = storedStory.coverImageFileId;
    const previousUrl = storedStory.coverImageUrl;
    try {
      const saved = await this.update(
        storyId,
        {coverImageUrl: uploaded.url},
        userId,
        role
      );
      await this.storiesRepository.update(storyId, {
        coverImageFileId: uploaded.fileId,
      });
      saved.coverImageFileId = uploaded.fileId;
      if (previousFileId)
        void this.imageStorage!.delete(previousFileId).catch(() => undefined);
      return saved;
    } catch (error) {
      await this.imageStorage!.delete(uploaded.fileId).catch(() => undefined);
      await this.storiesRepository
        .update(storyId, {coverImageUrl: previousUrl})
        .catch(() => undefined);
      throw error;
    }
  }

  async removeCoverImage(storyId: string, userId: string, role: Role) {
    await this._getStoryIfAuthorized(storyId, userId, role);
    const story = await this.storiesRepository
      .createQueryBuilder('story')
      .addSelect('story.coverImageFileId')
      .where('story.id = :storyId', {storyId})
      .getOneOrFail();
    const fileId = story.coverImageFileId;
    const saved = await this.update(
      storyId,
      {coverImageUrl: null} as unknown as UpdateStoryDto,
      userId,
      role
    );
    await this.storiesRepository.update(storyId, {coverImageFileId: null});
    if (fileId) void this.imageStorage!.delete(fileId).catch(() => undefined);
    return saved;
  }

  private async _getStoryIfAuthorized(
    storyId: string,
    userId: string,
    role: Role
  ): Promise<Story> {
    const story = await this.findOne(storyId);

    const isOwner = story.author?.id === userId;

    if (!isOwner && role !== Role.Admin) {
      throw new ForbiddenException(
        `You do not have permission to modify this story`
      );
    }

    return story;
  }

  private async _getTagsIfExists(tagIds: string[]) {
    const tags = await this.tagsService.findManyByIds(tagIds);

    if (tags.length !== tagIds.length) {
      throw new NotFoundException('One or more tags not found');
    }

    return tags;
  }

  // Reject a publish (submit for review) once the author is at the free limit.
  // Drafts are exempt — the cap is on the publication pipeline, not private work.
  // Patron+ members are exempt entirely — but only once the site-wide
  // membershipFeaturesEnabled toggle is on, so a tier already staged on an
  // account before rollout has no effect until launch.
  private async _assertWithinPublishLimit(
    userId: string,
    membershipTier: MembershipTier
  ) {
    if (
      membershipTier !== MembershipTier.Free &&
      (await this.settingsService.isMembershipFeaturesEnabled())
    ) {
      return;
    }

    const count = await this.storiesRepository.count({
      where: {
        author: {id: userId},
        status: In(PUBLISH_PIPELINE_STATUSES),
      },
    });
    if (count >= FREE_PUBLISH_LIMIT) {
      throw new ForbiddenException(
        `You've reached the free limit of ${FREE_PUBLISH_LIMIT} published stories. ` +
          'Delete one, or keep new work as a draft until you have room.'
      );
    }
  }

  // Reject saving a new draft once the author is at the free draft limit —
  // a separate bucket from the publish limit (see FREE_DRAFT_LIMIT). Patron+
  // members are exempt, same rule as the publish limit.
  private async _assertWithinDraftLimit(
    userId: string,
    membershipTier: MembershipTier
  ) {
    if (
      membershipTier !== MembershipTier.Free &&
      (await this.settingsService.isMembershipFeaturesEnabled())
    ) {
      return;
    }

    const count = await this.storiesRepository.count({
      where: {
        author: {id: userId},
        status: StoryStatus.Draft,
      },
    });
    if (count >= FREE_DRAFT_LIMIT) {
      throw new ForbiddenException(
        `You've reached the free limit of ${FREE_DRAFT_LIMIT} drafts. ` +
          'Delete or submit one before starting another.'
      );
    }
  }

  async create(
    createStoryDto: CreateStoryDto,
    userId: string,
    // Trusted callers (the seed) opt out of the user-facing publish and draft
    // limits so demo/pagination data can exceed them.
    {enforcePublishLimit = true}: {enforcePublishLimit?: boolean} = {}
  ) {
    const {
      tags: tagIds,
      excerpt,
      draft,
      seriesTitle,
      scheduledFor,
      ...rest
    } = createStoryDto;

    const author = await this.usersService.findOne(userId);

    if (enforcePublishLimit) {
      if (draft) {
        await this._assertWithinDraftLimit(userId, author.membershipTier);
      } else {
        await this._assertWithinPublishLimit(userId, author.membershipTier);
      }
    }

    // Drafts are never in moderation to begin with; a non-draft only skips
    // the pending queue when the site-wide approval requirement is off.
    const requireApproval = draft
      ? true
      : await this.settingsService.requiresApproval();

    // Silently drop rather than reject — a stale client with the old URL
    // field shouldn't error, it just doesn't take effect.
    if (
      rest.coverImageUrl !== undefined &&
      !(await this.settingsService.allowsStoryCoverImage())
    ) {
      delete rest.coverImageUrl;
    }

    const story = this.storiesRepository.create({
      ...rest,
      excerpt: excerpt || rest.content.slice(0, 280) + '...',
      status: draft
        ? StoryStatus.Draft
        : requireApproval
          ? StoryStatus.Pending
          : StoryStatus.Approved,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      author,
    });

    if (tagIds?.length) {
      story.tags = await this._getTagsIfExists(tagIds);
    }

    if (seriesTitle) {
      await this._assignSeries(story, author, seriesTitle);
    }

    const saved = await this.storiesRepository.save(story);

    // Mirrors updateStatus's own latch — without this, an author whose
    // stories are only ever auto-approved (never manually approved by an
    // admin) would never trip auto-verification or the Published/Prolific
    // badges.
    if (saved.status === StoryStatus.Approved) {
      await this.usersService.markHasPublishedStory(author.id);
    }

    return saved;
  }

  // Attaches `story` to (creating if needed) `author`'s series named
  // `title`, assigning it the next position in that series. Shared by
  // create and update — update only calls this when the target series is
  // actually changing (see update()), so editing unrelated fields never
  // reshuffles an existing position.
  private async _assignSeries(story: Story, author: User, title: string) {
    const series = await this.seriesService.findOrCreateForAuthor(
      author,
      title
    );
    story.series = series;

    // TypeORM's typed `.maximum()` helper requires a strictly `number` column
    // (seriesPosition is `number | null`), so this aggregate goes through the
    // query builder instead.
    const raw = await this.storiesRepository
      .createQueryBuilder('story')
      .select('MAX(story.seriesPosition)', 'max')
      .where('story.series = :seriesId', {seriesId: series.id})
      .getRawOne<{max: string | null}>();

    story.seriesPosition = (Number(raw?.max) || 0) + 1;
  }

  async findAll(
    page: number = 1,
    limit: number = 20,
    status?: StoryStatus,
    search?: string,
    reported?: boolean
  ) {
    const {skip, take} = paginate(page, limit);

    // The reported queue is a separate axis from status: member-reported
    // stories (reportCount > 0), most-reported first, whatever their status.
    // Otherwise the status-filtered list newest-first (drafts are the author's
    // private business — never listed for admins).
    const base: FindOptionsWhere<Story> = reported
      ? {reportCount: MoreThan(0)}
      : status
        ? {status}
        : {status: Not(StoryStatus.Draft)};
    let where: FindOptionsWhere<Story> | FindOptionsWhere<Story>[] = base;

    if (search) {
      // ILIKE for case-insensitive matching (Postgres's default collation is
      // case-sensitive, unlike MySQL's).
      const like = ILike(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
      where = [
        {...base, title: like},
        {...base, excerpt: like},
      ];
    }

    // The pending queue orders Patron+ authors' stories first — queue
    // *position* only, never a different bar for approval (see CLAUDE.md) —
    // oldest-first within each tier so no one's wait is unbounded, matching
    // the existing tiebreak. This needs a query builder: a 3-value string
    // enum can't express "any non-free tier outranks free" via the plain
    // find-options order object (alphabetical order doesn't line up with
    // priority order), so it's a raw CASE expression instead. Only taken for
    // the actual review queue — every other status/the reported queue keeps
    // the find-options path below unchanged, including its narrow SELECT.
    if (
      status === StoryStatus.Pending &&
      !reported &&
      (await this.settingsService.isMembershipFeaturesEnabled())
    ) {
      const qb = this.storiesRepository
        .createQueryBuilder('story')
        .leftJoinAndSelect('story.author', 'author')
        .leftJoinAndSelect('story.tags', 'tags')
        .where('story.status = :status', {status})
        .withDeleted();

      if (search) {
        qb.andWhere('(story.title ILIKE :like OR story.excerpt ILIKE :like)', {
          like: `%${search.replace(/[\\%_]/g, '\\$&')}%`,
        });
      }

      // Selected (not just ordered-by) under its own alias — TypeORM's order-by
      // combiner tries to resolve bare raw CASE expressions against known
      // aliases and errors ("author" alias was not found) unless the
      // expression is first registered as a select.
      const [stories, total] = await qb
        .addSelect(
          `CASE WHEN author."membershipTier" = 'free' THEN 1 ELSE 0 END`,
          'priority_rank'
        )
        .orderBy('priority_rank', 'ASC')
        .addOrderBy('story.createdAt', 'DESC')
        .skip(skip)
        .take(take)
        .getManyAndCount();

      return getPaginatedResponse<Story>(stories, total, page, limit);
    }

    const [stories, total] = await this.storiesRepository.findAndCount({
      skip,
      take,
      where,
      relations: ['author', 'tags'],
      select: SELECTED_FIELDS,
      // Reported queue: worst offenders first, then newest. Otherwise newest.
      order: reported
        ? {reportCount: 'DESC', createdAt: 'DESC'}
        : {createdAt: 'DESC'},
      // Admins should see stories whose authors were soft-deleted
      withDeleted: true,
    });

    return getPaginatedResponse<Story>(stories, total, page, limit);
  }

  async findAllApprovedByUserId(
    userId: string,
    page: number = 1,
    limit: number = 20
  ) {
    const {skip, take} = paginate(page, limit);

    const [stories, total] = await this.storiesRepository.findAndCount({
      where: {author: {id: userId}, status: StoryStatus.Approved},
      // No author relation: these stories are always shown in the author's own
      // context (the author page and "more from author"), where the card
      // hides the byline — so the author would be unused payload.
      relations: ['tags'],
      skip,
      take,
      select: SELECTED_FIELDS,
      order: {createdAt: 'DESC'},
    });

    return getPaginatedResponse<Story>(stories, total, page, limit);
  }

  async findAllByUserId(
    userId: string,
    page: number = 1,
    limit: number = 20,
    search?: string,
    status?: StoryStatus
  ) {
    const {skip, take} = paginate(page, limit);

    const base: FindOptionsWhere<Story> = {
      author: {id: userId},
      ...(status ? {status} : {}),
    };
    let where: FindOptionsWhere<Story> | FindOptionsWhere<Story>[] = base;

    if (search) {
      // ILIKE for case-insensitive matching (Postgres's default collation is
      // case-sensitive, unlike MySQL's).
      const like = ILike(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
      where = [
        {...base, title: like},
        {...base, excerpt: like},
      ];
    }

    const [stories, total] = await this.storiesRepository.findAndCount({
      where,
      relations: ['tags'],
      skip,
      take,
      select: SELECTED_FIELDS,
      order: {createdAt: 'DESC'},
    });

    return getPaginatedResponse<Story>(stories, total, page, limit);
  }

  // Picks one random approved story's id. ORDER BY RANDOM() shuffles the
  // whole filtered set to pick — fine at the story counts this app runs at
  // today; a much larger table would want an offset/gap-sampling scheme
  // instead.
  async findRandomApprovedId(): Promise<string> {
    const story = await this.storiesRepository
      .createQueryBuilder('story')
      .select('story.id')
      .where('story.status = :status', {status: StoryStatus.Approved})
      .orderBy('RANDOM()')
      .getOne();

    if (!story) {
      throw new NotFoundException('No approved stories yet');
    }

    return story.id;
  }

  async findOne(id: string) {
    return await this.storiesRepository
      .findOneOrFail({
        where: {id},
        relations: ['author', 'tags', 'series'],
        // Include soft-deleted authors so a story by a removed user stays
        // readable instead of null-ing out author and throwing.
        withDeleted: true,
      })
      .catch(() => {
        throw new NotFoundException(`Story with ID ${id} not found`);
      });
  }

  // Public read: non-approved stories are visible only to their author and
  // admins. Others — including anonymous visitors — get a 404 (not 403) so
  // story existence isn't leaked.
  async findOneVisible(id: string, userId?: string, role?: Role) {
    const story = await this.findOne(id);

    this._assertStoryVisible(story, id, userId, role);

    return story;
  }

  // Authorization-only visibility check for hot writes such as reading
  // progress. Avoids loading story content, tags and series every few seconds
  // merely to prove the member may see the story.
  async assertVisible(id: string, userId?: string, role?: Role): Promise<void> {
    const story = await this.storiesRepository.findOne({
      where: {id},
      relations: {author: true},
      select: {
        id: true,
        status: true,
        scheduledFor: true,
        author: {id: true},
      },
      withDeleted: true,
    });
    if (!story) throw new NotFoundException(`Story with ID ${id} not found`);
    this._assertStoryVisible(story, id, userId, role);
  }

  private _assertStoryVisible(
    story: Pick<Story, 'status' | 'scheduledFor'> & {
      author?: {id: string} | null;
    },
    id: string,
    userId?: string,
    role?: Role
  ) {
    const isOwner = userId !== undefined && story.author?.id === userId;
    // A scheduled story stays invisible to everyone but its author/an admin
    // until the moment passes, even once approved — no scheduler involved,
    // just this same read-time check every visibility gate already applies.
    const stillScheduled =
      story.scheduledFor !== null && story.scheduledFor > new Date();

    if (
      (story.status !== StoryStatus.Approved || stillScheduled) &&
      !isOwner &&
      role !== Role.Admin
    ) {
      throw new NotFoundException(`Story with ID ${id} not found`);
    }
  }

  // Shared query for the public approved listing: field selection, author/tag
  // eager loads, the approved+withDeleted scope, the active filters, and the
  // sort. Every sort ends in `story.id` as a tiebreaker so the order is total
  // (rows with equal sort keys never shuffle) — this is what makes keyset
  // paging stable and is harmless for offset paging. Callers add paging
  // (skip/take for offset, a keyset WHERE + take for the cursor feed).
  private _buildApprovedQuery(
    filters: StoryFilters
  ): SelectQueryBuilder<Story> {
    const {
      tag,
      tags,
      search,
      scareLevel,
      sort,
      forYouTagIds,
      excludeStoryIds,
      excludeAuthorIds,
    } = filters;

    const qb = this.storiesRepository
      .createQueryBuilder('story')
      .select(Object.keys(SELECTED_FIELDS).map((field) => `story.${field}`))
      .leftJoinAndSelect('story.author', 'author')
      .leftJoinAndSelect('story.tags', 'tags')
      .where('story.status = :status', {status: StoryStatus.Approved})
      // A scheduled story stays out of every public listing until its
      // moment passes — read-time only, no scheduler (mirrors findOneVisible).
      .andWhere('(story.scheduledFor IS NULL OR story.scheduledFor <= :now)', {
        now: new Date(),
      })
      // Same rationale as findOne: keep stories by soft-deleted authors.
      .withDeleted();

    const countColumn = sort ? COUNT_SORT_COLUMN[sort] : undefined;
    if (sort === 'trending') {
      // Recent window (bounds the filesort via the status+createdAt index),
      // then the engagement blend (Story.trendingScore, a generated column —
      // see its own comment for why a real column instead of a raw computed
      // expression), id-tiebroken like the count sorts.
      qb.andWhere('story.createdAt >= (NOW() - :trendingWindow::interval)', {
        trendingWindow: `${TRENDING_WINDOW_DAYS} days`,
      })
        .addSelect('story.trendingScore')
        .orderBy('story.trendingScore', 'DESC')
        .addOrderBy('story.id', 'DESC');
    } else if (countColumn) {
      qb.orderBy(`story.${countColumn}`, 'DESC').addOrderBy('story.id', 'DESC');
    } else {
      const direction = sort === 'oldest' ? 'ASC' : 'DESC';
      qb.orderBy('story.createdAt', direction).addOrderBy(
        'story.id',
        direction
      );
    }

    if (tag) {
      // Second join purely as a filter — `tags` above still loads the story's
      // full tag list, not just the matched one.
      qb.innerJoin('story.tags', 'tagFilter', 'tagFilter.slug = :tagSlug', {
        tagSlug: tag,
      });
    }

    if (tags && tags.length > 0) {
      // OR semantics — a story matching any one of these tags qualifies. A
      // plain `innerJoin('story.tags', ..., 'slug IN (:...tags)')` would fan
      // out one row per matching tag (on top of the unconditional
      // `tags` eager-load above) for a story carrying more than one of the
      // selected tags — a subquery keeps that existence check row-count-safe,
      // mirroring the For You feed's `forYouTagIds` affinity filter below.
      const tagsFilterSubQuery = qb
        .subQuery()
        .select('tagsFilterStory.id')
        .from(Story, 'tagsFilterStory')
        .innerJoin(
          'tagsFilterStory.tags',
          'tagsFilterTag',
          'tagsFilterTag.slug IN (:...tagsSlugs)'
        )
        .getQuery();
      qb.andWhere(`story.id IN ${tagsFilterSubQuery}`, {tagsSlugs: tags});
    }

    if (search) {
      const booleanQuery = toBooleanFulltextQuery(search);
      if (booleanQuery) {
        // Indexed word/prefix match over the generated searchVector (title +
        // excerpt — see Story.searchVector). Used purely as a filter — the
        // sort/keyset ordering above is untouched.
        qb.andWhere(
          'story."searchVector" @@ to_tsquery(\'english\', :ftQuery)',
          {
            ftQuery: booleanQuery,
          }
        );
      } else {
        // Too short or all stopwords for a tsquery — fall back to a
        // substring ILIKE (unindexed, but such queries are rare and cheap to
        // scan). Escape LIKE wildcards so a literal % / _ can't act as a
        // match-all. ILIKE for case-insensitive matching (Postgres's default
        // collation is case-sensitive, unlike MySQL's).
        const escaped = search.replace(/[\\%_]/g, '\\$&');
        qb.andWhere(
          '(story.title ILIKE :search OR story.excerpt ILIKE :search)',
          {search: `%${escaped}%`}
        );
      }
    }

    if (scareLevel) {
      qb.andWhere('story.scareLevel = :scareLevel', {scareLevel});
    }

    if (excludeStoryIds && excludeStoryIds.length > 0) {
      qb.andWhere('story.id NOT IN (:...excludeStoryIds)', {excludeStoryIds});
    }

    if (excludeAuthorIds && excludeAuthorIds.length > 0) {
      // author is a left join (a soft-deleted author's stories still show,
      // per the withDeleted scope above) — a plain `NOT IN` would silently
      // drop those rows too, since SQL's NULL NOT IN (...) is NULL, not true.
      qb.andWhere(
        '(author.id IS NULL OR author.id NOT IN (:...excludeAuthorIds))',
        {excludeAuthorIds}
      );
    }

    if (forYouTagIds && forYouTagIds.length > 0) {
      // A second `innerJoin` on `story.tags` (like the `tag` filter above)
      // would multiply rows for a story sharing several affinity tags, on
      // top of the unconditional `tags` eager-load already in this query —
      // silently truncating a keyset page below `limit`. A subquery keeps
      // that fan-out contained, so the outer row shape is untouched. The
      // join's ON-condition carries the raw `:...forYouTagIds` placeholder
      // without binding it here — the value is supplied once, by the
      // `andWhere` below, against the fully-assembled SQL string.
      const affinitySubQuery = qb
        .subQuery()
        .select('affinityStory.id')
        .from(Story, 'affinityStory')
        .innerJoin(
          'affinityStory.tags',
          'affinityTag',
          'affinityTag.id IN (:...forYouTagIds)'
        )
        .getQuery();
      qb.andWhere(`story.id IN ${affinitySubQuery}`, {forYouTagIds});
    }

    return qb;
  }

  // Offset paging — kept for the tag/author shelves, which show numbered pages
  // and a total. Fine at shallow depths; the feed uses keyset instead.
  async findAllApproved(
    page: number = 1,
    limit: number = 20,
    filters: StoryFilters = {}
  ) {
    const {skip, take} = paginate(page, limit);

    const [stories, total] = await this._buildApprovedQuery(filters)
      .skip(skip)
      .take(take)
      .getManyAndCount();

    return getPaginatedResponse<Story>(stories, total, page, limit);
  }

  // Approved stories by any of the given authors, newest first — the Following
  // feed. Offset-paged (numbered), reusing the shared approved query. Callers
  // must pass a non-empty id list (an empty `IN ()` is invalid SQL); the
  // follows service short-circuits the empty case.
  async findApprovedByAuthorIds(
    authorIds: string[],
    page: number = 1,
    limit: number = 20
  ) {
    const {skip, take} = paginate(page, limit);

    const [stories, total] = await this._buildApprovedQuery({})
      .andWhere('author.id IN (:...authorIds)', {authorIds})
      .skip(skip)
      .take(take)
      .getManyAndCount();

    return getPaginatedResponse<Story>(stories, total, page, limit);
  }

  // A series' approved stories in narrative order (the series page, and the
  // reader's "More in this series" strip). Series are small by nature, so
  // this returns the whole ordered list rather than paging it.
  async findApprovedBySeriesId(seriesId: string): Promise<Story[]> {
    // Not built on _buildApprovedQuery (a plain find(), not a query builder),
    // so the same "still scheduled" exclusion is expressed as an array of
    // where-clauses — TypeORM OR's them together — rather than a raw AND/OR.
    const base = {series: {id: seriesId}, status: StoryStatus.Approved};
    return this.storiesRepository.find({
      where: [
        {...base, scheduledFor: IsNull()},
        {...base, scheduledFor: LessThanOrEqual(new Date())},
      ],
      relations: ['tags', 'series'],
      select: {...SELECTED_FIELDS, seriesPosition: true},
      order: {seriesPosition: 'ASC'},
    });
  }

  // The author's own view of a series: every story regardless of status,
  // ordered by position — unlike findApprovedBySeriesId (public, approved
  // only), the reorder tool needs to show/reorder drafts and pending parts too.
  async findAllBySeriesId(seriesId: string): Promise<Story[]> {
    return this.storiesRepository.find({
      where: {series: {id: seriesId}},
      relations: ['tags', 'series'],
      select: {...SELECTED_FIELDS, seriesPosition: true},
      order: {seriesPosition: 'ASC'},
    });
  }

  // Reassigns 1-based positions in the given order. Transactional and
  // all-or-nothing, mirroring bulkUpdateStatus. storyIds must resolve to
  // exactly the series' current stories (same set, any order) — the
  // caller's guarantee that nothing was dropped, duplicated, or smuggled in
  // from another series.
  async reorderSeries(seriesId: string, storyIds: string[]): Promise<Story[]> {
    return this.storiesRepository.manager.transaction(async (manager) => {
      const repo = manager.withRepository(this.storiesRepository);
      const stories = await repo.find({
        where: {series: {id: seriesId}},
        relations: ['tags', 'series'],
      });

      const currentIds = new Set(stories.map((story) => story.id));
      if (
        storyIds.length !== stories.length ||
        !storyIds.every((id) => currentIds.has(id))
      ) {
        throw new BadRequestException(
          "storyIds must exactly match this series' current stories"
        );
      }

      const byId = new Map(stories.map((story) => [story.id, story]));
      storyIds.forEach((id, index) => {
        byId.get(id)!.seriesPosition = index + 1;
      });

      await repo.save(stories);
      return stories.sort(
        (a, b) => (a.seriesPosition ?? 0) - (b.seriesPosition ?? 0)
      );
    });
  }

  // Keyset (cursor) paging for the infinite feed. Instead of OFFSET (which
  // scans and discards every earlier row), it seeks straight past the cursor
  // via `(sortKey, id)`, so page N costs the same as page 1. `total` is
  // computed only on the first page (no cursor) — enough to show a count in
  // the header without a COUNT on every scroll.
  async findApprovedFeed(params: {
    cursor?: string;
    limit?: number;
    filters?: StoryFilters;
  }): Promise<{data: Story[]; nextCursor: string | null; total?: number}> {
    const {cursor, limit = 20, filters = {}} = params;
    const sort = filters.sort ?? 'newest';

    const qb = this._buildApprovedQuery(filters);

    // Count only the first page (no cursor). Cloned before the raw select
    // below so getCount() sees a clean projection.
    const total =
      cursor === undefined ? await qb.clone().getCount() : undefined;

    // createdAt is timestamp(6), but a JS Date carries only milliseconds — so
    // reading it off the entity would drop the microsecond tail and let the
    // boundary row reappear on the next page. Pull it at full precision as a
    // string for the cursor. It's in the SELECT only, never the WHERE, so the
    // (status, createdAt) index still drives the keyset seek.
    qb.addSelect(
      `to_char(story."createdAt", 'YYYY-MM-DD HH24:MI:SS.US')`,
      'story_created_raw'
    );

    const decoded = cursor ? decodeStoryCursor(cursor) : null;
    if (decoded) {
      this._applyKeyset(qb, sort, decoded);
    }

    const {entities, raw} = await qb
      .take(limit)
      .getRawAndEntities<Record<string, unknown>>();
    const last = entities.at(-1);
    const nextCursor =
      last && entities.length === limit
        ? encodeStoryCursor(this._cursorKey(sort, last, raw), last.id)
        : null;

    return {data: entities, nextCursor, total};
  }

  // Count a read of a story, deduped per viewer session. Only approved stories
  // count (an author previewing their own pending story doesn't inflate it),
  // self-views by the author don't count, and a story already in this session's
  // viewed set is a no-op. Best-effort: the client fires it and ignores the
  // result, but it returns the fresh count so a caller can reflect it.
  async recordView(
    storyId: string,
    session: ViewSession,
    viewerId?: string
  ): Promise<{counted: boolean; viewCount: number}> {
    const story = await this.storiesRepository.findOne({
      where: {id: storyId},
      // Narrow projection — never load the full text content on a view ping.
      select: {id: true, status: true, viewCount: true, author: {id: true}},
      relations: {author: true},
    });

    if (!story) {
      throw new NotFoundException(`Story with ID ${storyId} not found`);
    }

    // Reading-streak activity is a per-day, not per-story, concept — record
    // it for any signed-in viewer regardless of whether this particular view
    // moves the story's own viewCount (dedup/self-view below only govern
    // that counter).
    if (viewerId) {
      await this.usersService.recordActivity(viewerId);
    }

    const alreadyViewed = session.viewedStoryIds?.includes(storyId) ?? false;
    const isAuthor = viewerId != null && viewerId === story.author?.id;

    if (story.status !== StoryStatus.Approved || isAuthor || alreadyViewed) {
      return {counted: false, viewCount: story.viewCount};
    }

    await this.storiesRepository.increment({id: storyId}, 'viewCount', 1);
    session.viewedStoryIds = [...(session.viewedStoryIds ?? []), storyId].slice(
      -MAX_TRACKED_VIEWS
    );
    await this.analyticsEvents?.record(AnalyticsEventType.StoryViewed, {
      actorId: viewerId ?? null,
      storyId,
    });

    return {counted: true, viewCount: story.viewCount + 1};
  }

  // The sort key for the last row, as a string: the full-precision createdAt
  // (from the raw projection) or the commentCount.
  private _cursorKey(
    sort: StorySortOption,
    last: Story,
    raw: Record<string, unknown>[]
  ): string {
    // Joins fan the raw rows out per tag, so match on the root id rather than
    // trusting positional alignment with `entities`.
    const row = raw.find((r) => r.story_id === last.id);

    // Trending orders by the generated trendingScore column — read straight
    // off the hydrated entity, same as the count-sort columns below.
    if (sort === 'trending') {
      return String(last.trendingScore);
    }

    const countColumn = COUNT_SORT_COLUMN[sort];
    if (countColumn) {
      return String(last[countColumn]);
    }
    return String(
      (row?.story_created_raw as string | null) ?? last.createdAt.toISOString()
    );
  }

  // Row-value keyset predicate matching _buildApprovedQuery's ORDER BY. For a
  // descending sort the next page is everything "less than" the cursor:
  // `col < k OR (col = k AND id < cursorId)`; ascending flips the comparators.
  private _applyKeyset(
    qb: SelectQueryBuilder<Story>,
    sort: StorySortOption,
    cursor: DecodedCursor
  ): void {
    const ascending = sort === 'oldest';
    const cmp = ascending ? '>' : '<';
    const countColumn = COUNT_SORT_COLUMN[sort];
    // Trending compares on the same generated column it orders by; count
    // sorts on their column (both numeric); createdAt on the timestamp(6)
    // string encoded at full precision (see _cursorKey) — pg binds a string
    // param as text, and Postgres won't implicitly compare text to
    // timestamp, so this branch alone needs an explicit ::timestamp cast.
    let column: string;
    let placeholder = ':ck';
    let key: string | number;
    if (sort === 'trending') {
      column = 'story.trendingScore';
      key = Number(cursor.k);
    } else if (countColumn) {
      column = `story.${countColumn}`;
      key = Number(cursor.k);
    } else {
      column = 'story.createdAt';
      placeholder = ':ck::timestamp';
      key = cursor.k;
    }

    qb.andWhere(
      `(${column} ${cmp} ${placeholder} OR (${column} = ${placeholder} AND story.id ${cmp} :cid))`,
      {ck: key, cid: cursor.id}
    );
  }

  // Recent story ids this reader has liked/bookmarked/made reading progress
  // on — capped per source so a long-time member's full history doesn't
  // balloon the query. Recency, not completeness, is what should drive
  // affinity.
  private async _engagedStoryIds(userId: string): Promise<string[]> {
    const CAP = 50;
    const [likes, bookmarks, progress] = await Promise.all([
      this.storyLikeRepository.find({
        where: {user: {id: userId}},
        relations: {story: true},
        order: {createdAt: 'DESC'},
        take: CAP,
      }),
      this.bookmarkRepository.find({
        where: {user: {id: userId}},
        relations: {story: true},
        order: {createdAt: 'DESC'},
        take: CAP,
      }),
      this.readingProgressRepository.find({
        where: {user: {id: userId}},
        relations: {story: true},
        order: {updatedAt: 'DESC'},
        take: CAP,
      }),
    ]);

    const ids = new Set<string>();
    [...likes, ...bookmarks, ...progress].forEach((row) =>
      ids.add(row.story.id)
    );
    return [...ids];
  }

  // Top tags among those engaged stories, most-frequent first, capped. Not
  // carried forward as a per-story score — For You is a filter (any shared
  // tag), not a ranked recommender.
  private async _affinityTagIds(
    engagedStoryIds: string[],
    limit = 8
  ): Promise<string[]> {
    if (engagedStoryIds.length === 0) return [];

    const stories = await this.storiesRepository.find({
      where: {id: In(engagedStoryIds)},
      relations: {tags: true},
      select: {id: true},
    });

    const freq = new Map<string, number>();
    stories.forEach((story) =>
      story.tags.forEach((tag) => freq.set(tag.id, (freq.get(tag.id) ?? 0) + 1))
    );

    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);
  }

  // The "For You" feed: approved stories tagged like what this reader has
  // engaged with, newest first, excluding what they've already interacted
  // with. Keyset-paged via the same findApprovedFeed used by the public
  // feed — no `sort` is passed, so it defaults to plain createdAt ordering.
  async findForYouFeed(
    userId: string,
    params: {cursor?: string; limit?: number}
  ): Promise<{data: Story[]; nextCursor: string | null; total?: number}> {
    const engagedStoryIds = await this._engagedStoryIds(userId);
    if (engagedStoryIds.length === 0) {
      return {data: [], nextCursor: null, total: 0};
    }

    const forYouTagIds = await this._affinityTagIds(engagedStoryIds);
    if (forYouTagIds.length === 0) {
      return {data: [], nextCursor: null, total: 0};
    }

    const mutedIds = await this.mutesService.mutedAuthorIds(userId);

    return this.findApprovedFeed({
      cursor: params.cursor,
      limit: params.limit,
      filters: {
        forYouTagIds,
        excludeStoryIds: engagedStoryIds,
        excludeAuthorIds: [userId, ...mutedIds],
      },
    });
  }

  async update(
    id: string,
    updateStoryDto: UpdateStoryDto,
    userId: string,
    role: Role
  ) {
    const story = await this._getStoryIfAuthorized(id, userId, role);

    const {tags: tagIds, seriesTitle, scheduledFor, ...rest} = updateStoryDto;
    // `draft` only applies at creation; submission goes through submitDraft
    delete rest.draft;

    // Silently drop rather than reject — a stale client with the old URL
    // field shouldn't error, it just doesn't take effect.
    if (
      rest.coverImageUrl !== undefined &&
      !(await this.settingsService.allowsStoryCoverImage())
    ) {
      delete rest.coverImageUrl;
    }

    // A non-admin can't retroactively pull an already-public story back out
    // of sight by scheduling it into the future — that's not what scheduled
    // publishing is for, and would surprise readers who've already seen it.
    // Checked against the story's state *before* any mutation below.
    const wasPubliclyLive =
      story.status === StoryStatus.Approved &&
      (story.scheduledFor === null || story.scheduledFor <= new Date());
    if (
      role !== Role.Admin &&
      wasPubliclyLive &&
      scheduledFor &&
      new Date(scheduledFor) > new Date()
    ) {
      throw new BadRequestException(
        'Cannot schedule an already-published story back out of view'
      );
    }

    // Hoisted above any mutation below — used both to decide whether to
    // snapshot a revision (with the story's still-unmutated values) and,
    // further down, whether to reset status back to pending. scheduledFor is
    // deliberately excluded: changing only the publish schedule shouldn't
    // force a re-review the way editing title/content/etc. does.
    const contentChanged =
      tagIds !== undefined ||
      rest.title !== undefined ||
      rest.content !== undefined ||
      rest.coverImageUrl !== undefined ||
      rest.excerpt !== undefined ||
      rest.contentWarnings !== undefined;

    // Snapshot the pre-edit state before anything is mutated. Drafts are
    // exempt — nobody's edit history needs autosave churn, and a draft was
    // never in moderation to begin with.
    if (contentChanged && story.status !== StoryStatus.Draft) {
      await this.revisionsRepository.save(
        this.revisionsRepository.create({
          story,
          title: story.title,
          excerpt: story.excerpt,
          content: story.content,
          coverImageUrl: story.coverImageUrl,
          contentWarnings: story.contentWarnings.join(','),
          tagNames: story.tags.map((tag) => tag.name),
          statusBefore: story.status,
        })
      );
    }

    if (tagIds?.length) {
      story.tags = await this._getTagsIfExists(tagIds);
    }

    if (seriesTitle !== undefined) {
      if (seriesTitle === null) {
        story.series = null;
        story.seriesPosition = null;
      } else if (story.series?.title !== seriesTitle) {
        await this._assignSeries(story, story.author, seriesTitle);
      }
    }

    Object.assign(story, rest);

    if (scheduledFor !== undefined) {
      story.scheduledFor = scheduledFor ? new Date(scheduledFor) : null;
    }

    // A non-admin editing an already-moderated story sends it back to pending
    // so content changes can't bypass review — unless the site-wide approval
    // requirement is off, in which case it stays (or returns to) approved
    // instead, consistent with moderation being fully bypassed. Drafts stay
    // drafts — they were never in moderation.
    let justAutoApproved = false;
    if (
      contentChanged &&
      role !== Role.Admin &&
      story.status !== StoryStatus.Pending &&
      story.status !== StoryStatus.Draft
    ) {
      const requireApproval = await this.settingsService.requiresApproval();
      story.status = requireApproval
        ? StoryStatus.Pending
        : StoryStatus.Approved;
      story.isFlagged = false;
      justAutoApproved = !requireApproval;
    }

    const saved = await this.storiesRepository.save(story);

    if (justAutoApproved) {
      await this.usersService.markHasPublishedStory(story.author.id);
    }

    return saved;
  }

  // Owner-or-admin only — this is edit history, not public content. Newest
  // first, mirroring the report/comment list ordering conventions.
  async findRevisions(storyId: string, userId: string, role: Role) {
    await this._getStoryIfAuthorized(storyId, userId, role);

    return this.revisionsRepository.find({
      where: {story: {id: storyId}},
      order: {createdAt: 'DESC'},
    });
  }

  // Author action: move a private draft into the moderation queue
  async submitDraft(id: string, userId: string, role: Role) {
    const story = await this._getStoryIfAuthorized(id, userId, role);

    if (story.status !== StoryStatus.Draft) {
      throw new BadRequestException('Only drafts can be submitted for review');
    }

    await this._assertWithinPublishLimit(
      userId,
      story.author?.membershipTier ?? MembershipTier.Free
    );

    const requireApproval = await this.settingsService.requiresApproval();
    story.status = requireApproval ? StoryStatus.Pending : StoryStatus.Approved;

    const saved = await this.storiesRepository.save(story);

    if (saved.status === StoryStatus.Approved) {
      await this.usersService.markHasPublishedStory(story.author.id);
    }

    return saved;
  }

  async updateStatus(
    id: string,
    status: StoryStatus,
    rejectionReason?: string
  ) {
    const story = await this.findOne(id);
    const previousStatus = story.status;

    story.status = status;
    story.isFlagged = status === StoryStatus.Flagged;
    // Cleared on every transition except a reasoned rejection, so a later
    // re-approval/re-rejection never shows a stale explanation.
    story.rejectionReason =
      status === StoryStatus.Rejected ? (rejectionReason ?? null) : null;

    const updated = await this.storiesRepository.save(story);
    await this.analyticsEvents?.record(AnalyticsEventType.StoryStatusChanged, {
      storyId: id,
      metadata: {from: previousStatus, to: status},
    });

    // Latches the author's "ever published" flag the first time any of
    // their stories reaches approved — feeds auto-verification
    // (SessionAuthGuard) and survives this exact story being deleted later.
    if (status === StoryStatus.Approved) {
      await this.usersService.markHasPublishedStory(story.author.id);
    }

    return updated;
  }

  // Transitions several stories at once, in a single DB transaction — either
  // all of them move, or (an unknown id) none do. Mirrors updateStatus's own
  // status/isFlagged assignment, just batched; markHasPublishedStory is
  // deduped per author so bulk-approving several stories by the same author
  // only latches once.
  async bulkUpdateStatus(ids: string[], status: StoryStatus) {
    return this.storiesRepository.manager.transaction(async (manager) => {
      const repo = manager.withRepository(this.storiesRepository);
      const stories = await repo.find({
        where: {id: In(ids)},
        relations: ['author', 'tags', 'series'],
      });

      if (stories.length !== ids.length) {
        throw new NotFoundException('One or more stories not found');
      }

      for (const story of stories) {
        story.status = status;
        story.isFlagged = status === StoryStatus.Flagged;
        // Bulk never supplies a reason (see UpdateStoryStatusDto's single-
        // story-only requirement) — always clear it so a story previously
        // rejected-with-a-reason doesn't carry a stale one forward.
        story.rejectionReason = null;
      }
      await repo.save(stories);

      if (status === StoryStatus.Approved) {
        const authorIds = new Set(stories.map((story) => story.author.id));
        for (const authorId of authorIds) {
          await this.usersService.markHasPublishedStory(authorId);
        }
      }

      return stories;
    });
  }

  // A member flags a story for moderation. Gated to stories the reporter can
  // see (findOneVisible 404s non-approved ones for non-owners), and you can't
  // report your own. The unique (user, story) constraint blocks double-
  // reporting (mapped to 409); reportCount is recomputed from the rows so it
  // never drifts. Mirrors CommentsService.report — but a report only surfaces
  // the story for review, it does not change the public status.
  async report(
    storyId: string,
    userId: string,
    reason: StoryReportReason,
    details?: string,
    role?: Role
  ) {
    const story = await this.findOneVisible(storyId, userId, role);

    if (story.author?.id === userId) {
      throw new BadRequestException(`You cannot report your own story`);
    }

    const user = await this.usersService.findOne(userId);

    try {
      await this.reportsRepository.save(
        this.reportsRepository.create({
          story,
          user,
          reason,
          details: details ?? null,
        })
      );
    } catch (error) {
      handleQueryFailedError(error, 'report story');
    }

    const reportCount = await this.reportsRepository.countBy({
      story: {id: storyId},
    });
    await syncReportCount(this.storiesRepository, story, reportCount);
    return story;
  }

  // Admin dismisses the reports on a story (without changing its status): drop
  // the report rows and zero the count so it leaves the reported queue.
  async resolveReports(storyId: string) {
    const story = await this.findOne(storyId);

    await this.reportsRepository.delete({story: {id: storyId}});
    await syncReportCount(this.storiesRepository, story, 0);
    return story;
  }

  // Admin single-story detail (GET /admin/stories/:id): the story plus the
  // individual reports against it (reason, optional detail, and who filed it)
  // — the aggregate reportCount alone doesn't say why it was reported.
  async findOneWithReports(id: string) {
    const story = await this.findOne(id);

    story.reports = await this.reportsRepository.find({
      where: {story: {id}},
      relations: ['user'],
      order: {createdAt: 'DESC'},
    });

    return story;
  }

  async remove(id: string, userId: string, role: Role) {
    await this._getStoryIfAuthorized(id, userId, role);

    const result = await this.storiesRepository.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException(`Story with ID ${id} not found`);
    }
  }

  // Per-story lifetime totals for the author's own "Stats" tab — the
  // existing denormalized counters, no new query complexity. Capped rather
  // than paginated: a breakdown table this long would need pagination UI
  // before a limit here matters.
  async getAuthorStoryBreakdown(
    authorId: string
  ): Promise<
    Pick<
      Story,
      'id' | 'title' | 'viewCount' | 'likeCount' | 'commentCount' | 'createdAt'
    >[]
  > {
    return this.storiesRepository.find({
      where: {author: {id: authorId}, status: StoryStatus.Approved},
      select: {
        id: true,
        title: true,
        viewCount: true,
        likeCount: true,
        commentCount: true,
        createdAt: true,
      },
      order: {viewCount: 'DESC'},
      take: 50,
    });
  }

  // Day-bucketed views/likes/comments for one of the author's own stories,
  // for the "Stats" tab's per-story trend chart. Mirrors
  // AdminAnalyticsService.getOverview's zero-filled generate_series pattern,
  // but scoped to one story: views come from `analytics_event` (recorded on
  // every deduped public view, see recordView below), likes/comments come
  // straight from `story_like`/`comment`'s own createdAt — no new table, so
  // history only goes back as far as those rows already do. Ownership is
  // 404'd rather than 403'd, matching `_assertStoryVisible`'s existing
  // "don't leak existence" stance — this is a strictly-mine view, not a
  // public/admin one, so there's no role bypass either.
  async getStoryDailyStats(
    storyId: string,
    requesterId: string,
    // Validated to 7/30/90/180/365 by StoryStatsQueryDto at the controller
    // boundary — the wider windows are clamped back to 90 below unless the
    // requester is Patron+ and membership features are live.
    days: number
  ): Promise<{date: string; views: number; likes: number; comments: number}[]> {
    const story = await this.storiesRepository.findOne({
      where: {id: storyId},
      select: {id: true, author: {id: true, membershipTier: true}},
      relations: {author: true},
    });
    if (!story || story.author?.id !== requesterId) {
      throw new NotFoundException(`Story with ID ${storyId} not found`);
    }

    // Silently clamp rather than reject — mirrors how other toggle-gated
    // fields in this codebase degrade a stale/tampered client instead of
    // erroring.
    const hasExtendedInsights =
      story.author.membershipTier !== MembershipTier.Free &&
      (await this.settingsService.isMembershipFeaturesEnabled());
    const effectiveDays = hasExtendedInsights ? days : Math.min(days, 90);

    const end = new Date();
    const start = new Date(end.getTime() - (effectiveDays - 1) * 86_400_000);

    const rows = await this.storiesRepository.query<
      {date: string; views: string; likes: string; comments: string}[]
    >(
      `WITH days AS (
        SELECT generate_series($2::date, $3::date, interval '1 day')::date AS day
      ), events AS (
        SELECT "createdAt"::date AS day, COUNT(*)::int AS views, 0 AS likes, 0 AS comments
          FROM analytics_event
          WHERE type = $4 AND "storyId" = $1 AND "createdAt" >= $2 AND "createdAt" < $3 + interval '1 day'
          GROUP BY 1
        UNION ALL
        SELECT "createdAt"::date, 0, COUNT(*)::int, 0
          FROM story_like
          WHERE "storyId" = $1 AND "createdAt" >= $2 AND "createdAt" < $3 + interval '1 day'
          GROUP BY 1
        UNION ALL
        SELECT "createdAt"::date, 0, 0, COUNT(*)::int
          FROM comment
          WHERE "storyId" = $1 AND "createdAt" >= $2 AND "createdAt" < $3 + interval '1 day'
          GROUP BY 1
      )
      SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
        COALESCE(SUM(views), 0)::int AS views,
        COALESCE(SUM(likes), 0)::int AS likes,
        COALESCE(SUM(comments), 0)::int AS comments
      FROM days LEFT JOIN events ON events.day = days.day
      GROUP BY days.day ORDER BY days.day`,
      [storyId, start, end, AnalyticsEventType.StoryViewed]
    );

    return rows.map((row) => ({
      date: row.date,
      views: Number(row.views),
      likes: Number(row.likes),
      comments: Number(row.comments),
    }));
  }
}
