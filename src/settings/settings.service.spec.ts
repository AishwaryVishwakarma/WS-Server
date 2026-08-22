import {Test} from '@nestjs/testing';
import {getRepositoryToken} from '@nestjs/typeorm';
import {SiteSettings} from './entities/site-settings.entity';
import {SettingsService} from './settings.service';

describe('SettingsService', () => {
  let service: SettingsService;
  let repository: {findOne: jest.Mock; save: jest.Mock};

  beforeEach(async () => {
    repository = {
      findOne: jest.fn(),
      save: jest.fn((settings) => Promise.resolve(settings)),
    };

    const module = await Test.createTestingModule({
      providers: [
        SettingsService,
        {provide: getRepositoryToken(SiteSettings), useValue: repository},
      ],
    }).compile();

    service = module.get(SettingsService);
  });

  describe('getSettings', () => {
    it('returns the seeded row', async () => {
      repository.findOne.mockResolvedValue({
        id: 1,
        requireStoryApproval: false,
        updatedAt: new Date(),
      });

      const settings = await service.getSettings();

      expect(settings.requireStoryApproval).toBe(false);
      expect(repository.findOne).toHaveBeenCalledWith({where: {id: 1}});
    });

    it('serves a second call within the TTL from cache, not another query', async () => {
      repository.findOne.mockResolvedValue({
        id: 1,
        requireStoryApproval: false,
        updatedAt: new Date(),
      });

      await service.getSettings();
      await service.getSettings();

      expect(repository.findOne).toHaveBeenCalledTimes(1);
    });

    it('falls back to requiring approval, with image uploads and digest off, when the seed row is missing', async () => {
      repository.findOne.mockResolvedValue(null);

      const settings = await service.getSettings();

      expect(settings.requireStoryApproval).toBe(true);
      expect(settings.allowProfileImageUpload).toBe(false);
      expect(settings.allowStoryCoverImage).toBe(false);
      expect(settings.digestEmailGloballyEnabled).toBe(false);
    });
  });

  describe('requiresApproval', () => {
    it('reflects the stored value', async () => {
      repository.findOne.mockResolvedValue({
        id: 1,
        requireStoryApproval: false,
        updatedAt: new Date(),
      });

      expect(await service.requiresApproval()).toBe(false);
    });
  });

  describe('allowsProfileImageUpload', () => {
    it('reflects the stored value', async () => {
      repository.findOne.mockResolvedValue({
        id: 1,
        allowProfileImageUpload: true,
        updatedAt: new Date(),
      });

      expect(await service.allowsProfileImageUpload()).toBe(true);
    });
  });

  describe('allowsStoryCoverImage', () => {
    it('reflects the stored value', async () => {
      repository.findOne.mockResolvedValue({
        id: 1,
        allowStoryCoverImage: true,
        updatedAt: new Date(),
      });

      expect(await service.allowsStoryCoverImage()).toBe(true);
    });
  });

  describe('isDigestEmailGloballyEnabled', () => {
    it('reflects the stored value', async () => {
      repository.findOne.mockResolvedValue({
        id: 1,
        digestEmailGloballyEnabled: true,
        updatedAt: new Date(),
      });

      expect(await service.isDigestEmailGloballyEnabled()).toBe(true);
    });
  });

  describe('isWinbackEmailGloballyEnabled', () => {
    it('reflects the stored value', async () => {
      repository.findOne.mockResolvedValue({
        id: 1,
        winbackEmailGloballyEnabled: true,
        updatedAt: new Date(),
      });

      expect(await service.isWinbackEmailGloballyEnabled()).toBe(true);
    });
  });

  describe('isReferralProgramEnabled', () => {
    it('reflects the stored value', async () => {
      repository.findOne.mockResolvedValue({
        id: 1,
        referralProgramEnabled: true,
        updatedAt: new Date(),
      });

      expect(await service.isReferralProgramEnabled()).toBe(true);
    });
  });

  describe('updateSettings', () => {
    it('persists the new value', async () => {
      repository.findOne.mockResolvedValue({
        id: 1,
        requireStoryApproval: true,
        updatedAt: new Date(),
      });

      const settings = await service.updateSettings({
        requireStoryApproval: false,
      });

      expect(settings.requireStoryApproval).toBe(false);
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({requireStoryApproval: false})
      );
    });

    it('persists the two image-upload toggles together', async () => {
      repository.findOne.mockResolvedValue({
        id: 1,
        requireStoryApproval: true,
        allowProfileImageUpload: false,
        allowStoryCoverImage: false,
        updatedAt: new Date(),
      });

      const settings = await service.updateSettings({
        allowProfileImageUpload: true,
        allowStoryCoverImage: true,
      });

      expect(settings.allowProfileImageUpload).toBe(true);
      expect(settings.allowStoryCoverImage).toBe(true);
    });

    it('refreshes the cache immediately so a later getSettings reflects the write without re-querying', async () => {
      repository.findOne.mockResolvedValue({
        id: 1,
        requireStoryApproval: true,
        updatedAt: new Date(),
      });

      await service.updateSettings({requireStoryApproval: false});
      repository.findOne.mockClear();
      const settings = await service.getSettings();

      expect(settings.requireStoryApproval).toBe(false);
      expect(repository.findOne).not.toHaveBeenCalled();
    });
  });
});
