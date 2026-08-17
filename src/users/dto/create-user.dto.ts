import {IsBoolean, IsEnum, IsOptional} from 'class-validator';
import {Role} from '../enums/role';
import {MembershipTier} from '../enums/membership-tier.enum';
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

  // Phase 0: the only way membership is granted/revoked today (no payment
  // processor) — see UsersService.update's founding-member logic.
  @IsOptional()
  @IsEnum(MembershipTier)
  membershipTier?: MembershipTier;
}
