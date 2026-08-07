import {UnauthorizedException, type ExecutionContext} from '@nestjs/common';
import {DataSource} from 'typeorm';
import {Role} from 'src/users/enums/role';
import {AUTO_VERIFY_MIN_ACCOUNT_AGE_MS} from 'src/users/auto-verify';
import {SessionAuthGuard} from './session-auth.gaurd';

const createContext = (session: Record<string, unknown>) => {
  session.destroy = jest.fn((cb: () => void) => cb());
  return {
    switchToHttp: () => ({
      getRequest: () => ({session}),
    }),
  } as unknown as ExecutionContext;
};

const oldEnough = new Date(Date.now() - AUTO_VERIFY_MIN_ACCOUNT_AGE_MS - 1000);

describe('SessionAuthGuard', () => {
  let guard: SessionAuthGuard;
  let findOneBy: jest.Mock;
  let save: jest.Mock;

  beforeEach(() => {
    findOneBy = jest.fn();
    save = jest.fn((user) => Promise.resolve(user));
    const dataSource = {
      getRepository: () => ({findOneBy, save}),
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

  it('rejects a user that no longer exists (e.g. soft-deleted) and destroys the stale session', async () => {
    findOneBy.mockResolvedValue(null);
    const session: Record<string, unknown> = {userId: 'user-1'};
    const context = createContext(session);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException
    );
    expect(session.destroy).toHaveBeenCalled();
  });

  it('rejects a user who has been blocked and destroys the session', async () => {
    findOneBy.mockResolvedValue({
      id: 'user-1',
      role: Role.User,
      isBlocked: true,
    });
    const session: Record<string, unknown> = {userId: 'user-1'};
    const context = createContext(session);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException
    );
    expect(session.destroy).toHaveBeenCalled();
  });

  describe('auto-verification', () => {
    it('verifies and locks an eligible user', async () => {
      findOneBy.mockResolvedValue({
        id: 'user-1',
        role: Role.User,
        isBlocked: false,
        isVerified: false,
        verificationLocked: false,
        hasPublishedStory: true,
        createdAt: oldEnough,
      });

      await guard.canActivate(createContext({userId: 'user-1'}));

      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({isVerified: true, verificationLocked: true})
      );
    });

    it('does not touch an already-verified user', async () => {
      findOneBy.mockResolvedValue({
        id: 'user-1',
        role: Role.User,
        isBlocked: false,
        isVerified: true,
        verificationLocked: false,
        hasPublishedStory: true,
        createdAt: oldEnough,
      });

      await guard.canActivate(createContext({userId: 'user-1'}));

      expect(save).not.toHaveBeenCalled();
    });

    it('does not re-verify a locked account (an admin has already decided)', async () => {
      findOneBy.mockResolvedValue({
        id: 'user-1',
        role: Role.User,
        isBlocked: false,
        isVerified: false,
        verificationLocked: true,
        hasPublishedStory: true,
        createdAt: oldEnough,
      });

      await guard.canActivate(createContext({userId: 'user-1'}));

      expect(save).not.toHaveBeenCalled();
    });

    it('does not verify an author with no published story', async () => {
      findOneBy.mockResolvedValue({
        id: 'user-1',
        role: Role.User,
        isBlocked: false,
        isVerified: false,
        verificationLocked: false,
        hasPublishedStory: false,
        createdAt: oldEnough,
      });

      await guard.canActivate(createContext({userId: 'user-1'}));

      expect(save).not.toHaveBeenCalled();
    });

    it('does not verify an account younger than the threshold', async () => {
      findOneBy.mockResolvedValue({
        id: 'user-1',
        role: Role.User,
        isBlocked: false,
        isVerified: false,
        verificationLocked: false,
        hasPublishedStory: true,
        createdAt: new Date(),
      });

      await guard.canActivate(createContext({userId: 'user-1'}));

      expect(save).not.toHaveBeenCalled();
    });
  });
});
