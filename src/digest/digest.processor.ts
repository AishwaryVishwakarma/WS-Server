import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import type {Job, Queue} from 'bullmq';
import {DeadLetterService} from 'src/jobs/dead-letter.service';
import {DIGEST_DEAD_LETTER_QUEUE, DIGEST_QUEUE} from 'src/jobs/queue.constants';
import type {DigestJobData} from 'src/jobs/queue.types';
import {DigestService} from './digest.service';

@Processor(DIGEST_QUEUE, {concurrency: 5})
export class DigestProcessor extends WorkerHost {
  constructor(
    private readonly digestService: DigestService,
    private readonly deadLetters: DeadLetterService,
    @InjectQueue(DIGEST_DEAD_LETTER_QUEUE)
    private readonly deadLetterQueue: Queue
  ) {
    super();
  }

  async process(job: Job<DigestJobData>): Promise<boolean> {
    return this.digestService.processUser(job.data.userId);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<DigestJobData> | undefined, error: Error) {
    if (job) await this.deadLetters.capture(job, error, this.deadLetterQueue);
  }
}
