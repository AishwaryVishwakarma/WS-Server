import {Injectable, Logger} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import type {EmailJobData} from 'src/jobs/queue.types';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {User} from 'src/users/entities/user.entity';

const RESEND_API_URL = 'https://api.resend.com/emails';
const MAIL_REQUEST_TIMEOUT_MS = 10_000;

@Injectable()
export class MailTransportService {
  private readonly logger = new Logger(MailTransportService.name);
  private readonly apiKey: string | undefined;
  private readonly from: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>
  ) {
    this.apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.from =
      this.configService.get<string>('MAIL_FROM') ??
      'no-reply@whisperingshadows.net';
  }

  get enabled(): boolean {
    return !!this.apiKey;
  }

  async deliver({
    to,
    subject,
    text,
    html,
    headers,
  }: EmailJobData): Promise<void> {
    const recipient = await this.usersRepository.findOne({
      where: {email: to.trim().toLowerCase()},
      select: {id: true, emailSuppressedAt: true},
    });
    if (recipient?.emailSuppressedAt) {
      this.logger.warn(`Skipped email to suppressed recipient ${recipient.id}`);
      return;
    }

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
      body: JSON.stringify({from: this.from, to, subject, text, html, headers}),
    });

    if (!response.ok) {
      throw new Error(`Resend API request failed (${response.status})`);
    }
  }
}
