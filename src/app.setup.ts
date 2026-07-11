import {Logger, ValidationPipe, type INestApplication} from '@nestjs/common';
import {RedisStore} from 'connect-redis';
import session from 'express-session';
import {createClient, type RedisClientType} from 'redis';
import {CsrfExceptionFilter} from './common/filters/csrf-exception.filter';

// Applies the app-level wiring that lives outside the Nest module graph
// (pipes, filters, Redis-backed session middleware). Shared by main.ts and
// the integration test harness so both run the exact same stack.
export async function setupApp(
  app: INestApplication
): Promise<RedisClientType> {
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    })
  );
  app.useGlobalFilters(new CsrfExceptionFilter());

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const redisClient: RedisClientType = createClient({url: redisUrl});

  await redisClient.connect();
  new Logger('AppSetup', {timestamp: true}).log(
    `Connected to Redis, running on ${redisUrl}`
  );

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

  return redisClient;
}
