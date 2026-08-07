import {MigrationInterface, QueryRunner} from 'typeorm';

export class AddUserAvatarColor1786500000000 implements MigrationInterface {
  name = 'AddUserAvatarColor1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`user\` ADD \`avatarColor\` enum ('ember', 'spectral', 'blood', 'success', 'warning') NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`user\` DROP COLUMN \`avatarColor\``);
  }
}
