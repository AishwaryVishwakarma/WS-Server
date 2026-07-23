import {MigrationInterface, QueryRunner} from 'typeorm';

// Story reports: the story_report join (member ↔ story, unique per pair), a
// denormalized story.reportCount, and an index on it for the admin reported
// queue (reportCount > 0, most-reported first). Mirrors AddCommentReports.
export class AddStoryReports1785100000000 implements MigrationInterface {
  name = 'AddStoryReports1785100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`story_report\` (\`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`storyId\` varchar(36) NULL, \`userId\` varchar(36) NULL, UNIQUE INDEX \`IDX_97bd2dbd78007a1cb480064429\` (\`userId\`, \`storyId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`
    );
    await queryRunner.query(
      `ALTER TABLE \`story\` ADD \`reportCount\` int NOT NULL DEFAULT '0'`
    );
    await queryRunner.query(
      'CREATE INDEX `IDX_story_reportCount` ON `story` (`reportCount`)'
    );
    await queryRunner.query(
      `ALTER TABLE \`story_report\` ADD CONSTRAINT \`FK_d48331b6dc987c069e5d1b5ca98\` FOREIGN KEY (\`storyId\`) REFERENCES \`story\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE \`story_report\` ADD CONSTRAINT \`FK_2b2bc279fabd733b237ef5588fb\` FOREIGN KEY (\`userId\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`story_report\` DROP FOREIGN KEY \`FK_2b2bc279fabd733b237ef5588fb\``
    );
    await queryRunner.query(
      `ALTER TABLE \`story_report\` DROP FOREIGN KEY \`FK_d48331b6dc987c069e5d1b5ca98\``
    );
    await queryRunner.query('DROP INDEX `IDX_story_reportCount` ON `story`');
    await queryRunner.query(
      `ALTER TABLE \`story\` DROP COLUMN \`reportCount\``
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_97bd2dbd78007a1cb480064429\` ON \`story_report\``
    );
    await queryRunner.query(`DROP TABLE \`story_report\``);
  }
}
