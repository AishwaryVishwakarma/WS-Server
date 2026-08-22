import {Injectable} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {InjectRepository} from '@nestjs/typeorm';
import {createHmac, timingSafeEqual} from 'crypto';
import {Repository} from 'typeorm';
import {User} from 'src/users/entities/user.entity';

// Separate token context (and separate flag, winbackEmailEnabled) from
// DigestUnsubscribeService — a different email with a different reason to
// opt out, so sharing digestEmailEnabled's "unsubscribe from weekly emails"
// copy would misrepresent what's actually being turned off.
const TOKEN_CONTEXT = 'winback-unsubscribe';

@Injectable()
export class WinbackUnsubscribeService {
  private readonly secret: string;

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    configService: ConfigService
  ) {
    this.secret = configService.getOrThrow<string>('SESSION_SECRET');
  }

  createToken(userId: string): string {
    const payload = Buffer.from(userId).toString('base64url');
    return `${payload}.${this._sign(payload)}`;
  }

  async unsubscribe(token: string): Promise<boolean> {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra || !this._valid(payload, signature)) {
      return false;
    }

    const userId = Buffer.from(payload, 'base64url').toString('utf8');
    const result = await this.usersRepository.update(
      {id: userId},
      {winbackEmailEnabled: false}
    );
    return (result.affected ?? 0) > 0;
  }

  private _sign(payload: string): string {
    return createHmac('sha256', this.secret)
      .update(`${TOKEN_CONTEXT}:${payload}`)
      .digest('base64url');
  }

  private _valid(payload: string, signature: string): boolean {
    const expected = Buffer.from(this._sign(payload));
    const supplied = Buffer.from(signature);
    return (
      expected.length === supplied.length && timingSafeEqual(expected, supplied)
    );
  }
}
