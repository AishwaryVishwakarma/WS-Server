import type {JobsOptions} from 'bullmq';
import {JOB_ATTEMPTS, JOB_BACKOFF_MS} from './queue.constants';

export const DURABLE_JOB_OPTIONS: JobsOptions = {
  attempts: JOB_ATTEMPTS,
  backoff: {type: 'exponential', delay: JOB_BACKOFF_MS},
  removeOnComplete: {age: 8 * 24 * 60 * 60, count: 10_000},
  removeOnFail: false,
};
