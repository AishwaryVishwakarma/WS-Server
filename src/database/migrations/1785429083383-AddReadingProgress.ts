import {MigrationInterface, QueryRunner} from 'typeorm';

export class AddReadingProgress1785429083383 implements MigrationInterface {
  name = 'AddReadingProgress1785429083383';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`reading_progress\` (\`id\` varchar(36) NOT NULL, \`percent\` tinyint UNSIGNED NOT NULL, \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`userId\` varchar(36) NULL, \`storyId\` varchar(36) NULL, INDEX \`IDX_reading_progress_user_updatedAt\` (\`userId\`, \`updatedAt\`), UNIQUE INDEX \`IDX_reading_progress_user_story\` (\`userId\`, \`storyId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`
    );
    await queryRunner.query(
      `ALTER TABLE \`reading_progress\` ADD CONSTRAINT \`FK_reading_progress_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE \`reading_progress\` ADD CONSTRAINT \`FK_reading_progress_story\` FOREIGN KEY (\`storyId\`) REFERENCES \`story\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`reading_progress\` DROP FOREIGN KEY \`FK_reading_progress_story\``
    );
    await queryRunner.query(
      `ALTER TABLE \`reading_progress\` DROP FOREIGN KEY \`FK_reading_progress_user\``
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_reading_progress_user_story\` ON \`reading_progress\``
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_reading_progress_user_updatedAt\` ON \`reading_progress\``
    );
    await queryRunner.query(`DROP TABLE \`reading_progress\``);
  }
}
