import {Module} from '@nestjs/common';
import {SessionService} from './session.service';
import {SessionRegistryService} from './session-registry.service';
import {GeoLocationService} from './geo-location.service';

@Module({
  providers: [SessionService, SessionRegistryService, GeoLocationService],
  exports: [SessionService, SessionRegistryService, GeoLocationService],
})
export class SessionModule {}
