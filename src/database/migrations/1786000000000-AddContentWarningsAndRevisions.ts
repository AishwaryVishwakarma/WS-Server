import {MigrationInterface, QueryRunner} from 'typeorm';

// A fixed, developer-owned content-warning vocabulary on `story` (see
// ContentWarning), plus story_revision: a snapshot of a story's content
// taken right before a "content changed" edit (see StoriesService.update).
// View-only history in v1 — no restore, so no columns beyond what a reader
// needs to see what changed. Cascade-deletes with its story.
export class AddContentWarningsAndRevisions1786000000000 implements MigrationInterface {
  name = 'AddContentWarningsAndRevisions1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`story_revision\` (\`id\` varchar(36) NOT NULL, \`title\` varchar(255) NOT NULL, \`excerpt\` varchar(300) NOT NULL, \`content\` mediumtext NOT NULL, \`coverImageUrl\` varchar(255) NULL, \`contentWarnings\` varchar(255) NOT NULL DEFAULT '', \`tagNames\` text NULL, \`statusBefore\` enum ('draft', 'pending', 'approved', 'rejected', 'flagged') NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`storyId\` varchar(36) NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`
    );
    await queryRunner.query(
      `ALTER TABLE \`story\` ADD \`contentWarnings\` varchar(255) NOT NULL DEFAULT ''`
    );
    await queryRunner.query(
      `ALTER TABLE \`story_revision\` ADD CONSTRAINT \`FK_a62131f5a63309e46b90f50a942\` FOREIGN KEY (\`storyId\`) REFERENCES \`story\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`story_revision\` DROP FOREIGN KEY \`FK_a62131f5a63309e46b90f50a942\``
    );
    await queryRunner.query(
      `ALTER TABLE \`story\` DROP COLUMN \`contentWarnings\``
    );
    await queryRunner.query(`DROP TABLE \`story_revision\``);
  }
}
