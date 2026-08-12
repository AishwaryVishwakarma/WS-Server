import {Test} from '@nestjs/testing';
import {getRepositoryToken} from '@nestjs/typeorm';
import {ConfigService} from '@nestjs/config';
import {User} from 'src/users/entities/user.entity';
import {FollowsService} from 'src/follows/follows.service';
import {MutesService} from 'src/mutes/mutes.service';
import {StoriesService} from 'src/stories/stories.service';
import {NotificationsService} from 'src/notifications/notifications.service';
import {MailService} from 'src/mail/mail.service';
import {SettingsService} from 'src/settings/settings.service';
import {DigestService} from './digest.service';
import {DigestLockService} from './digest-lock.service';

// Only the global on/off gate is unit-tested here — the digest content
// itself (what a sent email actually contains) is covered by
// digest-content.spec.ts (the pure builders) and digest.integration.spec.ts
// (a real send end-to-end).
describe('DigestService', () => {
  let service: DigestService;
  let usersRepository: {find: jest.Mock};
  let settingsService: {isDigestEmailGloballyEnabled: jest.Mock};

  beforeEach(async () => {
    usersRepository = {find: jest.fn().mockResolvedValue([])};
    settingsService = {
      isDigestEmailGloballyEnabled: jest.fn().mockResolvedValue(true),
    };

    const module = await Test.createTestingModule({
      providers: [
        DigestService,
        {provide: getRepositoryToken(User), useValue: usersRepository},
        {provide: FollowsService, useValue: {}},
        {provide: MutesService, useValue: {}},
        {provide: StoriesService, useValue: {}},
        {provide: NotificationsService, useValue: {}},
        {provide: MailService, useValue: {send: jest.fn()}},
        {provide: ConfigService, useValue: {get: jest.fn()}},
        {provide: SettingsService, useValue: settingsService},
        {
          provide: DigestLockService,
          useValue: {run: jest.fn((work: () => Promise<unknown>) => work())},
        },
      ],
    }).compile();

    service = module.get(DigestService);
  });

  describe('sendWeeklyDigests', () => {
    it('does nothing when digest is globally disabled', async () => {
      settingsService.isDigestEmailGloballyEnabled.mockResolvedValue(false);

      const result = await service.sendWeeklyDigests();

      expect(result).toEqual({sent: 0});
      expect(usersRepository.find).not.toHaveBeenCalled();
    });

    it('proceeds to look up opted-in users when digest is globally enabled', async () => {
      settingsService.isDigestEmailGloballyEnabled.mockResolvedValue(true);

      const result = await service.sendWeeklyDigests();

      expect(result).toEqual({sent: 0});
      expect(usersRepository.find).toHaveBeenCalledWith({
        where: {digestEmailEnabled: true},
        order: {id: 'ASC'},
        take: 100,
      });
    });
  });
});
