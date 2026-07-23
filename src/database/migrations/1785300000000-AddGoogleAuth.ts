import {MigrationInterface, QueryRunner} from 'typeorm';

// Google sign-in: a nullable, unique `googleId` on the user, and `password`
// relaxed to nullable so OAuth-only accounts (no local password) are valid.
export class AddGoogleAuth1785300000000 implements MigrationInterface {
  name = 'AddGoogleAuth1785300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `user` ADD `googleId` varchar(255) NULL'
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX `IDX_user_googleId` ON `user` (`googleId`)'
    );
    await queryRunner.query(
      'ALTER TABLE `user` MODIFY `password` varchar(255) NULL'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Note: reverting password to NOT NULL will fail if any OAuth-only accounts
    // (null password) exist — clear or backfill them first.
    await queryRunner.query(
      'ALTER TABLE `user` MODIFY `password` varchar(255) NOT NULL'
    );
    await queryRunner.query('DROP INDEX `IDX_user_googleId` ON `user`');
    await queryRunner.query('ALTER TABLE `user` DROP COLUMN `googleId`');
  }
}
