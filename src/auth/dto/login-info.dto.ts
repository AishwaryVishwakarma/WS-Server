import {IsEmail, IsNotEmpty, IsString} from 'class-validator';

export class LoginInfoDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
