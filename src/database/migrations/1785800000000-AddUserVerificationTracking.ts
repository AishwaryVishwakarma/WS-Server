import {MigrationInterface, QueryRunner} from 'typeorm';

// Two flags backing auto-verification (see User entity / SessionAuthGuard):
// hasPublishedStory latches once an author's first story is ever approved
// (survives deleting that story) and verificationLocked marks isVerified as
// already decided, one way or the other, so the auto-check never revisits it.
export class AddUserVerificationTracking1785800000000 implements MigrationInterface {
  name = 'AddUserVerificationTracking1785800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`user\` ADD \`hasPublishedStory\` tinyint NOT NULL DEFAULT 0`
    );
    await queryRunner.query(
      `ALTER TABLE \`user\` ADD \`verificationLocked\` tinyint NOT NULL DEFAULT 0`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`user\` DROP COLUMN \`verificationLocked\``
    );
    await queryRunner.query(
      `ALTER TABLE \`user\` DROP COLUMN \`hasPublishedStory\``
    );
  }
}
