import {MigrationInterface, QueryRunner} from 'typeorm';

// The password-reset token table: one row per outstanding reset link, keyed
// by a hash of the raw token (never the token itself — see
// PasswordResetToken). PasswordResetService keeps at most one live row per
// user, so no unique constraint on userId is needed here.
export class AddPasswordResetToken1785600000000 implements MigrationInterface {
  name = 'AddPasswordResetToken1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`password_reset_token\` (\`id\` varchar(36) NOT NULL, \`tokenHash\` varchar(64) NOT NULL, \`expiresAt\` datetime NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`userId\` varchar(36) NOT NULL, UNIQUE INDEX \`IDX_324e592c57094c9dcfa00ddf91\` (\`tokenHash\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`
    );
    await queryRunner.query(
      `ALTER TABLE \`password_reset_token\` ADD CONSTRAINT \`FK_a4e53583f7a8ab7d01cded46a41\` FOREIGN KEY (\`userId\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`password_reset_token\` DROP FOREIGN KEY \`FK_a4e53583f7a8ab7d01cded46a41\``
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_324e592c57094c9dcfa00ddf91\` ON \`password_reset_token\``
    );
    await queryRunner.query(`DROP TABLE \`password_reset_token\``);
  }
}
