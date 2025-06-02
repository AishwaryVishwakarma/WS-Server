import {Exclude, Expose} from 'class-transformer';
import {Role} from '../enums/role';

/**
 * [public]
 */
export class UserPreviewResponseDto {
  @Expose() id: string;
  @Expose() name: string;
  @Expose() profileImageUrl?: string;
  @Expose() bio?: string;
  @Expose() isVerified: boolean;
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;

  @Exclude() password: string;

  constructor(partial: Partial<UserPreviewResponseDto>) {
    Object.assign(this, partial);
  }
}

/**
 * [private]
 */
export class UserPrivateResponseDto extends UserPreviewResponseDto {
  @Expose() email: string;

  constructor(partial: Partial<UserPrivateResponseDto>) {
    super(partial);
    Object.assign(this, partial);
  }
}

/**
 * [admin]
 */
export class UserResponseDto extends UserPrivateResponseDto {
  @Expose() role: Role;
  @Expose() isBlocked: boolean;
  @Expose() deletedAt?: Date;

  constructor(partial: Partial<UserResponseDto>) {
    super(partial);
    Object.assign(this, partial);
  }
}
