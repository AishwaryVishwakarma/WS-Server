import {Module} from '@nestjs/common';
import {UsersModule} from 'src/users/users.module';
import {SettingsModule} from 'src/settings/settings.module';
import {BillingController} from './billing.controller';
import {LemonSqueezyWebhookController} from './lemon-squeezy-webhook.controller';
import {LemonSqueezyService} from './lemon-squeezy.service';
import {LemonSqueezyWebhookService} from './lemon-squeezy-webhook.service';

@Module({
  imports: [UsersModule, SettingsModule],
  controllers: [BillingController, LemonSqueezyWebhookController],
  providers: [LemonSqueezyService, LemonSqueezyWebhookService],
})
export class BillingModule {}
