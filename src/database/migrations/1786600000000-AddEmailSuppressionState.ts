import {MigrationInterface, QueryRunner} from 'typeorm';

export class AddEmailSuppressionState1786600000000 implements MigrationInterface {
  name = 'AddEmailSuppressionState1786600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "emailSuppressedAt" TIMESTAMP`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "emailSuppressionReason" character varying(20)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "emailSuppressionReason"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "emailSuppressedAt"`
    );
  }
}
