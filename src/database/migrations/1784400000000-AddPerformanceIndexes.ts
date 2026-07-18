import {MigrationInterface, QueryRunner} from 'typeorm';

// Indexes for the hot listing/query paths (see the entity comments): the public
// story feed, the comment moderation queue + per-story threads, and the
// notification feed/unread-count. Without these, each of those degrades to a
// full table scan + filesort as the tables grow.
export class AddPerformanceIndexes1784400000000 implements MigrationInterface {
  name = 'AddPerformanceIndexes1784400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX `IDX_story_status_createdAt` ON `story` (`status`, `createdAt`)'
    );
    await queryRunner.query(
      'CREATE INDEX `IDX_story_status_commentCount` ON `story` (`status`, `commentCount`)'
    );
    await queryRunner.query(
      'CREATE INDEX `IDX_comment_isFlagged_reportCount` ON `comment` (`isFlagged`, `reportCount`)'
    );
    await queryRunner.query(
      'CREATE INDEX `IDX_comment_story_createdAt` ON `comment` (`storyId`, `createdAt`)'
    );
    await queryRunner.query(
      'CREATE INDEX `IDX_notification_recipient_isRead` ON `notification` (`recipientId`, `isRead`)'
    );
    await queryRunner.query(
      'CREATE INDEX `IDX_notification_recipient_createdAt` ON `notification` (`recipientId`, `createdAt`)'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX `IDX_notification_recipient_createdAt` ON `notification`'
    );
    await queryRunner.query(
      'DROP INDEX `IDX_notification_recipient_isRead` ON `notification`'
    );
    await queryRunner.query(
      'DROP INDEX `IDX_comment_story_createdAt` ON `comment`'
    );
    await queryRunner.query(
      'DROP INDEX `IDX_comment_isFlagged_reportCount` ON `comment`'
    );
    await queryRunner.query(
      'DROP INDEX `IDX_story_status_commentCount` ON `story`'
    );
    await queryRunner.query(
      'DROP INDEX `IDX_story_status_createdAt` ON `story`'
    );
  }
}
