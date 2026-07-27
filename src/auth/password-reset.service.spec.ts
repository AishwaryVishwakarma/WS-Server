import {BadRequestException} from '@nestjs/common';
import {Test} from '@nestjs/testing';
import {getRepositoryToken} from '@nestjs/typeorm';
import {ConfigService} from '@nestjs/config';
import {UsersService} from 'src/users/users.service';
import {MailService} from 'src/mail/mail.service';
import {SessionRegistryService} from 'src/session/session-registry.service';
import {PasswordResetToken} from './entities/password-reset-token.entity';
import {PasswordResetService} from './password-reset.service';

describe('PasswordResetService', () => {
  let service: PasswordResetService;
  let tokensRepository: {
    delete: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    findOne: jest.Mock;
  };
  let usersService: {findOneByEmail: jest.Mock; updatePassword: jest.Mock};
  let mailService: {send: jest.Mock};
  let sessionRegistryService: {invalidateAll: jest.Mock};

  const user = {id: 'user-1', email: 'reader@test.com'};

  beforeEach(async () => {
    tokensRepository = {
      delete: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((data) => data),
      findOne: jest.fn(),
    };
    usersService = {
      findOneByEmail: jest.fn(),
      updatePassword: jest.fn().mockResolvedValue(undefined),
    };
    mailService = {send: jest.fn().mockResolvedValue(undefined)};
    sessionRegistryService = {
      invalidateAll: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        PasswordResetService,
        {
          provide: getRepositoryToken(PasswordResetToken),
          useValue: tokensRepository,
        },
        {provide: UsersService, useValue: usersService},
        {provide: MailService, useValue: mailService},
        {provide: ConfigService, useValue: {get: jest.fn()}},
        {provide: SessionRegistryService, useValue: sessionRegistryService},
      ],
    }).compile();

    service = module.get(PasswordResetService);
  });

  describe('requestReset', () => {
    it('does nothing when the email is not registered (no enumeration signal)', async () => {
      usersService.findOneByEmail.mockResolvedValue(null);

      await service.requestReset('nobody@test.com');

      expect(tokensRepository.save).not.toHaveBeenCalled();
      expect(mailService.send).not.toHaveBeenCalled();
    });

    it('invalidates prior tokens, stores a hashed token, and emails a link', async () => {
      usersService.findOneByEmail.mockResolvedValue(user);

      await service.requestReset(user.email);

      expect(tokensRepository.delete).toHaveBeenCalledWith({
        user: {id: user.id},
      });
      expect(tokensRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          user,
          tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          expiresAt: expect.any(Date),
        })
      );
      expect(mailService.send).toHaveBeenCalledWith(
        user.email,
        expect.any(String),
        expect.stringContaining('/reset-password?token=')
      );
    });

    it('never stores or emails the raw token as the same value', async () => {
      usersService.findOneByEmail.mockResolvedValue(user);

      await service.requestReset(user.email);

      const [, , body] = mailService.send.mock.calls[0] as [
        string,
        string,
        string,
      ];
      const rawToken = /token=([0-9a-f]+)/.exec(body)?.[1];
      const savedTokenHash = (
        tokensRepository.save.mock.calls[0] as [{tokenHash: string}]
      )[0].tokenHash;

      expect(rawToken).toBeDefined();
      expect(savedTokenHash).not.toBe(rawToken);
    });
  });

  describe('resetPassword', () => {
    it('rejects an unknown token', async () => {
      tokensRepository.findOne.mockResolvedValue(null);

      await expect(
        service.resetPassword('bad-token', 'NewP4ss!word')
      ).rejects.toThrow(BadRequestException);
      expect(usersService.updatePassword).not.toHaveBeenCalled();
    });

    it('rejects an expired token', async () => {
      tokensRepository.findOne.mockResolvedValue({
        user,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.resetPassword('token', 'NewP4ss!word')
      ).rejects.toThrow(BadRequestException);
      expect(usersService.updatePassword).not.toHaveBeenCalled();
    });

    it('updates the password and invalidates all outstanding tokens for the user', async () => {
      tokensRepository.findOne.mockResolvedValue({
        user,
        expiresAt: new Date(Date.now() + 1000),
      });

      await service.resetPassword('token', 'NewP4ss!word');

      expect(usersService.updatePassword).toHaveBeenCalledWith(
        user.id,
        'NewP4ss!word'
      );
      expect(tokensRepository.delete).toHaveBeenCalledWith({
        user: {id: user.id},
      });
    });

    it('invalidates every active session for the user', async () => {
      tokensRepository.findOne.mockResolvedValue({
        user,
        expiresAt: new Date(Date.now() + 1000),
      });

      await service.resetPassword('token', 'NewP4ss!word');

      expect(sessionRegistryService.invalidateAll).toHaveBeenCalledWith(
        user.id
      );
    });
  });
});
