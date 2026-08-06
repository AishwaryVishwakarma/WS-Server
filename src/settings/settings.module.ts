import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {SettingsService} from './settings.service';
import {AdminSettingsController} from './controllers/admin-settings.controller';
import {PublicSettingsController} from './controllers/public-settings.controller';
import {SiteSettings} from './entities/site-settings.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SiteSettings])],
  controllers: [AdminSettingsController, PublicSettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
