import {IsBoolean, IsEnum, IsOptional} from 'class-validator';
import {Role} from '../enums/role';
import {RegisterUserDto} from './register-user.dto';

// Admin-only DTO: adds privileged fields on top of the self-service ones
export class CreateUserDto extends RegisterUserDto {
  @IsOptional()
  @IsEnum(Role)
  role: Role;

  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @IsOptional()
  @IsBoolean()
  isBlocked?: boolean;
}
