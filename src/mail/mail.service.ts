import {Injectable, Logger} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import * as nodemailer from 'nodemailer';

// Optional, like Google sign-in (see GoogleAuthService): unset SMTP_HOST
// disables real delivery rather than failing app boot. Unlike Google
// sign-in, callers never need to branch on `enabled` — send() always
// succeeds from the caller's perspective, falling back to logging the
// message so dev/CI can still exercise a full email-driven flow (e.g.
// grab a password-reset link from the console) without real credentials.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly from: string;
  private readonly transporter: nodemailer.Transporter | null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    this.from =
      this.configService.get<string>('SMTP_FROM') ??
      'no-reply@whisperingshadows.dev';

    const user = this.configService.get<string>('SMTP_USER');
    this.transporter = host
      ? nodemailer.createTransport({
          host,
          port: parseInt(this.configService.get('SMTP_PORT') || '587', 10),
          secure: this.configService.get('SMTP_SECURE') === 'true',
          auth: user
            ? {user, pass: this.configService.get<string>('SMTP_PASSWORD')}
            : undefined,
        })
      : null;
  }

  get enabled(): boolean {
    return this.transporter !== null;
  }

  async send(to: string, subject: string, text: string): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(
        `SMTP not configured — logging instead of sending.\nTo: ${to}\nSubject: ${subject}\n${text}`
      );
      return;
    }

    await this.transporter.sendMail({from: this.from, to, subject, text});
  }
}
