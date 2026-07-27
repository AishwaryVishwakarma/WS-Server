import {Module} from '@nestjs/common';
import {SessionService} from './session.service';
import {SessionRegistryService} from './session-registry.service';

@Module({
  providers: [SessionService, SessionRegistryService],
  exports: [SessionService, SessionRegistryService],
})
export class SessionModule {}
