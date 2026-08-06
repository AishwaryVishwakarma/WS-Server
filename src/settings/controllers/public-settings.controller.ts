import {Controller, Get} from '@nestjs/common';
import {Throttle} from '@nestjs/throttler';
import {plainToInstance} from 'class-transformer';
import {SettingsService} from '../settings.service';
import {PublicSiteSettingsResponseDto} from '../dto/public-site-settings-response.dto';
import {PUBLIC_READ_THROTTLE} from 'src/common/constants/throttle';

// Public read — no session required. Pages that adjust their copy based on
// whether story approval is currently required (write flow, feed/tag/author
// intros, footer, legal pages) all need this, and none of them are admin-only.
@Throttle(PUBLIC_READ_THROTTLE)
@Controller('settings')
export class PublicSettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async getSettings() {
    const settings = await this.settingsService.getSettings();
    return plainToInstance(PublicSiteSettingsResponseDto, settings, {
      excludeExtraneousValues: true,
    });
  }
}
