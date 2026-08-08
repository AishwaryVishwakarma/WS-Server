import {MigrationInterface, QueryRunner} from 'typeorm';

export class Baseline1786175459406 implements MigrationInterface {
  name = 'Baseline1786175459406';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // TypeORM's `@PrimaryGeneratedColumn('uuid')` emits `DEFAULT
    // uuid_generate_v4()` on Postgres, which needs this extension — it
    // isn't enabled by default and migration:generate doesn't add it for
    // you.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "tag" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(20) NOT NULL, "slug" character varying(20) NOT NULL, CONSTRAINT "UQ_6a9775008add570dc3e5a0bab7b" UNIQUE ("name"), CONSTRAINT "UQ_3413aed3ecde54f832c4f44f045" UNIQUE ("slug"), CONSTRAINT "PK_8e4052373c579afc1471f526760" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "comment_report" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "commentId" uuid, "userId" uuid, CONSTRAINT "UQ_cef0f7f862ea6ffd5a99dd640eb" UNIQUE ("userId", "commentId"), CONSTRAINT "PK_6c4ddf5b4b438eff30ef1bf1fad" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "comment" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "content" text NOT NULL, "isFlagged" boolean NOT NULL DEFAULT false, "reportCount" integer NOT NULL DEFAULT '0', "isHiddenByAuthor" boolean NOT NULL DEFAULT false, "reactionCount" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid, "storyId" uuid, "parentId" uuid, CONSTRAINT "PK_0b0e4bbc8415ec426f87f3a88e2" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_comment_story_createdAt" ON "comment" ("storyId", "createdAt") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_comment_isFlagged_reportCount" ON "comment" ("isFlagged", "reportCount") `
    );
    await queryRunner.query(
      `CREATE TYPE "public"."story_report_reason_enum" AS ENUM('plagiarism', 'spam', 'graphic_content', 'copyright', 'harassment', 'other')`
    );
    await queryRunner.query(
      `CREATE TABLE "story_report" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "reason" "public"."story_report_reason_enum" NOT NULL DEFAULT 'other', "details" character varying(100), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "storyId" uuid, "userId" uuid, CONSTRAINT "UQ_97bd2dbd78007a1cb480064429b" UNIQUE ("userId", "storyId"), CONSTRAINT "PK_807a129d4f727ecb56d83ecc389" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TYPE "public"."story_revision_statusbefore_enum" AS ENUM('draft', 'pending', 'approved', 'rejected', 'flagged')`
    );
    await queryRunner.query(
      `CREATE TABLE "story_revision" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying(255) NOT NULL, "excerpt" character varying(300) NOT NULL, "content" text NOT NULL, "coverImageUrl" character varying, "contentWarnings" character varying(255) NOT NULL DEFAULT '', "tagNames" text, "statusBefore" "public"."story_revision_statusbefore_enum" NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "storyId" uuid, CONSTRAINT "PK_6d18fee554cd17be7a396563bc4" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "series" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying(100) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "authorId" uuid, CONSTRAINT "UQ_2c6490de8ce06b68045717ced51" UNIQUE ("authorId", "title"), CONSTRAINT "PK_e725676647382eb54540d7128ba" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TYPE "public"."story_status_enum" AS ENUM('draft', 'pending', 'approved', 'rejected', 'flagged')`
    );
    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        'ws_dev',
        'public',
        'story',
        'GENERATED_COLUMN',
        'searchVector',
        "setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(excerpt, '')), 'B')",
      ]
    );
    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        'ws_dev',
        'public',
        'story',
        'GENERATED_COLUMN',
        'trendingScore',
        '"likeCount" * 3 + "commentCount" * 4 + "viewCount"',
      ]
    );
    await queryRunner.query(
      `CREATE TABLE "story" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying(255) NOT NULL, "excerpt" character varying(300) NOT NULL, "content" text NOT NULL, "searchVector" tsvector GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(excerpt, '')), 'B')) STORED NOT NULL, "coverImageUrl" character varying, "scareLevel" integer NOT NULL DEFAULT '1', "contentWarnings" character varying(255) NOT NULL DEFAULT '', "isFlagged" boolean NOT NULL DEFAULT false, "rejectionReason" character varying(500), "scheduledFor" TIMESTAMP, "wordCount" integer NOT NULL DEFAULT '0', "commentCount" integer NOT NULL DEFAULT '0', "viewCount" integer NOT NULL DEFAULT '0', "likeCount" integer NOT NULL DEFAULT '0', "trendingScore" integer GENERATED ALWAYS AS ("likeCount" * 3 + "commentCount" * 4 + "viewCount") STORED NOT NULL, "scareRatingSum" integer NOT NULL DEFAULT '0', "scareRatingCount" integer NOT NULL DEFAULT '0', "reportCount" integer NOT NULL DEFAULT '0', "status" "public"."story_status_enum" NOT NULL DEFAULT 'pending', "seriesPosition" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "authorId" uuid, "seriesId" uuid, CONSTRAINT "PK_28fce6873d61e2cace70a0f3361" PRIMARY KEY ("id"))`
    );
    // TypeORM's @Index has no first-class GIN option — a plain btree
    // index on a tsvector column would work but defeat the point (no
    // fast containment/match lookups), so this is hand-patched.
    await queryRunner.query(
      `CREATE INDEX "IDX_story_fulltext" ON "story" USING GIN ("searchVector") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_story_reportCount" ON "story" ("reportCount") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_story_status_likeCount" ON "story" ("status", "likeCount") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_story_status_viewCount" ON "story" ("status", "viewCount") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_story_status_commentCount" ON "story" ("status", "commentCount") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_story_status_createdAt" ON "story" ("status", "createdAt") `
    );
    await queryRunner.query(
      `CREATE TYPE "public"."user_report_reason_enum" AS ENUM('spam', 'harassment', 'inappropriate_image', 'impersonation', 'other')`
    );
    await queryRunner.query(
      `CREATE TABLE "user_report" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "reason" "public"."user_report_reason_enum" NOT NULL DEFAULT 'other', "details" character varying(100), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "reportedUserId" uuid, "reporterId" uuid, CONSTRAINT "UQ_b7e6a0e7ec2ebe9c8941ee243e3" UNIQUE ("reporterId", "reportedUserId"), CONSTRAINT "PK_58c08f0e20fa66561b119421eb2" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TYPE "public"."user_role_enum" AS ENUM('user', 'admin', 'superadmin')`
    );
    await queryRunner.query(
      `CREATE TYPE "public"."user_avataricon_enum" AS ENUM('ghost', 'moon', 'skull', 'bat', 'spider', 'pumpkin', 'candle', 'eye')`
    );
    await queryRunner.query(
      `CREATE TYPE "public"."user_avatarcolor_enum" AS ENUM('ember', 'spectral', 'blood', 'success', 'warning')`
    );
    await queryRunner.query(
      `CREATE TABLE "user" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "email" character varying NOT NULL, "password" character varying(255), "googleId" character varying(255), "role" "public"."user_role_enum" NOT NULL DEFAULT 'user', "isVerified" boolean NOT NULL DEFAULT false, "hasPublishedStory" boolean NOT NULL DEFAULT false, "verificationLocked" boolean NOT NULL DEFAULT false, "isBlocked" boolean NOT NULL DEFAULT false, "profileImageUrl" character varying(500), "avatarIcon" "public"."user_avataricon_enum", "avatarColor" "public"."user_avatarcolor_enum", "bio" character varying(500), "mutedContentWarnings" character varying(255) NOT NULL DEFAULT '', "reportCount" integer NOT NULL DEFAULT '0', "currentStreak" integer NOT NULL DEFAULT '0', "longestStreak" integer NOT NULL DEFAULT '0', "lastActiveDate" character varying(10), "digestEmailEnabled" boolean NOT NULL DEFAULT true, "lastDigestSentAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_reportCount" ON "user" ("reportCount") `
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_user_googleId" ON "user" ("googleId") `
    );
    await queryRunner.query(
      `CREATE TABLE "password_reset_token" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tokenHash" character varying(64) NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid NOT NULL, CONSTRAINT "UQ_324e592c57094c9dcfa00ddf919" UNIQUE ("tokenHash"), CONSTRAINT "PK_838af121380dfe3a6330e04f5bb" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TYPE "public"."pending_registration_avataricon_enum" AS ENUM('ghost', 'moon', 'skull', 'bat', 'spider', 'pumpkin', 'candle', 'eye')`
    );
    await queryRunner.query(
      `CREATE TYPE "public"."pending_registration_avatarcolor_enum" AS ENUM('ember', 'spectral', 'blood', 'success', 'warning')`
    );
    await queryRunner.query(
      `CREATE TABLE "pending_registration" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "name" character varying(100) NOT NULL, "passwordHash" character varying(255) NOT NULL, "profileImageUrl" character varying(500), "avatarIcon" "public"."pending_registration_avataricon_enum", "avatarColor" "public"."pending_registration_avatarcolor_enum", "bio" character varying(500), "codeHash" character varying(64) NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "attempts" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_0ed441e3fc33d7cedbd63046182" UNIQUE ("email"), CONSTRAINT "PK_63e892e181e9c3409e02ed84827" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "notification" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" character varying(20) NOT NULL DEFAULT 'reply', "actorName" character varying(100) NOT NULL, "actorId" character varying(36), "storyId" character varying(36), "storyTitle" character varying(255), "commentId" character varying(36), "parentId" character varying(36), "isRead" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "recipientId" uuid NOT NULL, CONSTRAINT "PK_705b6c7cdf9b2c2ff7ac7872cb7" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_recipient_createdAt" ON "notification" ("recipientId", "createdAt") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_recipient_isRead" ON "notification" ("recipientId", "isRead") `
    );
    await queryRunner.query(
      `CREATE TABLE "bookmark" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid, "storyId" uuid, CONSTRAINT "IDX_bookmark_user_story" UNIQUE ("userId", "storyId"), CONSTRAINT "PK_b7fbf4a865ba38a590bb9239814" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bookmark_user_createdAt" ON "bookmark" ("userId", "createdAt") `
    );
    await queryRunner.query(
      `CREATE TABLE "follow" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "followerId" uuid, "followingId" uuid, CONSTRAINT "IDX_follow_follower_following" UNIQUE ("followerId", "followingId"), CONSTRAINT "PK_fda88bc28a84d2d6d06e19df6e5" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_follow_following" ON "follow" ("followingId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_follow_follower" ON "follow" ("followerId") `
    );
    await queryRunner.query(
      `CREATE TABLE "story_like" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid, "storyId" uuid, CONSTRAINT "IDX_story_like_user_story" UNIQUE ("userId", "storyId"), CONSTRAINT "PK_60d762da5ea61294cc33fc02944" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_story_like_user" ON "story_like" ("userId") `
    );
    await queryRunner.query(
      `CREATE TABLE "reading_progress" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "percent" smallint NOT NULL, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid, "storyId" uuid, CONSTRAINT "IDX_reading_progress_user_story" UNIQUE ("userId", "storyId"), CONSTRAINT "CHK_9ef88330bd449cf5ea8400266f" CHECK ("percent" >= 0 AND "percent" <= 100), CONSTRAINT "PK_2360621825d1001b80d94996cbb" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_reading_progress_user_updatedAt" ON "reading_progress" ("userId", "updatedAt") `
    );
    await queryRunner.query(
      `CREATE TABLE "scare_vote" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "value" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid, "storyId" uuid, CONSTRAINT "IDX_scare_vote_user_story" UNIQUE ("userId", "storyId"), CONSTRAINT "PK_7a443b1bfa2d1eed7ec225f3c49" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_scare_vote_user" ON "scare_vote" ("userId") `
    );
    await queryRunner.query(
      `CREATE TABLE "muted_author" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid, "mutedAuthorId" uuid, CONSTRAINT "IDX_muted_author_user_muted" UNIQUE ("userId", "mutedAuthorId"), CONSTRAINT "PK_cc4689ce57a2340497d9a1a4330" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_muted_author_user" ON "muted_author" ("userId") `
    );
    await queryRunner.query(
      `CREATE TABLE "comment_reaction" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid, "commentId" uuid, CONSTRAINT "IDX_comment_reaction_user_comment" UNIQUE ("userId", "commentId"), CONSTRAINT "PK_87f27d282c06eb61b1e0cde2d24" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_comment_reaction_user" ON "comment_reaction" ("userId") `
    );
    await queryRunner.query(
      `CREATE TABLE "site_settings" ("id" integer NOT NULL DEFAULT '1', "requireStoryApproval" boolean NOT NULL DEFAULT true, "allowProfileImageUpload" boolean NOT NULL DEFAULT false, "allowStoryCoverImage" boolean NOT NULL DEFAULT false, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e4290e8371a166d7e066d131f6e" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "story_tags_tag" ("storyId" uuid NOT NULL, "tagId" uuid NOT NULL, CONSTRAINT "PK_e733ae92f88da6d43084f80a52b" PRIMARY KEY ("storyId", "tagId"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0b20906042d8989c8ccd78f066" ON "story_tags_tag" ("storyId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4446ab22e74a04a38ddfca8a9e" ON "story_tags_tag" ("tagId") `
    );
    await queryRunner.query(
      `ALTER TABLE "comment_report" ADD CONSTRAINT "FK_027245f081e2200c00d6d75d1ed" FOREIGN KEY ("commentId") REFERENCES "comment"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "comment_report" ADD CONSTRAINT "FK_f5d76a882255aab76133a175b55" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "comment" ADD CONSTRAINT "FK_c0354a9a009d3bb45a08655ce3b" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "comment" ADD CONSTRAINT "FK_fe13edd1431a248a0eeac11ae43" FOREIGN KEY ("storyId") REFERENCES "story"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "comment" ADD CONSTRAINT "FK_e3aebe2bd1c53467a07109be596" FOREIGN KEY ("parentId") REFERENCES "comment"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "story_report" ADD CONSTRAINT "FK_d48331b6dc987c069e5d1b5ca98" FOREIGN KEY ("storyId") REFERENCES "story"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "story_report" ADD CONSTRAINT "FK_2b2bc279fabd733b237ef5588fb" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "story_revision" ADD CONSTRAINT "FK_a62131f5a63309e46b90f50a942" FOREIGN KEY ("storyId") REFERENCES "story"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "series" ADD CONSTRAINT "FK_d12f33f1dfdfe7cfdd8a3de53ac" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "story" ADD CONSTRAINT "FK_deb112632d0b5be276f59287d99" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "story" ADD CONSTRAINT "FK_f5f3ec812c421ba04460e4aff46" FOREIGN KEY ("seriesId") REFERENCES "series"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "user_report" ADD CONSTRAINT "FK_2d3711064572aa0203cba01242b" FOREIGN KEY ("reportedUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "user_report" ADD CONSTRAINT "FK_142ad20f8e4e5385b548940b62c" FOREIGN KEY ("reporterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "password_reset_token" ADD CONSTRAINT "FK_a4e53583f7a8ab7d01cded46a41" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "notification" ADD CONSTRAINT "FK_ab7cbe7a013ecac5da0a8f88884" FOREIGN KEY ("recipientId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "bookmark" ADD CONSTRAINT "FK_bookmark_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "bookmark" ADD CONSTRAINT "FK_bookmark_story" FOREIGN KEY ("storyId") REFERENCES "story"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "follow" ADD CONSTRAINT "FK_follow_follower" FOREIGN KEY ("followerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "follow" ADD CONSTRAINT "FK_follow_following" FOREIGN KEY ("followingId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "story_like" ADD CONSTRAINT "FK_story_like_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "story_like" ADD CONSTRAINT "FK_story_like_story" FOREIGN KEY ("storyId") REFERENCES "story"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "reading_progress" ADD CONSTRAINT "FK_reading_progress_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "reading_progress" ADD CONSTRAINT "FK_reading_progress_story" FOREIGN KEY ("storyId") REFERENCES "story"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "scare_vote" ADD CONSTRAINT "FK_scare_vote_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "scare_vote" ADD CONSTRAINT "FK_scare_vote_story" FOREIGN KEY ("storyId") REFERENCES "story"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "muted_author" ADD CONSTRAINT "FK_muted_author_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "muted_author" ADD CONSTRAINT "FK_muted_author_muted" FOREIGN KEY ("mutedAuthorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "comment_reaction" ADD CONSTRAINT "FK_comment_reaction_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "comment_reaction" ADD CONSTRAINT "FK_comment_reaction_comment" FOREIGN KEY ("commentId") REFERENCES "comment"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "story_tags_tag" ADD CONSTRAINT "FK_0b20906042d8989c8ccd78f066b" FOREIGN KEY ("storyId") REFERENCES "story"("id") ON DELETE CASCADE ON UPDATE CASCADE`
    );
    await queryRunner.query(
      `ALTER TABLE "story_tags_tag" ADD CONSTRAINT "FK_4446ab22e74a04a38ddfca8a9e5" FOREIGN KEY ("tagId") REFERENCES "tag"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "story_tags_tag" DROP CONSTRAINT "FK_4446ab22e74a04a38ddfca8a9e5"`
    );
    await queryRunner.query(
      `ALTER TABLE "story_tags_tag" DROP CONSTRAINT "FK_0b20906042d8989c8ccd78f066b"`
    );
    await queryRunner.query(
      `ALTER TABLE "comment_reaction" DROP CONSTRAINT "FK_comment_reaction_comment"`
    );
    await queryRunner.query(
      `ALTER TABLE "comment_reaction" DROP CONSTRAINT "FK_comment_reaction_user"`
    );
    await queryRunner.query(
      `ALTER TABLE "muted_author" DROP CONSTRAINT "FK_muted_author_muted"`
    );
    await queryRunner.query(
      `ALTER TABLE "muted_author" DROP CONSTRAINT "FK_muted_author_user"`
    );
    await queryRunner.query(
      `ALTER TABLE "scare_vote" DROP CONSTRAINT "FK_scare_vote_story"`
    );
    await queryRunner.query(
      `ALTER TABLE "scare_vote" DROP CONSTRAINT "FK_scare_vote_user"`
    );
    await queryRunner.query(
      `ALTER TABLE "reading_progress" DROP CONSTRAINT "FK_reading_progress_story"`
    );
    await queryRunner.query(
      `ALTER TABLE "reading_progress" DROP CONSTRAINT "FK_reading_progress_user"`
    );
    await queryRunner.query(
      `ALTER TABLE "story_like" DROP CONSTRAINT "FK_story_like_story"`
    );
    await queryRunner.query(
      `ALTER TABLE "story_like" DROP CONSTRAINT "FK_story_like_user"`
    );
    await queryRunner.query(
      `ALTER TABLE "follow" DROP CONSTRAINT "FK_follow_following"`
    );
    await queryRunner.query(
      `ALTER TABLE "follow" DROP CONSTRAINT "FK_follow_follower"`
    );
    await queryRunner.query(
      `ALTER TABLE "bookmark" DROP CONSTRAINT "FK_bookmark_story"`
    );
    await queryRunner.query(
      `ALTER TABLE "bookmark" DROP CONSTRAINT "FK_bookmark_user"`
    );
    await queryRunner.query(
      `ALTER TABLE "notification" DROP CONSTRAINT "FK_ab7cbe7a013ecac5da0a8f88884"`
    );
    await queryRunner.query(
      `ALTER TABLE "password_reset_token" DROP CONSTRAINT "FK_a4e53583f7a8ab7d01cded46a41"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_report" DROP CONSTRAINT "FK_142ad20f8e4e5385b548940b62c"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_report" DROP CONSTRAINT "FK_2d3711064572aa0203cba01242b"`
    );
    await queryRunner.query(
      `ALTER TABLE "story" DROP CONSTRAINT "FK_f5f3ec812c421ba04460e4aff46"`
    );
    await queryRunner.query(
      `ALTER TABLE "story" DROP CONSTRAINT "FK_deb112632d0b5be276f59287d99"`
    );
    await queryRunner.query(
      `ALTER TABLE "series" DROP CONSTRAINT "FK_d12f33f1dfdfe7cfdd8a3de53ac"`
    );
    await queryRunner.query(
      `ALTER TABLE "story_revision" DROP CONSTRAINT "FK_a62131f5a63309e46b90f50a942"`
    );
    await queryRunner.query(
      `ALTER TABLE "story_report" DROP CONSTRAINT "FK_2b2bc279fabd733b237ef5588fb"`
    );
    await queryRunner.query(
      `ALTER TABLE "story_report" DROP CONSTRAINT "FK_d48331b6dc987c069e5d1b5ca98"`
    );
    await queryRunner.query(
      `ALTER TABLE "comment" DROP CONSTRAINT "FK_e3aebe2bd1c53467a07109be596"`
    );
    await queryRunner.query(
      `ALTER TABLE "comment" DROP CONSTRAINT "FK_fe13edd1431a248a0eeac11ae43"`
    );
    await queryRunner.query(
      `ALTER TABLE "comment" DROP CONSTRAINT "FK_c0354a9a009d3bb45a08655ce3b"`
    );
    await queryRunner.query(
      `ALTER TABLE "comment_report" DROP CONSTRAINT "FK_f5d76a882255aab76133a175b55"`
    );
    await queryRunner.query(
      `ALTER TABLE "comment_report" DROP CONSTRAINT "FK_027245f081e2200c00d6d75d1ed"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4446ab22e74a04a38ddfca8a9e"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0b20906042d8989c8ccd78f066"`
    );
    await queryRunner.query(`DROP TABLE "story_tags_tag"`);
    await queryRunner.query(`DROP TABLE "site_settings"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_comment_reaction_user"`);
    await queryRunner.query(`DROP TABLE "comment_reaction"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_muted_author_user"`);
    await queryRunner.query(`DROP TABLE "muted_author"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_scare_vote_user"`);
    await queryRunner.query(`DROP TABLE "scare_vote"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_reading_progress_user_updatedAt"`
    );
    await queryRunner.query(`DROP TABLE "reading_progress"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_story_like_user"`);
    await queryRunner.query(`DROP TABLE "story_like"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_follow_follower"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_follow_following"`);
    await queryRunner.query(`DROP TABLE "follow"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bookmark_user_createdAt"`
    );
    await queryRunner.query(`DROP TABLE "bookmark"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_notification_recipient_isRead"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_notification_recipient_createdAt"`
    );
    await queryRunner.query(`DROP TABLE "notification"`);
    await queryRunner.query(`DROP TABLE "pending_registration"`);
    await queryRunner.query(
      `DROP TYPE "public"."pending_registration_avatarcolor_enum"`
    );
    await queryRunner.query(
      `DROP TYPE "public"."pending_registration_avataricon_enum"`
    );
    await queryRunner.query(`DROP TABLE "password_reset_token"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_user_googleId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_user_reportCount"`);
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`DROP TYPE "public"."user_avatarcolor_enum"`);
    await queryRunner.query(`DROP TYPE "public"."user_avataricon_enum"`);
    await queryRunner.query(`DROP TYPE "public"."user_role_enum"`);
    await queryRunner.query(`DROP TABLE "user_report"`);
    await queryRunner.query(`DROP TYPE "public"."user_report_reason_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_story_status_createdAt"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_story_status_commentCount"`
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_story_status_viewCount"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_story_status_likeCount"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_story_reportCount"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_story_fulltext"`);
    await queryRunner.query(`DROP TABLE "story"`);
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "database" = $3 AND "schema" = $4 AND "table" = $5`,
      ['GENERATED_COLUMN', 'trendingScore', 'ws_dev', 'public', 'story']
    );
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "database" = $3 AND "schema" = $4 AND "table" = $5`,
      ['GENERATED_COLUMN', 'searchVector', 'ws_dev', 'public', 'story']
    );
    await queryRunner.query(`DROP TYPE "public"."story_status_enum"`);
    await queryRunner.query(`DROP TABLE "series"`);
    await queryRunner.query(`DROP TABLE "story_revision"`);
    await queryRunner.query(
      `DROP TYPE "public"."story_revision_statusbefore_enum"`
    );
    await queryRunner.query(`DROP TABLE "story_report"`);
    await queryRunner.query(`DROP TYPE "public"."story_report_reason_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_comment_isFlagged_reportCount"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_comment_story_createdAt"`
    );
    await queryRunner.query(`DROP TABLE "comment"`);
    await queryRunner.query(`DROP TABLE "comment_report"`);
    await queryRunner.query(`DROP TABLE "tag"`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS "uuid-ossp"`);
  }
}
