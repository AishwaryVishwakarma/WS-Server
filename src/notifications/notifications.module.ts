import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {Notification} from './entities/notification.entity';
import {NotificationsService} from './notifications.service';
import {NotificationsStream} from './notifications-stream.service';
import {PrivateNotificationsController} from './controllers/private-notifications.controller';
import {User} from 'src/users/entities/user.entity';
import {MailModule} from 'src/mail/mail.module';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, User]), MailModule],
  controllers: [PrivateNotificationsController],
  providers: [NotificationsService, NotificationsStream],
  exports: [NotificationsService, NotificationsStream],
})
export class NotificationsModule {}
