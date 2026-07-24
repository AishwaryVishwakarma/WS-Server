import {MigrationInterface, QueryRunner} from 'typeorm';

// A predefined category (required, defaulted to `other` purely so this
// backfills any pre-existing rows) plus an optional free-text detail
// (<=100 chars) on each user_report row, so the admin queue shows more than a
// bare count.
export class AddUserReportReason1785500000000 implements MigrationInterface {
  name = 'AddUserReportReason1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`user_report\` ADD \`reason\` enum ('spam', 'harassment', 'inappropriate_image', 'impersonation', 'other') NOT NULL DEFAULT 'other'`
    );
    await queryRunner.query(
      `ALTER TABLE \`user_report\` ADD \`details\` varchar(100) NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`user_report\` DROP COLUMN \`details\``
    );
    await queryRunner.query(
      `ALTER TABLE \`user_report\` DROP COLUMN \`reason\``
    );
  }
}
