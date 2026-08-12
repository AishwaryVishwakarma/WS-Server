import type {MigrationInterface, QueryRunner} from 'typeorm';

export class AddStoryAuthorFeedIndex1786530000000 implements MigrationInterface {
  name = 'AddStoryAuthorFeedIndex1786530000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX "IDX_story_author_status_createdAt_id" ON "story" ("authorId", "status", "createdAt", "id")'
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX "public"."IDX_story_author_status_createdAt_id"'
    );
  }
}
