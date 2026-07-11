import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import {DataSource} from 'typeorm';
import {Request} from 'express';
import {User} from 'src/users/entities/user.entity';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly dataSource: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.session.userId;

    if (!userId) {
      throw new UnauthorizedException('You are not logged in');
    }

    // Re-check the user on every request so blocking or deleting an account
    // takes effect immediately instead of surviving until the cookie expires.
    // findOneBy excludes soft-deleted rows, so a deleted user resolves to null.
    const user = await this.dataSource
      .getRepository(User)
      .findOneBy({id: userId});

    if (!user || user.isBlocked) {
      throw new UnauthorizedException('Your session is no longer valid');
    }

    // Keep the session role in sync with the DB so role changes take effect
    // and RolesGuard (which reads session.role) sees the current value.
    request.session.role = user.role;

    return true;
  }
}
