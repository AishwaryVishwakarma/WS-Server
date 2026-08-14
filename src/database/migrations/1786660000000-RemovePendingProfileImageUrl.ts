import type {MigrationInterface, QueryRunner} from 'typeorm';

export class RemovePendingProfileImageUrl1786660000000 implements MigrationInterface {
  name = 'RemovePendingProfileImageUrl1786660000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pending_registration" DROP COLUMN "profileImageUrl"`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pending_registration" ADD "profileImageUrl" character varying(500)`
    );
  }
}
