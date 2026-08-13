import {MigrationInterface, QueryRunner} from 'typeorm';

export class DisableDigestEmailByDefault1786550000000 implements MigrationInterface {
  name = 'DisableDigestEmailByDefault1786550000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "digestEmailEnabled" SET DEFAULT false`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "digestEmailEnabled" SET DEFAULT true`
    );
  }
}
