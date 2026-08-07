import {MigrationInterface, QueryRunner} from 'typeorm';

export class AddUserAvatarIcon1786400000000 implements MigrationInterface {
  name = 'AddUserAvatarIcon1786400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`user\` ADD \`avatarIcon\` enum ('ghost', 'moon', 'skull', 'bat', 'spider', 'pumpkin', 'candle', 'eye') NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`user\` DROP COLUMN \`avatarIcon\``);
  }
}
