import {IsEmail, IsNumberString, Length} from 'class-validator';

export class ConfirmRegistrationDto {
  @IsEmail()
  email: string;

  @IsNumberString()
  @Length(6, 6)
  code: string;
}
