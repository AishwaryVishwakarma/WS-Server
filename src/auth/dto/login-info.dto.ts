import {IsEmail, IsEmpty, IsNotEmpty, IsString} from 'class-validator';

export class LoginInfoDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  // Honeypot: a hidden field a real user never fills. Bots that auto-fill every
  // input trip @IsEmpty and get a 400 before any credential check runs.
  @IsEmpty()
  website?: string;
}
