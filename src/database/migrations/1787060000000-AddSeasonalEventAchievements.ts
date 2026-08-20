import type {MigrationInterface, QueryRunner} from 'typeorm';

export class AddSeasonalEventAchievements1787060000000 implements MigrationInterface {
  name = 'AddSeasonalEventAchievements1787060000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.removeLegacyRewardLabel(queryRunner);
    await this.createCompletionLedger(queryRunner);
    await this.backfillCompletedEvents(queryRunner);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropCompletionLedger(queryRunner);
    await this.restoreLegacyRewardLabel(queryRunner);
  }

  private async removeLegacyRewardLabel(
    queryRunner: QueryRunner
  ): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "seasonal_event" DROP COLUMN "rewardLabel"`
    );
  }

  private async createCompletionLedger(
    queryRunner: QueryRunner
  ): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "seasonal_event_completion" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "eventId" uuid NOT NULL,
        "completedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_seasonal_event_completion" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_seasonal_event_completion_user_event" UNIQUE ("userId", "eventId"),
        CONSTRAINT "FK_seasonal_event_completion_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_seasonal_event_completion_event" FOREIGN KEY ("eventId") REFERENCES "seasonal_event"("id") ON DELETE CASCADE
      )
    `);
  }

  private async backfillCompletedEvents(
    queryRunner: QueryRunner
  ): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "seasonal_event_completion" ("id", "userId", "eventId", "completedAt")
      SELECT uuid_generate_v4(), progress."userId", event."id", MAX(progress."updatedAt")
      FROM "seasonal_event" event
      INNER JOIN "seasonal_event_tags" event_tag ON event_tag."eventId" = event."id"
      INNER JOIN "story_tags_tag" story_tag ON story_tag."tagId" = event_tag."tagId"
      INNER JOIN "reading_progress" progress ON progress."storyId" = story_tag."storyId"
      WHERE progress."percent" >= 95
        AND progress."updatedAt" >= event."startsAt"
        AND progress."updatedAt" < event."endsAt"
      GROUP BY progress."userId", event."id", event."goal"
      HAVING COUNT(DISTINCT progress."storyId") >= event."goal"
      ON CONFLICT ("userId", "eventId") DO NOTHING
    `);
  }

  private async dropCompletionLedger(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "seasonal_event_completion"`);
  }

  private async restoreLegacyRewardLabel(
    queryRunner: QueryRunner
  ): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "seasonal_event" ADD "rewardLabel" character varying(80)`
    );
  }
}
