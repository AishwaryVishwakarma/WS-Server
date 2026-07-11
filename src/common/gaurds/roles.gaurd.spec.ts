import {ForbiddenException, type ExecutionContext} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import {Role} from 'src/users/enums/role';
import {RolesGuard} from './roles.gaurd';

const createContext = (session: Record<string, unknown>) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({session}),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  const setRequiredRoles = (roles: Role[] | undefined) => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);
  };

  it('allows requests when no roles metadata is set', () => {
    setRequiredRoles(undefined);
    expect(guard.canActivate(createContext({}))).toBe(true);
  });

  it('allows users whose session role matches', () => {
    setRequiredRoles([Role.Admin]);
    expect(guard.canActivate(createContext({role: Role.Admin}))).toBe(true);
  });

  it('rejects users whose session role does not match', () => {
    setRequiredRoles([Role.Admin]);
    expect(() => guard.canActivate(createContext({role: Role.User}))).toThrow(
      ForbiddenException
    );
  });

  it('rejects sessions without a role', () => {
    setRequiredRoles([Role.Admin]);
    expect(() => guard.canActivate(createContext({}))).toThrow(
      ForbiddenException
    );
  });
});
