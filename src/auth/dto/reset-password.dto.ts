import {IsNotEmpty, IsString, IsStrongPassword} from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsStrongPassword()
  password: string;
}
