import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {InjectRepository} from '@nestjs/typeorm';
import {In, Repository} from 'typeorm';
import {Webhook} from 'svix';
import {User} from 'src/users/entities/user.entity';

type SuppressionReason = 'bounce' | 'complaint' | 'provider';

interface ResendEvent {
  type: string;
  data?: {
    to?: string[];
    bounce?: {type?: string};
  };
}

interface WebhookHeaders {
  id?: string;
  timestamp?: string;
  signature?: string;
}

@Injectable()
export class ResendWebhookService {
  private readonly secret: string | undefined;

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    configService: ConfigService
  ) {
    this.secret = configService.get<string>('RESEND_WEBHOOK_SECRET');
  }

  async handle(rawBody: Buffer | undefined, headers: WebhookHeaders) {
    if (!this.secret) {
      throw new ServiceUnavailableException(
        'Email webhooks are not configured'
      );
    }
    if (!rawBody || !headers.id || !headers.timestamp || !headers.signature) {
      throw new BadRequestException('Invalid webhook');
    }

    let event: ResendEvent;
    try {
      event = new Webhook(this.secret).verify(rawBody.toString('utf8'), {
        'svix-id': headers.id,
        'svix-timestamp': headers.timestamp,
        'svix-signature': headers.signature,
      }) as ResendEvent;
    } catch {
      throw new BadRequestException('Invalid webhook');
    }

    const reason = this._suppressionReason(event);
    const recipients = [...new Set(event.data?.to ?? [])]
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    if (!reason || recipients.length === 0) return;

    await this.usersRepository.update(
      {email: In(recipients)},
      {
        digestEmailEnabled: false,
        emailSuppressedAt: new Date(),
        emailSuppressionReason: reason,
      }
    );
  }

  private _suppressionReason(event: ResendEvent): SuppressionReason | null {
    if (event.type === 'email.complained') return 'complaint';
    if (event.type === 'email.suppressed') return 'provider';
    if (
      event.type === 'email.bounced' &&
      (!event.data?.bounce?.type || event.data.bounce.type === 'Permanent')
    ) {
      return 'bounce';
    }
    return null;
  }
}
