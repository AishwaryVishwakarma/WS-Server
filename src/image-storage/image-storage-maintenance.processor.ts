import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import type {Job, Queue} from 'bullmq';
import {DeadLetterService} from 'src/jobs/dead-letter.service';
import {
  IMAGE_MAINTENANCE_DEAD_LETTER_QUEUE,
  IMAGE_MAINTENANCE_QUEUE,
} from 'src/jobs/queue.constants';
import type {ImagePurgeJobData} from 'src/jobs/queue.types';
import {ImageStorageMaintenanceService} from './image-storage-maintenance.service';

@Processor(IMAGE_MAINTENANCE_QUEUE, {concurrency: 1})
export class ImageStorageMaintenanceProcessor extends WorkerHost {
  constructor(
    private readonly maintenance: ImageStorageMaintenanceService,
    private readonly deadLetters: DeadLetterService,
    @InjectQueue(IMAGE_MAINTENANCE_DEAD_LETTER_QUEUE)
    private readonly deadLetterQueue: Queue
  ) {
    super();
  }

  process(job: Job<ImagePurgeJobData>) {
    return this.maintenance.purge(job);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<ImagePurgeJobData> | undefined, error: Error) {
    if (job) await this.deadLetters.capture(job, error, this.deadLetterQueue);
  }
}
