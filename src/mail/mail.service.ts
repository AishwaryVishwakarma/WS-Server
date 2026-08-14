import {Injectable} from '@nestjs/common';
import {InjectQueue} from '@nestjs/bullmq';
import type {Queue} from 'bullmq';
import {EMAIL_QUEUE} from 'src/jobs/queue.constants';
import {DURABLE_JOB_OPTIONS} from 'src/jobs/queue.options';

// Sends via Resend's HTTPS API rather than raw SMTP. SMTP was the original
// design (provider-agnostic — any SMTP host worked via env vars alone), but
// Railway (and many PaaS platforms) silently drops outbound SMTP
// connections: send() would hang for minutes before ever failing, since
// nothing on the wire actively refuses the connection. HTTPS on 443 is
// always reachable, so this trades that provider-agnosticism for actually
// working on the platform this app runs on. Optional, like Google sign-in:
// unset RESEND_API_KEY disables real delivery rather than failing app boot,
// falling back to logging so dev/CI can still exercise a full email-driven
// flow (grab the link/code from the console) without real credentials.
@Injectable()
export class MailService {
  constructor(@InjectQueue(EMAIL_QUEUE) private readonly queue: Queue) {}

  async send(
    to: string,
    subject: string,
    text: string,
    html?: string,
    options?: {delay?: number}
  ): Promise<void> {
    await this.queue.add(
      'send',
      {to, subject, text, html},
      {...DURABLE_JOB_OPTIONS, delay: options?.delay}
    );
  }
}
