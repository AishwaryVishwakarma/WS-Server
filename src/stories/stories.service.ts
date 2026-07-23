import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {CreateStoryDto} from './dto/create-story.dto';
import {UpdateStoryDto} from './dto/update-story.dto';
import {InjectRepository} from '@nestjs/typeorm';
import {Story} from './entities/story.entity';
import {StoryReport} from './entities/story-report.entity';
import {
  In,
  Like,
  MoreThan,
  Not,
  Repository,
  type FindOptionsWhere,
  type SelectQueryBuilder,
} from 'typeorm';
import {getPaginatedResponse, paginate} from 'src/utils/pagination';
import {TagsService} from 'src/tags/tags.service';
import {Role} from 'src/users/enums/role';
import {UsersService} from 'src/users/users.service';
import {StoryStatus} from './enums/story-status.enum';
import {handleQueryFailedError} from 'src/utils/handle-query-error';
import type {StorySortOption} from './dto/story-query.dto';
import {
  decodeStoryCursor,
  encodeStoryCursor,
  type DecodedCursor,
} from './story-cursor';

interface StoryFilters {
  tag?: string;
  search?: string;
  scareLevel?: number;
  sort?: StorySortOption;
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

// Free accounts can have up to this many stories in the publication pipeline
// (submitted, live, or flagged) at once. Drafts and rejected stories don't
// count, so authors can keep working — the cap is on how much they push to the
// keepers, both a fair-use limit and basic spam protection.
export const FREE_PUBLISH_LIMIT = 10;

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
  isFlagged: true,
  status: true,
  excerpt: true,
  wordCount: true,
  commentCount: true,
  viewCount: true,
  likeCount: true,
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
    private readonly usersService: UsersService,
    private readonly tagsService: TagsService
  ) {}

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
  private async _assertWithinPublishLimit(userId: string) {
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

  async create(
    createStoryDto: CreateStoryDto,
    userId: string,
    // Trusted callers (the seed) opt out of the user-facing publish limit so
    // demo/pagination data can exceed it.
    {enforcePublishLimit = true}: {enforcePublishLimit?: boolean} = {}
  ) {
    const {tags: tagIds, excerpt, draft, ...rest} = createStoryDto;

    // Submitting straight to review counts against the publish limit; saving a
    // private draft does not.
    if (!draft && enforcePublishLimit) {
      await this._assertWithinPublishLimit(userId);
    }

    const author = await this.usersService.findOne(userId);

    const story = this.storiesRepository.create({
      ...rest,
      excerpt: excerpt || rest.content.slice(0, 280) + '...',
      status: draft ? StoryStatus.Draft : StoryStatus.Pending,
      author,
    });

    if (tagIds?.length) {
      story.tags = await this._getTagsIfExists(tagIds);
    }

    return this.storiesRepository.save(story);
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
      const like = Like(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
      where = [
        {...base, title: like},
        {...base, excerpt: like},
      ];
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
      const like = Like(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
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

  async findOne(id: string) {
    return await this.storiesRepository
      .findOneOrFail({
        where: {id},
        relations: ['author', 'tags'],
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

    const isOwner = userId !== undefined && story.author?.id === userId;

    if (
      story.status !== StoryStatus.Approved &&
      !isOwner &&
      role !== Role.Admin
    ) {
      throw new NotFoundException(`Story with ID ${id} not found`);
    }

    return story;
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
    const {tag, search, scareLevel, sort} = filters;

    const qb = this.storiesRepository
      .createQueryBuilder('story')
      .select(Object.keys(SELECTED_FIELDS).map((field) => `story.${field}`))
      .leftJoinAndSelect('story.author', 'author')
      .leftJoinAndSelect('story.tags', 'tags')
      .where('story.status = :status', {status: StoryStatus.Approved})
      // Same rationale as findOne: keep stories by soft-deleted authors.
      .withDeleted();

    const countColumn = sort ? COUNT_SORT_COLUMN[sort] : undefined;
    if (countColumn) {
      qb.orderBy(`story.${countColumn}`, 'DESC').addOrderBy('story.id', 'DESC');
    } else {
      const direction = sort === 'oldest' ? 'ASC' : 'DESC';
      qb.orderBy('story.createdAt', direction).addOrderBy('story.id', direction);
    }

    if (tag) {
      // Second join purely as a filter — `tags` above still loads the story's
      // full tag list, not just the matched one.
      qb.innerJoin('story.tags', 'tagFilter', 'tagFilter.slug = :tagSlug', {
        tagSlug: tag,
      });
    }

    if (search) {
      const escaped = search.replace(/[\\%_]/g, '\\$&');
      qb.andWhere('(story.title LIKE :search OR story.excerpt LIKE :search)', {
        search: `%${escaped}%`,
      });
    }

    if (scareLevel) {
      qb.andWhere('story.scareLevel = :scareLevel', {scareLevel});
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

    // createdAt is datetime(6), but a JS Date carries only milliseconds — so
    // reading it off the entity would drop the microsecond tail and let the
    // boundary row reappear on the next page. Pull it at full precision as a
    // string for the cursor. It's in the SELECT only, never the WHERE, so the
    // (status, createdAt) index still drives the keyset seek.
    qb.addSelect(
      "DATE_FORMAT(story.createdAt, '%Y-%m-%d %H:%i:%s.%f')",
      'story_created_raw'
    );

    const decoded = cursor ? decodeStoryCursor(cursor) : null;
    if (decoded) {
      this._applyKeyset(qb, sort, decoded);
    }

    const {entities, raw} = await qb.take(limit).getRawAndEntities();
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
      // Narrow projection — never load the mediumtext content on a view ping.
      select: {id: true, status: true, viewCount: true, author: {id: true}},
      relations: {author: true},
    });

    if (!story) {
      throw new NotFoundException(`Story with ID ${storyId} not found`);
    }

    const alreadyViewed = session.viewedStoryIds?.includes(storyId) ?? false;
    const isAuthor = viewerId != null && viewerId === story.author?.id;

    if (story.status !== StoryStatus.Approved || isAuthor || alreadyViewed) {
      return {counted: false, viewCount: story.viewCount};
    }

    await this.storiesRepository.increment({id: storyId}, 'viewCount', 1);
    session.viewedStoryIds = [
      ...(session.viewedStoryIds ?? []),
      storyId,
    ].slice(-MAX_TRACKED_VIEWS);

    return {counted: true, viewCount: story.viewCount + 1};
  }

  // The sort key for the last row, as a string: the full-precision createdAt
  // (from the raw projection) or the commentCount.
  private _cursorKey(
    sort: StorySortOption,
    last: Story,
    raw: Record<string, unknown>[]
  ): string {
    const countColumn = COUNT_SORT_COLUMN[sort];
    if (countColumn) {
      return String(last[countColumn]);
    }
    // Joins fan the raw rows out per tag, so match on the root id rather than
    // trusting positional alignment with `entities`.
    const row = raw.find((r) => r.story_id === last.id);
    return String(row?.story_created_raw ?? last.createdAt.toISOString());
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
    const column = countColumn ? `story.${countColumn}` : 'story.createdAt';
    // A counter compares as a number; createdAt as the datetime(6) string
    // MySQL parses back to full precision.
    const key = countColumn ? Number(cursor.k) : cursor.k;

    qb.andWhere(
      `(${column} ${cmp} :ck OR (${column} = :ck AND story.id ${cmp} :cid))`,
      {ck: key, cid: cursor.id}
    );
  }

  async update(
    id: string,
    updateStoryDto: UpdateStoryDto,
    userId: string,
    role: Role
  ) {
    const story = await this._getStoryIfAuthorized(id, userId, role);

    const {tags: tagIds, ...rest} = updateStoryDto;
    // `draft` only applies at creation; submission goes through submitDraft
    delete rest.draft;

    if (tagIds?.length) {
      story.tags = await this._getTagsIfExists(tagIds);
    }

    Object.assign(story, rest);

    // A non-admin editing an already-moderated story sends it back to pending
    // so content changes can't bypass review. Drafts stay drafts — they were
    // never in moderation.
    const contentChanged =
      tagIds !== undefined ||
      rest.title !== undefined ||
      rest.content !== undefined ||
      rest.coverImageUrl !== undefined ||
      rest.excerpt !== undefined;

    if (
      contentChanged &&
      role !== Role.Admin &&
      story.status !== StoryStatus.Pending &&
      story.status !== StoryStatus.Draft
    ) {
      story.status = StoryStatus.Pending;
      story.isFlagged = false;
    }

    return await this.storiesRepository.save(story);
  }

  // Author action: move a private draft into the moderation queue
  async submitDraft(id: string, userId: string, role: Role) {
    const story = await this._getStoryIfAuthorized(id, userId, role);

    if (story.status !== StoryStatus.Draft) {
      throw new BadRequestException('Only drafts can be submitted for review');
    }

    await this._assertWithinPublishLimit(userId);

    story.status = StoryStatus.Pending;

    return await this.storiesRepository.save(story);
  }

  async updateStatus(id: string, status: StoryStatus) {
    const story = await this.findOne(id);

    story.status = status;
    story.isFlagged = status === StoryStatus.Flagged;

    return await this.storiesRepository.save(story);
  }

  // A member flags a story for moderation. Gated to stories the reporter can
  // see (findOneVisible 404s non-approved ones for non-owners), and you can't
  // report your own. The unique (user, story) constraint blocks double-
  // reporting (mapped to 409); reportCount is recomputed from the rows so it
  // never drifts. Mirrors CommentsService.report — but a report only surfaces
  // the story for review, it does not change the public status.
  async report(storyId: string, userId: string, role?: Role) {
    const story = await this.findOneVisible(storyId, userId, role);

    if (story.author?.id === userId) {
      throw new BadRequestException(`You cannot report your own story`);
    }

    const user = await this.usersService.findOne(userId);

    try {
      await this.reportsRepository.save(
        this.reportsRepository.create({story, user})
      );
    } catch (error) {
      handleQueryFailedError(error, 'report story');
    }

    const reportCount = await this.reportsRepository.countBy({
      story: {id: storyId},
    });

    // A report is moderation metadata, not a content edit — carry the existing
    // updatedAt through the targeted update so it stays untouched (TypeORM only
    // auto-bumps the update-date column when it isn't among the set columns).
    await this.storiesRepository.update(storyId, {
      reportCount,
      updatedAt: story.updatedAt,
    });

    story.reportCount = reportCount;
    return story;
  }

  // Admin dismisses the reports on a story (without changing its status): drop
  // the report rows and zero the count so it leaves the reported queue.
  async resolveReports(storyId: string) {
    const story = await this.findOne(storyId);

    await this.reportsRepository.delete({story: {id: storyId}});

    // Same as report(): clearing reports is not an edit, so preserve updatedAt.
    await this.storiesRepository.update(storyId, {
      reportCount: 0,
      updatedAt: story.updatedAt,
    });

    story.reportCount = 0;
    return story;
  }

  async remove(id: string, userId: string, role: Role) {
    await this._getStoryIfAuthorized(id, userId, role);

    const result = await this.storiesRepository.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException(`Story with ID ${id} not found`);
    }
  }
}
