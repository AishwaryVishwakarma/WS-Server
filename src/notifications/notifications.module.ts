import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {Notification} from './entities/notification.entity';
import {NotificationsService} from './notifications.service';
import {NotificationsStream} from './notifications-stream.service';
import {PrivateNotificationsController} from './controllers/private-notifications.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  controllers: [PrivateNotificationsController],
  providers: [NotificationsService, NotificationsStream],
  exports: [NotificationsService, NotificationsStream],
})
export class NotificationsModule {}
