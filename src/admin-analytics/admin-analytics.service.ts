import {Injectable, Optional} from '@nestjs/common';
import {DataSource} from 'typeorm';
import {AnalyticsCacheService} from './analytics-cache.service';

type CountRow = Record<string, string>;
export interface AnalyticsRange {
  days: number;
  start?: Date;
  end?: Date;
  status?: string;
  authorId?: string;
  tag?: string;
}
interface CsvOverview {
  range: {start: string; end: string};
  metrics: Record<
    'users' | 'stories' | 'comments' | 'likes' | 'bookmarks',
    {total: number; current: number}
  > & {
    publishedStories: number;
    views: number;
  };
  moderation: {
    pendingStories: number;
    pendingOver24Hours: number;
    pendingOver72Hours: number;
    reportedStories: number;
    reportedComments: number;
    reportedUsers: number;
  };
}
@Injectable()
export class AdminAnalyticsService {
  constructor(
    private readonly dataSource: DataSource,
    @Optional() private readonly cache?: AnalyticsCacheService
  ) {}

  async getOverview(range: AnalyticsRange) {
    const rangeDays = range.days;
    const endDay = range.end ?? new Date();
    const endExclusive = new Date(
      Date.UTC(
        endDay.getUTCFullYear(),
        endDay.getUTCMonth(),
        endDay.getUTCDate() + 1
      )
    );
    const currentStart =
      range.start ?? new Date(endExclusive.getTime() - rangeDays * 86_400_000);
    const previousStart = new Date(
      currentStart.getTime() - rangeDays * 86_400_000
    );
    const rankingFilters = [
      range.status ?? 'approved',
      range.authorId ?? null,
      range.tag ?? null,
    ];
    const cacheKey = `overview:${currentStart.toISOString()}:${endExclusive.toISOString()}:${rankingFilters.join(':')}`;
    // The concrete response shape is inferred from `value` below. `never`
    // prevents the generic cache transport from widening this method to `{}`.
    const cached = await this.cache?.get<never>(cacheKey);
    if (cached) return cached;

    const [totalsRows, periodRows, trendRows, topStoryRows, topAuthorRows] =
      await Promise.all([
        this.dataSource.query<CountRow[]>(`
          SELECT
            (SELECT COUNT(*) FROM "user" WHERE "deletedAt" IS NULL) AS "users",
            (SELECT COUNT(*) FROM story) AS "stories",
            (SELECT COUNT(*) FROM story WHERE status = 'approved') AS "publishedStories",
            (SELECT COALESCE(SUM("viewCount"), 0) FROM story WHERE status = 'approved') AS "views",
            (SELECT COUNT(*) FROM story_like) AS "likes",
            (SELECT COUNT(*) FROM comment) AS "comments",
            (SELECT COUNT(*) FROM bookmark) AS "bookmarks",
            (SELECT COUNT(*) FROM story WHERE status = 'pending') AS "pendingStories",
            (SELECT COUNT(*) FROM story WHERE status = 'pending' AND "updatedAt" < now() - interval '24 hours') AS "pendingOver24Hours",
            (SELECT COUNT(*) FROM story WHERE status = 'pending' AND "updatedAt" < now() - interval '72 hours') AS "pendingOver72Hours",
            (SELECT COUNT(*) FROM story WHERE status = 'flagged' OR "reportCount" > 0) AS "reportedStories",
            (SELECT COUNT(*) FROM comment WHERE "isFlagged" = true OR "reportCount" > 0) AS "reportedComments",
            (SELECT COUNT(*) FROM "user" WHERE "deletedAt" IS NULL AND "reportCount" > 0) AS "reportedUsers"
        `),
        this.dataSource.query<CountRow[]>(
          `SELECT
            (SELECT COUNT(*) FROM "user" WHERE "deletedAt" IS NULL AND "createdAt" >= $1 AND "createdAt" < $3) AS "usersCurrent",
            (SELECT COUNT(*) FROM "user" WHERE "deletedAt" IS NULL AND "createdAt" >= $2 AND "createdAt" < $1) AS "usersPrevious",
            (SELECT COUNT(*) FROM story WHERE "createdAt" >= $1 AND "createdAt" < $3) AS "storiesCurrent",
            (SELECT COUNT(*) FROM story WHERE "createdAt" >= $2 AND "createdAt" < $1) AS "storiesPrevious",
            (SELECT COUNT(*) FROM comment WHERE "createdAt" >= $1 AND "createdAt" < $3) AS "commentsCurrent",
            (SELECT COUNT(*) FROM comment WHERE "createdAt" >= $2 AND "createdAt" < $1) AS "commentsPrevious",
            (SELECT COUNT(*) FROM story_like WHERE "createdAt" >= $1 AND "createdAt" < $3) AS "likesCurrent",
            (SELECT COUNT(*) FROM story_like WHERE "createdAt" >= $2 AND "createdAt" < $1) AS "likesPrevious",
            (SELECT COUNT(*) FROM bookmark WHERE "createdAt" >= $1 AND "createdAt" < $3) AS "bookmarksCurrent",
            (SELECT COUNT(*) FROM bookmark WHERE "createdAt" >= $2 AND "createdAt" < $1) AS "bookmarksPrevious"`,
          [currentStart, previousStart, endExclusive]
        ),
        this.dataSource.query<CountRow[]>(
          `WITH days AS (
            SELECT generate_series($1::date, $2::date, interval '1 day')::date AS day
          ), events AS (
            SELECT "createdAt"::date AS day, COUNT(*)::int AS users, 0 AS stories, 0 AS comments, 0 AS likes, 0 AS bookmarks
              FROM "user" WHERE "deletedAt" IS NULL AND "createdAt" >= $1 AND "createdAt" < $3 GROUP BY 1
            UNION ALL SELECT "createdAt"::date, 0, COUNT(*)::int, 0, 0, 0 FROM story WHERE "createdAt" >= $1 AND "createdAt" < $3 GROUP BY 1
            UNION ALL SELECT "createdAt"::date, 0, 0, COUNT(*)::int, 0, 0 FROM comment WHERE "createdAt" >= $1 AND "createdAt" < $3 GROUP BY 1
            UNION ALL SELECT "createdAt"::date, 0, 0, 0, COUNT(*)::int, 0 FROM story_like WHERE "createdAt" >= $1 AND "createdAt" < $3 GROUP BY 1
            UNION ALL SELECT "createdAt"::date, 0, 0, 0, 0, COUNT(*)::int FROM bookmark WHERE "createdAt" >= $1 AND "createdAt" < $3 GROUP BY 1
          )
          SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
            COALESCE(SUM(users), 0)::int AS users, COALESCE(SUM(stories), 0)::int AS stories,
            COALESCE(SUM(comments), 0)::int AS comments, COALESCE(SUM(likes), 0)::int AS likes,
            COALESCE(SUM(bookmarks), 0)::int AS bookmarks
          FROM days LEFT JOIN events ON events.day = days.day GROUP BY days.day ORDER BY days.day`,
          [
            currentStart,
            new Date(endExclusive.getTime() - 86_400_000),
            endExclusive,
          ]
        ),
        this.dataSource.query<CountRow[]>(
          `
          SELECT s.id, s.title, s.slug, s."viewCount"::int AS views, s."likeCount"::int AS likes,
            s."commentCount"::int AS comments, u.id AS "authorId", u.name AS author
          FROM story s JOIN "user" u ON u.id = s."authorId"
          WHERE s.status::text = $1
            AND ($2::uuid IS NULL OR s."authorId" = $2)
            AND ($3::text IS NULL OR EXISTS (SELECT 1 FROM story_tags_tag st JOIN tag t ON t.id = st."tagId" WHERE st."storyId" = s.id AND t.slug = $3))
          ORDER BY (s."viewCount" + s."likeCount" * 3 + s."commentCount" * 4) DESC, s.id
          LIMIT 5
        `,
          rankingFilters
        ),
        this.dataSource.query<CountRow[]>(
          `
          SELECT u.id, u.name, u.slug, COUNT(s.id)::int AS stories,
            COALESCE(SUM(s."viewCount"), 0)::int AS views,
            COALESCE(SUM(s."likeCount"), 0)::int AS likes
          FROM "user" u JOIN story s ON s."authorId" = u.id AND s.status::text = $1
          WHERE u."deletedAt" IS NULL AND ($2::uuid IS NULL OR u.id = $2)
            AND ($3::text IS NULL OR EXISTS (SELECT 1 FROM story_tags_tag st JOIN tag t ON t.id = st."tagId" WHERE st."storyId" = s.id AND t.slug = $3))
          GROUP BY u.id, u.name, u.slug
          ORDER BY (COALESCE(SUM(s."viewCount"), 0) + COALESCE(SUM(s."likeCount"), 0) * 3) DESC, u.id
          LIMIT 5
        `,
          rankingFilters
        ),
      ]);

    const [insights = {}] = await this.dataSource.query<CountRow[]>(
      `SELECT
        (SELECT COUNT(*) FROM analytics_event WHERE type = 'story_viewed' AND "createdAt" >= $1 AND "createdAt" < $2) AS "periodViews",
        (SELECT COUNT(*) FROM analytics_event WHERE type = 'story_status_changed' AND "createdAt" >= $1 AND "createdAt" < $2) AS "moderationDecisions",
        (SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (e."createdAt" - s."createdAt")) / 3600), 0)
          FROM analytics_event e JOIN story s ON s.id = e."storyId"
          WHERE e.type = 'story_status_changed' AND e.metadata->>'to' IN ('approved', 'rejected')
            AND e."createdAt" >= $1 AND e."createdAt" < $2) AS "averageReviewHours",
        (SELECT COALESCE(MAX(EXTRACT(EPOCH FROM (now() - "updatedAt")) / 3600), 0) FROM story WHERE status = 'pending') AS "oldestPendingHours",
        (SELECT COUNT(*) FROM "user" u WHERE u."deletedAt" IS NULL AND u."createdAt" >= $1 AND u."createdAt" < $2) AS "cohortUsers",
        (SELECT COUNT(*) FROM "user" u WHERE u."deletedAt" IS NULL AND u."createdAt" >= $1 AND u."createdAt" < $2 AND EXISTS (
          SELECT 1 FROM comment c WHERE c."userId" = u.id AND c."createdAt" > u."createdAt" AND c."createdAt" <= u."createdAt" + interval '7 days'
          UNION ALL SELECT 1 FROM story_like l WHERE l."userId" = u.id AND l."createdAt" > u."createdAt" AND l."createdAt" <= u."createdAt" + interval '7 days'
          UNION ALL SELECT 1 FROM bookmark b WHERE b."userId" = u.id AND b."createdAt" > u."createdAt" AND b."createdAt" <= u."createdAt" + interval '7 days'
        )) AS "retained7",
        (SELECT COUNT(*) FROM "user" u WHERE u."deletedAt" IS NULL AND u."createdAt" >= $1 AND u."createdAt" < $2 AND EXISTS (
          SELECT 1 FROM comment c WHERE c."userId" = u.id AND c."createdAt" > u."createdAt" AND c."createdAt" <= u."createdAt" + interval '30 days'
          UNION ALL SELECT 1 FROM story_like l WHERE l."userId" = u.id AND l."createdAt" > u."createdAt" AND l."createdAt" <= u."createdAt" + interval '30 days'
          UNION ALL SELECT 1 FROM bookmark b WHERE b."userId" = u.id AND b."createdAt" > u."createdAt" AND b."createdAt" <= u."createdAt" + interval '30 days'
        )) AS "retained30"`,
      [currentStart, endExclusive]
    );

    const totals = totalsRows[0];
    const periods = periodRows[0];
    const metric = (key: string) => ({
      total: Number(totals[key]),
      current: Number(periods[`${key}Current`]),
      previous: Number(periods[`${key}Previous`]),
    });
    const value = {
      rangeDays,
      range: {
        start: currentStart.toISOString(),
        end: new Date(endExclusive.getTime() - 1).toISOString(),
      },
      generatedAt: new Date().toISOString(),
      metrics: {
        users: metric('users'),
        stories: metric('stories'),
        comments: metric('comments'),
        likes: metric('likes'),
        bookmarks: metric('bookmarks'),
        publishedStories: Number(totals.publishedStories),
        views: Number(totals.views),
      },
      moderation: {
        pendingStories: Number(totals.pendingStories),
        pendingOver24Hours: Number(totals.pendingOver24Hours),
        pendingOver72Hours: Number(totals.pendingOver72Hours),
        reportedStories: Number(totals.reportedStories),
        reportedComments: Number(totals.reportedComments),
        reportedUsers: Number(totals.reportedUsers),
        decisions: Number(insights.moderationDecisions ?? 0),
        averageReviewHours: Number(insights.averageReviewHours ?? 0),
        oldestPendingHours: Number(insights.oldestPendingHours ?? 0),
      },
      retention: {
        cohortUsers: Number(insights.cohortUsers ?? 0),
        retained7: Number(insights.retained7 ?? 0),
        retained30: Number(insights.retained30 ?? 0),
      },
      periodViews: Number(insights.periodViews ?? 0),
      trends: trendRows.map((row: CountRow) => ({
        date: row.date,
        users: Number(row.users),
        stories: Number(row.stories),
        comments: Number(row.comments),
        likes: Number(row.likes),
        bookmarks: Number(row.bookmarks),
      })),
      topStories: topStoryRows.map((row: CountRow) => ({
        ...row,
        views: Number(row.views),
        likes: Number(row.likes),
        comments: Number(row.comments),
      })),
      topAuthors: topAuthorRows.map((row: CountRow) => ({
        ...row,
        stories: Number(row.stories),
        views: Number(row.views),
        likes: Number(row.likes),
      })),
    };
    await this.cache?.set(cacheKey, value);
    return value;
  }

  toCsv(value: CsvOverview): string {
    const rows: Array<[string, string | number]> = [
      ['Metric', 'Value'],
      ['Range start', value.range.start],
      ['Range end', value.range.end],
      ['Members', value.metrics.users.total],
      ['New members', value.metrics.users.current],
      ['Stories', value.metrics.stories.total],
      ['New stories', value.metrics.stories.current],
      ['Comments', value.metrics.comments.total],
      ['Likes', value.metrics.likes.total],
      ['Bookmarks', value.metrics.bookmarks.total],
      ['Published stories', value.metrics.publishedStories],
      ['Story views', value.metrics.views],
      ['Pending stories', value.moderation.pendingStories],
      ['Pending over 24 hours', value.moderation.pendingOver24Hours],
      ['Pending over 72 hours', value.moderation.pendingOver72Hours],
      ['Reported stories', value.moderation.reportedStories],
      ['Reported comments', value.moderation.reportedComments],
      ['Reported members', value.moderation.reportedUsers],
    ];
    return rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')
      )
      .join('\n');
  }
}
