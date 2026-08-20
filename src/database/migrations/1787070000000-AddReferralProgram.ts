import type {MigrationInterface, QueryRunner} from 'typeorm';
import {shortId} from '../../utils/slug';

// referralCode is nullable-first, then backfilled and constrained, since
// existing rows have no value to derive one from until this runs — mirrors
// AddSlugColumns1786953587458's shape for the same reason.
export class AddReferralProgram1787070000000 implements MigrationInterface {
  name = 'AddReferralProgram1787070000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "referralCode" character varying(12)`
    );
    await queryRunner.query(`ALTER TABLE "user" ADD "referredById" uuid`);
    await queryRunner.query(
      `ALTER TABLE "pending_registration" ADD "referredById" uuid`
    );
    await queryRunner.query(
      `ALTER TABLE "site_settings" ADD "referralProgramEnabled" boolean NOT NULL DEFAULT false`
    );

    await this._backfillReferralCodes(queryRunner);

    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "referralCode" SET NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD CONSTRAINT "UQ_user_referralCode" UNIQUE ("referralCode")`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD CONSTRAINT "FK_user_referredById" FOREIGN KEY ("referredById") REFERENCES "user"("id") ON DELETE SET NULL`
    );
  }

  private async _backfillReferralCodes(
    queryRunner: QueryRunner
  ): Promise<void> {
    const rows = (await queryRunner.query(`SELECT "id" FROM "user"`)) as {
      id: string;
    }[];

    for (const row of rows) {
      await queryRunner.query(
        `UPDATE "user" SET "referralCode" = $1 WHERE "id" = $2`,
        [shortId(), row.id]
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" DROP CONSTRAINT "FK_user_referredById"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP CONSTRAINT "UQ_user_referralCode"`
    );
    await queryRunner.query(
      `ALTER TABLE "site_settings" DROP COLUMN "referralProgramEnabled"`
    );
    await queryRunner.query(
      `ALTER TABLE "pending_registration" DROP COLUMN "referredById"`
    );
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "referredById"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "referralCode"`);
  }
}
