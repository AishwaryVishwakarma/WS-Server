import {IsNotEmpty, IsString, IsStrongPassword} from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsString()
  @IsStrongPassword()
  newPassword: string;
}
