import * as crypto from 'crypto';
import {BadRequestException, Injectable, Logger} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {PasswordResetToken} from './entities/password-reset-token.entity';
import {UsersService} from 'src/users/users.service';
import {MailService} from 'src/mail/mail.service';
import {renderEmailHtml} from 'src/mail/email-template';
import {SessionRegistryService} from 'src/session/session-registry.service';

// A link is valid for an hour and can only ever be used once.
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
// A reset request is intentionally idempotent during this window. This is
// separate from the broad auth endpoint throttle: it prevents one account's
// inbox being flooded even when requests arrive from different sessions/IPs.
const RESET_RESEND_COOLDOWN_MS = 60 * 1000;

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  constructor(
    @InjectRepository(PasswordResetToken)
    private readonly tokensRepository: Repository<PasswordResetToken>,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly sessionRegistryService: SessionRegistryService
  ) {}

  private _hash(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  // Always resolves the same way whether or not the email is registered —
  // responding differently (an error for an unknown email, say) would let
  // an attacker enumerate accounts by trying addresses here. If it IS
  // registered, mail a fresh single-use link; any of the user's previous
  // outstanding links are invalidated first, so only the newest ever works.
  async requestReset(email: string): Promise<void> {
    const user = await this.usersService.findOneByEmail(email);
    if (!user) return;

    // Use the concrete join column here. Some TypeORM/Postgres combinations
    // do not resolve a nested relation predicate on this unidirectional
    // relation, which made the cooldown silently miss an existing token.
    const existingToken = await this.tokensRepository
      .createQueryBuilder('token')
      .where('token."userId" = :userId', {userId: user.id})
      .orderBy('token."createdAt"', 'DESC')
      .getOne();
    const coolingDown = existingToken
      ? existingToken.expiresAt
        ? existingToken.expiresAt.getTime() - Date.now() >
          RESET_TOKEN_TTL_MS - RESET_RESEND_COOLDOWN_MS
        : Boolean(
            existingToken.createdAt &&
            Date.now() - existingToken.createdAt.getTime() <
              RESET_RESEND_COOLDOWN_MS
          )
      : false;
    if (coolingDown) return;

    await this.tokensRepository.delete({user: {id: user.id}});

    const rawToken = crypto.randomBytes(32).toString('hex');
    await this.tokensRepository.save(
      this.tokensRepository.create({
        user,
        tokenHash: this._hash(rawToken),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      })
    );

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

    // Delivery is intentionally detached from the HTTP response. Known and
    // unknown addresses now both return after local database work rather than
    // exposing account existence through a provider-sized timing difference.
    void this.mailService
      .send(
        user.email,
        'Reset your Whispering Shadows password',
        `Someone (hopefully you) asked to reset your password. This link ` +
          `expires in an hour and works only once:\n\n${resetUrl}\n\n` +
          `If you didn't request this, you can safely ignore this email.`,
        renderEmailHtml({
          preheader: 'Reset your password — this link expires in an hour.',
          heading: 'Reset your password',
          bodyHtml:
            '<p style="margin:0;">Someone (hopefully you) asked to reset your ' +
            'Whispering Shadows password. This link expires in an hour and ' +
            'works only once.</p>',
          cta: {label: 'Reset password', url: resetUrl},
          footnote:
            "If you didn't request this, you can safely ignore this email.",
        })
      )
      .catch((error: unknown) => {
        this.logger.error(
          `Failed to send password-reset email for user ${user.id}`,
          error instanceof Error ? error.stack : undefined
        );
      });
  }

  // Consumes a reset link: validates the hashed token and its expiry, sets
  // the new password, and invalidates every outstanding token for that user
  // (not just the one used) — a stale link from an earlier request must not
  // also be replayable afterward. Also logs out every active session for the
  // account: this flow is unauthenticated (no session exists to exempt as
  // "current"), and if the reset was prompted by a compromised password, a
  // still-live session elsewhere is exactly what needs to be cut off.
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const token = await this.tokensRepository.findOne({
      where: {tokenHash: this._hash(rawToken)},
      relations: ['user'],
    });

    if (!token || token.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired reset link');
    }

    await this.usersService.updatePassword(token.user.id, newPassword);
    await this.tokensRepository.delete({user: {id: token.user.id}});
    await this.sessionRegistryService.invalidateAll(token.user.id);
  }
}
