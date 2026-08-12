import {Injectable} from '@nestjs/common';
import {DataSource} from 'typeorm';

type CountRow = Record<string, string>;
type CacheEntry = {expiresAt: number; value: unknown};

const CACHE_TTL_MS = 60_000;

@Injectable()
export class AdminAnalyticsService {
  private readonly cache = new Map<number, CacheEntry>();

  constructor(private readonly dataSource: DataSource) {}

  async getOverview(rangeDays: number) {
    const cached = this.cache.get(rangeDays);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

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
            (SELECT COUNT(*) FROM story WHERE status = 'flagged' OR "reportCount" > 0) AS "reportedStories",
            (SELECT COUNT(*) FROM comment WHERE "isFlagged" = true OR "reportCount" > 0) AS "reportedComments",
            (SELECT COUNT(*) FROM "user" WHERE "deletedAt" IS NULL AND "reportCount" > 0) AS "reportedUsers"
        `),
        this.dataSource.query<CountRow[]>(
          `SELECT
            (SELECT COUNT(*) FROM "user" WHERE "deletedAt" IS NULL AND "createdAt" >= $1) AS "usersCurrent",
            (SELECT COUNT(*) FROM "user" WHERE "deletedAt" IS NULL AND "createdAt" >= $2 AND "createdAt" < $1) AS "usersPrevious",
            (SELECT COUNT(*) FROM story WHERE "createdAt" >= $1) AS "storiesCurrent",
            (SELECT COUNT(*) FROM story WHERE "createdAt" >= $2 AND "createdAt" < $1) AS "storiesPrevious",
            (SELECT COUNT(*) FROM comment WHERE "createdAt" >= $1) AS "commentsCurrent",
            (SELECT COUNT(*) FROM comment WHERE "createdAt" >= $2 AND "createdAt" < $1) AS "commentsPrevious",
            (SELECT COUNT(*) FROM story_like WHERE "createdAt" >= $1) AS "likesCurrent",
            (SELECT COUNT(*) FROM story_like WHERE "createdAt" >= $2 AND "createdAt" < $1) AS "likesPrevious",
            (SELECT COUNT(*) FROM bookmark WHERE "createdAt" >= $1) AS "bookmarksCurrent",
            (SELECT COUNT(*) FROM bookmark WHERE "createdAt" >= $2 AND "createdAt" < $1) AS "bookmarksPrevious"`,
          [
            new Date(Date.now() - rangeDays * 86_400_000),
            new Date(Date.now() - rangeDays * 2 * 86_400_000),
          ]
        ),
        this.dataSource.query<CountRow[]>(
          `WITH days AS (
            SELECT generate_series(current_date - ($1::int - 1), current_date, interval '1 day')::date AS day
          ), events AS (
            SELECT "createdAt"::date AS day, COUNT(*)::int AS users, 0 AS stories, 0 AS comments, 0 AS likes, 0 AS bookmarks
              FROM "user" WHERE "deletedAt" IS NULL AND "createdAt" >= current_date - ($1::int - 1) GROUP BY 1
            UNION ALL SELECT "createdAt"::date, 0, COUNT(*)::int, 0, 0, 0 FROM story WHERE "createdAt" >= current_date - ($1::int - 1) GROUP BY 1
            UNION ALL SELECT "createdAt"::date, 0, 0, COUNT(*)::int, 0, 0 FROM comment WHERE "createdAt" >= current_date - ($1::int - 1) GROUP BY 1
            UNION ALL SELECT "createdAt"::date, 0, 0, 0, COUNT(*)::int, 0 FROM story_like WHERE "createdAt" >= current_date - ($1::int - 1) GROUP BY 1
            UNION ALL SELECT "createdAt"::date, 0, 0, 0, 0, COUNT(*)::int FROM bookmark WHERE "createdAt" >= current_date - ($1::int - 1) GROUP BY 1
          )
          SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
            COALESCE(SUM(users), 0)::int AS users, COALESCE(SUM(stories), 0)::int AS stories,
            COALESCE(SUM(comments), 0)::int AS comments, COALESCE(SUM(likes), 0)::int AS likes,
            COALESCE(SUM(bookmarks), 0)::int AS bookmarks
          FROM days LEFT JOIN events ON events.day = days.day GROUP BY days.day ORDER BY days.day`,
          [rangeDays]
        ),
        this.dataSource.query<CountRow[]>(`
          SELECT s.id, s.title, s."viewCount"::int AS views, s."likeCount"::int AS likes,
            s."commentCount"::int AS comments, u.id AS "authorId", u.name AS author
          FROM story s JOIN "user" u ON u.id = s."authorId"
          WHERE s.status = 'approved'
          ORDER BY (s."viewCount" + s."likeCount" * 3 + s."commentCount" * 4) DESC, s.id
          LIMIT 5
        `),
        this.dataSource.query<CountRow[]>(`
          SELECT u.id, u.name, COUNT(s.id)::int AS stories,
            COALESCE(SUM(s."viewCount"), 0)::int AS views,
            COALESCE(SUM(s."likeCount"), 0)::int AS likes
          FROM "user" u JOIN story s ON s."authorId" = u.id AND s.status = 'approved'
          WHERE u."deletedAt" IS NULL
          GROUP BY u.id, u.name
          ORDER BY (COALESCE(SUM(s."viewCount"), 0) + COALESCE(SUM(s."likeCount"), 0) * 3) DESC, u.id
          LIMIT 5
        `),
      ]);

    const totals = totalsRows[0];
    const periods = periodRows[0];
    const metric = (key: string) => ({
      total: Number(totals[key]),
      current: Number(periods[`${key}Current`]),
      previous: Number(periods[`${key}Previous`]),
    });
    const value = {
      rangeDays,
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
        reportedStories: Number(totals.reportedStories),
        reportedComments: Number(totals.reportedComments),
        reportedUsers: Number(totals.reportedUsers),
      },
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
    this.cache.set(rangeDays, {expiresAt: Date.now() + CACHE_TTL_MS, value});
    return value;
  }
}
