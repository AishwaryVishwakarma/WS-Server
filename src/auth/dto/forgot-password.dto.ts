import {IsEmail, IsEmpty} from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  email: string;

  // Honeypot: a hidden field a real user never fills. Bots that auto-fill every
  // input trip @IsEmpty and get a 400 before any lookup runs.
  @IsEmpty()
  website?: string;
}
