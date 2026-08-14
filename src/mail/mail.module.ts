import {Module} from '@nestjs/common';
import {MailService} from './mail.service';
import {MailTransportService} from './mail-transport.service';
import {MailProcessor} from './mail.processor';
import {TypeOrmModule} from '@nestjs/typeorm';
import {User} from 'src/users/entities/user.entity';
import {ResendWebhookController} from './resend-webhook.controller';
import {ResendWebhookService} from './resend-webhook.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [ResendWebhookController],
  providers: [
    MailService,
    MailTransportService,
    MailProcessor,
    ResendWebhookService,
  ],
  exports: [MailService, MailTransportService],
})
export class MailModule {}
