import {Injectable, Logger} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import type {EmailJobData} from 'src/jobs/queue.types';

const RESEND_API_URL = 'https://api.resend.com/emails';
const MAIL_REQUEST_TIMEOUT_MS = 10_000;

@Injectable()
export class MailTransportService {
  private readonly logger = new Logger(MailTransportService.name);
  private readonly apiKey: string | undefined;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.from =
      this.configService.get<string>('MAIL_FROM') ??
      'no-reply@whisperingshadows.net';
  }

  get enabled(): boolean {
    return !!this.apiKey;
  }

  async deliver({to, subject, text, html}: EmailJobData): Promise<void> {
    if (!this.apiKey) {
      this.logger.warn(
        `RESEND_API_KEY not configured — logging instead of sending.\nTo: ${to}\nSubject: ${subject}\n${text}`
      );
      return;
    }

    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(MAIL_REQUEST_TIMEOUT_MS),
      body: JSON.stringify({from: this.from, to, subject, text, html}),
    });

    if (!response.ok) {
      throw new Error(`Resend API request failed (${response.status})`);
    }
  }
}
