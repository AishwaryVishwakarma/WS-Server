import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {Notification} from './entities/notification.entity';
import {NotificationsService} from './notifications.service';
import {PrivateNotificationsController} from './controllers/private-notifications.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  controllers: [PrivateNotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
