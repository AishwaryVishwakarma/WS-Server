import {MigrationInterface, QueryRunner} from 'typeorm';

// Supports 'follow' notifications: adds actorId (link to the follower's
// profile) and relaxes the story/comment columns to nullable, since a follow
// has neither. Existing 'comment'/'reply' rows keep their values.
export class AddFollowNotifications1784900000000
  implements MigrationInterface
{
  name = 'AddFollowNotifications1784900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `notification` ADD `actorId` varchar(36) NULL'
    );
    await queryRunner.query(
      'ALTER TABLE `notification` MODIFY `storyId` varchar(36) NULL'
    );
    await queryRunner.query(
      'ALTER TABLE `notification` MODIFY `storyTitle` varchar(255) NULL'
    );
    await queryRunner.query(
      'ALTER TABLE `notification` MODIFY `commentId` varchar(36) NULL'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop any follow rows first — they have NULLs the NOT NULL revert rejects.
    await queryRunner.query(
      "DELETE FROM `notification` WHERE `type` = 'follow'"
    );
    await queryRunner.query(
      'ALTER TABLE `notification` MODIFY `commentId` varchar(36) NOT NULL'
    );
    await queryRunner.query(
      'ALTER TABLE `notification` MODIFY `storyTitle` varchar(255) NOT NULL'
    );
    await queryRunner.query(
      'ALTER TABLE `notification` MODIFY `storyId` varchar(36) NOT NULL'
    );
    await queryRunner.query(
      'ALTER TABLE `notification` DROP COLUMN `actorId`'
    );
  }
}
