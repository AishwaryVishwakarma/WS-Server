import {Body, Controller, Get, Patch, UseGuards} from '@nestjs/common';
import {ApiCookieAuth} from '@nestjs/swagger';
import {plainToInstance} from 'class-transformer';
import {SettingsService} from '../settings.service';
import {UpdateSiteSettingsDto} from '../dto/update-site-settings.dto';
import {SiteSettingsResponseDto} from '../dto/site-settings-response.dto';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {RolesGuard} from 'src/common/gaurds/roles.gaurd';
import {Roles} from 'src/common/decorators/roles.decorators';
import {Role} from 'src/users/enums/role';

@ApiCookieAuth('session')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.Admin)
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  private _serialize(settings: unknown) {
    return plainToInstance(SiteSettingsResponseDto, settings, {
      excludeExtraneousValues: true,
    });
  }

  @Get()
  async getSettings() {
    return this._serialize(await this.settingsService.getSettings());
  }

  @Patch()
  async updateSettings(@Body() updateSiteSettingsDto: UpdateSiteSettingsDto) {
    return this._serialize(
      await this.settingsService.updateSettings(updateSiteSettingsDto)
    );
  }
}
