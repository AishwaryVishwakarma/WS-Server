import {Module} from '@nestjs/common';
import {MailService} from './mail.service';
import {MailTransportService} from './mail-transport.service';
import {MailProcessor} from './mail.processor';

@Module({
  providers: [MailService, MailTransportService, MailProcessor],
  exports: [MailService, MailTransportService],
})
export class MailModule {}
