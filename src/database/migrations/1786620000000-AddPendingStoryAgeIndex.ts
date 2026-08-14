import type {MigrationInterface, QueryRunner} from 'typeorm';

export class AddPendingStoryAgeIndex1786620000000 implements MigrationInterface {
  name = 'AddPendingStoryAgeIndex1786620000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_story_pending_updatedAt" ON "story" ("updatedAt") WHERE "status" = 'pending'`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX "public"."IDX_story_pending_updatedAt"'
    );
  }
}
