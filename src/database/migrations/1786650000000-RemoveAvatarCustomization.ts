import type {MigrationInterface, QueryRunner} from 'typeorm';

export class RemoveAvatarCustomization1786650000000 implements MigrationInterface {
  name = 'RemoveAvatarCustomization1786650000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "avatarColor"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "avatarIcon"`);
    await queryRunner.query(
      `ALTER TABLE "pending_registration" DROP COLUMN "avatarColor"`
    );
    await queryRunner.query(
      `ALTER TABLE "pending_registration" DROP COLUMN "avatarIcon"`
    );
    await queryRunner.query(`DROP TYPE "public"."user_avatarcolor_enum"`);
    await queryRunner.query(`DROP TYPE "public"."user_avataricon_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."pending_registration_avatarcolor_enum"`
    );
    await queryRunner.query(
      `DROP TYPE "public"."pending_registration_avataricon_enum"`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."user_avataricon_enum" AS ENUM('ghost', 'moon', 'skull', 'bat', 'spider', 'pumpkin', 'candle', 'eye')`
    );
    await queryRunner.query(
      `CREATE TYPE "public"."user_avatarcolor_enum" AS ENUM('ember', 'spectral', 'blood', 'success', 'warning')`
    );
    await queryRunner.query(
      `CREATE TYPE "public"."pending_registration_avataricon_enum" AS ENUM('ghost', 'moon', 'skull', 'bat', 'spider', 'pumpkin', 'candle', 'eye')`
    );
    await queryRunner.query(
      `CREATE TYPE "public"."pending_registration_avatarcolor_enum" AS ENUM('ember', 'spectral', 'blood', 'success', 'warning')`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "avatarIcon" "public"."user_avataricon_enum"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "avatarColor" "public"."user_avatarcolor_enum"`
    );
    await queryRunner.query(
      `ALTER TABLE "pending_registration" ADD "avatarIcon" "public"."pending_registration_avataricon_enum"`
    );
    await queryRunner.query(
      `ALTER TABLE "pending_registration" ADD "avatarColor" "public"."pending_registration_avatarcolor_enum"`
    );
  }
}
