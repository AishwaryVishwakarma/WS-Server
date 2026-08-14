import type {MigrationInterface, QueryRunner} from 'typeorm';

export class AddImageStorageIds1786640000000 implements MigrationInterface {
  name = 'AddImageStorageIds1786640000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "profileImageFileId" character varying(36)`
    );
    await queryRunner.query(
      `ALTER TABLE "story" ADD "coverImageFileId" character varying(36)`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "story" DROP COLUMN "coverImageFileId"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "profileImageFileId"`
    );
  }
}
