import {MigrationInterface, QueryRunner} from 'typeorm';

export class AddBookmarks1784500000000 implements MigrationInterface {
  name = 'AddBookmarks1784500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`bookmark\` (\`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`userId\` varchar(36) NULL, \`storyId\` varchar(36) NULL, UNIQUE INDEX \`IDX_bookmark_user_story\` (\`userId\`, \`storyId\`), INDEX \`IDX_bookmark_user_createdAt\` (\`userId\`, \`createdAt\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`
    );
    await queryRunner.query(
      `ALTER TABLE \`bookmark\` ADD CONSTRAINT \`FK_bookmark_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE \`bookmark\` ADD CONSTRAINT \`FK_bookmark_story\` FOREIGN KEY (\`storyId\`) REFERENCES \`story\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`bookmark\` DROP FOREIGN KEY \`FK_bookmark_story\``
    );
    await queryRunner.query(
      `ALTER TABLE \`bookmark\` DROP FOREIGN KEY \`FK_bookmark_user\``
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_bookmark_user_createdAt\` ON \`bookmark\``
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_bookmark_user_story\` ON \`bookmark\``
    );
    await queryRunner.query(`DROP TABLE \`bookmark\``);
  }
}
