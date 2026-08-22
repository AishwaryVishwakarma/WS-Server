import {
  IsEmail,
  IsEmpty,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsStrongPassword,
  MaxLength,
} from 'class-validator';
import {ApiHideProperty} from '@nestjs/swagger';
import {IsClean} from 'src/common/moderation/is-clean.decorator';

// Self-service DTO: excludes privileged fields (role, isVerified, isBlocked)
export class RegisterUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  @IsClean()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsStrongPassword()
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @IsClean()
  bio?: string;

  // The inbound code from someone else's referral link (?ref=), if any — not
  // to be confused with User.referralCode, this account's own outbound code.
  // An invalid/typo'd value is never rejected; see
  // RegistrationOtpService.start.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  referralCode?: string;

  // Honeypot: a hidden field a real user never fills. Bots that auto-fill every
  // input trip @IsEmpty and get a 400 before an account is created.
  @IsEmpty()
  website?: string;

  // Images are managed exclusively through the upload endpoints. Keep these
  // retired customization fields as validation-only guards so clients cannot
  // silently submit stale/raw avatar data through registration or profile DTOs.
  @ApiHideProperty()
  @IsEmpty()
  profileImageUrl?: string;

  @ApiHideProperty()
  @IsEmpty()
  avatarIcon?: string;

  @ApiHideProperty()
  @IsEmpty()
  avatarColor?: string;
}
