import {MigrationInterface, QueryRunner} from 'typeorm';

export class AddReadingStreaksAndDigest1785510641162 implements MigrationInterface {
  name = 'AddReadingStreaksAndDigest1785510641162';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`user\` ADD \`currentStreak\` int NOT NULL DEFAULT '0'`
    );
    await queryRunner.query(
      `ALTER TABLE \`user\` ADD \`longestStreak\` int NOT NULL DEFAULT '0'`
    );
    await queryRunner.query(
      `ALTER TABLE \`user\` ADD \`lastActiveDate\` varchar(10) NULL`
    );
    await queryRunner.query(
      `ALTER TABLE \`user\` ADD \`digestEmailEnabled\` tinyint NOT NULL DEFAULT 1`
    );
    await queryRunner.query(
      `ALTER TABLE \`user\` ADD \`lastDigestSentAt\` datetime NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`user\` DROP COLUMN \`lastDigestSentAt\``
    );
    await queryRunner.query(
      `ALTER TABLE \`user\` DROP COLUMN \`digestEmailEnabled\``
    );
    await queryRunner.query(
      `ALTER TABLE \`user\` DROP COLUMN \`lastActiveDate\``
    );
    await queryRunner.query(
      `ALTER TABLE \`user\` DROP COLUMN \`longestStreak\``
    );
    await queryRunner.query(
      `ALTER TABLE \`user\` DROP COLUMN \`currentStreak\``
    );
  }
}
