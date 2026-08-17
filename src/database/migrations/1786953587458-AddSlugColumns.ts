import {MigrationInterface, QueryRunner} from 'typeorm';
import {buildSlug} from '../../utils/slug';

// Backfills a human-readable slug (title/name + a short random id fragment)
// for every existing story, user, and series row — see the Story/User/
// Series entities' assignSlug hooks, which handle new rows going forward.
// Nullable-first, then backfilled and constrained, since existing rows have
// no value to derive one from until this runs.
export class AddSlugColumns1786953587458 implements MigrationInterface {
  name = 'AddSlugColumns1786953587458';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "story" ADD "slug" character varying(100)`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "slug" character varying(100)`
    );
    await queryRunner.query(
      `ALTER TABLE "series" ADD "slug" character varying(100)`
    );

    await this._backfillSlugs(queryRunner, 'story', 'title', 'story');
    await this._backfillSlugs(queryRunner, 'user', 'name', 'member');
    await this._backfillSlugs(queryRunner, 'series', 'title', 'series');

    await queryRunner.query(
      `ALTER TABLE "story" ALTER COLUMN "slug" SET NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "story" ADD CONSTRAINT "UQ_9f213fc3a21e030a2e1510ba31b" UNIQUE ("slug")`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "slug" SET NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD CONSTRAINT "UQ_ac08b39ccb744ea6682c0db1c2d" UNIQUE ("slug")`
    );
    await queryRunner.query(
      `ALTER TABLE "series" ALTER COLUMN "slug" SET NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "series" ADD CONSTRAINT "UQ_aabf879e0e06d1b37922d5c9664" UNIQUE ("slug")`
    );
  }

  private async _backfillSlugs(
    queryRunner: QueryRunner,
    table: string,
    textColumn: string,
    fallback: string
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT "id", "${textColumn}" AS "text" FROM "${table}"`
    )) as {id: string; text: string}[];

    for (const row of rows) {
      await queryRunner.query(
        `UPDATE "${table}" SET "slug" = $1 WHERE "id" = $2`,
        [buildSlug(row.text, fallback), row.id]
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "series" DROP CONSTRAINT "UQ_aabf879e0e06d1b37922d5c9664"`
    );
    await queryRunner.query(`ALTER TABLE "series" DROP COLUMN "slug"`);
    await queryRunner.query(
      `ALTER TABLE "user" DROP CONSTRAINT "UQ_ac08b39ccb744ea6682c0db1c2d"`
    );
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "slug"`);
    await queryRunner.query(
      `ALTER TABLE "story" DROP CONSTRAINT "UQ_9f213fc3a21e030a2e1510ba31b"`
    );
    await queryRunner.query(`ALTER TABLE "story" DROP COLUMN "slug"`);
  }
}
