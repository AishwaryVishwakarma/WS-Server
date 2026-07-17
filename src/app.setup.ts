import {Logger, ValidationPipe, type INestApplication} from '@nestjs/common';
import {RedisStore} from 'connect-redis';
import cookieParser from 'cookie-parser';
import type {Express} from 'express';
import session from 'express-session';
import {createClient, type RedisClientType} from 'redis';
import {AllExceptionsFilter} from './common/filters/all-exceptions.filter';
import {LoggingInterceptor} from './common/interceptors/logging.interceptor';
import {requestIdMiddleware} from './middlewares/request-id';
import {createHttpMetricsMiddleware} from './middlewares/http-metrics';
import {MetricsService} from './metrics/metrics.service';
import {NotificationsStream} from './notifications/notifications-stream.service';

// Applies the app-level wiring that lives outside the Nest module graph
// (pipes, filters, Redis-backed session middleware). Shared by main.ts and
// the integration test harness so both run the exact same stack.
export async function setupApp(
  app: INestApplication
): Promise<RedisClientType> {
  // First in the chain: stamp every request with a correlation id (req.requestId
  // + X-Request-Id response header) so logs, errors and clients can line up. Set
  // before session/CSRF so even a rejected request is traceable.
  const expressApp = app.getHttpAdapter().getInstance() as Express;
  expressApp.use(requestIdMiddleware);

  // Record HTTP metrics for every request (including those later rejected by
  // session/CSRF), so put it early too. Timing closes on response 'finish'.
  const metricsService = app.get(MetricsService);
  expressApp.use(createHttpMetricsMiddleware(metricsService));

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    })
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Behind one reverse proxy in production (and the Next.js /api proxy),
  // trust the first X-Forwarded-For hop so req.ip is the real client for the
  // throttler's anonymous IP fallback.
  expressApp.set('trust proxy', 1);

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const redisClient: RedisClientType = createClient({url: redisUrl});

  await redisClient.connect();
  new Logger('AppSetup', {timestamp: true}).log(
    `Connected to Redis, running on ${redisUrl}`
  );

  // Redis lives outside the Nest graph, so hand it to MetricsService for the
  // ws_redis_up health gauge.
  metricsService.bindRedis(redisClient);

  // Wire notification pub/sub: the main client publishes, a dedicated
  // subscriber connection (a client in subscribe mode can't run commands) feeds
  // events into the SSE stream service. The subscriber is closed via the
  // service's onModuleDestroy on app shutdown.
  const notificationsStream = app.get(NotificationsStream);
  const subscriber = redisClient.duplicate();
  await subscriber.connect();
  notificationsStream.bindPublisher(redisClient);
  notificationsStream.bindSubscriber(subscriber);
  await subscriber.subscribe(notificationsStream.channel, (message: string) => {
    try {
      notificationsStream.dispatch(JSON.parse(message) as {userId: string});
    } catch {
      // Ignore malformed messages rather than crash the subscriber.
    }
  });

  const store = new RedisStore({
    client: redisClient,
  });

  // csrf-csrf's double-submit reads/writes real cookies, so req.cookies must
  // be populated before the CSRF middleware runs.
  app.use(cookieParser());

  // Middleware to handle session management
  app.use(
    session({
      store,
      // SESSION_SECRET is validated as required in AppModule's ConfigModule
      secret: process.env.SESSION_SECRET!,
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
