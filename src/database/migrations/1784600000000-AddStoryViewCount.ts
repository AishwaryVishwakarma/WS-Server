import {MigrationInterface, QueryRunner} from 'typeorm';

export class AddStoryViewCount1784600000000 implements MigrationInterface {
  name = 'AddStoryViewCount1784600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`story\` ADD \`viewCount\` int NOT NULL DEFAULT '0'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`story\` DROP COLUMN \`viewCount\``);
  }
}
