import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {SiteSettings} from './entities/site-settings.entity';
import {UpdateSiteSettingsDto} from './dto/update-site-settings.dto';

// Single well-known row (id 1), seeded by the migration.
const SETTINGS_ROW_ID = 1;

// This started as "not a hot path" but is now read per-recipient inside
// notification/digest/win-back fan-out and per-request in achievement/
// referral checks — a bulk story approval's series-notify fan-out alone can
// mean hundreds of reads of one never-changing-mid-batch row. A short TTL
// cache keeps those cheap while still being "correct immediately after an
// admin flips it" *on the instance that handled the write* (updateSettings
// refreshes the cache instead of just invalidating it). Other instances in a
// multi-instance deployment can lag by up to CACHE_TTL_MS — acceptable for
// settings an admin flips rarely, unlike per-request session/auth state.
const CACHE_TTL_MS = 5_000;

@Injectable()
export class SettingsService {
  private _cache: {settings: SiteSettings; expiresAt: number} | null = null;

  constructor(
    @InjectRepository(SiteSettings)
    private readonly settingsRepository: Repository<SiteSettings>
  ) {}

  async getSettings(): Promise<SiteSettings> {
    if (this._cache && this._cache.expiresAt > Date.now()) {
      return this._cache.settings;
    }

    const settings = await this.settingsRepository.findOne({
      where: {id: SETTINGS_ROW_ID},
    });

    // Defensive fallback (preserves today's behavior) in case the seed row is
    // ever missing in some environment — the migration should always create it.
    const resolved = settings ?? {
      id: SETTINGS_ROW_ID,
      requireStoryApproval: true,
      allowProfileImageUpload: false,
      allowStoryCoverImage: false,
      digestEmailGloballyEnabled: false,
      notificationEmailGloballyEnabled: false,
      membershipFeaturesEnabled: false,
      winbackEmailGloballyEnabled: false,
      referralProgramEnabled: false,
      updatedAt: new Date(),
    };
    this._cache = {settings: resolved, expiresAt: Date.now() + CACHE_TTL_MS};
    return resolved;
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

  async isDigestEmailGloballyEnabled(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.digestEmailGloballyEnabled;
  }

  async isNotificationEmailGloballyEnabled(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.notificationEmailGloballyEnabled;
  }

  async isMembershipFeaturesEnabled(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.membershipFeaturesEnabled;
  }

  async isWinbackEmailGloballyEnabled(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.winbackEmailGloballyEnabled;
  }

  async isReferralProgramEnabled(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.referralProgramEnabled;
  }

  async updateSettings(dto: UpdateSiteSettingsDto): Promise<SiteSettings> {
    const settings = await this.getSettings();
    Object.assign(settings, dto);
    const saved = await this.settingsRepository.save(settings);
    this._cache = {settings: saved, expiresAt: Date.now() + CACHE_TTL_MS};
    return saved;
  }

  // For anything that changes the row out from under this cache without
  // going through updateSettings — today, only the integration test
  // harness's cleanDatabase (a raw TRUNCATE between tests).
  invalidateCache(): void {
    this._cache = null;
  }
}
