import * as crypto from 'crypto';
import {BadRequestException} from '@nestjs/common';
import {Test} from '@nestjs/testing';
import {getRepositoryToken} from '@nestjs/typeorm';
import {UsersService} from 'src/users/users.service';
import {MailService} from 'src/mail/mail.service';
import {SettingsService} from 'src/settings/settings.service';
import {PendingRegistration} from './entities/pending-registration.entity';
import {RegistrationOtpService} from './registration-otp.service';

describe('RegistrationOtpService', () => {
  let service: RegistrationOtpService;
  let pendingRepository: {
    delete: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    findOne: jest.Mock;
  };
  let usersService: {
    hashPassword: jest.Mock;
    findOneByReferralCode: jest.Mock;
  };
  let mailService: {send: jest.Mock};
  let settingsService: {isReferralProgramEnabled: jest.Mock};

  const dto = {name: 'Aria', email: 'reader@test.com', password: 'S3cret!Pw'};
  const hashedPassword = 'hashed-password';

  const extractCode = (): string => {
    const [, , body] = mailService.send.mock.calls[0] as [
      string,
      string,
      string,
    ];
    const match = /code is (\d{6})/.exec(body);
    if (!match) throw new Error('no code found in mail body');
    return match[1];
  };

  beforeEach(async () => {
    pendingRepository = {
      delete: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((data) => data),
      findOne: jest.fn(),
    };
    usersService = {
      hashPassword: jest.fn().mockResolvedValue(hashedPassword),
      findOneByReferralCode: jest.fn().mockResolvedValue(null),
    };
    mailService = {send: jest.fn().mockResolvedValue(undefined)};
    settingsService = {
      isReferralProgramEnabled: jest.fn().mockResolvedValue(false),
    };

    const module = await Test.createTestingModule({
      providers: [
        RegistrationOtpService,
        {
          provide: getRepositoryToken(PendingRegistration),
          useValue: pendingRepository,
        },
        {provide: UsersService, useValue: usersService},
        {provide: MailService, useValue: mailService},
        {provide: SettingsService, useValue: settingsService},
      ],
    }).compile();

    service = module.get(RegistrationOtpService);
  });

  describe('start', () => {
    it('hashes the password, deletes any prior pending row, and saves a fresh one', async () => {
      await service.start(dto);

      expect(usersService.hashPassword).toHaveBeenCalledWith(dto.password);
      expect(pendingRepository.delete).toHaveBeenCalledWith({
        email: dto.email,
      });
      expect(pendingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          email: dto.email,
          name: dto.name,
          passwordHash: hashedPassword,
          codeHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          expiresAt: expect.any(Date),
        })
      );
    });

    it('emails the raw code, which never matches the stored hash', async () => {
      await service.start(dto);

      const code = extractCode();
      const savedHash = (
        pendingRepository.save.mock.calls[0] as [{codeHash: string}]
      )[0].codeHash;

      expect(code).toMatch(/^\d{6}$/);
      expect(savedHash).not.toBe(code);
    });

    it('carries the optional bio through when given, null otherwise', async () => {
      await service.start({
        ...dto,
        bio: 'A reader of dark things.',
      });

      expect(pendingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          bio: 'A reader of dark things.',
        })
      );

      await service.start(dto);

      expect(pendingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          bio: null,
        })
      );
    });
  });

  describe('start — referrals', () => {
    it('resolves and stores the referrer id when the program is enabled and the code is valid', async () => {
      settingsService.isReferralProgramEnabled.mockResolvedValue(true);
      usersService.findOneByReferralCode.mockResolvedValue({
        id: 'referrer-1',
      });

      await service.start({...dto, referralCode: 'abc123'});

      expect(usersService.findOneByReferralCode).toHaveBeenCalledWith('abc123');
      expect(pendingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({referredById: 'referrer-1'})
      );
    });

    it('silently ignores a code that resolves to nobody', async () => {
      settingsService.isReferralProgramEnabled.mockResolvedValue(true);
      usersService.findOneByReferralCode.mockResolvedValue(null);

      await service.start({...dto, referralCode: 'not-a-real-code'});

      expect(pendingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({referredById: null})
      );
    });

    it('never looks up a code while the referral program is globally disabled', async () => {
      settingsService.isReferralProgramEnabled.mockResolvedValue(false);

      await service.start({...dto, referralCode: 'abc123'});

      expect(usersService.findOneByReferralCode).not.toHaveBeenCalled();
      expect(pendingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({referredById: null})
      );
    });

    it('never looks anything up when no code was supplied at all', async () => {
      settingsService.isReferralProgramEnabled.mockResolvedValue(true);

      await service.start(dto);

      expect(usersService.findOneByReferralCode).not.toHaveBeenCalled();
    });
  });

  describe('resend', () => {
    it('silently no-ops when no pending registration exists', async () => {
      pendingRepository.findOne.mockResolvedValue(null);

      await service.resend('nobody@test.com');

      expect(pendingRepository.save).not.toHaveBeenCalled();
      expect(mailService.send).not.toHaveBeenCalled();
    });

    it('issues a fresh code, resets attempts, and re-emails', async () => {
      const pending = {
        email: dto.email,
        name: dto.name,
        passwordHash: hashedPassword,
        codeHash: 'stale-hash',
        expiresAt: new Date(Date.now() - 1000),
        attempts: 3,
      };
      pendingRepository.findOne.mockResolvedValue(pending);

      await service.resend(dto.email);

      expect(mailService.send).toHaveBeenCalled();
      expect(pendingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          codeHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          attempts: 0,
        })
      );
      const savedRow = pendingRepository.save.mock.calls[0][0] as {
        codeHash: string;
        expiresAt: Date;
      };
      expect(savedRow.codeHash).not.toBe('stale-hash');
      expect(savedRow.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('confirm', () => {
    it('rejects when there is no pending registration', async () => {
      pendingRepository.findOne.mockResolvedValue(null);

      await expect(service.confirm(dto.email, '123456')).rejects.toThrow(
        BadRequestException
      );
    });

    it('rejects an expired code without incrementing attempts', async () => {
      pendingRepository.findOne.mockResolvedValue({
        email: dto.email,
        codeHash: 'irrelevant',
        expiresAt: new Date(Date.now() - 1000),
        attempts: 0,
      });

      await expect(service.confirm(dto.email, '123456')).rejects.toThrow(
        BadRequestException
      );
      expect(pendingRepository.save).not.toHaveBeenCalled();
    });

    it('rejects a wrong code and increments attempts', async () => {
      const pending = {
        email: dto.email,
        codeHash: 'a-different-hash',
        expiresAt: new Date(Date.now() + 1000),
        attempts: 1,
      };
      pendingRepository.findOne.mockResolvedValue(pending);

      await expect(service.confirm(dto.email, '000000')).rejects.toThrow(
        'Incorrect code'
      );
      expect(pendingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({attempts: 2})
      );
      expect(pendingRepository.delete).not.toHaveBeenCalled();
    });

    it('locks out and deletes the row once attempts reach the max', async () => {
      const pending = {
        email: dto.email,
        codeHash: 'a-different-hash',
        expiresAt: new Date(Date.now() + 1000),
        attempts: 4,
      };
      pendingRepository.findOne.mockResolvedValue(pending);

      await expect(service.confirm(dto.email, '000000')).rejects.toThrow(
        'Too many incorrect attempts'
      );
      expect(pendingRepository.delete).toHaveBeenCalledWith({
        email: dto.email,
      });
      expect(pendingRepository.save).not.toHaveBeenCalled();
    });

    it('succeeds on the correct code, deletes the row, and returns the collected fields', async () => {
      await service.start(dto);
      const code = extractCode();
      const savedRow = pendingRepository.save.mock.calls[0][0] as {
        email: string;
        name: string;
        passwordHash: string;
        codeHash: string;
        expiresAt: Date;
        attempts?: number;
      };
      pendingRepository.findOne.mockResolvedValue({
        ...savedRow,
        attempts: savedRow.attempts ?? 0,
      });

      const result = await service.confirm(dto.email, code);

      expect(result).toEqual({
        name: dto.name,
        email: dto.email,
        passwordHash: hashedPassword,
        bio: null,
        referredById: null,
      });
      expect(pendingRepository.delete).toHaveBeenCalledWith({
        email: dto.email,
      });
    });

    it('rejects confirming with the same code a second time (row already consumed)', async () => {
      pendingRepository.findOne.mockResolvedValueOnce({
        email: dto.email,
        codeHash: crypto.createHash('sha256').update('123456').digest('hex'),
        expiresAt: new Date(Date.now() + 1000),
        attempts: 0,
      });
      await service.confirm(dto.email, '123456');

      pendingRepository.findOne.mockResolvedValueOnce(null);
      await expect(service.confirm(dto.email, '123456')).rejects.toThrow(
        BadRequestException
      );
    });
  });
});
