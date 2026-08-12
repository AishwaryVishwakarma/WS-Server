import {MigrationInterface, QueryRunner} from 'typeorm';

export class AddAnalyticsEvents1786540000000 implements MigrationInterface {
  name = 'AddAnalyticsEvents1786540000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."analytics_event_type_enum" AS ENUM('story_viewed', 'story_status_changed')`
    );
    await queryRunner.query(
      `CREATE TABLE "analytics_event" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" "public"."analytics_event_type_enum" NOT NULL, "actorId" uuid, "storyId" uuid, "metadata" jsonb NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_analytics_event" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_event_type_createdAt" ON "analytics_event" ("type", "createdAt")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_event_story_createdAt" ON "analytics_event" ("storyId", "createdAt")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_createdAt" ON "user" ("createdAt") WHERE "deletedAt" IS NULL`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_story_createdAt" ON "story" ("createdAt")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_comment_createdAt" ON "comment" ("createdAt")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_story_like_createdAt" ON "story_like" ("createdAt")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bookmark_createdAt" ON "bookmark" ("createdAt")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_bookmark_createdAt"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_story_like_createdAt"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_comment_createdAt"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_story_createdAt"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_user_createdAt"`);
    await queryRunner.query(`DROP TABLE "analytics_event"`);
    await queryRunner.query(`DROP TYPE "public"."analytics_event_type_enum"`);
  }
}
