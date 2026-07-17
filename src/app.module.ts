import {Module, type MiddlewareConsumer} from '@nestjs/common';
import {AppController} from './app.controller';
import {AppService} from './app.service';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {TypeOrmModule} from '@nestjs/typeorm';
import {ThrottlerModule} from '@nestjs/throttler';
import {APP_GUARD} from '@nestjs/core';
import {SessionThrottlerGuard} from './common/gaurds/session-throttler.gaurd';
import {DEFAULT_THROTTLE} from './common/constants/throttle';
import {UsersModule} from './users/users.module';
import {User} from './users/entities/user.entity';
import {AuthModule} from './auth/auth.module';
import {CsrfMiddleware} from './middlewares/csrf.middleware';
import {SessionService} from './session/session.service';
import {SessionModule} from './session/session.module';
import {StoriesModule} from './stories/stories.module';
import {Story} from './stories/entities/story.entity';
import {TagsModule} from './tags/tags.module';
import {Tag} from './tags/entities/tag.entity';
import {CommentsModule} from './comments/comments.module';
import {Comment} from './comments/entities/comment.entity';
import {CommentReport} from './comments/entities/comment-report.entity';
import {Notification} from './notifications/entities/notification.entity';
import {NotificationsModule} from './notifications/notifications.module';
import {MetricsModule} from './metrics/metrics.module';
import {migrations} from './database/migrations';

@Module({
  imports: [
    // Per-user (or per-IP) rate limiting — see SessionThrottlerGuard and
    // src/common/constants/throttle.ts for the tiers.
    ThrottlerModule.forRoot({
      throttlers: [DEFAULT_THROTTLE],
      errorMessage: 'Too many requests, please try again later.',
      // Rate limiting would fail integration tests after a few requests, and
      // an e2e run drives many flows from one IP — THROTTLE_DISABLED lets the
      // Playwright backend opt out without affecting real deployments.
      skipIf: () =>
        process.env.NODE_ENV === 'test' ||
        process.env.THROTTLE_DISABLED === 'true',
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

        // /metrics is bearer-token protected; in production the token is
        // mandatory (fail-closed guard denies scrapes without it). Optional
        // locally/in tests so the endpoint simply stays closed there.
        if (config.NODE_ENV === 'production' && !config.METRICS_TOKEN) {
          throw new Error(
            'METRICS_TOKEN is required in production to protect the /metrics endpoint'
          );
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
    // Configure TypeORM with MySQL. The schema is owned by migrations
    // (src/database/migrations), applied automatically on boot — synchronize
    // stays off everywhere so dev/test/prod all run the same DDL.
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get('DB_HOST'),
        port: parseInt(configService.get('DB_PORT') || '3306', 10),
        username: configService.get('DB_USERNAME'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_NAME'),
        entities: [User, Story, Tag, Comment, CommentReport, Notification],
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
      .exclude('/auth/login', '/auth/logout', '/auth/register')
      .forRoutes('*');
  }
}
