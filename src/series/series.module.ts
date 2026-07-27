import {forwardRef, Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {Series} from './entities/series.entity';
import {SeriesService} from './series.service';
import {SeriesController} from './series.controller';
import {StoriesModule} from 'src/stories/stories.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Series]),
    forwardRef(() => StoriesModule),
  ],
  controllers: [SeriesController],
  providers: [SeriesService],
  exports: [SeriesService],
})
export class SeriesModule {}
