import {Test} from '@nestjs/testing';
import {getQueueToken} from '@nestjs/bullmq';
import {getRepositoryToken} from '@nestjs/typeorm';
import {ConfigService} from '@nestjs/config';
import {User} from 'src/users/entities/user.entity';
import {FollowsService} from 'src/follows/follows.service';
import {MutesService} from 'src/mutes/mutes.service';
import {StoriesService} from 'src/stories/stories.service';
import {NotificationsService} from 'src/notifications/notifications.service';
import {MailTransportService} from 'src/mail/mail-transport.service';
import {SettingsService} from 'src/settings/settings.service';
import {WinbackService} from './winback.service';
import {WINBACK_QUEUE} from 'src/jobs/queue.constants';
import {WinbackUnsubscribeService} from './winback-unsubscribe.service';

// Only the global on/off gate and the eligibility query are unit-tested here
// — the email content itself is covered by winback-content.spec.ts (the
// pure builders) and would need an integration spec for a real send
// end-to-end, mirroring digest.service.spec.ts's own scope split.
describe('WinbackService', () => {
  let service: WinbackService;
  let queryBuilder: {
    select: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    take: jest.Mock;
    getMany: jest.Mock;
  };
  let usersRepository: {createQueryBuilder: jest.Mock};
  let settingsService: {isWinbackEmailGloballyEnabled: jest.Mock};
  let winbackQueue: {addBulk: jest.Mock};

  beforeEach(async () => {
    queryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    usersRepository = {
      createQueryBuilder: jest.fn(() => queryBuilder),
    };
    settingsService = {
      isWinbackEmailGloballyEnabled: jest.fn().mockResolvedValue(true),
    };
    winbackQueue = {addBulk: jest.fn().mockResolvedValue([])};

    const module = await Test.createTestingModule({
      providers: [
        WinbackService,
        {provide: getRepositoryToken(User), useValue: usersRepository},
        {provide: FollowsService, useValue: {}},
        {provide: MutesService, useValue: {}},
        {provide: StoriesService, useValue: {}},
        {provide: NotificationsService, useValue: {}},
        {provide: MailTransportService, useValue: {deliver: jest.fn()}},
        {provide: ConfigService, useValue: {get: jest.fn()}},
        {provide: SettingsService, useValue: settingsService},
        {provide: getQueueToken(WINBACK_QUEUE), useValue: winbackQueue},
        {
          provide: WinbackUnsubscribeService,
          useValue: {createToken: jest.fn().mockReturnValue('token')},
        },
      ],
    }).compile();

    service = module.get(WinbackService);
  });

  describe('sendWinbackEmails', () => {
    it('does nothing when win-back email is globally disabled', async () => {
      settingsService.isWinbackEmailGloballyEnabled.mockResolvedValue(false);

      const result = await service.sendWinbackEmails();

      expect(result).toEqual({sent: 0});
      expect(usersRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('proceeds to query eligible users when win-back email is globally enabled', async () => {
      const result = await service.sendWinbackEmails();

      expect(result).toEqual({sent: 0});
      expect(usersRepository.createQueryBuilder).toHaveBeenCalledWith('user');
      expect(queryBuilder.where).toHaveBeenCalledWith(
        'user.winbackEmailEnabled = true'
      );
    });

    it('queues one durable winback job per eligible user in a single bulk add', async () => {
      queryBuilder.getMany
        .mockResolvedValueOnce([{id: 'user-1'}, {id: 'user-2'}])
        .mockResolvedValueOnce([]);

      const result = await service.sendWinbackEmails();

      expect(result).toEqual({sent: 2});
      expect(winbackQueue.addBulk).toHaveBeenCalledTimes(1);
      expect(winbackQueue.addBulk).toHaveBeenCalledWith([
        expect.objectContaining({
          name: 'winback',
          data: {userId: 'user-1'},
          opts: expect.objectContaining({
            attempts: 5,
            jobId: expect.stringMatching(/^winback-\d{4}-\d{2}-\d{2}-user-1$/),
          }),
        }),
        expect.objectContaining({
          name: 'winback',
          data: {userId: 'user-2'},
        }),
      ]);
    });
  });
});
