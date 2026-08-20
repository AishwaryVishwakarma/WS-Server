import {MigrationInterface, QueryRunner} from 'typeorm';

// Backs LemonSqueezy self-serve subscriptions — see User entity and
// UsersService.applyMembershipChange/LemonSqueezyWebhookService. All five
// columns are nullable since every existing account predates billing.
export class AddBillingColumns1786960000000 implements MigrationInterface {
  name = 'AddBillingColumns1786960000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "foundingPatronSince" TIMESTAMP`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "lemonSqueezySubscriptionId" character varying(64)`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD CONSTRAINT "UQ_user_lemonSqueezySubscriptionId" UNIQUE ("lemonSqueezySubscriptionId")`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "lemonSqueezyCustomerId" character varying(64)`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "membershipStatus" character varying(32)`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "membershipRenewsAt" TIMESTAMP`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "membershipRenewsAt"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "membershipStatus"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "lemonSqueezyCustomerId"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP CONSTRAINT "UQ_user_lemonSqueezySubscriptionId"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "lemonSqueezySubscriptionId"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "foundingPatronSince"`
    );
  }
}
