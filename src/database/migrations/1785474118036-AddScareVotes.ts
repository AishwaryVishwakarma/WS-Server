import {MigrationInterface, QueryRunner} from 'typeorm';

export class AddScareVotes1785474118036 implements MigrationInterface {
  name = 'AddScareVotes1785474118036';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`scare_vote\` (\`id\` varchar(36) NOT NULL, \`value\` int NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`userId\` varchar(36) NULL, \`storyId\` varchar(36) NULL, INDEX \`IDX_scare_vote_user\` (\`userId\`), UNIQUE INDEX \`IDX_scare_vote_user_story\` (\`userId\`, \`storyId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`
    );
    await queryRunner.query(
      `ALTER TABLE \`story\` ADD \`scareRatingSum\` int NOT NULL DEFAULT '0'`
    );
    await queryRunner.query(
      `ALTER TABLE \`story\` ADD \`scareRatingCount\` int NOT NULL DEFAULT '0'`
    );
    await queryRunner.query(
      `ALTER TABLE \`scare_vote\` ADD CONSTRAINT \`FK_scare_vote_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE \`scare_vote\` ADD CONSTRAINT \`FK_scare_vote_story\` FOREIGN KEY (\`storyId\`) REFERENCES \`story\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`scare_vote\` DROP FOREIGN KEY \`FK_scare_vote_story\``
    );
    await queryRunner.query(
      `ALTER TABLE \`scare_vote\` DROP FOREIGN KEY \`FK_scare_vote_user\``
    );
    await queryRunner.query(
      `ALTER TABLE \`story\` DROP COLUMN \`scareRatingCount\``
    );
    await queryRunner.query(
      `ALTER TABLE \`story\` DROP COLUMN \`scareRatingSum\``
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_scare_vote_user_story\` ON \`scare_vote\``
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_scare_vote_user\` ON \`scare_vote\``
    );
    await queryRunner.query(`DROP TABLE \`scare_vote\``);
  }
}
