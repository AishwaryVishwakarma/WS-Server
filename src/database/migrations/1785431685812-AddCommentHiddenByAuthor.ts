import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCommentHiddenByAuthor1785431685812 implements MigrationInterface {
    name = 'AddCommentHiddenByAuthor1785431685812'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`comment\` ADD \`isHiddenByAuthor\` tinyint NOT NULL DEFAULT 0`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`comment\` DROP COLUMN \`isHiddenByAuthor\``);
    }

}
