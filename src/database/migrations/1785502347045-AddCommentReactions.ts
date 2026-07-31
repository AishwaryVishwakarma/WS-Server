import {MigrationInterface, QueryRunner} from 'typeorm';

export class AddCommentReactions1785502347045 implements MigrationInterface {
  name = 'AddCommentReactions1785502347045';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`comment_reaction\` (\`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`userId\` varchar(36) NULL, \`commentId\` varchar(36) NULL, INDEX \`IDX_comment_reaction_user\` (\`userId\`), UNIQUE INDEX \`IDX_comment_reaction_user_comment\` (\`userId\`, \`commentId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`
    );
    await queryRunner.query(
      `ALTER TABLE \`comment\` ADD \`reactionCount\` int NOT NULL DEFAULT '0'`
    );
    await queryRunner.query(
      `ALTER TABLE \`comment_reaction\` ADD CONSTRAINT \`FK_comment_reaction_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE \`comment_reaction\` ADD CONSTRAINT \`FK_comment_reaction_comment\` FOREIGN KEY (\`commentId\`) REFERENCES \`comment\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`comment_reaction\` DROP FOREIGN KEY \`FK_comment_reaction_comment\``
    );
    await queryRunner.query(
      `ALTER TABLE \`comment_reaction\` DROP FOREIGN KEY \`FK_comment_reaction_user\``
    );
    await queryRunner.query(
      `ALTER TABLE \`comment\` DROP COLUMN \`reactionCount\``
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_comment_reaction_user_comment\` ON \`comment_reaction\``
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_comment_reaction_user\` ON \`comment_reaction\``
    );
    await queryRunner.query(`DROP TABLE \`comment_reaction\``);
  }
}
