import {MigrationInterface, QueryRunner} from 'typeorm';

export class AddMutedAuthors1785500606343 implements MigrationInterface {
  name = 'AddMutedAuthors1785500606343';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`muted_author\` (\`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`userId\` varchar(36) NULL, \`mutedAuthorId\` varchar(36) NULL, INDEX \`IDX_muted_author_user\` (\`userId\`), UNIQUE INDEX \`IDX_muted_author_user_muted\` (\`userId\`, \`mutedAuthorId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`
    );
    await queryRunner.query(
      `ALTER TABLE \`muted_author\` ADD CONSTRAINT \`FK_muted_author_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE \`muted_author\` ADD CONSTRAINT \`FK_muted_author_muted\` FOREIGN KEY (\`mutedAuthorId\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`muted_author\` DROP FOREIGN KEY \`FK_muted_author_muted\``
    );
    await queryRunner.query(
      `ALTER TABLE \`muted_author\` DROP FOREIGN KEY \`FK_muted_author_user\``
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_muted_author_user_muted\` ON \`muted_author\``
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_muted_author_user\` ON \`muted_author\``
    );
    await queryRunner.query(`DROP TABLE \`muted_author\``);
  }
}
