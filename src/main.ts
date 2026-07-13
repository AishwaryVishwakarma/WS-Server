import {Logger} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {DocumentBuilder, SwaggerModule} from '@nestjs/swagger';
import type {RedisClientType} from 'redis';
import {AppModule} from './app.module';
import {setupApp} from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap', {timestamp: true});

  let redisClient: RedisClientType | undefined;
  try {
    redisClient = await setupApp(app);
  } catch (error) {
    logger.error(`App setup failed: ${error}`);
    process.exit(1); // Exit the process if setup (e.g. Redis connection) fails
  }

  // OpenAPI docs at /docs. Set up here (not in the shared app.setup) so the
  // integration test harness stays untouched. The @nestjs/swagger CLI plugin
  // (nest-cli.json) supplies schemas from the DTO types — no manual decorators.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Whispering Shadows API')
    .setDescription('Story-sharing backend — auth, stories, tags, comments.')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig)
  );

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
