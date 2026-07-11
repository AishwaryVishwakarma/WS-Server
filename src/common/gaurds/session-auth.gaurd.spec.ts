import {UnauthorizedException, type ExecutionContext} from '@nestjs/common';
import {DataSource} from 'typeorm';
import {Role} from 'src/users/enums/role';
import {SessionAuthGuard} from './session-auth.gaurd';

const createContext = (session: Record<string, unknown>) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({session}),
    }),
  }) as unknown as ExecutionContext;

describe('SessionAuthGuard', () => {
  let guard: SessionAuthGuard;
  let findOneBy: jest.Mock;

  beforeEach(() => {
    findOneBy = jest.fn();
    const dataSource = {
      getRepository: () => ({findOneBy}),
    } as unknown as DataSource;
    guard = new SessionAuthGuard(dataSource);
  });

  it('allows a logged-in user who still exists and is not blocked', async () => {
    findOneBy.mockResolvedValue({
      id: 'user-1',
      role: Role.User,
      isBlocked: false,
    });

    const context = createContext({userId: 'user-1'});
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('refreshes the session role from the database', async () => {
    findOneBy.mockResolvedValue({
      id: 'user-1',
      role: Role.Admin,
      isBlocked: false,
    });
    const session: Record<string, unknown> = {
      userId: 'user-1',
      role: Role.User,
    };

    await guard.canActivate(createContext(session));

    expect(session.role).toBe(Role.Admin);
  });

  it('rejects requests without a session userId', async () => {
    await expect(guard.canActivate(createContext({}))).rejects.toThrow(
      UnauthorizedException
    );
    expect(findOneBy).not.toHaveBeenCalled();
  });

  it('rejects a user that no longer exists (e.g. soft-deleted)', async () => {
    findOneBy.mockResolvedValue(null);

    await expect(
      guard.canActivate(createContext({userId: 'user-1'}))
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a user who has been blocked', async () => {
    findOneBy.mockResolvedValue({
      id: 'user-1',
      role: Role.User,
      isBlocked: true,
    });

    await expect(
      guard.canActivate(createContext({userId: 'user-1'}))
    ).rejects.toThrow(UnauthorizedException);
  });
});
