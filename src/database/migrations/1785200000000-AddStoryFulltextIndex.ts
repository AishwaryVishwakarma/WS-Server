import {MigrationInterface, QueryRunner} from 'typeorm';

// FULLTEXT index over story (title, excerpt), backing the public feed's
// word/prefix search (MATCH … AGAINST IN BOOLEAN MODE). Replaces the previous
// unindexable leading-wildcard LIKE for queries of 3+ chars.
export class AddStoryFulltextIndex1785200000000 implements MigrationInterface {
  name = 'AddStoryFulltextIndex1785200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE FULLTEXT INDEX `IDX_story_fulltext` ON `story` (`title`, `excerpt`)'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX `IDX_story_fulltext` ON `story`');
  }
}
