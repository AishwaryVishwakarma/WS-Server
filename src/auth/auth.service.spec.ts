import {UnauthorizedException} from '@nestjs/common';
import {Test} from '@nestjs/testing';
import {getRepositoryToken} from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import type {Request} from 'express';
import {SessionService} from 'src/session/session.service';
import {User} from 'src/users/entities/user.entity';
import {Role} from 'src/users/enums/role';
import {UsersService} from 'src/users/users.service';
import {AuthService} from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let queryBuilder: {
    addSelect: jest.Mock;
    where: jest.Mock;
    getOne: jest.Mock;
  };
  let usersService: {create: jest.Mock};
  let sessionService: {regenerate: jest.Mock; destroy: jest.Mock};

  const password = 'S3cret!Password';
  let hashedPassword: string;

  const createRequest = () => ({session: {}}) as unknown as Request;

  beforeAll(async () => {
    hashedPassword = await bcrypt.hash(password, 4);
  });

  beforeEach(async () => {
    queryBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };
    usersService = {create: jest.fn()};
    sessionService = {
      regenerate: jest.fn().mockResolvedValue(undefined),
      destroy: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: {createQueryBuilder: jest.fn(() => queryBuilder)},
        },
        {provide: UsersService, useValue: usersService},
        {provide: SessionService, useValue: sessionService},
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
    it('creates the user, regenerates the session, and stores id and role', async () => {
      usersService.create.mockResolvedValue({id: 'user-1', role: Role.User});
      const req = createRequest();

      const user = await service.register(
        {name: 'Test', email: 'a@b.com', password},
        req
      );

      expect(usersService.create).toHaveBeenCalledWith({
        name: 'Test',
        email: 'a@b.com',
        password,
      });
      expect(sessionService.regenerate).toHaveBeenCalledWith(req);
      expect(req.session.userId).toBe('user-1');
      expect(req.session.role).toBe(Role.User);
      expect(user.id).toBe('user-1');
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
    });
  });

  describe('logout', () => {
    it('destroys the session', async () => {
      const req = createRequest();

      await service.logout(req);

      expect(sessionService.destroy).toHaveBeenCalledWith(req);
    });
  });
});
