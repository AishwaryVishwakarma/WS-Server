import {MigrationInterface, QueryRunner} from 'typeorm';

export class AddNotificationPreferences1786610000000 implements MigrationInterface {
  name = 'AddNotificationPreferences1786610000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "notificationInAppTypes" character varying(80) NOT NULL DEFAULT 'reply,comment,follow,like'`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "notificationEmailTypes" character varying(80) NOT NULL DEFAULT ''`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "notificationQuietStart" character varying(5)`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "notificationQuietEnd" character varying(5)`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "notificationTimezoneOffset" integer NOT NULL DEFAULT '0'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "notificationTimezoneOffset"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "notificationQuietEnd"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "notificationQuietStart"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "notificationEmailTypes"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "notificationInAppTypes"`
    );
  }
}
