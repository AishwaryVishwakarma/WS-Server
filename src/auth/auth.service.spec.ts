import {ConflictException, UnauthorizedException} from '@nestjs/common';
import {Test} from '@nestjs/testing';
import {getRepositoryToken} from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import type {Request} from 'express';
import {SessionService} from 'src/session/session.service';
import {SessionRegistryService} from 'src/session/session-registry.service';
import {
  REMEMBER_ME_MAX_AGE_MS,
  SESSION_MAX_AGE_MS,
} from 'src/session/session.constants';
import {User} from 'src/users/entities/user.entity';
import {Role} from 'src/users/enums/role';
import {UsersService} from 'src/users/users.service';
import {AuthService} from './auth.service';
import {GoogleAuthService} from './google-auth.service';
import {RegistrationOtpService} from './registration-otp.service';
import {GeoLocationService} from 'src/session/geo-location.service';

describe('AuthService', () => {
  let service: AuthService;
  let queryBuilder: {
    addSelect: jest.Mock;
    where: jest.Mock;
    getOne: jest.Mock;
  };
  let findOneBy: jest.Mock;
  let findOne: jest.Mock;
  let usersRepository: {
    createQueryBuilder: jest.Mock;
    findOneBy: jest.Mock;
    findOne: jest.Mock;
    manager?: {transaction: jest.Mock};
  };
  let usersService: {
    create: jest.Mock;
    findOrCreateGoogleUser: jest.Mock;
    createFromVerifiedRegistration: jest.Mock;
  };
  let sessionService: {regenerate: jest.Mock; destroy: jest.Mock};
  let sessionRegistryService: {track: jest.Mock; untrack: jest.Mock};
  let googleAuthService: {verify: jest.Mock};
  let registrationOtpService: {start: jest.Mock; confirm: jest.Mock};

  const password = 'S3cret!Password';
  let hashedPassword: string;

  const createRequest = (headers: Record<string, string> = {}) =>
    ({
      session: {cookie: {}},
      sessionID: 'sid-1',
      get: jest.fn((name: string) => headers[name.toLowerCase()]),
    }) as unknown as Request;

  beforeAll(async () => {
    hashedPassword = await bcrypt.hash(password, 4);
  });

  beforeEach(async () => {
    queryBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };
    findOneBy = jest.fn();
    findOne = jest.fn();
    usersService = {
      create: jest.fn(),
      findOrCreateGoogleUser: jest.fn(),
      createFromVerifiedRegistration: jest.fn(),
    };
    sessionService = {
      regenerate: jest.fn().mockResolvedValue(undefined),
      destroy: jest.fn().mockResolvedValue(undefined),
    };
    sessionRegistryService = {
      track: jest.fn().mockResolvedValue(undefined),
      untrack: jest.fn().mockResolvedValue(undefined),
    };
    googleAuthService = {verify: jest.fn()};
    registrationOtpService = {start: jest.fn(), confirm: jest.fn()};

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: (usersRepository = {
            createQueryBuilder: jest.fn(() => queryBuilder),
            findOneBy,
            findOne,
          }),
        },
        {provide: UsersService, useValue: usersService},
        {provide: SessionService, useValue: sessionService},
        {provide: SessionRegistryService, useValue: sessionRegistryService},
        {provide: GoogleAuthService, useValue: googleAuthService},
        {provide: RegistrationOtpService, useValue: registrationOtpService},
        {provide: GeoLocationService, useValue: {lookup: jest.fn()}},
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('validateUser', () => {
    it('returns the user for valid credentials', async () => {
      queryBuilder.getOne.mockResolvedValue({
        id: 'user-1',
        password: hashedPassword,
        isBlocked: false,
      });

      const user = await service.validateUser({
        email: 'a@b.com',
        password,
      });

      expect(user.id).toBe('user-1');
    });

    it('rejects an unknown email', async () => {
      queryBuilder.getOne.mockResolvedValue(null);

      await expect(
        service.validateUser({email: 'a@b.com', password})
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a wrong password', async () => {
      queryBuilder.getOne.mockResolvedValue({
        id: 'user-1',
        password: hashedPassword,
        isBlocked: false,
      });

      await expect(
        service.validateUser({email: 'a@b.com', password: 'wrong-password'})
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a blocked user even with valid credentials', async () => {
      queryBuilder.getOne.mockResolvedValue({
        id: 'user-1',
        password: hashedPassword,
        isBlocked: true,
      });

      await expect(
        service.validateUser({email: 'a@b.com', password})
      ).rejects.toThrow('User is blocked');
    });
  });

  describe('register', () => {
    it('starts the OTP flow for a new email, without touching the session', async () => {
      findOne.mockResolvedValue(null);

      await service.register({name: 'Test', email: 'a@b.com', password});

      expect(registrationOtpService.start).toHaveBeenCalledWith({
        name: 'Test',
        email: 'a@b.com',
        password,
      });
      expect(sessionService.regenerate).not.toHaveBeenCalled();
    });

    it('rejects an email that already belongs to a real account', async () => {
      findOne.mockResolvedValue({id: 'user-1'});

      await expect(
        service.register({name: 'Test', email: 'a@b.com', password})
      ).rejects.toThrow(ConflictException);
      expect(registrationOtpService.start).not.toHaveBeenCalled();
    });

    it('also rejects an email still locked by an admin-removed (soft-deleted) account', async () => {
      findOne.mockResolvedValue({id: 'old-user', deletedAt: new Date()});

      await expect(
        service.register({name: 'Test', email: 'a@b.com', password})
      ).rejects.toThrow(ConflictException);
      expect(findOne).toHaveBeenCalledWith(
        expect.objectContaining({withDeleted: true})
      );
      expect(registrationOtpService.start).not.toHaveBeenCalled();
    });
  });

  describe('confirmRegistration', () => {
    it('confirms the code, creates the user from the pending data, and opens the session', async () => {
      registrationOtpService.confirm.mockResolvedValue({
        name: 'Test',
        email: 'a@b.com',
        passwordHash: hashedPassword,
        referredById: null,
      });
      usersService.createFromVerifiedRegistration.mockResolvedValue({
        id: 'user-1',
        role: Role.User,
      });
      const req = createRequest();

      const result = await service.confirmRegistration(
        'a@b.com',
        '123456',
        req
      );

      expect(registrationOtpService.confirm).toHaveBeenCalledWith(
        'a@b.com',
        '123456'
      );
      expect(usersService.createFromVerifiedRegistration).toHaveBeenCalledWith(
        {name: 'Test', email: 'a@b.com'},
        hashedPassword,
        null
      );
      expect(sessionService.regenerate).toHaveBeenCalledWith(req);
      expect(req.session.userId).toBe('user-1');
      expect(req.session.role).toBe(Role.User);
      expect(sessionRegistryService.track).toHaveBeenCalledWith(
        'user-1',
        'sid-1',
        SESSION_MAX_AGE_MS
      );
      expect(result.user.id).toBe('user-1');
      expect(result.referralBonusAwarded).toBe(false);
    });

    it('credits both the referrer and the new user with a bonus streak-freeze token, capped', async () => {
      registrationOtpService.confirm.mockResolvedValue({
        name: 'Test',
        email: 'a@b.com',
        passwordHash: hashedPassword,
        referredById: 'referrer-1',
      });
      usersService.createFromVerifiedRegistration.mockResolvedValue({
        id: 'new-user-1',
        role: Role.User,
      });
      const managerFindOneBy = jest
        .fn()
        .mockImplementation((_entity, {id}: {id: string}) =>
          Promise.resolve(
            id === 'referrer-1'
              ? {id: 'referrer-1', streakFreezeCount: 0}
              : {id: 'new-user-1', streakFreezeCount: 0}
          )
        );
      const managerUpdate = jest.fn().mockResolvedValue(undefined);
      const transaction = jest.fn(
        async (fn: (manager: unknown) => Promise<void>) =>
          fn({findOneBy: managerFindOneBy, update: managerUpdate})
      );
      usersRepository.manager = {transaction};
      const req = createRequest();

      const result = await service.confirmRegistration(
        'a@b.com',
        '123456',
        req
      );

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(managerUpdate).toHaveBeenCalledWith(User, 'referrer-1', {
        streakFreezeCount: 1,
      });
      expect(managerUpdate).toHaveBeenCalledWith(User, 'new-user-1', {
        streakFreezeCount: 1,
      });
      expect(result.referralBonusAwarded).toBe(true);
    });

    it('caps the referral bonus rather than exceeding MAX_STREAK_FREEZES', async () => {
      registrationOtpService.confirm.mockResolvedValue({
        name: 'Test',
        email: 'a@b.com',
        passwordHash: hashedPassword,
        referredById: 'referrer-1',
      });
      usersService.createFromVerifiedRegistration.mockResolvedValue({
        id: 'new-user-1',
        role: Role.User,
      });
      const managerFindOneBy = jest
        .fn()
        .mockResolvedValue({id: 'referrer-1', streakFreezeCount: 1});
      const managerUpdate = jest.fn().mockResolvedValue(undefined);
      usersRepository.manager = {
        transaction: jest.fn(async (fn: (manager: unknown) => Promise<void>) =>
          fn({findOneBy: managerFindOneBy, update: managerUpdate})
        ),
      };
      const req = createRequest();

      await service.confirmRegistration('a@b.com', '123456', req);

      expect(managerUpdate).toHaveBeenCalledWith(User, 'referrer-1', {
        streakFreezeCount: 1,
      });
    });
  });

  describe('login', () => {
    it('regenerates the session and stores id and role', async () => {
      queryBuilder.getOne.mockResolvedValue({
        id: 'user-1',
        password: hashedPassword,
        isBlocked: false,
        role: Role.Admin,
      });
      const req = createRequest();

      await service.login({email: 'a@b.com', password}, req);

      expect(sessionService.regenerate).toHaveBeenCalledWith(req);
      expect(req.session.userId).toBe('user-1');
      expect(req.session.role).toBe(Role.Admin);
      expect(req.session.metadata).toEqual(
        expect.objectContaining({
          device: 'Computer',
          browser: 'Unknown browser',
        })
      );
      expect(sessionRegistryService.track).toHaveBeenCalledWith(
        'user-1',
        'sid-1',
        SESSION_MAX_AGE_MS
      );
    });

    it('extends the cookie and index to 30 days when rememberMe is set', async () => {
      queryBuilder.getOne.mockResolvedValue({
        id: 'user-1',
        password: hashedPassword,
        isBlocked: false,
        role: Role.User,
      });
      const req = createRequest();

      await service.login({email: 'a@b.com', password, rememberMe: true}, req);

      expect(req.session.cookie.maxAge).toBe(REMEMBER_ME_MAX_AGE_MS);
      expect(sessionRegistryService.track).toHaveBeenCalledWith(
        'user-1',
        'sid-1',
        REMEMBER_ME_MAX_AGE_MS
      );
    });

    it('leaves the default cookie maxAge untouched when rememberMe is false', async () => {
      queryBuilder.getOne.mockResolvedValue({
        id: 'user-1',
        password: hashedPassword,
        isBlocked: false,
        role: Role.User,
      });
      const req = createRequest();

      await service.login({email: 'a@b.com', password}, req);

      expect(req.session.cookie.maxAge).toBeUndefined();
    });
  });

  describe('googleSignIn', () => {
    const profile = {
      googleId: 'g-1',
      email: 'a@b.com',
      emailVerified: true,
      name: 'Aria',
    };

    it('verifies the token, resolves the account, and opens the session', async () => {
      googleAuthService.verify.mockResolvedValue(profile);
      usersService.findOrCreateGoogleUser.mockResolvedValue({
        id: 'user-1',
        role: Role.User,
        isBlocked: false,
      });
      const req = createRequest();

      const user = await service.googleSignIn('id-token', req);

      expect(googleAuthService.verify).toHaveBeenCalledWith('id-token');
      expect(usersService.findOrCreateGoogleUser).toHaveBeenCalledWith(profile);
      expect(sessionService.regenerate).toHaveBeenCalledWith(req);
      expect(req.session.userId).toBe('user-1');
      expect(req.session.role).toBe(Role.User);
      expect(sessionRegistryService.track).toHaveBeenCalledWith(
        'user-1',
        'sid-1',
        SESSION_MAX_AGE_MS
      );
      expect(user.id).toBe('user-1');
    });

    it('rejects an unverified Google email', async () => {
      googleAuthService.verify.mockResolvedValue({
        ...profile,
        emailVerified: false,
      });

      await expect(
        service.googleSignIn('id-token', createRequest())
      ).rejects.toThrow(UnauthorizedException);
      expect(usersService.findOrCreateGoogleUser).not.toHaveBeenCalled();
    });

    it('rejects a blocked account', async () => {
      googleAuthService.verify.mockResolvedValue(profile);
      usersService.findOrCreateGoogleUser.mockResolvedValue({
        id: 'user-1',
        role: Role.User,
        isBlocked: true,
      });

      await expect(
        service.googleSignIn('id-token', createRequest())
      ).rejects.toThrow('User is blocked');
    });
  });

  describe('logout', () => {
    it('destroys the session and untracks it from the registry', async () => {
      const req = createRequest();
      req.session.userId = 'user-1';

      await service.logout(req);

      expect(sessionService.destroy).toHaveBeenCalledWith(req);
      expect(sessionRegistryService.untrack).toHaveBeenCalledWith(
        'user-1',
        'sid-1'
      );
    });

    it('skips untracking when the request has no session', async () => {
      const req = createRequest();

      await service.logout(req);

      expect(sessionRegistryService.untrack).not.toHaveBeenCalled();
    });
  });

  describe('hasActiveSession', () => {
    it('returns false when the request has no session', async () => {
      const req = createRequest();

      await expect(service.hasActiveSession(req)).resolves.toBe(false);
      expect(findOneBy).not.toHaveBeenCalled();
    });

    it('returns true for a session whose user still exists and is not blocked', async () => {
      findOneBy.mockResolvedValue({id: 'user-1', isBlocked: false});
      const req = createRequest();
      req.session.userId = 'user-1';

      await expect(service.hasActiveSession(req)).resolves.toBe(true);
    });

    // The scenario this guards against: a dev DB reseed (or an admin
    // deleting/blocking the account) leaves a browser holding a session
    // that's present but stale — session.userId no longer resolves to a
    // real user. It must not destroy the session itself: the caller's own
    // register/login/googleSignIn regenerates it right after, which needs
    // req.session to still exist (destroy() would delete it out from under
    // that call).
    it('returns false without destroying the session when the user no longer exists', async () => {
      findOneBy.mockResolvedValue(null);
      const req = createRequest();
      req.session.userId = 'user-1';

      await expect(service.hasActiveSession(req)).resolves.toBe(false);
      expect(sessionService.destroy).not.toHaveBeenCalled();
      expect(sessionRegistryService.untrack).not.toHaveBeenCalled();
    });

    it('returns false without destroying the session when the user has been blocked', async () => {
      findOneBy.mockResolvedValue({id: 'user-1', isBlocked: true});
      const req = createRequest();
      req.session.userId = 'user-1';

      await expect(service.hasActiveSession(req)).resolves.toBe(false);
      expect(sessionService.destroy).not.toHaveBeenCalled();
    });
  });
});
