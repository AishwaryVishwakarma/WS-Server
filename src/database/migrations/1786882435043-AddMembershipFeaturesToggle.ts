import {MigrationInterface, QueryRunner} from 'typeorm';

export class AddMembershipFeaturesToggle1786882435043 implements MigrationInterface {
  name = 'AddMembershipFeaturesToggle1786882435043';

  // Same pre-existing createdAt-index drift noted in AddMembershipTier —
  // left out here too, see that migration's comment.
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "site_settings" ADD "membershipFeaturesEnabled" boolean NOT NULL DEFAULT false`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "site_settings" DROP COLUMN "membershipFeaturesEnabled"`
    );
  }
}
