import {
  IsEmail,
  IsEmpty,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsStrongPassword,
  IsUrl,
  MaxLength,
} from 'class-validator';
import {IsClean} from 'src/common/moderation/is-clean.decorator';

// Self-service DTO: excludes privileged fields (role, isVerified, isBlocked)
export class RegisterUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
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
  profileImageUrl?: string;

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
