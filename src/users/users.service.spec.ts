import {ConflictException, NotFoundException} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {Test} from '@nestjs/testing';
import {getRepositoryToken} from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import {QueryFailedError} from 'typeorm';
import {User} from './entities/user.entity';
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
    findAndCount: jest.Mock;
    findOneByOrFail: jest.Mock;
    softDelete: jest.Mock;
    restore: jest.Mock;
  };

  beforeEach(async () => {
    repository = {
      create: jest.fn((data) => data),
      save: jest.fn((user) => Promise.resolve({id: 'user-1', ...user})),
      findAndCount: jest.fn(),
      findOneByOrFail: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        {provide: getRepositoryToken(User), useValue: repository},
        {
          provide: ConfigService,
          // Low salt rounds to keep hashing fast in tests
          useValue: {get: jest.fn().mockReturnValue('4')},
        },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe('create', () => {
    it('hashes the password before saving', async () => {
      const user = (await service.create({
        name: 'Test',
        email: 'a@b.com',
        password: 'S3cret!Password',
      })) as User;

      expect(user.password).not.toBe('S3cret!Password');
      expect(await bcrypt.compare('S3cret!Password', user.password)).toBe(true);
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
      expect(await bcrypt.compare('N3w!Password', user.password)).toBe(true);
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
