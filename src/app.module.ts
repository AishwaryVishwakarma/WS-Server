import {Module, RequestMethod, type MiddlewareConsumer} from '@nestjs/common';
import {AppController} from './app.controller';
import {AppService} from './app.service';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {TypeOrmModule} from '@nestjs/typeorm';
import {ThrottlerModule} from '@nestjs/throttler';
import {ScheduleModule} from '@nestjs/schedule';
import {APP_GUARD} from '@nestjs/core';
import {SessionThrottlerGuard} from './common/gaurds/session-throttler.gaurd';
import {DEFAULT_THROTTLE} from './common/constants/throttle';
import {UsersModule} from './users/users.module';
import {User} from './users/entities/user.entity';
import {UserReport} from './users/entities/user-report.entity';
import {AuthModule} from './auth/auth.module';
import {PasswordResetToken} from './auth/entities/password-reset-token.entity';
import {PendingRegistration} from './auth/entities/pending-registration.entity';
import {CsrfMiddleware} from './middlewares/csrf.middleware';
import {SessionService} from './session/session.service';
import {SessionModule} from './session/session.module';
import {StoriesModule} from './stories/stories.module';
import {Story} from './stories/entities/story.entity';
import {StoryReport} from './stories/entities/story-report.entity';
import {StoryRevision} from './stories/entities/story-revision.entity';
import {TagsModule} from './tags/tags.module';
import {Tag} from './tags/entities/tag.entity';
import {CommentsModule} from './comments/comments.module';
import {Comment} from './comments/entities/comment.entity';
import {CommentReport} from './comments/entities/comment-report.entity';
import {Notification} from './notifications/entities/notification.entity';
import {NotificationsModule} from './notifications/notifications.module';
import {MetricsModule} from './metrics/metrics.module';
import {Bookmark} from './bookmarks/entities/bookmark.entity';
import {BookmarksModule} from './bookmarks/bookmarks.module';
import {Follow} from './follows/entities/follow.entity';
import {FollowsModule} from './follows/follows.module';
import {MutesModule} from './mutes/mutes.module';
import {StoryLike} from './likes/entities/story-like.entity';
import {LikesModule} from './likes/likes.module';
import {ScareVote} from './scare-ratings/entities/scare-vote.entity';
import {MutedAuthor} from './mutes/entities/muted-author.entity';
import {ScareRatingsModule} from './scare-ratings/scare-ratings.module';
import {Series} from './series/entities/series.entity';
import {SeriesModule} from './series/series.module';
import {ReadingProgress} from './reading-progress/entities/reading-progress.entity';
import {ReadingProgressModule} from './reading-progress/reading-progress.module';
import {CommentReaction} from './comment-reactions/entities/comment-reaction.entity';
import {CommentReactionsModule} from './comment-reactions/comment-reactions.module';
import {DigestModule} from './digest/digest.module';
import {SiteSettings} from './settings/entities/site-settings.entity';
import {SettingsModule} from './settings/settings.module';
import {PresenceModule} from './presence/presence.module';
import {migrations} from './database/migrations';
import {RedisThrottlerStorage} from './common/redis-throttler.storage';
import {RateLimitModule} from './common/rate-limit.module';
import {JobsModule} from './jobs/jobs.module';
import {AdminAnalyticsModule} from './admin-analytics/admin-analytics.module';
import {AnalyticsEvent} from './admin-analytics/entities/analytics-event.entity';
import {ImageStorageModule} from './image-storage/image-storage.module';

// A reasonable default pool size when DB_POOL_SIZE is unset.
const DEFAULT_DB_POOL_SIZE = 10;

@Module({
  imports: [
    // Per-user (or per-IP) rate limiting — see SessionThrottlerGuard and
    // src/common/constants/throttle.ts for the tiers.
    RateLimitModule,
    JobsModule,
    ImageStorageModule,
    ThrottlerModule.forRootAsync({
      imports: [RateLimitModule],
      inject: [RedisThrottlerStorage],
      useFactory: (storage: RedisThrottlerStorage) => ({
        throttlers: [DEFAULT_THROTTLE],
        storage,
        errorMessage: 'Too many requests, please try again later.',
        // Rate limiting would fail integration tests after a few requests, and an
        // e2e run drives many flows from one IP — THROTTLE_DISABLED lets those
        // opt out (set in .env.test, and by the Playwright backend) without
        // affecting real deployments. Kept flag-only, not tied to NODE_ENV, so a
        // dedicated test can boot with it off and exercise the guard.
        skipIf: () => process.env.THROTTLE_DISABLED === 'true',
      }),
    }),
    // Load environment variables from .env file
    ConfigModule.forRoot({
      isGlobal: true,
      // NODE_ENV=test reads .env.test (throwaway test infra: ws_test on 3311,
      // Redis 6381, PORT 8001) so the e2e suite never touches the dev DB.
      // Everything else uses .env.
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
      validate: (config: Record<string, unknown>) => {
        const requiredConfig = [
          'DB_HOST',
          'DB_USERNAME',
          'DB_PASSWORD',
          'DB_NAME',
          'SESSION_SECRET',
          'REDIS_URL',
        ];

        for (const key of requiredConfig) {
          if (!config[key]) {
            throw new Error(`Missing required config: ${key}`);
          }
        }

        // A weak or well-known session secret allows session-cookie forgery.
        const sessionSecret = String(config.SESSION_SECRET);
        if (sessionSecret.length < 16) {
          throw new Error('SESSION_SECRET must be at least 16 characters');
        }

        // Example/dev secrets are fine locally but must never reach production.
        const nonProductionSecrets = [
          'some-ultra-long-secret', // former hardcoded fallback
          'dev-session-secret-change-me', // .env.example default
          'test-session-secret', // .env.test
        ];
        if (
          config.NODE_ENV === 'production' &&
          nonProductionSecrets.includes(sessionSecret)
        ) {
          throw new Error(
            'SESSION_SECRET is set to a known example value — set a unique secret in production'
          );
        }

        // Optional Postgres pool size (defaults to DEFAULT_DB_POOL_SIZE below
        // when unset). ws_db_pool_connections{state} in /metrics tracks live
        // usage; raise this if that gauge sits near the configured max
        // under load.
        if (config.DB_POOL_SIZE !== undefined) {
          const poolSize = Number(config.DB_POOL_SIZE);
          if (!Number.isInteger(poolSize) || poolSize < 1) {
            throw new Error('DB_POOL_SIZE must be a positive integer');
          }
        }

        if (config.DB_SLOW_QUERY_MS !== undefined) {
          const threshold = Number(config.DB_SLOW_QUERY_MS);
          if (!Number.isInteger(threshold) || threshold < 1) {
            throw new Error('DB_SLOW_QUERY_MS must be a positive integer');
          }
        }

        // /metrics is bearer-token protected; in production the token is
        // mandatory (fail-closed guard denies scrapes without it). Optional
        // locally/in tests so the endpoint simply stays closed there.
        if (config.NODE_ENV === 'production' && !config.METRICS_TOKEN) {
          throw new Error(
            'METRICS_TOKEN is required in production to protect the /metrics endpoint'
          );
        }

        if (config.NODE_ENV === 'production') {
          for (const key of [
            'APPWRITE_ENDPOINT',
            'APPWRITE_PROJECT_ID',
            'APPWRITE_API_KEY',
            'APPWRITE_IMAGE_BUCKET_ID',
          ]) {
            if (!config[key])
              throw new Error(`${key} is required in production`);
          }
          try {
            const endpoint = new URL(String(config.APPWRITE_ENDPOINT));
            if (endpoint.protocol !== 'https:') throw new Error();
          } catch {
            throw new Error('APPWRITE_ENDPOINT must be a valid HTTPS URL');
          }
        }

        if (config.APPWRITE_IMAGE_CAPACITY_BYTES !== undefined) {
          const capacity = Number(config.APPWRITE_IMAGE_CAPACITY_BYTES);
          if (!Number.isSafeInteger(capacity) || capacity < 1) {
            throw new Error(
              'APPWRITE_IMAGE_CAPACITY_BYTES must be a positive integer'
            );
          }
        }

        if (
          config.APPWRITE_IMAGE_NAMESPACE !== undefined &&
          (typeof config.APPWRITE_IMAGE_NAMESPACE !== 'string' ||
            !['production', 'development'].includes(
              config.APPWRITE_IMAGE_NAMESPACE
            ))
        ) {
          throw new Error(
            'APPWRITE_IMAGE_NAMESPACE must be production or development'
          );
        }

        if (
          config.IMAGE_PURGE_ENABLED !== undefined &&
          (typeof config.IMAGE_PURGE_ENABLED !== 'string' ||
            !['true', 'false'].includes(config.IMAGE_PURGE_ENABLED))
        ) {
          throw new Error('IMAGE_PURGE_ENABLED must be true or false');
        }

        // Fail fast on a typo'd NODE_ENV — it gates cookie security, so a
        // bad value silently weakens production.
        const nodeEnv = config.NODE_ENV;
        if (
          typeof nodeEnv === 'string' &&
          !['development', 'test', 'production'].includes(nodeEnv)
        ) {
          throw new Error(
            `Invalid NODE_ENV "${nodeEnv}" — expected development, test, or production`
          );
        }

        return config;
      },
    }),
    // Configure TypeORM with Postgres. The schema is owned by migrations
    // (src/database/migrations), applied automatically on boot — synchronize
    // stays off everywhere so dev/test/prod all run the same DDL.
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST'),
        port: parseInt(configService.get('DB_PORT') || '5432', 10),
        username: configService.get('DB_USERNAME'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_NAME'),
        // Maps to the pg Pool's `max` (verified in TypeORM's PostgresDriver —
        // poolSize is passed straight through as `max`). Watch
        // ws_db_pool_connections{state="free"} in /metrics: sitting near zero
        // under load means this is the ceiling to raise.
        poolSize: parseInt(
          configService.get('DB_POOL_SIZE') || String(DEFAULT_DB_POOL_SIZE),
          10
        ),
        maxQueryExecutionTime: parseInt(
          configService.get('DB_SLOW_QUERY_MS') || '500',
          10
        ),
        entities: [
          User,
          UserReport,
          Story,
          StoryReport,
          StoryRevision,
          Tag,
          Comment,
          CommentReport,
          Notification,
          Bookmark,
          Follow,
          StoryLike,
          PasswordResetToken,
          PendingRegistration,
          Series,
          ReadingProgress,
          ScareVote,
          MutedAuthor,
          CommentReaction,
          SiteSettings,
          AnalyticsEvent,
        ],
        synchronize: false,
        migrations,
        migrationsRun: true,
      }),
    }),
    AuthModule,
    SessionModule,
    UsersModule,
    StoriesModule,
    TagsModule,
    CommentsModule,
    NotificationsModule,
    MetricsModule,
    BookmarksModule,
    FollowsModule,
    MutesModule,
    LikesModule,
    SeriesModule,
    ReadingProgressModule,
    ScareRatingsModule,
    CommentReactionsModule,
    ScheduleModule.forRoot(),
    DigestModule,
    SettingsModule,
    PresenceModule,
    AdminAnalyticsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: SessionThrottlerGuard,
    },
    SessionService,
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CsrfMiddleware)
      .exclude(
        '/auth/login',
        '/auth/logout',
        '/auth/register',
        '/auth/register/confirm',
        '/auth/register/resend',
        '/auth/google',
        // No session exists yet at either step of a password reset (the
        // requester may not even be signed in, and consuming the link
        // replaces the only proof of identity a session would provide).
        '/auth/forgot-password',
        '/auth/reset-password',
        // Email clients call this without a browser session or CSRF cookie.
        // The HMAC-signed token is the authorization and the action can only
        // reduce email delivery, never subscribe or alter other account data.
        '/digest/unsubscribe',
        // Resend has no browser session/CSRF cookie. Authenticity is enforced
        // with its Svix signature over the untouched raw request body.
        '/webhooks/resend',
        // Anonymous read-counter ping — anonymous browsers can't hold a CSRF
        // token, and it's a harmless denormalized counter, not a real mutation.
        {path: 'stories/:id/view', method: RequestMethod.POST},
        // Same reasoning — an anonymous browser's very first request to the
        // site could plausibly be this presence heartbeat.
        {path: 'stories/:id/presence', method: RequestMethod.PUT},
        // navigator.sendBeacon (used so this "I'm leaving" ping reliably
        // fires even during a hard page unload) always POSTs and can't
        // attach a custom header, so it can never carry a CSRF token.
        {path: 'stories/:id/presence/leave', method: RequestMethod.POST}
      )
      .forRoutes('*');
  }
}
