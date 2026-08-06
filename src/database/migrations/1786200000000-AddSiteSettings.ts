import {MigrationInterface, QueryRunner} from 'typeorm';

export class AddSiteSettings1786200000000 implements MigrationInterface {
  name = 'AddSiteSettings1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`site_settings\` (\`id\` int NOT NULL, \`requireStoryApproval\` tinyint NOT NULL DEFAULT 1, \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`
    );
    // Seeds the single settings row — true preserves today's behavior
    // (approval required) for existing deployments.
    await queryRunner.query(
      `INSERT INTO \`site_settings\` (\`id\`, \`requireStoryApproval\`) VALUES (1, 1)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`site_settings\``);
  }
}
