import {MigrationInterface, QueryRunner} from 'typeorm';

export class Baseline1783883957794 implements MigrationInterface {
  name = 'Baseline1783883957794';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`tag\` (\`id\` varchar(36) NOT NULL, \`name\` varchar(20) NOT NULL, \`slug\` varchar(20) NOT NULL, UNIQUE INDEX \`IDX_6a9775008add570dc3e5a0bab7\` (\`name\`), UNIQUE INDEX \`IDX_3413aed3ecde54f832c4f44f04\` (\`slug\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`
    );
    await queryRunner.query(
      `CREATE TABLE \`comment\` (\`id\` varchar(36) NOT NULL, \`content\` text NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`userId\` varchar(36) NULL, \`storyId\` varchar(36) NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`
    );
    await queryRunner.query(
      `CREATE TABLE \`story\` (\`id\` varchar(36) NOT NULL, \`title\` varchar(255) NOT NULL, \`excerpt\` varchar(300) NOT NULL, \`content\` mediumtext NOT NULL, \`coverImageUrl\` varchar(255) NULL, \`scareLevel\` int NOT NULL DEFAULT '1', \`isFlagged\` tinyint NOT NULL DEFAULT 0, \`wordCount\` int NOT NULL DEFAULT '0', \`commentCount\` int NOT NULL DEFAULT '0', \`status\` enum ('draft', 'pending', 'approved', 'rejected', 'flagged') NOT NULL DEFAULT 'pending', \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`authorId\` varchar(36) NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`
    );
    await queryRunner.query(
      `CREATE TABLE \`user\` (\`id\` varchar(36) NOT NULL, \`name\` varchar(100) NOT NULL, \`email\` varchar(255) NOT NULL, \`password\` varchar(255) NOT NULL, \`role\` enum ('user', 'admin', 'superadmin') NOT NULL DEFAULT 'user', \`isVerified\` tinyint NOT NULL DEFAULT 0, \`isBlocked\` tinyint NOT NULL DEFAULT 0, \`profileImageUrl\` varchar(500) NULL, \`bio\` varchar(500) NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deletedAt\` datetime(6) NULL, UNIQUE INDEX \`IDX_e12875dfb3b1d92d7d7c5377e2\` (\`email\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`
    );
    await queryRunner.query(
      `CREATE TABLE \`story_tags_tag\` (\`storyId\` varchar(36) NOT NULL, \`tagId\` varchar(36) NOT NULL, INDEX \`IDX_0b20906042d8989c8ccd78f066\` (\`storyId\`), INDEX \`IDX_4446ab22e74a04a38ddfca8a9e\` (\`tagId\`), PRIMARY KEY (\`storyId\`, \`tagId\`)) ENGINE=InnoDB`
    );
    await queryRunner.query(
      `ALTER TABLE \`comment\` ADD CONSTRAINT \`FK_c0354a9a009d3bb45a08655ce3b\` FOREIGN KEY (\`userId\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE \`comment\` ADD CONSTRAINT \`FK_fe13edd1431a248a0eeac11ae43\` FOREIGN KEY (\`storyId\`) REFERENCES \`story\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE \`story\` ADD CONSTRAINT \`FK_deb112632d0b5be276f59287d99\` FOREIGN KEY (\`authorId\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE \`story_tags_tag\` ADD CONSTRAINT \`FK_0b20906042d8989c8ccd78f066b\` FOREIGN KEY (\`storyId\`) REFERENCES \`story\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`
    );
    await queryRunner.query(
      `ALTER TABLE \`story_tags_tag\` ADD CONSTRAINT \`FK_4446ab22e74a04a38ddfca8a9e5\` FOREIGN KEY (\`tagId\`) REFERENCES \`tag\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`story_tags_tag\` DROP FOREIGN KEY \`FK_4446ab22e74a04a38ddfca8a9e5\``
    );
    await queryRunner.query(
      `ALTER TABLE \`story_tags_tag\` DROP FOREIGN KEY \`FK_0b20906042d8989c8ccd78f066b\``
    );
    await queryRunner.query(
      `ALTER TABLE \`story\` DROP FOREIGN KEY \`FK_deb112632d0b5be276f59287d99\``
    );
    await queryRunner.query(
      `ALTER TABLE \`comment\` DROP FOREIGN KEY \`FK_fe13edd1431a248a0eeac11ae43\``
    );
    await queryRunner.query(
      `ALTER TABLE \`comment\` DROP FOREIGN KEY \`FK_c0354a9a009d3bb45a08655ce3b\``
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_4446ab22e74a04a38ddfca8a9e\` ON \`story_tags_tag\``
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_0b20906042d8989c8ccd78f066\` ON \`story_tags_tag\``
    );
    await queryRunner.query(`DROP TABLE \`story_tags_tag\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_e12875dfb3b1d92d7d7c5377e2\` ON \`user\``
    );
    await queryRunner.query(`DROP TABLE \`user\``);
    await queryRunner.query(`DROP TABLE \`story\``);
    await queryRunner.query(`DROP TABLE \`comment\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_3413aed3ecde54f832c4f44f04\` ON \`tag\``
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_6a9775008add570dc3e5a0bab7\` ON \`tag\``
    );
    await queryRunner.query(`DROP TABLE \`tag\``);
  }
}
