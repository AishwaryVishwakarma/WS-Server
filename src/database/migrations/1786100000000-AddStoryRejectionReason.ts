import {MigrationInterface, QueryRunner} from 'typeorm';

// A rejection reason on `story`, set whenever an admin rejects it via the
// single-story status transition (required there — see
// UpdateStoryStatusDto) and cleared on every other transition.
export class AddStoryRejectionReason1786100000000 implements MigrationInterface {
  name = 'AddStoryRejectionReason1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`story\` ADD \`rejectionReason\` varchar(500) NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`story\` DROP COLUMN \`rejectionReason\``
    );
  }
}
