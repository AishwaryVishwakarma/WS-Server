import type {MigrationInterface, QueryRunner} from 'typeorm';

export class AddSeasonalEvents1787050000000 implements MigrationInterface {
  name = 'AddSeasonalEvents1787050000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "seasonal_event" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" character varying(80) NOT NULL,
        "description" character varying(240) NOT NULL,
        "goal" smallint NOT NULL,
        "startsAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "endsAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "isPublished" boolean NOT NULL DEFAULT false,
        "rewardLabel" character varying(80),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_seasonal_event" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_seasonal_event_goal" CHECK ("goal" >= 1 AND "goal" <= 25),
        CONSTRAINT "CHK_seasonal_event_window" CHECK ("endsAt" > "startsAt")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "seasonal_event_tags" (
        "eventId" uuid NOT NULL,
        "tagId" uuid NOT NULL,
        CONSTRAINT "PK_seasonal_event_tags" PRIMARY KEY ("eventId", "tagId"),
        CONSTRAINT "FK_seasonal_event_tags_event" FOREIGN KEY ("eventId") REFERENCES "seasonal_event"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_seasonal_event_tags_tag" FOREIGN KEY ("tagId") REFERENCES "tag"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_seasonal_event_tags_tag" ON "seasonal_event_tags" ("tagId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_seasonal_event_window" ON "seasonal_event" ("isPublished", "startsAt", "endsAt")`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "seasonal_event_tags"`);
    await queryRunner.query(`DROP TABLE "seasonal_event"`);
  }
}
