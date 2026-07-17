import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNotifications1784262275676 implements MigrationInterface {
    name = 'AddNotifications1784262275676'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`notification\` (\`id\` varchar(36) NOT NULL, \`type\` varchar(20) NOT NULL DEFAULT 'reply', \`actorName\` varchar(100) NOT NULL, \`storyId\` varchar(255) NOT NULL, \`storyTitle\` varchar(255) NOT NULL, \`commentId\` varchar(255) NOT NULL, \`isRead\` tinyint NOT NULL DEFAULT 0, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`recipientId\` varchar(36) NOT NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`notification\` ADD CONSTRAINT \`FK_ab7cbe7a013ecac5da0a8f88884\` FOREIGN KEY (\`recipientId\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`notification\` DROP FOREIGN KEY \`FK_ab7cbe7a013ecac5da0a8f88884\``);
        await queryRunner.query(`DROP TABLE \`notification\``);
    }

}
