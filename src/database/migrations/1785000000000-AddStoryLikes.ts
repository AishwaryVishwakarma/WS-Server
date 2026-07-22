import {MigrationInterface, QueryRunner} from 'typeorm';

// Story likes: the story_like join (member ↔ story), a denormalized
// story.likeCount, and a (status, likeCount) index for the "most-liked" sort.
export class AddStoryLikes1785000000000 implements MigrationInterface {
  name = 'AddStoryLikes1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`story_like\` (\`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`userId\` varchar(36) NULL, \`storyId\` varchar(36) NULL, UNIQUE INDEX \`IDX_story_like_user_story\` (\`userId\`, \`storyId\`), INDEX \`IDX_story_like_user\` (\`userId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`
    );
    await queryRunner.query(
      `ALTER TABLE \`story\` ADD \`likeCount\` int NOT NULL DEFAULT '0'`
    );
    await queryRunner.query(
      'CREATE INDEX `IDX_story_status_likeCount` ON `story` (`status`, `likeCount`)'
    );
    await queryRunner.query(
      `ALTER TABLE \`story_like\` ADD CONSTRAINT \`FK_story_like_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE \`story_like\` ADD CONSTRAINT \`FK_story_like_story\` FOREIGN KEY (\`storyId\`) REFERENCES \`story\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`story_like\` DROP FOREIGN KEY \`FK_story_like_story\``
    );
    await queryRunner.query(
      `ALTER TABLE \`story_like\` DROP FOREIGN KEY \`FK_story_like_user\``
    );
    await queryRunner.query(
      'DROP INDEX `IDX_story_status_likeCount` ON `story`'
    );
    await queryRunner.query(`ALTER TABLE \`story\` DROP COLUMN \`likeCount\``);
    await queryRunner.query(`DROP TABLE \`story_like\``);
  }
}
