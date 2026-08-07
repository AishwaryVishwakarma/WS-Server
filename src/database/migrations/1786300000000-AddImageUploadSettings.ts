import {MigrationInterface, QueryRunner} from 'typeorm';

export class AddImageUploadSettings1786300000000 implements MigrationInterface {
  name = 'AddImageUploadSettings1786300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`site_settings\` ADD \`allowProfileImageUpload\` tinyint NOT NULL DEFAULT 0`
    );
    await queryRunner.query(
      `ALTER TABLE \`site_settings\` ADD \`allowStoryCoverImage\` tinyint NOT NULL DEFAULT 0`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`site_settings\` DROP COLUMN \`allowStoryCoverImage\``
    );
    await queryRunner.query(
      `ALTER TABLE \`site_settings\` DROP COLUMN \`allowProfileImageUpload\``
    );
  }
}
