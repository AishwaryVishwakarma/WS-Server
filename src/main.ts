import {Logger} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {DocumentBuilder, SwaggerModule} from '@nestjs/swagger';
import type {RedisClientType} from 'redis';
import {AppModule} from './app.module';
import {setupApp} from './app.setup';

async function bootstrap() {
  // Resend signs the exact request bytes; rawBody preserves them alongside
  // the parsed body for /webhooks/resend signature verification.
  const app = await NestFactory.create(AppModule, {rawBody: true});
  const logger = new Logger('Bootstrap', {timestamp: true});

  let redisClient: RedisClientType | undefined;
  try {
    redisClient = await setupApp(app);
  } catch (error) {
    logger.error(`App setup failed: ${error}`);
    process.exit(1); // Exit the process if setup (e.g. Redis connection) fails
  }

  // OpenAPI docs at /docs in non-production environments only. Set up here
  // (not in the shared app.setup) so the public production surface and the
  // integration test harness stays untouched. The @nestjs/swagger CLI plugin
  // (nest-cli.json) supplies schemas from the DTO types — no manual decorators
  // for request/response shapes; auth requirements are still hand-annotated
  // per route with @ApiCookieAuth('session'), since Swagger can't infer that
  // from a guard.
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Whispering Shadows API')
      .setDescription(
        'Story-sharing backend — auth, stories, tags, comments. ' +
          'Auth is session-based, not JWT: a 🔒 endpoint requires the ' +
          '`connect.sid` cookie from a prior login/register, sent automatically ' +
          'by a browser but not by "Try it out" here. Mutating requests also ' +
          'need an `x-csrf-token` header (see GET /auth/csrf-token) — endpoints ' +
          "in `CSRF_EXEMPT_PATHS` (login, register, password reset) don't."
      )
      .setVersion('1.0')
      .addCookieAuth(
        'connect.sid',
        {
          type: 'apiKey',
          in: 'cookie',
          name: 'connect.sid',
          description:
            'Session cookie set by POST /auth/login or /auth/register/confirm.',
        },
        'session'
      )
      .build();
    SwaggerModule.setup(
      'docs',
      app,
      SwaggerModule.createDocument(app, swaggerConfig)
    );
  }

  // Graceful shutdown: stop accepting connections, let Nest close the DB
  // pool via its lifecycle hooks, then release the session-store Redis
  // client (created outside DI in setupApp, so closed here explicitly).
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.log(`${signal} received — shutting down gracefully`);
    void (async () => {
      try {
        await app.close();
        await redisClient?.quit();
        logger.log('Shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error(`Error during shutdown: ${error}`);
        process.exit(1);
      }
    })();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await app.listen(process.env.PORT || 8000, () => {
    logger.log(
      `Application is running on: http://localhost:${process.env.PORT || 8000}`
    );
  });
}

void bootstrap();
