import {UnauthorizedException, type ExecutionContext} from '@nestjs/common';
import {SessionAuthGuard} from './session-auth.gaurd';

const createContext = (session: Record<string, unknown>) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({session}),
    }),
  }) as unknown as ExecutionContext;

describe('SessionAuthGuard', () => {
  let guard: SessionAuthGuard;

  beforeEach(() => {
    guard = new SessionAuthGuard();
  });

  it('allows requests with a logged-in session', () => {
    expect(guard.canActivate(createContext({userId: 'user-1'}))).toBe(true);
  });

  it('rejects requests without a session userId', () => {
    expect(() => guard.canActivate(createContext({}))).toThrow(
      UnauthorizedException
    );
  });
});
