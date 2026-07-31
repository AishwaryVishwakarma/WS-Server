import {MigrationInterface, QueryRunner} from 'typeorm';

export class AddMutedContentWarnings1785484220156 implements MigrationInterface {
  name = 'AddMutedContentWarnings1785484220156';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`user\` ADD \`mutedContentWarnings\` varchar(255) NOT NULL DEFAULT ''`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`user\` DROP COLUMN \`mutedContentWarnings\``
    );
  }
}
