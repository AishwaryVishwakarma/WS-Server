import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {SiteSettings} from './entities/site-settings.entity';
import {UpdateSiteSettingsDto} from './dto/update-site-settings.dto';

// Single well-known row (id 1), seeded by the migration. No caching — this is
// only read on story create/submit/edit, not a hot path, and the setting must
// be correct immediately after an admin flips it.
const SETTINGS_ROW_ID = 1;

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(SiteSettings)
    private readonly settingsRepository: Repository<SiteSettings>
  ) {}

  async getSettings(): Promise<SiteSettings> {
    const settings = await this.settingsRepository.findOne({
      where: {id: SETTINGS_ROW_ID},
    });

    // Defensive fallback (preserves today's behavior) in case the seed row is
    // ever missing in some environment — the migration should always create it.
    return (
      settings ?? {
        id: SETTINGS_ROW_ID,
        requireStoryApproval: true,
        allowProfileImageUpload: false,
        allowStoryCoverImage: false,
        updatedAt: new Date(),
      }
    );
  }

  async requiresApproval(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.requireStoryApproval;
  }

  async allowsProfileImageUpload(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.allowProfileImageUpload;
  }

  async allowsStoryCoverImage(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.allowStoryCoverImage;
  }

  async updateSettings(dto: UpdateSiteSettingsDto): Promise<SiteSettings> {
    const settings = await this.getSettings();
    Object.assign(settings, dto);
    return this.settingsRepository.save(settings);
  }
}
