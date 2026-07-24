import {MigrationInterface, QueryRunner} from 'typeorm';

// User reports: the user_report join (reporter -> reportedUser, unique per
// pair), a denormalized user.reportCount, and an index on it for the admin
// reported-users queue (reportCount > 0, most-reported first). Mirrors
// AddStoryReports/AddCommentReports.
export class AddUserReports1785400000000 implements MigrationInterface {
  name = 'AddUserReports1785400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`user_report\` (\`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`reportedUserId\` varchar(36) NULL, \`reporterId\` varchar(36) NULL, UNIQUE INDEX \`IDX_b7e6a0e7ec2ebe9c8941ee243e\` (\`reporterId\`, \`reportedUserId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`
    );
    await queryRunner.query(
      `ALTER TABLE \`user\` ADD \`reportCount\` int NOT NULL DEFAULT '0'`
    );
    await queryRunner.query(
      'CREATE INDEX `IDX_user_reportCount` ON `user` (`reportCount`)'
    );
    await queryRunner.query(
      `ALTER TABLE \`user_report\` ADD CONSTRAINT \`FK_2d3711064572aa0203cba01242b\` FOREIGN KEY (\`reportedUserId\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE \`user_report\` ADD CONSTRAINT \`FK_142ad20f8e4e5385b548940b62c\` FOREIGN KEY (\`reporterId\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`user_report\` DROP FOREIGN KEY \`FK_142ad20f8e4e5385b548940b62c\``
    );
    await queryRunner.query(
      `ALTER TABLE \`user_report\` DROP FOREIGN KEY \`FK_2d3711064572aa0203cba01242b\``
    );
    await queryRunner.query('DROP INDEX `IDX_user_reportCount` ON `user`');
    await queryRunner.query(`ALTER TABLE \`user\` DROP COLUMN \`reportCount\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_b7e6a0e7ec2ebe9c8941ee243e\` ON \`user_report\``
    );
    await queryRunner.query(`DROP TABLE \`user_report\``);
  }
}
