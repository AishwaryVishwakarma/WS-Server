import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import type {Job, Queue} from 'bullmq';
import {DeadLetterService} from 'src/jobs/dead-letter.service';
import {EMAIL_DEAD_LETTER_QUEUE, EMAIL_QUEUE} from 'src/jobs/queue.constants';
import type {EmailJobData} from 'src/jobs/queue.types';
import {MailTransportService} from './mail-transport.service';

@Processor(EMAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  constructor(
    private readonly transport: MailTransportService,
    private readonly deadLetters: DeadLetterService,
    @InjectQueue(EMAIL_DEAD_LETTER_QUEUE)
    private readonly deadLetterQueue: Queue
  ) {
    super();
  }

  async process(job: Job<EmailJobData>): Promise<void> {
    await this.transport.deliver(job.data);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<EmailJobData> | undefined, error: Error) {
    if (job) await this.deadLetters.capture(job, error, this.deadLetterQueue);
  }
}
