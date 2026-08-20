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
import {Story} from 'src/stories/entities/story.entity';
import {Series} from 'src/series/entities/series.entity';
import {Bookmark} from 'src/bookmarks/entities/bookmark.entity';
import {Follow} from 'src/follows/entities/follow.entity';
import {ReadingProgress} from 'src/reading-progress/entities/reading-progress.entity';
import {ReportReason} from './enums/report-reason.enum';
import {Badge} from './enums/badge.enum';
import {ContentWarning} from 'src/stories/enums/content-warning.enum';
import type {UpdateUserDto} from './dto/update-user.dto';
import type {CreateUserDto} from './dto/create-user.dto';
import {UsersService} from './users.service';
import {SettingsService} from 'src/settings/settings.service';
import {
  MembershipTier,
  MEMBERSHIP_FOUNDING_LIMIT,
} from './enums/membership-tier.enum';
import {AchievementKey} from './achievements';

const duplicateEntryError = () => {
  const error = new QueryFailedError('INSERT', [], new Error('dup'));
  (error as any).code = '23505';
  return error;
};

describe('UsersService', () => {
  let service: UsersService;
  let repository: {
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    findOne: jest.Mock;
    findOneBy: jest.Mock;
    findAndCount: jest.Mock;
    findOneByOrFail: jest.Mock;
    count: jest.Mock;
    createQueryBuilder: jest.Mock;
    softDelete: jest.Mock;
    restore: jest.Mock;
  };
  let userQueryBuilder: {
    addSelect: jest.Mock;
    where: jest.Mock;
    getOne: jest.Mock;
  };
  let reportsRepository: {
    create: jest.Mock;
    save: jest.Mock;
    countBy: jest.Mock;
    delete: jest.Mock;
    find: jest.Mock;
  };
  let storiesQueryBuilder: {
    select: jest.Mock;
    addSelect: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    getRawOne: jest.Mock;
  };
  let storiesRepository: {createQueryBuilder: jest.Mock};
  let seriesQueryBuilder: {
    innerJoin: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    getCount: jest.Mock;
  };
  let seriesRepository: {exists: jest.Mock; createQueryBuilder: jest.Mock};
  let bookmarksQueryBuilder: {
    innerJoin: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    getCount: jest.Mock;
  };
  let bookmarksRepository: {createQueryBuilder: jest.Mock};
  let followsRepository: {countBy: jest.Mock};
  let readingProgressQueryBuilder: {
    innerJoin: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    getCount: jest.Mock;
  };
  let readingProgressRepository: {createQueryBuilder: jest.Mock};
  let settingsService: {
    allowsProfileImageUpload: jest.Mock;
    isMembershipFeaturesEnabled: jest.Mock;
  };

  beforeEach(async () => {
    userQueryBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };
    repository = {
      create: jest.fn((data) => data),
      save: jest.fn((user) => Promise.resolve({id: 'user-1', ...user})),
      update: jest.fn(),
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      findAndCount: jest.fn(),
      findOneByOrFail: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn(() => userQueryBuilder),
      softDelete: jest.fn(),
      restore: jest.fn(),
    };
    reportsRepository = {
      create: jest.fn((data) => data),
      save: jest.fn((report) => Promise.resolve(report)),
      countBy: jest.fn().mockResolvedValue(0),
      delete: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    storiesQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        approvedCount: '0',
        totalLikes: '0',
        totalComments: '0',
      }),
    };
    storiesRepository = {
      createQueryBuilder: jest.fn(() => storiesQueryBuilder),
    };
    seriesQueryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    };
    seriesRepository = {
      exists: jest.fn().mockResolvedValue(false),
      createQueryBuilder: jest.fn(() => seriesQueryBuilder),
    };
    bookmarksQueryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    };
    bookmarksRepository = {
      createQueryBuilder: jest.fn(() => bookmarksQueryBuilder),
    };
    followsRepository = {countBy: jest.fn().mockResolvedValue(0)};
    readingProgressQueryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    };
    readingProgressRepository = {
      createQueryBuilder: jest.fn(() => readingProgressQueryBuilder),
    };
    settingsService = {
      allowsProfileImageUpload: jest.fn().mockResolvedValue(true),
      isMembershipFeaturesEnabled: jest.fn().mockResolvedValue(false),
    };

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        {provide: getRepositoryToken(User), useValue: repository},
        {provide: getRepositoryToken(UserReport), useValue: reportsRepository},
        {provide: getRepositoryToken(Story), useValue: storiesRepository},
        {provide: getRepositoryToken(Series), useValue: seriesRepository},
        {provide: getRepositoryToken(Bookmark), useValue: bookmarksRepository},
        {provide: getRepositoryToken(Follow), useValue: followsRepository},
        {
          provide: getRepositoryToken(ReadingProgress),
          useValue: readingProgressRepository,
        },
        {
          provide: ConfigService,
          // Low salt rounds to keep hashing fast in tests
          useValue: {get: jest.fn().mockReturnValue('4')},
        },
        {provide: SettingsService, useValue: settingsService},
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
          isVerified: false,
          profileImageUrl: 'https://pic',
        })
      );
      expect(user.id).toBe('user-1');
    });

    it('does not set a profile image when the Google profile has no photo', async () => {
      repository.findOne.mockResolvedValue(null);

      const user = await service.findOrCreateGoogleUser({
        ...profile,
        picture: undefined,
      });

      expect(user.profileImageUrl).toBeUndefined();
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
      await expect(
        service.report('user-1', 'user-1', ReportReason.Spam)
      ).rejects.toThrow(BadRequestException);
      expect(reportsRepository.save).not.toHaveBeenCalled();
    });

    it('saves a report (with reason and detail) and recomputes reportCount from the rows', async () => {
      repository.findOneByOrFail
        .mockResolvedValueOnce({
          id: 'user-2',
          updatedAt: new Date('2020-01-01'),
        })
        .mockResolvedValueOnce({id: 'user-1'});
      reportsRepository.countBy.mockResolvedValue(3);

      const reportedUser = await service.report(
        'user-2',
        'user-1',
        ReportReason.Harassment,
        'Kept sending threats in the comments.'
      );

      expect(reportsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: ReportReason.Harassment,
          details: 'Kept sending threats in the comments.',
        })
      );
      expect(reportsRepository.save).toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalledWith(
        'user-2',
        expect.objectContaining({reportCount: 3})
      );
      expect(reportedUser.reportCount).toBe(3);
    });

    it('stores null details when none are given', async () => {
      repository.findOneByOrFail
        .mockResolvedValueOnce({id: 'user-2', updatedAt: new Date()})
        .mockResolvedValueOnce({id: 'user-1'});

      await service.report('user-2', 'user-1', ReportReason.Spam);

      expect(reportsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({details: null})
      );
    });

    it('maps a duplicate report to ConflictException', async () => {
      repository.findOneByOrFail
        .mockResolvedValueOnce({id: 'user-2', updatedAt: new Date()})
        .mockResolvedValueOnce({id: 'user-1'});
      reportsRepository.save.mockRejectedValue(duplicateEntryError());

      await expect(
        service.report('user-2', 'user-1', ReportReason.Spam)
      ).rejects.toThrow(ConflictException);
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

  describe('findOneWithReports', () => {
    it('attaches the individual reports, most recent first', async () => {
      repository.findOneByOrFail.mockResolvedValue({id: 'user-2'});
      const reports = [
        {id: 'r1', reason: ReportReason.Spam, reporter: {id: 'a'}},
        {id: 'r2', reason: ReportReason.Harassment, reporter: {id: 'b'}},
      ];
      reportsRepository.find.mockResolvedValue(reports);

      const user = await service.findOneWithReports('user-2');

      expect(reportsRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {reportedUser: {id: 'user-2'}},
          relations: ['reporter'],
        })
      );
      expect(user.reports).toBe(reports);
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

    it('always creates the user unverified', async () => {
      const user = (await service.create({
        name: 'Test',
        email: 'a@b.com',
        password: 'S3cret!Password',
        isVerified: true,
      } as CreateUserDto)) as User;

      expect(user.isVerified).toBe(false);
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

  describe('createFromVerifiedRegistration', () => {
    it('saves a user with the given pre-hashed password, unchanged', async () => {
      const user = (await service.createFromVerifiedRegistration(
        {name: 'Test', email: 'a@b.com'},
        'already-hashed'
      )) as User;

      expect(user.password).toBe('already-hashed');
    });

    it('creates the confirmed registration unverified', async () => {
      const user = (await service.createFromVerifiedRegistration(
        {name: 'Test', email: 'a@b.com'},
        'already-hashed'
      )) as User;

      expect(user.isVerified).toBe(false);
    });

    it('maps a duplicate email to ConflictException', async () => {
      repository.save.mockRejectedValue(duplicateEntryError());

      await expect(
        service.createFromVerifiedRegistration(
          {name: 'Test', email: 'a@b.com'},
          'already-hashed'
        )
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

  describe('hasPassword', () => {
    it('returns true only when the account has a password hash', async () => {
      userQueryBuilder.getOne
        .mockResolvedValueOnce({password: 'hash'})
        .mockResolvedValueOnce({password: null});

      await expect(service.hasPassword('user-1')).resolves.toBe(true);
      await expect(service.hasPassword('user-2')).resolves.toBe(false);
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

    it('regenerates the slug when the name actually changes', async () => {
      repository.findOneByOrFail.mockResolvedValue({
        id: 'user-1',
        name: 'Old Name',
        slug: 'old-name-abc123',
      });

      const user = (await service.update('user-1', {
        name: 'New Name',
      })) as User;

      expect(user.slug).not.toBe('old-name-abc123');
      expect(user.slug).toMatch(/^new-name-/);
    });

    it('leaves the slug untouched when the name is not part of the update', async () => {
      repository.findOneByOrFail.mockResolvedValue({
        id: 'user-1',
        name: 'Old Name',
        slug: 'old-name-abc123',
        bio: 'old bio',
      });

      const user = (await service.update('user-1', {
        bio: 'new bio',
      })) as User;

      expect(user.slug).toBe('old-name-abc123');
    });

    it('leaves the slug untouched when the name is resubmitted unchanged', async () => {
      repository.findOneByOrFail.mockResolvedValue({
        id: 'user-1',
        name: 'Old Name',
        slug: 'old-name-abc123',
      });

      const user = (await service.update('user-1', {
        name: 'Old Name',
      })) as User;

      expect(user.slug).toBe('old-name-abc123');
    });

    it('locks verification when an admin explicitly sets isVerified', async () => {
      repository.findOneByOrFail.mockResolvedValue({
        id: 'user-1',
        verificationLocked: false,
      });

      const user = (await service.update('user-1', {
        isVerified: false,
      })) as User;

      expect(user.verificationLocked).toBe(true);
    });

    it('leaves verification unlocked when isVerified is not part of the update', async () => {
      repository.findOneByOrFail.mockResolvedValue({
        id: 'user-1',
        verificationLocked: false,
      });

      const user = (await service.update('user-1', {name: 'New'})) as User;

      expect(user.verificationLocked).toBe(false);
    });

    it('persists mutedContentWarnings via the generic pass-through', async () => {
      repository.findOneByOrFail.mockResolvedValue({
        id: 'user-1',
        mutedContentWarnings: [],
      });

      // mutedContentWarnings lives on UpdateProfileDto (self-service only,
      // not the admin UpdateUserDto family this method is typed against) —
      // the cast mirrors how PrivateUsersController.updateMe passes a real
      // UpdateProfileDto instance through structurally.
      const user = (await service.update('user-1', {
        mutedContentWarnings: [
          ContentWarning.GraphicViolence,
          ContentWarning.BodyHorror,
        ],
      } as UpdateUserDto)) as User;

      expect(user.mutedContentWarnings).toEqual([
        ContentWarning.GraphicViolence,
        ContentWarning.BodyHorror,
      ]);
    });
  });

  describe('update — membership grants', () => {
    it('auto-upgrades a first grant to FoundingPatron while under the founding limit', async () => {
      repository.findOneByOrFail.mockResolvedValue({
        id: 'user-1',
        membershipTier: MembershipTier.Free,
        premiumSince: null,
      });
      repository.count.mockResolvedValue(0);

      const user = (await service.update('user-1', {
        membershipTier: MembershipTier.Patron,
      })) as unknown as User;

      expect(user.membershipTier).toBe(MembershipTier.FoundingPatron);
      expect(user.premiumSince).toBeInstanceOf(Date);
    });

    it('grants plain Patron once the founding limit is reached', async () => {
      repository.findOneByOrFail.mockResolvedValue({
        id: 'user-1',
        membershipTier: MembershipTier.Free,
        premiumSince: null,
      });
      repository.count.mockResolvedValue(MEMBERSHIP_FOUNDING_LIMIT);

      const user = (await service.update('user-1', {
        membershipTier: MembershipTier.Patron,
      })) as unknown as User;

      expect(user.membershipTier).toBe(MembershipTier.Patron);
    });

    it('honors an explicit FoundingPatron request without recomputing eligibility', async () => {
      repository.findOneByOrFail.mockResolvedValue({
        id: 'user-1',
        membershipTier: MembershipTier.Free,
        premiumSince: null,
      });
      repository.count.mockResolvedValue(MEMBERSHIP_FOUNDING_LIMIT);

      const user = (await service.update('user-1', {
        membershipTier: MembershipTier.FoundingPatron,
      })) as unknown as User;

      expect(user.membershipTier).toBe(MembershipTier.FoundingPatron);
      expect(repository.count).not.toHaveBeenCalled();
    });

    it('does not touch premiumSince on a re-grant after a prior lapse', async () => {
      const originalPremiumSince = new Date('2026-01-01T00:00:00.000Z');
      repository.findOneByOrFail.mockResolvedValue({
        id: 'user-1',
        membershipTier: MembershipTier.Free,
        premiumSince: originalPremiumSince,
      });

      const user = (await service.update('user-1', {
        membershipTier: MembershipTier.Patron,
      })) as unknown as User;

      expect(user.premiumSince).toBe(originalPremiumSince);
      // Already a member once before, so no fresh founding-limit check.
      expect(repository.count).not.toHaveBeenCalled();
    });

    it('revoking to Free leaves premiumSince untouched', async () => {
      const originalPremiumSince = new Date('2026-01-01T00:00:00.000Z');
      repository.findOneByOrFail.mockResolvedValue({
        id: 'user-1',
        membershipTier: MembershipTier.Patron,
        premiumSince: originalPremiumSince,
      });

      const user = (await service.update('user-1', {
        membershipTier: MembershipTier.Free,
      })) as unknown as User;

      expect(user.membershipTier).toBe(MembershipTier.Free);
      expect(user.premiumSince).toBe(originalPremiumSince);
    });

    it('restores FoundingPatron from the latch on a re-grant, without recomputing the cap', async () => {
      // Founding status was awarded once, then the account lapsed to Free —
      // premiumSince stays set (from the original grant) but
      // foundingPatronSince is what actually carries the "was founding"
      // fact forward.
      repository.findOneByOrFail.mockResolvedValue({
        id: 'user-1',
        membershipTier: MembershipTier.Free,
        premiumSince: new Date('2026-01-01T00:00:00.000Z'),
        foundingPatronSince: new Date('2026-01-01T00:00:00.000Z'),
      });

      const user = (await service.update('user-1', {
        membershipTier: MembershipTier.Patron,
      })) as unknown as User;

      expect(user.membershipTier).toBe(MembershipTier.FoundingPatron);
      expect(repository.count).not.toHaveBeenCalled();
    });

    it('revokes a latched FoundingPatron to Free without the latch overriding it back', async () => {
      // The latch means "never lost on a later re-grant," not "can never
      // become Free" — an explicit revoke (or a subscription lapsing) must
      // go through even though foundingPatronSince stays set.
      const foundingPatronSince = new Date('2026-01-01T00:00:00.000Z');
      repository.findOneByOrFail.mockResolvedValue({
        id: 'user-1',
        membershipTier: MembershipTier.FoundingPatron,
        premiumSince: foundingPatronSince,
        foundingPatronSince,
      });

      const user = (await service.update('user-1', {
        membershipTier: MembershipTier.Free,
      })) as unknown as User;

      expect(user.membershipTier).toBe(MembershipTier.Free);
      expect(user.foundingPatronSince).toBe(foundingPatronSince);
    });
  });

  describe('applyMembershipChange — self-serve billing grant path', () => {
    it('is a no-op returning null for an unknown user id', async () => {
      repository.findOneBy.mockResolvedValue(null);

      const result = await service.applyMembershipChange(
        'unknown-user',
        MembershipTier.Patron
      );

      expect(result).toBeNull();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('persists the granted tier alongside the billing fields', async () => {
      repository.findOneBy.mockResolvedValue({
        id: 'user-1',
        membershipTier: MembershipTier.Free,
        premiumSince: null,
      });
      repository.count.mockResolvedValue(MEMBERSHIP_FOUNDING_LIMIT);
      repository.save.mockImplementation((user: User) => Promise.resolve(user));

      const user = (await service.applyMembershipChange(
        'user-1',
        MembershipTier.Patron,
        {
          lemonSqueezyCustomerId: 'cust_1',
          lemonSqueezySubscriptionId: 'sub_1',
          membershipStatus: 'active',
          membershipRenewsAt: new Date('2026-06-01T00:00:00.000Z'),
        }
      )) as unknown as User;

      expect(user.membershipTier).toBe(MembershipTier.Patron);
      expect(user.lemonSqueezyCustomerId).toBe('cust_1');
      expect(user.lemonSqueezySubscriptionId).toBe('sub_1');
      expect(user.membershipStatus).toBe('active');
      expect(user.premiumSince).toBeInstanceOf(Date);
    });

    it('converges with the admin PATCH path at the founding cap boundary', async () => {
      // Same fixture, same cap count, exercised through both grant sources —
      // proving _resolveGrantedTier can't drift between them.
      const freshFree = () => ({
        id: 'user-1',
        membershipTier: MembershipTier.Free,
        premiumSince: null,
      });
      repository.count.mockResolvedValue(0);

      repository.findOneByOrFail.mockResolvedValue(freshFree());
      const viaAdmin = (await service.update('user-1', {
        membershipTier: MembershipTier.Patron,
      })) as unknown as User;

      repository.findOneBy.mockResolvedValue(freshFree());
      repository.save.mockImplementation((user: User) => Promise.resolve(user));
      const viaWebhook = (await service.applyMembershipChange(
        'user-1',
        MembershipTier.Patron
      )) as unknown as User;

      expect(viaAdmin.membershipTier).toBe(MembershipTier.FoundingPatron);
      expect(viaWebhook.membershipTier).toBe(MembershipTier.FoundingPatron);
    });

    it('restores FoundingPatron from the latch when a lapsed member resubscribes via checkout', async () => {
      // A self-serve checkout only ever requests plain Patron — this is the
      // scenario the latch exists for.
      repository.findOneBy.mockResolvedValue({
        id: 'user-1',
        membershipTier: MembershipTier.Free,
        premiumSince: new Date('2026-01-01T00:00:00.000Z'),
        foundingPatronSince: new Date('2026-01-01T00:00:00.000Z'),
      });
      repository.save.mockImplementation((user: User) => Promise.resolve(user));

      const user = (await service.applyMembershipChange(
        'user-1',
        MembershipTier.Patron,
        {lemonSqueezySubscriptionId: 'sub_2'}
      )) as unknown as User;

      expect(user.membershipTier).toBe(MembershipTier.FoundingPatron);
      expect(repository.count).not.toHaveBeenCalled();
    });
  });

  describe('recordActivity — streak freeze', () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000)
      .toISOString()
      .slice(0, 10);

    it('grants a freeze to a Patron+ member with none banked', async () => {
      repository.findOneBy.mockResolvedValue({
        id: 'user-1',
        membershipTier: MembershipTier.Patron,
        currentStreak: 1,
        longestStreak: 1,
        lastActiveDate: today,
        streakFreezeCount: 0,
        lastStreakFreezeUsedAt: null,
      });
      settingsService.isMembershipFeaturesEnabled.mockResolvedValue(true);

      await service.recordActivity('user-1');

      expect(repository.update).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({streakFreezeCount: 1})
      );
    });

    it('does not grant a freeze to a Free member', async () => {
      repository.findOneBy.mockResolvedValue({
        id: 'user-1',
        membershipTier: MembershipTier.Free,
        currentStreak: 1,
        longestStreak: 1,
        lastActiveDate: yesterday,
        streakFreezeCount: 0,
        lastStreakFreezeUsedAt: null,
      });

      await service.recordActivity('user-1');

      const [, update] = repository.update.mock.calls[0];
      expect(update.streakFreezeCount).toBeUndefined();
    });

    it('does not grant while membership features are staged off', async () => {
      repository.findOneBy.mockResolvedValue({
        id: 'user-1',
        membershipTier: MembershipTier.Patron,
        currentStreak: 1,
        longestStreak: 1,
        lastActiveDate: yesterday,
        streakFreezeCount: 0,
        lastStreakFreezeUsedAt: null,
      });
      settingsService.isMembershipFeaturesEnabled.mockResolvedValue(false);

      await service.recordActivity('user-1');

      const [, update] = repository.update.mock.calls[0];
      expect(update.streakFreezeCount).toBeUndefined();
    });

    it('spends a banked freeze to protect a one-day gap instead of resetting', async () => {
      repository.findOneBy.mockResolvedValue({
        id: 'user-1',
        membershipTier: MembershipTier.Patron,
        currentStreak: 5,
        longestStreak: 5,
        lastActiveDate: twoDaysAgo,
        streakFreezeCount: 1,
        lastStreakFreezeUsedAt: null,
      });
      settingsService.isMembershipFeaturesEnabled.mockResolvedValue(true);

      await service.recordActivity('user-1');

      const [, update] = repository.update.mock.calls[0];
      expect(update.currentStreak).toBe(6);
      expect(update.streakFreezeCount).toBe(0);
    });

    it('resets normally when the gap is more than one day, even with a freeze banked', async () => {
      const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      repository.findOneBy.mockResolvedValue({
        id: 'user-1',
        membershipTier: MembershipTier.Patron,
        currentStreak: 5,
        longestStreak: 5,
        lastActiveDate: fourDaysAgo,
        streakFreezeCount: 1,
        lastStreakFreezeUsedAt: null,
      });
      settingsService.isMembershipFeaturesEnabled.mockResolvedValue(true);

      await service.recordActivity('user-1');

      const [, update] = repository.update.mock.calls[0];
      expect(update.currentStreak).toBe(1);
      // Not spent — the gap it protects is exactly one day, not this one.
      expect(update.streakFreezeCount).toBeUndefined();
    });
  });

  describe('markHasPublishedStory', () => {
    it('sets the flag via a targeted update', async () => {
      await service.markHasPublishedStory('user-1');

      expect(repository.update).toHaveBeenCalledWith('user-1', {
        hasPublishedStory: true,
      });
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
    it('refuses to restore a self-deleted anonymized account', async () => {
      repository.findOne.mockResolvedValue({
        id: 'user-1',
        email: 'deleted-user-1@deleted.invalid',
        deletedAt: new Date(),
      });

      await expect(service.restore('user-1')).rejects.toThrow(
        BadRequestException
      );
      expect(repository.restore).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when nothing was restored', async () => {
      repository.findOne.mockResolvedValue(null);
      repository.restore.mockResolvedValue({affected: 0});

      await expect(service.restore('missing')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('computeBadges', () => {
    it('returns no badges for an author with no approved stories or series', async () => {
      const badges = await service.computeBadges('user-1', 0);

      expect(badges).toEqual([]);
    });

    it('awards Published at 1 approved story, not before', async () => {
      storiesQueryBuilder.getRawOne.mockResolvedValue({
        approvedCount: '1',
        totalLikes: '0',
        totalComments: '0',
      });

      expect(await service.computeBadges('user-1', 0)).toEqual([
        Badge.Published,
      ]);
    });

    it('awards Prolific at 10 approved stories', async () => {
      storiesQueryBuilder.getRawOne.mockResolvedValue({
        approvedCount: '10',
        totalLikes: '0',
        totalComments: '0',
      });

      const badges = await service.computeBadges('user-1', 0);

      expect(badges).toContain(Badge.Published);
      expect(badges).toContain(Badge.Prolific);
    });

    it('does not award Prolific at 9 approved stories', async () => {
      storiesQueryBuilder.getRawOne.mockResolvedValue({
        approvedCount: '9',
        totalLikes: '0',
        totalComments: '0',
      });

      expect(await service.computeBadges('user-1', 0)).not.toContain(
        Badge.Prolific
      );
    });

    it('awards Fan Favorite at 25 likes received, not at 24', async () => {
      storiesQueryBuilder.getRawOne.mockResolvedValue({
        approvedCount: '1',
        totalLikes: '24',
        totalComments: '0',
      });
      expect(await service.computeBadges('user-1', 0)).not.toContain(
        Badge.FanFavorite
      );

      storiesQueryBuilder.getRawOne.mockResolvedValue({
        approvedCount: '1',
        totalLikes: '25',
        totalComments: '0',
      });
      expect(await service.computeBadges('user-1', 0)).toContain(
        Badge.FanFavorite
      );
    });

    it('awards Conversation Starter at 25 comments received', async () => {
      storiesQueryBuilder.getRawOne.mockResolvedValue({
        approvedCount: '1',
        totalLikes: '0',
        totalComments: '25',
      });

      expect(await service.computeBadges('user-1', 0)).toContain(
        Badge.ConversationStarter
      );
    });

    it('awards Series Author only when the author has created a series', async () => {
      seriesRepository.exists.mockResolvedValue(true);

      const badges = await service.computeBadges('user-1', 0);

      expect(badges).toContain(Badge.SeriesAuthor);
      expect(seriesRepository.exists).toHaveBeenCalledWith({
        where: {author: {id: 'user-1'}},
      });
    });

    it('treats a null aggregate (no rows) as all-zero stats', async () => {
      storiesQueryBuilder.getRawOne.mockResolvedValue(undefined);

      await expect(service.computeBadges('user-1', 0)).resolves.toEqual([]);
    });

    it('awards the week/month streak badges at their thresholds, not before', async () => {
      expect(await service.computeBadges('user-1', 6)).not.toContain(
        Badge.WeekStreak
      );
      expect(await service.computeBadges('user-1', 7)).toContain(
        Badge.WeekStreak
      );
      expect(await service.computeBadges('user-1', 29)).not.toContain(
        Badge.MonthStreak
      );
      expect(await service.computeBadges('user-1', 30)).toContain(
        Badge.MonthStreak
      );
    });
  });

  describe('computeAchievements', () => {
    beforeEach(() => {
      repository.findOneByOrFail.mockResolvedValue({
        id: 'user-1',
        longestStreak: 30,
        membershipTier: MembershipTier.Free,
      });
    });

    it('returns all six tracks with four thresholds each', async () => {
      const achievements = await service.computeAchievements('user-1');

      expect(achievements).toHaveLength(7);
      expect(achievements.every((item) => item.thresholds.length === 4)).toBe(
        true
      );
    });

    it('unlocks the 4th tier for a Patron+ member once membership features are live', async () => {
      repository.findOneByOrFail.mockResolvedValue({
        id: 'user-1',
        longestStreak: 30,
        membershipTier: MembershipTier.Patron,
      });
      settingsService.isMembershipFeaturesEnabled.mockResolvedValue(true);
      storiesQueryBuilder.getRawOne.mockResolvedValue({
        approvedCount: '25',
        totalLikes: '0',
        totalComments: '0',
      });

      const achievements = await service.computeAchievements('user-1');

      expect(
        achievements.find(({key}) => key === AchievementKey.Storyteller)
      ).toMatchObject({progress: 25, highestUnlockedTier: 4});
    });

    it('caps a Free member at tier 3 even past the 4th threshold', async () => {
      storiesQueryBuilder.getRawOne.mockResolvedValue({
        approvedCount: '25',
        totalLikes: '0',
        totalComments: '0',
      });

      const achievements = await service.computeAchievements('user-1');

      expect(
        achievements.find(({key}) => key === AchievementKey.Storyteller)
      ).toMatchObject({progress: 25, highestUnlockedTier: 3});
    });

    it('caps a Patron member at tier 3 while membership features are staged off', async () => {
      repository.findOneByOrFail.mockResolvedValue({
        id: 'user-1',
        longestStreak: 30,
        membershipTier: MembershipTier.Patron,
      });
      settingsService.isMembershipFeaturesEnabled.mockResolvedValue(false);
      storiesQueryBuilder.getRawOne.mockResolvedValue({
        approvedCount: '25',
        totalLikes: '0',
        totalComments: '0',
      });

      const achievements = await service.computeAchievements('user-1');

      expect(
        achievements.find(({key}) => key === AchievementKey.Storyteller)
      ).toMatchObject({progress: 25, highestUnlockedTier: 3});
    });

    it('tiers current approved-story metrics at their boundaries', async () => {
      storiesQueryBuilder.getRawOne.mockResolvedValue({
        approvedCount: '5',
        totalLikes: '25',
        totalComments: '100',
      });

      const achievements = await service.computeAchievements('user-1');

      expect(
        achievements.find(({key}) => key === AchievementKey.Storyteller)
      ).toMatchObject({progress: 5, highestUnlockedTier: 2});
      expect(
        achievements.find(({key}) => key === AchievementKey.CrowdFavorite)
      ).toMatchObject({progress: 25, highestUnlockedTier: 2});
      expect(
        achievements.find(({key}) => key === AchievementKey.CampfireHost)
      ).toMatchObject({progress: 100, highestUnlockedTier: 3});
    });

    it('counts only series returned by the approved-story join and completed reads', async () => {
      seriesQueryBuilder.getCount.mockResolvedValue(3);
      readingProgressQueryBuilder.getCount.mockResolvedValue(25);

      const achievements = await service.computeAchievements('user-1');

      expect(
        achievements.find(({key}) => key === AchievementKey.SerialStoryteller)
      ).toMatchObject({progress: 3, highestUnlockedTier: 2});
      expect(
        achievements.find(({key}) => key === AchievementKey.NightExplorer)
      ).toMatchObject({progress: 25, highestUnlockedTier: 2});
      expect(readingProgressQueryBuilder.innerJoin).toHaveBeenCalledWith(
        'progress.story',
        'story'
      );
      expect(readingProgressQueryBuilder.andWhere).toHaveBeenCalledWith(
        'story.status = :status',
        {status: 'approved'}
      );
    });
  });

  describe('computeAuthorStats', () => {
    it('returns all-zero stats for a fresh author', async () => {
      const stats = await service.computeAuthorStats('user-1');

      expect(stats).toEqual({
        storiesPublished: 0,
        totalViews: 0,
        totalLikes: 0,
        totalComments: 0,
        totalBookmarks: 0,
        followers: 0,
        following: 0,
      });
    });

    it('reflects the story aggregate row', async () => {
      storiesQueryBuilder.getRawOne.mockResolvedValue({
        storiesPublished: '3',
        totalViews: '150',
        totalLikes: '20',
        totalComments: '8',
      });

      const stats = await service.computeAuthorStats('user-1');

      expect(stats.storiesPublished).toBe(3);
      expect(stats.totalViews).toBe(150);
      expect(stats.totalLikes).toBe(20);
      expect(stats.totalComments).toBe(8);
    });

    it('reflects the bookmark count', async () => {
      bookmarksQueryBuilder.getCount.mockResolvedValue(7);

      const stats = await service.computeAuthorStats('user-1');

      expect(stats.totalBookmarks).toBe(7);
      expect(bookmarksQueryBuilder.innerJoin).toHaveBeenCalledWith(
        'bookmark.story',
        'story'
      );
    });

    it('reflects followers and following independently', async () => {
      followsRepository.countBy
        .mockResolvedValueOnce(12)
        .mockResolvedValueOnce(4);

      const stats = await service.computeAuthorStats('user-1');

      expect(stats.followers).toBe(12);
      expect(stats.following).toBe(4);
      expect(followsRepository.countBy).toHaveBeenCalledWith({
        following: {id: 'user-1'},
      });
      expect(followsRepository.countBy).toHaveBeenCalledWith({
        follower: {id: 'user-1'},
      });
    });

    it('treats a null aggregate (no rows) as all-zero story stats', async () => {
      storiesQueryBuilder.getRawOne.mockResolvedValue(undefined);

      const stats = await service.computeAuthorStats('user-1');

      expect(stats.storiesPublished).toBe(0);
      expect(stats.totalViews).toBe(0);
      expect(stats.totalLikes).toBe(0);
      expect(stats.totalComments).toBe(0);
    });
  });
});
