import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {User} from 'src/users/entities/user.entity';
import {FollowsModule} from 'src/follows/follows.module';
import {MutesModule} from 'src/mutes/mutes.module';
import {StoriesModule} from 'src/stories/stories.module';
import {NotificationsModule} from 'src/notifications/notifications.module';
import {MailModule} from 'src/mail/mail.module';
import {SettingsModule} from 'src/settings/settings.module';
import {DigestService} from './digest.service';
import {DigestController} from './digest.controller';
import {DigestProcessor} from './digest.processor';
import {DigestUnsubscribeController} from './digest-unsubscribe.controller';
import {DigestUnsubscribeService} from './digest-unsubscribe.service';

// Plain imports, no forwardRef — none of these modules import DigestModule
// back, so there's no cycle to guard against.
@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    FollowsModule,
    MutesModule,
    StoriesModule,
    NotificationsModule,
    MailModule,
    SettingsModule,
  ],
  controllers: [DigestController, DigestUnsubscribeController],
  providers: [DigestService, DigestProcessor, DigestUnsubscribeService],
  exports: [DigestService],
})
export class DigestModule {}
