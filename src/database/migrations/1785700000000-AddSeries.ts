import {MigrationInterface, QueryRunner} from 'typeorm';

// The series table: an author's own ordered grouping of their stories. Story
// gets two new nullable columns — seriesId (SET NULL on series delete, since
// there's no delete-series endpoint but the FK stays defensive) and
// seriesPosition (plain int, no FK — see Series entity / StoriesService).
export class AddSeries1785700000000 implements MigrationInterface {
  name = 'AddSeries1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`series\` (\`id\` varchar(36) NOT NULL, \`title\` varchar(100) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`authorId\` varchar(36) NULL, UNIQUE INDEX \`IDX_2c6490de8ce06b68045717ced5\` (\`authorId\`, \`title\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`
    );
    await queryRunner.query(
      `ALTER TABLE \`story\` ADD \`seriesPosition\` int NULL`
    );
    await queryRunner.query(
      `ALTER TABLE \`story\` ADD \`seriesId\` varchar(36) NULL`
    );
    await queryRunner.query(
      `ALTER TABLE \`series\` ADD CONSTRAINT \`FK_d12f33f1dfdfe7cfdd8a3de53ac\` FOREIGN KEY (\`authorId\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE \`story\` ADD CONSTRAINT \`FK_f5f3ec812c421ba04460e4aff46\` FOREIGN KEY (\`seriesId\`) REFERENCES \`series\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`story\` DROP FOREIGN KEY \`FK_f5f3ec812c421ba04460e4aff46\``
    );
    await queryRunner.query(
      `ALTER TABLE \`series\` DROP FOREIGN KEY \`FK_d12f33f1dfdfe7cfdd8a3de53ac\``
    );
    await queryRunner.query(`ALTER TABLE \`story\` DROP COLUMN \`seriesId\``);
    await queryRunner.query(
      `ALTER TABLE \`story\` DROP COLUMN \`seriesPosition\``
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_2c6490de8ce06b68045717ced5\` ON \`series\``
    );
    await queryRunner.query(`DROP TABLE \`series\``);
  }
}
