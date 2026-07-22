import {MigrationInterface, QueryRunner} from 'typeorm';

export class AddFollows1784700000000 implements MigrationInterface {
  name = 'AddFollows1784700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`follow\` (\`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`followerId\` varchar(36) NULL, \`followingId\` varchar(36) NULL, UNIQUE INDEX \`IDX_follow_follower_following\` (\`followerId\`, \`followingId\`), INDEX \`IDX_follow_follower\` (\`followerId\`), INDEX \`IDX_follow_following\` (\`followingId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`
    );
    await queryRunner.query(
      `ALTER TABLE \`follow\` ADD CONSTRAINT \`FK_follow_follower\` FOREIGN KEY (\`followerId\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE \`follow\` ADD CONSTRAINT \`FK_follow_following\` FOREIGN KEY (\`followingId\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`follow\` DROP FOREIGN KEY \`FK_follow_following\``
    );
    await queryRunner.query(
      `ALTER TABLE \`follow\` DROP FOREIGN KEY \`FK_follow_follower\``
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_follow_following\` ON \`follow\``
    );
    await queryRunner.query(`DROP INDEX \`IDX_follow_follower\` ON \`follow\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_follow_follower_following\` ON \`follow\``
    );
    await queryRunner.query(`DROP TABLE \`follow\``);
  }
}
