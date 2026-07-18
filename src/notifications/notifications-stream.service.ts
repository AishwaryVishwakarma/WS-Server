import {
  Injectable,
  type MessageEvent,
  type OnModuleDestroy,
} from '@nestjs/common';
import {Observable, Subject, filter, interval, map, merge} from 'rxjs';
import type {RedisClientType} from 'redis';

// Redis channel every API instance publishes to / subscribes on, so a reply
// created on one instance reaches an SSE connection held by another.
const CHANNEL = 'notifications';
// Emitted periodically so proxies don't drop an otherwise-idle SSE connection;
// the client ignores pings.
const HEARTBEAT_MS = 25_000;

interface StreamEvent {
  userId: string;
  // The story the notification concerns, so a reader viewing that story can
  // refresh its comment thread live. Absent on legacy/malformed messages.
  storyId?: string;
}

// Fans reply-notification events out to Server-Sent Events streams. The Redis
// publisher and subscriber clients live outside the Nest graph (created in
// app.setup) and are bound in here; the subscriber feeds dispatch(), which
// pushes onto the in-process subject that per-user streams filter.
@Injectable()
export class NotificationsStream implements OnModuleDestroy {
  private readonly events$ = new Subject<StreamEvent>();
  private publisher?: RedisClientType;
  private subscriber?: RedisClientType;

  get channel(): string {
    return CHANNEL;
  }

  bindPublisher(client: RedisClientType): void {
    this.publisher = client;
  }

  bindSubscriber(client: RedisClientType): void {
    this.subscriber = client;
  }

  // Called by the Redis subscriber (app.setup) for each pub/sub message.
  dispatch(event: StreamEvent): void {
    this.events$.next(event);
  }

  async publish(userId: string, storyId?: string): Promise<void> {
    if (!this.publisher) return;
    await this.publisher.publish(CHANNEL, JSON.stringify({userId, storyId}));
  }

  // The SSE feed for one user: their notification events plus a heartbeat.
  streamFor(userId: string): Observable<MessageEvent> {
    const notifications = this.events$.pipe(
      filter((event) => event.userId === userId),
      map((event): MessageEvent => ({
        data: {type: 'notification', storyId: event.storyId},
      }))
    );
    const heartbeat = interval(HEARTBEAT_MS).pipe(
      map((): MessageEvent => ({data: {type: 'ping'}}))
    );
    return merge(notifications, heartbeat);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit().catch(() => undefined);
    }
  }
}
