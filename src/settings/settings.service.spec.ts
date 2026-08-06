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

    it('falls back to requiring approval when the seed row is missing', async () => {
      repository.findOne.mockResolvedValue(null);

      const settings = await service.getSettings();

      expect(settings.requireStoryApproval).toBe(true);
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
  });
});
