import {MigrationInterface, QueryRunner} from 'typeorm';

export class AddStoryScheduledFor1785433843318 implements MigrationInterface {
  name = 'AddStoryScheduledFor1785433843318';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`story\` ADD \`scheduledFor\` datetime NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`story\` DROP COLUMN \`scheduledFor\``
    );
  }
}
