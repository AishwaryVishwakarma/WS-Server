import type {MigrationInterface, QueryRunner} from 'typeorm';

export class AddRetentionFeatures1786970000000 implements MigrationInterface {
  name = 'AddRetentionFeatures1786970000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "story" ADD "discussionPrompt" character varying(180)`
    );
    await queryRunner.query(
      `ALTER TABLE "story" ADD "seriesNotifiedAt" TIMESTAMP`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "weeklyReadingGoal" smallint NOT NULL DEFAULT 3`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD CONSTRAINT "CHK_user_weeklyReadingGoal" CHECK ("weeklyReadingGoal" >= 1 AND "weeklyReadingGoal" <= 14)`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "notificationInAppTypes" SET DEFAULT 'reply,comment,follow,like,series'`
    );
    await queryRunner.query(`
      UPDATE "user"
      SET "notificationInAppTypes" = CONCAT("notificationInAppTypes", ',series')
      WHERE NOT ('series' = ANY(string_to_array("notificationInAppTypes", ',')))
    `);
    await queryRunner.query(`
      CREATE TABLE "series_subscription" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "seriesId" uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_series_subscription" PRIMARY KEY ("id"),
        CONSTRAINT "IDX_series_subscription_user_series" UNIQUE ("userId", "seriesId"),
        CONSTRAINT "FK_series_subscription_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_series_subscription_series" FOREIGN KEY ("seriesId") REFERENCES "series"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_series_subscription_series" ON "series_subscription" ("seriesId")`
    );
    await queryRunner.query(`
      CREATE TABLE "recommendation_feedback" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "storyId" uuid NOT NULL,
        "action" character varying(20) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_recommendation_feedback" PRIMARY KEY ("id"),
        CONSTRAINT "IDX_recommendation_feedback_user_story" UNIQUE ("userId", "storyId"),
        CONSTRAINT "CHK_recommendation_feedback_action" CHECK ("action" IN ('more_like_this', 'not_for_me')),
        CONSTRAINT "FK_recommendation_feedback_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_recommendation_feedback_story" FOREIGN KEY ("storyId") REFERENCES "story"("id") ON DELETE CASCADE
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "story" DROP COLUMN "discussionPrompt"`
    );
    await queryRunner.query(
      `ALTER TABLE "story" DROP COLUMN "seriesNotifiedAt"`
    );
    await queryRunner.query(`DROP TABLE "recommendation_feedback"`);
    await queryRunner.query(`DROP TABLE "series_subscription"`);
    await queryRunner.query(
      `ALTER TABLE "user" DROP CONSTRAINT "CHK_user_weeklyReadingGoal"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "weeklyReadingGoal"`
    );
    await queryRunner.query(`
      UPDATE "user"
      SET "notificationInAppTypes" = array_to_string(
        array_remove(string_to_array("notificationInAppTypes", ','), 'series'),
        ','
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "notificationInAppTypes" SET DEFAULT 'reply,comment,follow,like'`
    );
  }
}
