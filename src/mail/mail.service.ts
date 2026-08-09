import {Injectable, Logger} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';

const RESEND_API_URL = 'https://api.resend.com/emails';

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
  private readonly logger = new Logger(MailService.name);
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

  async send(
    to: string,
    subject: string,
    text: string,
    html?: string
  ): Promise<void> {
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
      body: JSON.stringify({from: this.from, to, subject, text, html}),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Resend API request failed (${response.status}): ${body}`
      );
    }
  }
}
