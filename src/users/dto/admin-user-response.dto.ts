import {Expose} from 'class-transformer';
import {UserResponseDto} from './user-response.dto';

export class AdminUserResponseDto extends UserResponseDto {
  @Expose() isAdmin: boolean;
  @Expose() isBlocked: boolean;

  constructor(partial: Partial<AdminUserResponseDto>) {
    super(partial);
    Object.assign(this, partial);
  }
}
