import {MigrationInterface, QueryRunner} from 'typeorm';

// A predefined category (required, defaulted to `other` purely so this
// backfills any pre-existing rows) plus an optional free-text detail
// (<=100 chars) on each story_report row, so the admin queue shows more than a
// bare count. Mirrors AddUserReportReason.
export class AddStoryReportReason1785900000000 implements MigrationInterface {
  name = 'AddStoryReportReason1785900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`story_report\` ADD \`reason\` enum ('plagiarism', 'spam', 'graphic_content', 'copyright', 'harassment', 'other') NOT NULL DEFAULT 'other'`
    );
    await queryRunner.query(
      `ALTER TABLE \`story_report\` ADD \`details\` varchar(100) NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`story_report\` DROP COLUMN \`details\``
    );
    await queryRunner.query(
      `ALTER TABLE \`story_report\` DROP COLUMN \`reason\``
    );
  }
}
