import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {Test} from '@nestjs/testing';
import {getRepositoryToken} from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import {QueryFailedError} from 'typeorm';
import {User} from './entities/user.entity';
import {UserReport} from './entities/user-report.entity';
import {UsersService} from './users.service';

const duplicateEntryError = () => {
  const error = new QueryFailedError('INSERT', [], new Error('dup'));
  (error as any).code = 'ER_DUP_ENTRY';
  return error;
};

describe('UsersService', () => {
  let service: UsersService;
  let repository: {
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    findOne: jest.Mock;
    findAndCount: jest.Mock;
    findOneByOrFail: jest.Mock;
    softDelete: jest.Mock;
    restore: jest.Mock;
  };
  let reportsRepository: {
    create: jest.Mock;
    save: jest.Mock;
    countBy: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    repository = {
      create: jest.fn((data) => data),
      save: jest.fn((user) => Promise.resolve({id: 'user-1', ...user})),
      update: jest.fn(),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      findOneByOrFail: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
    };
    reportsRepository = {
      create: jest.fn((data) => data),
      save: jest.fn((report) => Promise.resolve(report)),
      countBy: jest.fn().mockResolvedValue(0),
      delete: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        {provide: getRepositoryToken(User), useValue: repository},
        {provide: getRepositoryToken(UserReport), useValue: reportsRepository},
        {
          provide: ConfigService,
          // Low salt rounds to keep hashing fast in tests
          useValue: {get: jest.fn().mockReturnValue('4')},
        },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe('findOrCreateGoogleUser', () => {
    const profile = {
      googleId: 'g-1',
      email: 'a@b.com',
      name: 'Aria',
      picture: 'https://pic',
    };

    it('returns the existing account already linked by googleId', async () => {
      const existing = {id: 'user-1', googleId: 'g-1'};
      repository.findOne.mockResolvedValueOnce(existing);

      const user = await service.findOrCreateGoogleUser(profile);

      expect(user).toBe(existing);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('links the Google identity onto a same-email password account', async () => {
      const byEmail = {
        id: 'user-2',
        email: 'a@b.com',
        googleId: null,
        profileImageUrl: null,
      };
      // First lookup (by googleId) misses; second (by email) hits.
      repository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(byEmail);

      const user = await service.findOrCreateGoogleUser(profile);

      expect(user.googleId).toBe('g-1');
      // Backfilled the avatar since the account had none.
      expect(user.profileImageUrl).toBe('https://pic');
      expect(repository.save).toHaveBeenCalledWith(byEmail);
    });

    it('creates a new password-less account when nothing matches', async () => {
      repository.findOne.mockResolvedValue(null);

      const user = await service.findOrCreateGoogleUser(profile);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          googleId: 'g-1',
          email: 'a@b.com',
          password: null,
          isVerified: true,
          profileImageUrl: 'https://pic',
        })
      );
      expect(user.id).toBe('user-1');
    });

    it('refuses re-registration when an admin-removed account still holds the identity', async () => {
      // Neither an active googleId nor email match, but a soft-deleted row
      // (found only via withDeleted) does — an admin removal, since
      // deactivateSelf would have released it.
      repository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({id: 'old-user', deletedAt: new Date()});

      await expect(service.findOrCreateGoogleUser(profile)).rejects.toThrow(
        ForbiddenException
      );
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('deactivateSelf', () => {
    it('releases googleId and anonymizes the email before soft-deleting', async () => {
      repository.findOneByOrFail.mockResolvedValue({
        id: 'user-1',
        email: 'aria@gmail.com',
        googleId: 'g-1',
      });
      repository.softDelete.mockResolvedValue({affected: 1});

      await service.deactivateSelf('user-1');

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'user-1',
          googleId: null,
          email: 'deleted-user-1@deleted.invalid',
        })
      );
      expect(repository.softDelete).toHaveBeenCalledWith('user-1');
    });

    it('throws NotFoundException for a missing user', async () => {
      repository.findOneByOrFail.mockRejectedValue(new Error('not found'));

      await expect(service.deactivateSelf('missing')).rejects.toThrow(
        NotFoundException
      );
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe('report', () => {
    it('rejects reporting yourself', async () => {
      await expect(service.report('user-1', 'user-1')).rejects.toThrow(
        BadRequestException
      );
      expect(reportsRepository.save).not.toHaveBeenCalled();
    });

    it('saves a report and recomputes reportCount from the rows', async () => {
      repository.findOneByOrFail
        .mockResolvedValueOnce({
          id: 'user-2',
          updatedAt: new Date('2020-01-01'),
        })
        .mockResolvedValueOnce({id: 'user-1'});
      reportsRepository.countBy.mockResolvedValue(3);

      const reportedUser = await service.report('user-2', 'user-1');

      expect(reportsRepository.save).toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalledWith(
        'user-2',
        expect.objectContaining({reportCount: 3})
      );
      expect(reportedUser.reportCount).toBe(3);
    });

    it('maps a duplicate report to ConflictException', async () => {
      repository.findOneByOrFail
        .mockResolvedValueOnce({id: 'user-2', updatedAt: new Date()})
        .mockResolvedValueOnce({id: 'user-1'});
      reportsRepository.save.mockRejectedValue(duplicateEntryError());

      await expect(service.report('user-2', 'user-1')).rejects.toThrow(
        ConflictException
      );
    });
  });

  describe('resolveReports', () => {
    it('drops the report rows and zeroes the count', async () => {
      repository.findOneByOrFail.mockResolvedValue({
        id: 'user-2',
        updatedAt: new Date(),
        reportCount: 5,
      });

      const user = await service.resolveReports('user-2');

      expect(reportsRepository.delete).toHaveBeenCalledWith({
        reportedUser: {id: 'user-2'},
      });
      expect(repository.update).toHaveBeenCalledWith(
        'user-2',
        expect.objectContaining({reportCount: 0})
      );
      expect(user.reportCount).toBe(0);
    });
  });

  describe('findAll reported queue', () => {
    it('filters to reportCount > 0, ordered most-reported first', async () => {
      repository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll(1, 20, undefined, true);

      expect(repository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {reportCount: expect.anything()},
          order: {reportCount: 'DESC', createdAt: 'DESC'},
        })
      );
    });

    it('orders by createdAt when not viewing the reported queue', async () => {
      repository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll(1, 20);

      expect(repository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: undefined,
          order: {createdAt: 'DESC'},
        })
      );
    });
  });

  describe('create', () => {
    it('hashes the password before saving', async () => {
      const user = (await service.create({
        name: 'Test',
        email: 'a@b.com',
        password: 'S3cret!Password',
      })) as User;

      expect(user.password).not.toBe('S3cret!Password');
      expect(await bcrypt.compare('S3cret!Password', user.password!)).toBe(
        true
      );
    });

    it('throws ConflictException on duplicate email', async () => {
      repository.save.mockRejectedValue(duplicateEntryError());

      await expect(
        service.create({
          name: 'Test',
          email: 'a@b.com',
          password: 'S3cret!Password',
        })
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findOne', () => {
    it('returns the user when found', async () => {
      repository.findOneByOrFail.mockResolvedValue({id: 'user-1'});

      await expect(service.findOne('user-1')).resolves.toEqual({id: 'user-1'});
    });

    it('throws NotFoundException when missing', async () => {
      repository.findOneByOrFail.mockRejectedValue(new Error('not found'));

      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('update', () => {
    it('applies changes and re-hashes a new password', async () => {
      repository.findOneByOrFail.mockResolvedValue({
        id: 'user-1',
        name: 'Old',
        password: 'old-hash',
      });

      const user = (await service.update('user-1', {
        name: 'New',
        password: 'N3w!Password',
      })) as User;

      expect(user.name).toBe('New');
      expect(user.password).not.toBe('old-hash');
      expect(await bcrypt.compare('N3w!Password', user.password!)).toBe(true);
    });

    it('keeps the existing password when none is provided', async () => {
      repository.findOneByOrFail.mockResolvedValue({
        id: 'user-1',
        name: 'Old',
        password: 'old-hash',
      });

      const user = (await service.update('user-1', {name: 'New'})) as User;

      expect(user.password).toBe('old-hash');
    });
  });

  describe('remove', () => {
    it('soft-deletes the user', async () => {
      repository.softDelete.mockResolvedValue({affected: 1});

      await expect(service.remove('user-1')).resolves.toBeUndefined();
      expect(repository.softDelete).toHaveBeenCalledWith('user-1');
    });

    it('throws NotFoundException when nothing was deleted', async () => {
      repository.softDelete.mockResolvedValue({affected: 0});

      await expect(service.remove('missing')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('restore', () => {
    it('throws NotFoundException when nothing was restored', async () => {
      repository.restore.mockResolvedValue({affected: 0});

      await expect(service.restore('missing')).rejects.toThrow(
        NotFoundException
      );
    });
  });
});
