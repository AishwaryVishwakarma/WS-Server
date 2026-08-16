import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {Story} from 'src/stories/entities/story.entity';
import {User} from 'src/users/entities/user.entity';
import {AdminImageStorageController} from './admin-image-storage.controller';
import {ImageStorageMaintenanceProcessor} from './image-storage-maintenance.processor';
import {ImageStorageMaintenanceService} from './image-storage-maintenance.service';
import {ImageStorageService} from './image-storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([Story, User])],
  controllers: [AdminImageStorageController],
  providers: [
    ImageStorageService,
    ImageStorageMaintenanceService,
    ImageStorageMaintenanceProcessor,
  ],
  exports: [ImageStorageService],
})
export class ImageStorageModule {}
