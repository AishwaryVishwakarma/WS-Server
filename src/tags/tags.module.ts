import {Module} from '@nestjs/common';
import {TagsService} from './tags.service';
import {PublicTagsController} from './controllers/public-tags.controller';
import {AdminTagsController} from './controllers/admin-tags.controller';
import {TypeOrmModule} from '@nestjs/typeorm';
import {Tag} from './entities/tag.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Tag])],
  controllers: [PublicTagsController, AdminTagsController],
  providers: [TagsService],
  exports: [TagsService],
})
export class TagsModule {}
