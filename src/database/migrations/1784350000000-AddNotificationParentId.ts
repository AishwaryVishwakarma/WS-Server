import {MigrationInterface, QueryRunner} from 'typeorm';

export class AddNotificationParentId1784350000000 implements MigrationInterface {
  name = 'AddNotificationParentId1784350000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The top-level thread id when a notification targets a reply; null for a
    // top-level comment notification.
    await queryRunner.query(
      `ALTER TABLE \`notification\` ADD \`parentId\` varchar(36) NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`notification\` DROP COLUMN \`parentId\``
    );
  }
}
