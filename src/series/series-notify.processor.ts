import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import type {Job, Queue} from 'bullmq';
import {DeadLetterService} from 'src/jobs/dead-letter.service';
import {
  SERIES_NOTIFY_DEAD_LETTER_QUEUE,
  SERIES_NOTIFY_QUEUE,
} from 'src/jobs/queue.constants';
import type {SeriesNotifyJobData} from 'src/jobs/queue.types';
import {NotificationsService} from 'src/notifications/notifications.service';

@Processor(SERIES_NOTIFY_QUEUE, {concurrency: 5})
export class SeriesNotifyProcessor extends WorkerHost {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly deadLetters: DeadLetterService,
    @InjectQueue(SERIES_NOTIFY_DEAD_LETTER_QUEUE)
    private readonly deadLetterQueue: Queue
  ) {
    super();
  }

  async process(job: Job<SeriesNotifyJobData>): Promise<void> {
    const data = job.data;
    await this.notificationsService.createNotification({
      type: 'series',
      recipientId: data.recipientId,
      actorName: data.actorName,
      actorId: data.actorId,
      actorSlug: data.actorSlug,
      storyId: data.storyId,
      storySlug: data.storySlug,
      storyTitle: data.storyTitle,
    });
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<SeriesNotifyJobData> | undefined, error: Error) {
    if (job) await this.deadLetters.capture(job, error, this.deadLetterQueue);
  }
}
