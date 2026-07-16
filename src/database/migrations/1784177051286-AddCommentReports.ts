import {MigrationInterface, QueryRunner} from 'typeorm';

export class AddCommentReports1784177051286 implements MigrationInterface {
  name = 'AddCommentReports1784177051286';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`comment_report\` (\`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`commentId\` varchar(36) NULL, \`userId\` varchar(36) NULL, UNIQUE INDEX \`IDX_cef0f7f862ea6ffd5a99dd640e\` (\`userId\`, \`commentId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`
    );
    await queryRunner.query(
      `ALTER TABLE \`comment\` ADD \`isFlagged\` tinyint NOT NULL DEFAULT 0`
    );
    await queryRunner.query(
      `ALTER TABLE \`comment\` ADD \`reportCount\` int NOT NULL DEFAULT '0'`
    );
    await queryRunner.query(
      `ALTER TABLE \`comment_report\` ADD CONSTRAINT \`FK_027245f081e2200c00d6d75d1ed\` FOREIGN KEY (\`commentId\`) REFERENCES \`comment\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE \`comment_report\` ADD CONSTRAINT \`FK_f5d76a882255aab76133a175b55\` FOREIGN KEY (\`userId\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`comment_report\` DROP FOREIGN KEY \`FK_f5d76a882255aab76133a175b55\``
    );
    await queryRunner.query(
      `ALTER TABLE \`comment_report\` DROP FOREIGN KEY \`FK_027245f081e2200c00d6d75d1ed\``
    );
    await queryRunner.query(
      `ALTER TABLE \`comment\` DROP COLUMN \`reportCount\``
    );
    await queryRunner.query(
      `ALTER TABLE \`comment\` DROP COLUMN \`isFlagged\``
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_cef0f7f862ea6ffd5a99dd640e\` ON \`comment_report\``
    );
    await queryRunner.query(`DROP TABLE \`comment_report\``);
  }
}
