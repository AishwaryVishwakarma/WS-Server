import {MigrationInterface, QueryRunner} from 'typeorm';

export class AddNotificationEmailGlobalToggle1786630000000 implements MigrationInterface {
  name = 'AddNotificationEmailGlobalToggle1786630000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "site_settings" ADD "notificationEmailGloballyEnabled" boolean NOT NULL DEFAULT false`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "site_settings" DROP COLUMN "notificationEmailGloballyEnabled"`
    );
  }
}
