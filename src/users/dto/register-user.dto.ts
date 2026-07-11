import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsStrongPassword,
  IsUrl,
  MaxLength,
} from 'class-validator';

// Self-service DTO: excludes privileged fields (role, isVerified, isBlocked)
export class RegisterUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
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
  bio?: string;
}
