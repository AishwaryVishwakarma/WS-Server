import {plainToInstance} from 'class-transformer';
import {AdminUserResponseDto} from 'src/users/dto/admin-user-response.dto';
import {UserResponseDto} from 'src/users/dto/user-response.dto';
import type {User} from 'src/users/entities/user.entity';

export function serializeUser(user: User, isAdmin = false) {
  return plainToInstance(
    isAdmin ? AdminUserResponseDto : UserResponseDto,
    user,
    {excludeExtraneousValues: true}
  );
}
