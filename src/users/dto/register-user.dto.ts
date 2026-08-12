import {
  IsEmail,
  IsEmpty,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsStrongPassword,
  IsUrl,
  MaxLength,
} from 'class-validator';
import {IsClean} from 'src/common/moderation/is-clean.decorator';
import {AvatarIcon} from '../enums/avatar-icon.enum';
import {AvatarColor} from '../enums/avatar-color.enum';

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
  @IsUrl({
    max_allowed_length: 500,
  })
  profileImageUrl?: string | null;

  // Always available, unlike profileImageUrl — see SiteSettings.
  @IsOptional()
  @IsEnum(AvatarIcon)
  avatarIcon?: AvatarIcon | null;

  // An explicit background-color override — null clears back to the
  // frontend's name-based auto color. Same always-allowed treatment as
  // avatarIcon.
  @IsOptional()
  @IsEnum(AvatarColor)
  avatarColor?: AvatarColor | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @IsClean()
  bio?: string;

  // Honeypot: a hidden field a real user never fills. Bots that auto-fill every
  // input trip @IsEmpty and get a 400 before an account is created.
  @IsEmpty()
  website?: string;
}
