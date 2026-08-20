import type {MigrationInterface, QueryRunner} from 'typeorm';

export class AddWinbackEmail1787080000000 implements MigrationInterface {
  name = 'AddWinbackEmail1787080000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "winbackEmailEnabled" boolean NOT NULL DEFAULT true`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "winbackEmailSentAt" TIMESTAMP`
    );
    await queryRunner.query(
      `ALTER TABLE "site_settings" ADD "winbackEmailGloballyEnabled" boolean NOT NULL DEFAULT false`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "site_settings" DROP COLUMN "winbackEmailGloballyEnabled"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "winbackEmailSentAt"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "winbackEmailEnabled"`
    );
  }
}
