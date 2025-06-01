import {Module, type MiddlewareConsumer} from '@nestjs/common';
import {AppController} from './app.controller';
import {AppService} from './app.service';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {TypeOrmModule} from '@nestjs/typeorm';
import {ThrottlerGuard, ThrottlerModule} from '@nestjs/throttler';
import {APP_GUARD} from '@nestjs/core';
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

@Module({
  imports: [
    // Default throttler configuration (10 requests per minute)
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60 * 1000,
          limit: 10,
        },
      ],
      errorMessage: 'Too many requests, please try again later.',
    }),
    // Load environment variables from .env file
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, unknown>) => {
        const requiredConfig = [
          'DB_HOST',
          'DB_USERNAME',
          'DB_PASSWORD',
          'DB_NAME',
        ];

        for (const key of requiredConfig) {
          if (!config[key]) {
            throw new Error(`Missing required config: ${key}`);
          }
        }

        return config;
      },
    }),
    // Configure TypeORM with MySQL
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
        entities: [User, Story, Tag, Comment],
        synchronize: configService.get('NODE_ENV') !== 'production',
      }),
    }),
    AuthModule,
    SessionModule,
    UsersModule,
    StoriesModule,
    TagsModule,
    CommentsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    SessionService,
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    // consumer
    //   .apply(CsrfMiddleware)
    //   .exclude('/auth/login', '/auth/logout', '/auth/register')
    //   .forRoutes('*');
  }
}
