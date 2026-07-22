import {MigrationInterface, QueryRunner} from 'typeorm';

// Backs the "most-read" feed sort — turns the approved + ORDER BY viewCount
// listing into an index range scan, mirroring the status+commentCount index.
export class AddStoryViewCountIndex1784800000000
  implements MigrationInterface
{
  name = 'AddStoryViewCountIndex1784800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX `IDX_story_status_viewCount` ON `story` (`status`, `viewCount`)'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX `IDX_story_status_viewCount` ON `story`'
    );
  }
}
