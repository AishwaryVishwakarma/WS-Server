import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import type {Job, Queue} from 'bullmq';
import {DeadLetterService} from 'src/jobs/dead-letter.service';
import {
  WINBACK_DEAD_LETTER_QUEUE,
  WINBACK_QUEUE,
} from 'src/jobs/queue.constants';
import type {WinbackJobData} from 'src/jobs/queue.types';
import {WinbackService} from './winback.service';

@Processor(WINBACK_QUEUE, {concurrency: 5})
export class WinbackProcessor extends WorkerHost {
  constructor(
    private readonly winbackService: WinbackService,
    private readonly deadLetters: DeadLetterService,
    @InjectQueue(WINBACK_DEAD_LETTER_QUEUE)
    private readonly deadLetterQueue: Queue
  ) {
    super();
  }

  async process(job: Job<WinbackJobData>): Promise<boolean> {
    return this.winbackService.processUser(job.data.userId);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<WinbackJobData> | undefined, error: Error) {
    if (job) await this.deadLetters.capture(job, error, this.deadLetterQueue);
  }
}
