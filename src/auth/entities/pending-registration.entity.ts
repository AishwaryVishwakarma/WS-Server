import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {AvatarIcon} from 'src/users/enums/avatar-icon.enum';
import {AvatarColor} from 'src/users/enums/avatar-color.enum';

// A registration in progress: submitted name/email/password (plus whatever
// optional profile fields RegisterUserDto allows), waiting on the OTP emailed
// to that address. No `User` row exists yet — this is deleted once the code
// is verified (see RegistrationOtpService.confirm), at which point a real
// User is created from these fields. Keyed by email (not a user FK, since
// none exists) — unique, so a repeat registration attempt for the same
// address replaces the earlier pending one rather than piling up.
@Entity()
export class PendingRegistration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({unique: true})
  email: string;

  @Column({length: 100})
  name: string;

  // bcrypt hash — never the plaintext password, even for this short-lived row.
  @Column({length: 255})
  passwordHash: string;

  // Carried through unchanged to UsersService.createFromVerifiedRegistration,
  // which re-applies the same profile-image-setting gate create() always has
  // — nothing here needs its own enforcement. `type: 'varchar'` is required
  // (not just length) — TypeORM infers a column type from the property's
  // reflected design:type, and a `string | null` union reflects as `Object`,
  // which it can't map to a SQL type on its own (mirrors why User's own
  // profileImageUrl/bio are typed as plain `string` despite being nullable).
  @Column({type: 'varchar', length: 500, nullable: true})
  profileImageUrl: string | null;

  @Column({type: 'enum', enum: AvatarIcon, nullable: true})
  avatarIcon: AvatarIcon | null;

  @Column({type: 'enum', enum: AvatarColor, nullable: true})
  avatarColor: AvatarColor | null;

  @Column({type: 'varchar', length: 500, nullable: true})
  bio: string | null;

  // SHA-256 hex of the 6-digit code — same non-bcrypt reasoning as
  // PasswordResetToken.tokenHash: the code's brute-force resistance comes
  // from the attempt lockout + short TTL, not hash cost.
  @Column({length: 64})
  codeHash: string;

  @Column()
  expiresAt: Date;

  // Wrong-code guesses against the current codeHash — reset to 0 whenever a
  // fresh code is issued (resend). Locks out (deletes the row) at
  // MAX_VERIFY_ATTEMPTS.
  @Column({type: 'int', default: 0})
  attempts: number;

  @CreateDateColumn()
  createdAt: Date;
}
