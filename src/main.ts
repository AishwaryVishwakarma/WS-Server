import {NestFactory} from '@nestjs/core';
import {AppModule} from './app.module';
import {Logger, ValidationPipe} from '@nestjs/common';
import {createClient} from 'redis';
import {RedisStore} from 'connect-redis';
import * as session from 'express-session';
import {CsrfExceptionFilter} from './common/filters/csrf-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    })
  );
  app.useGlobalFilters(new CsrfExceptionFilter());

  // Initialize Redis client
  const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  });

  try {
    await redisClient.connect();
    new Logger('Bootstrap', {timestamp: true}).log(
      `Connected to Redis, running on ${process.env.REDIS_URL || 'redis://localhost:6379'}`
    );
  } catch (error) {
    new Logger('Bootstrap', {timestamp: true}).error(
      `Redis connection error: ${error}`
    );
    process.exit(1); // Exit the process if Redis connection fails
  }

  const store = new RedisStore({
    client: redisClient,
  });

  // Middleware to handle session management
  app.use(
    session({
      store,
      secret: process.env.SESSION_SECRET || 'some-ultra-long-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 1 day
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      },
    })
  );

  await app.listen(process.env.PORT || 8000, () => {
    new Logger('Bootstrap', {timestamp: true}).log(
      `Application is running on: http://localhost:${process.env.PORT || 8000}`
    );
  });
}

void bootstrap();
