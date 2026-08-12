import {Global, Module} from '@nestjs/common';
import {BullModule} from '@nestjs/bullmq';
import {ConfigService} from '@nestjs/config';
import {ConfigModule} from '@nestjs/config';
import {
  DIGEST_DEAD_LETTER_QUEUE,
  DIGEST_QUEUE,
  EMAIL_DEAD_LETTER_QUEUE,
  EMAIL_QUEUE,
} from './queue.constants';
import {DeadLetterService} from './dead-letter.service';

function redisConnection(redisUrl: string) {
  const url = new URL(redisUrl);
  const db = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username || undefined,
    password: url.password || undefined,
    db: Number.isInteger(db) ? db : 0,
    ...(url.protocol === 'rediss:' ? {tls: {}} : {}),
  };
}

@Global()
@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: redisConnection(config.getOrThrow<string>('REDIS_URL')),
      }),
    }),
    BullModule.registerQueue(
      {name: EMAIL_QUEUE},
      {name: EMAIL_DEAD_LETTER_QUEUE},
      {name: DIGEST_QUEUE},
      {name: DIGEST_DEAD_LETTER_QUEUE}
    ),
  ],
  providers: [DeadLetterService],
  exports: [BullModule, DeadLetterService],
})
export class JobsModule {}
