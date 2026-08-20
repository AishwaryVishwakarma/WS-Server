import type {MigrationInterface, QueryRunner} from 'typeorm';

// Closes a set of full-table-scan hot paths found by a complexity audit —
// each index here backs a query already documented at its call site (see
// the matching @Index decorators added to the affected entities in this
// same change).
export class AddPerformanceIndexes1787090000000 implements MigrationInterface {
  name = 'AddPerformanceIndexes1787090000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Comment thread reads (findAllByStoryId's replyCount map, findReplies,
    // the hide-cascade UPDATE) all filter/group on parentId; the createdAt
    // tail also serves findReplies' ORDER BY directly.
    await queryRunner.query(
      `CREATE INDEX "IDX_comment_parent_createdAt" ON "comment" ("parentId", "createdAt")`
    );

    // GET /users/me reads this on every request (PrivateUsersController's
    // countReferredUsers) — previously a full scan of "user".
    await queryRunner.query(
      `CREATE INDEX "IDX_user_referredById" ON "user" ("referredById") WHERE "referredById" IS NOT NULL`
    );

    // findAllByUserId (GET /users/me/comments) and the admin retention
    // cohort's correlated EXISTS both filter comment by userId; the
    // createdAt tail also serves both the activity ORDER BY and the
    // retention window predicate.
    await queryRunner.query(
      `CREATE INDEX "IDX_comment_user_createdAt" ON "comment" ("userId", "createdAt")`
    );

    // findApprovedBySeriesId/findAllBySeriesId/reorderSeries all filter by
    // seriesId and ORDER BY seriesPosition.
    await queryRunner.query(
      `CREATE INDEX "IDX_story_series_position" ON "story" ("seriesId", "seriesPosition")`
    );

    // The trending sort filters status='approved' then orders by
    // trendingScore (a stored generated column) — this was filesorting
    // every keyset page. Plain ascending (not DESC) deliberately, so this
    // matches the @Index entity metadata exactly and migration:generate
    // never proposes "fixing" a sort-order mismatch — Postgres can scan a
    // plain ascending B-tree backwards for the DESC ORDER BY just as
    // efficiently. IDX_story_status_createdAt still covers the recency-
    // window filter feeding into it.
    await queryRunner.query(
      `CREATE INDEX "IDX_story_trending" ON "story" ("status", "trendingScore", "id")`
    );

    // SeriesService.notifyScheduledParts polls this predicate every 60s;
    // a partial index matching it exactly stays tiny (rows leave it the
    // moment they're notified) instead of rescanning every approved story.
    await queryRunner.query(
      `CREATE INDEX "IDX_story_pending_series_notify" ON "story" ("scheduledFor") WHERE "seriesNotifiedAt" IS NULL AND "seriesId" IS NOT NULL AND "status" = 'approved'`
    );

    // getStoryDailyStats' like-count leg and computeAuthorStats' bookmark
    // join both filter by storyId; neither existing unique index on these
    // tables leads with that column.
    await queryRunner.query(
      `CREATE INDEX "IDX_story_like_story_createdAt" ON "story_like" ("storyId", "createdAt")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bookmark_story" ON "bookmark" ("storyId")`
    );

    // Redundant with UQ_story_like_user_story's own (user, story) prefix —
    // any query planner that would have used a userId-only index can just
    // as well use the unique constraint's index instead.
    await queryRunner.query(`DROP INDEX "IDX_story_like_user"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_story_like_user" ON "story_like" ("userId")`
    );
    await queryRunner.query(`DROP INDEX "IDX_bookmark_story"`);
    await queryRunner.query(`DROP INDEX "IDX_story_like_story_createdAt"`);
    await queryRunner.query(`DROP INDEX "IDX_story_pending_series_notify"`);
    await queryRunner.query(`DROP INDEX "IDX_story_trending"`);
    await queryRunner.query(`DROP INDEX "IDX_story_series_position"`);
    await queryRunner.query(`DROP INDEX "IDX_comment_user_createdAt"`);
    await queryRunner.query(`DROP INDEX "IDX_user_referredById"`);
    await queryRunner.query(`DROP INDEX "IDX_comment_parent_createdAt"`);
  }
}
