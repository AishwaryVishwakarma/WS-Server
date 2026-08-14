import * as crypto from 'crypto';
import {BadRequestException, Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {PendingRegistration} from './entities/pending-registration.entity';
import {RegisterUserDto} from 'src/users/dto/register-user.dto';
import {UsersService} from 'src/users/users.service';
import {MailService} from 'src/mail/mail.service';
import {EMAIL_ACCENT_COLOR, renderEmailHtml} from 'src/mail/email-template';
import {AvatarIcon} from 'src/users/enums/avatar-icon.enum';
import {AvatarColor} from 'src/users/enums/avatar-color.enum';

// A code is meant to be read off an email and typed back in one sitting —
// unlike a password-reset link, there's no reason to let it sit unused for
// an hour, so the window is much shorter.
const OTP_TTL_MS = 10 * 60 * 1000;

// The code space is only a million values, so unlike a reset token's 256
// random bits, brute force has to be bounded by attempts, not entropy.
const MAX_VERIFY_ATTEMPTS = 5;

export interface ConfirmedRegistration {
  name: string;
  email: string;
  passwordHash: string;
  profileImageUrl: string | null;
  avatarIcon: AvatarIcon | null;
  avatarColor: AvatarColor | null;
  bio: string | null;
}

@Injectable()
export class RegistrationOtpService {
  constructor(
    @InjectRepository(PendingRegistration)
    private readonly pendingRepository: Repository<PendingRegistration>,
    private readonly usersService: UsersService,
    private readonly mailService: MailService
  ) {}

  private _hash(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  private _generateCode(): string {
    // Browser tests must complete the real verification UI without reading
    // production mail. This override is deliberately impossible outside the
    // test environment, even if the variable is accidentally configured.
    if (
      process.env.NODE_ENV === 'test' &&
      /^\d{6}$/.test(process.env.REGISTRATION_OTP_TEST_CODE ?? '')
    ) {
      return process.env.REGISTRATION_OTP_TEST_CODE!;
    }

    return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private async _issueAndSend(
    pending: Pick<PendingRegistration, 'email'>
  ): Promise<{codeHash: string; expiresAt: Date}> {
    const code = this._generateCode();
    const codeHash = this._hash(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await this.mailService.send(
      pending.email,
      'Verify your Whispering Shadows email',
      `Your verification code is ${code}. It expires in 10 minutes.\n\n` +
        `If you didn't try to create an account, you can safely ignore this email.`,
      renderEmailHtml({
        preheader: `Your verification code is ${code}.`,
        heading: 'Verify your email',
        bodyHtml:
          '<p style="margin:0 0 20px;">Enter this code to finish creating ' +
          'your account. It expires in 10 minutes.</p>' +
          `<div style="padding:20px 12px; border:1px solid #34343d; border-radius:10px; background:#222229; text-align:center;">` +
          `<p style="margin:0; font-size:11px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:#777681;">Verification code</p>` +
          `<p style="margin:8px 0 0; font-size:34px; line-height:1.2; font-weight:700; letter-spacing:.24em; color:${EMAIL_ACCENT_COLOR}; font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;">${code}</p>` +
          `</div>`,
        footnote:
          "If you didn't try to create an account, you can safely ignore this email.",
      })
    );

    return {codeHash, expiresAt};
  }

  async start(dto: RegisterUserDto): Promise<void> {
    // PendingRegistration has no entity-level normalizeEmail hook (unlike
    // User) since it's a short-lived staging row, not the source of truth —
    // lowercase here so it still lines up with User.email's stored casing
    // (see User.normalizeEmail) for the register-step existing-account check.
    const email = dto.email.toLowerCase();
    const passwordHash = await this.usersService.hashPassword(dto.password);

    await this.pendingRepository.delete({email});

    const {codeHash, expiresAt} = await this._issueAndSend({email});

    await this.pendingRepository.save(
      this.pendingRepository.create({
        email,
        name: dto.name,
        passwordHash,
        profileImageUrl: dto.profileImageUrl ?? null,
        avatarIcon: dto.avatarIcon ?? null,
        avatarColor: dto.avatarColor ?? null,
        bio: dto.bio ?? null,
        codeHash,
        expiresAt,
      })
    );
  }

  async resend(rawEmail: string): Promise<void> {
    const email = rawEmail.toLowerCase();
    const pending = await this.pendingRepository.findOne({where: {email}});
    if (!pending) return;

    const {codeHash, expiresAt} = await this._issueAndSend(pending);
    pending.codeHash = codeHash;
    pending.expiresAt = expiresAt;
    pending.attempts = 0;
    await this.pendingRepository.save(pending);
  }

  async confirm(
    rawEmail: string,
    code: string
  ): Promise<ConfirmedRegistration> {
    const email = rawEmail.toLowerCase();
    const pending = await this.pendingRepository.findOne({where: {email}});

    if (!pending || pending.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    if (pending.codeHash !== this._hash(code)) {
      pending.attempts += 1;

      if (pending.attempts >= MAX_VERIFY_ATTEMPTS) {
        await this.pendingRepository.delete({email});
        throw new BadRequestException(
          'Too many incorrect attempts — request a new code'
        );
      }

      await this.pendingRepository.save(pending);
      throw new BadRequestException('Incorrect code');
    }

    await this.pendingRepository.delete({email});

    return {
      name: pending.name,
      email: pending.email,
      passwordHash: pending.passwordHash,
      profileImageUrl: pending.profileImageUrl,
      avatarIcon: pending.avatarIcon,
      avatarColor: pending.avatarColor,
      bio: pending.bio,
    };
  }
}
