import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import type {Request} from 'express';
import {Role} from 'src/users/enums/role';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!roles) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const userRole = request.session.role;

    if (!userRole || !roles.includes(userRole)) {
      throw new ForbiddenException('Access denied');
    }

    return true;
  }
}
