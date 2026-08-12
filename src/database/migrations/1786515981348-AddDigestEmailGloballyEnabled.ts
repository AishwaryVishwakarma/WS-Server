import {MigrationInterface, QueryRunner} from 'typeorm';

export class AddDigestEmailGloballyEnabled1786515981348 implements MigrationInterface {
  name = 'AddDigestEmailGloballyEnabled1786515981348';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "site_settings" ADD "digestEmailGloballyEnabled" boolean NOT NULL DEFAULT false`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "site_settings" DROP COLUMN "digestEmailGloballyEnabled"`
    );
  }
}
