export interface EmailJobData {
  to: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
}

export interface DigestJobData {
  userId: string;
}

export interface ImagePurgeJobData {
  requestedBy: string;
}

export interface DeadLetterJobData<T = unknown> {
  sourceJobId: string | undefined;
  sourceJobName: string;
  payload: T;
  failedReason: string;
  attemptsMade: number;
  failedAt: string;
}
