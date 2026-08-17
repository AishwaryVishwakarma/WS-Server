import {MigrationInterface, QueryRunner} from 'typeorm';

export class AddMembershipTier1786882214528 implements MigrationInterface {
  name = 'AddMembershipTier1786882214528';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."user_membershiptier_enum" AS ENUM('free', 'patron', 'founding_patron')`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "membershipTier" "public"."user_membershiptier_enum" NOT NULL DEFAULT 'free'`
    );
    await queryRunner.query(`ALTER TABLE "user" ADD "premiumSince" TIMESTAMP`);
    await queryRunner.query(
      `ALTER TABLE "user" ADD "streakFreezeCount" integer NOT NULL DEFAULT '0'`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "lastStreakFreezeUsedAt" TIMESTAMP`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "lastStreakFreezeUsedAt"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "streakFreezeCount"`
    );
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "premiumSince"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "membershipTier"`);
    await queryRunner.query(`DROP TYPE "public"."user_membershiptier_enum"`);
  }
}
