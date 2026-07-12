import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import {DataSource} from 'typeorm';
import {Request} from 'express';
import {User} from 'src/users/entities/user.entity';

// For publicly readable routes: anonymous visitors pass through, while a
// valid session still identifies the viewer (so authors see their own pending
// stories and admins see everything). A stale or revoked session is degraded
// to anonymous rather than rejected — crucially clearing the persisted role,
// which would otherwise let a blocked admin keep admin-level reads.
@Injectable()
export class OptionalSessionAuthGuard implements CanActivate {
  constructor(private readonly dataSource: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.session.userId;

    if (!userId) {
      return true;
    }

    const user = await this.dataSource
      .getRepository(User)
      .findOneBy({id: userId});

    if (!user || user.isBlocked) {
      request.session.userId = undefined;
      request.session.role = undefined;
      return true;
    }

    // Same role sync as SessionAuthGuard so role changes take effect live
    request.session.role = user.role;

    return true;
  }
}
