import {Injectable, Logger} from '@nestjs/common';
import type {Job, Queue} from 'bullmq';
import type {DeadLetterJobData} from './queue.types';

@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);

  async capture<T>(job: Job<T>, error: Error, queue: Queue): Promise<void> {
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < attempts) return;

    const data: DeadLetterJobData<T> = {
      sourceJobId: job.id,
      sourceJobName: job.name,
      payload: job.data,
      failedReason: error.message,
      attemptsMade: job.attemptsMade,
      failedAt: new Date().toISOString(),
    };

    await queue.add(job.name, data, {
      jobId: `${job.queueName}-${job.id ?? job.timestamp}-${job.attemptsMade}`,
      removeOnComplete: false,
      removeOnFail: false,
    });
    this.logger.error(
      `Moved ${job.queueName} job ${job.id ?? 'unknown'} to ${queue.name}`
    );
  }
}
