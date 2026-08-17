import {MigrationInterface, QueryRunner} from 'typeorm';

// Best-effort backfill: notification rows are point-in-time snapshots (see
// the entity), so a row whose story/actor was since deleted just keeps a
// null slug — same as actorId/storyId already going stale for those rows.
export class AddNotificationSlugFields1786953880106 implements MigrationInterface {
  name = 'AddNotificationSlugFields1786953880106';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notification" ADD "actorSlug" character varying(100)`
    );
    await queryRunner.query(
      `ALTER TABLE "notification" ADD "storySlug" character varying(100)`
    );

    await queryRunner.query(
      `UPDATE "notification" n SET "actorSlug" = u."slug"
       FROM "user" u WHERE u."id"::text = n."actorId"`
    );
    await queryRunner.query(
      `UPDATE "notification" n SET "storySlug" = s."slug"
       FROM "story" s WHERE s."id"::text = n."storyId"`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notification" DROP COLUMN "storySlug"`
    );
    await queryRunner.query(
      `ALTER TABLE "notification" DROP COLUMN "actorSlug"`
    );
  }
}
