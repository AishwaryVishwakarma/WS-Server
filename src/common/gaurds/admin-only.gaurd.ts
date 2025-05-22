import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import {Request} from 'express';

@Injectable()
export class AdminOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (!request.session.isAdmin) {
      throw new ForbiddenException(
        'You do not have permission to access this resource'
      );
    }

    return true;
  }
}
