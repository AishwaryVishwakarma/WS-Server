import {IsEmail} from 'class-validator';

export class ResendRegistrationDto {
  @IsEmail()
  email: string;
}
